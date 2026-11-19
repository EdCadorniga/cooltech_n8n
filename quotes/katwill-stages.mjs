import pg from 'pg';
import {ledgerConfig,runKatwillPilot} from './katwill-runtime.mjs';
import {serviceM8} from './servicem8.mjs';
import {selectInbox,timestampOf} from './katwill-scan.mjs';

const active=new Map();
const phases=['source','inventory','create_quote','contact','diary','photos','verify_details','queue','verify_quote'];
export function phaseRunner(task){
  let pending,resume,notify,finished=false;
  const signal=value=>{
    pending=value;
    const callback=notify;notify=undefined;
    callback?.();
  };
  const result=Promise.resolve().then(()=>task(phase=>new Promise((resolve,reject)=>{
    resume={resolve,reject};
    signal({phase});
  }))).then(result=>{finished=true;signal({result});},()=>{
    finished=true;signal({result:{status:'review',reason:'stage_failed'}});
  });
  const peek=async()=>{
    if(!pending)await new Promise(resolve=>{notify=resolve;});
    return pending;
  };
  return {peek,async advance(phase){
    const current=await peek();
    if(current.result)return current;
    if(current.phase!==phase)throw Error('Cooltech stage order mismatch');
    pending=undefined;
    const gate=resume;resume=undefined;gate.resolve();
    return peek();
  },async close(){
    if(!finished&&resume){const gate=resume;resume=undefined;gate.reject(Error('Stage session expired'));}
    await result;
  }};
}
export async function stageBatch({operation,execution,db,key,storageHosts,input=[]}){
  if(operation==='fetch_inbox'){
    if(active.has(execution))throw Error('Cooltech execution is already open');
    const conn=new pg.Client(ledgerConfig(db));
    conn.on('error',()=>{});
    try{
      await conn.connect();
      const deadline=Date.now()+210000;
      const cutoff=(await conn.query('SELECT cooltech_quotes.rollout_start() AS start')).rows[0]?.start;
      if(!(cutoff instanceof Date))throw Error('Cooltech rollout cutoff has not been set');
      const unique=(await conn.query('SELECT pg_try_advisory_lock(11623637,20) AS acquired')).rows[0]?.acquired;
      if(!unique){await conn.end();return [{json:{status:'already_running',noSession:true}}];}
      let previous=0;
      const remoteFor=options=>serviceM8({...options,fetcher:async(url,init)=>{
        const delay=previous+750-Date.now();
        if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
        previous=Date.now();
        return fetch(url,init);
      }});
      const rows=await remoteFor({key,deadline}).recentInbox();
      const session={conn,deadline,cutoff,rows,remoteFor,db,key,storageHosts,count:0,verified:0,held:0,skipped:0,deferred:0};
      const close=async()=>{
        active.delete(execution);
        clearTimeout(session.timer);
        session.runner?.close().catch(()=>{});
        await conn.end().catch(()=>{});
      };
      session.close=close;
      session.timer=setTimeout(()=>{close().catch(()=>{});},215000);
      session.timer.unref?.();
      active.set(execution,session);
      return [{json:{status:'fetched',scanned:rows.length}}];
    }catch(e){await conn.end().catch(()=>{});throw e;}
  }
  if(input.length===1&&input[0].json.noSession)return input;
  const s=active.get(execution);
  if(!s)throw Error('Cooltech stage session missing; reconcile ledger before replay');
  if(operation==='select_candidates'){
    s.candidates=selectInbox(s.rows,s.cutoff.getTime(),Date.now());
    s.scanned=s.rows.length;
    s.windowFull=s.rows.length===20&&s.rows.every(r=>timestampOf(r.timestamp)>=s.cutoff.getTime());
    s.rows=undefined;
    return s.candidates.length?s.candidates.map((_,index)=>({json:{index}})):[{json:{index:-1}}];
  }
  if(operation==='summarize'){
    const out={status:'checked',scanned:s.scanned,candidates:s.candidates.length,
      verified:s.verified,held:s.held,skipped:s.skipped,deferred:s.deferred,windowFull:s.windowFull};
    await s.close();
    return [{json:out}];
  }
  const item=input[0]?.json??{};
  if(input.length!==1||!Number.isInteger(item.index))throw Error('Expected one candidate per Cooltech loop');
  if(item.index===-1)return [{json:{...item,status:'no_candidates'}}];
  if(operation==='claim'){
    if(item.index!==s.count++||s.runner)throw Error('Unexpected Cooltech candidate order');
    if(Date.now()>s.deadline-30000)return [{json:{index:item.index,status:'deferred'}}];
    const candidate=s.candidates[item.index];
    s.runner=phaseRunner(checkpoint=>runKatwillPilot({
      db:s.db,key:s.key,storageHosts:s.storageHosts,source:candidate.source,scheduled:candidate,
      batchDeadline:s.deadline,remoteFor:s.remoteFor,checkpoint,
    }));
    const next=await s.runner.peek();
    return [{json:{index:item.index,status:next.result?.status??'claimed'}}];
  }
  if(operation==='record_result'){
    const result=s.runner?(await s.runner.peek()).result:{status:item.status};
    if(!result)throw Error('Cooltech candidate still has unfinished stages');
    const counter={verified:'verified',review:'held',skipped:'skipped',deferred:'deferred'}[result.status];
    if(!counter)throw Error('Invalid Cooltech result');
    s[counter]++;
    if(!['skipped','deferred'].includes(result.status))await s.conn.query('SELECT cooltech_quotes.record_batch_result($1,$2,$3)',
      [s.candidates[item.index].source,result.status,result.reason??null]);
    s.runner=undefined;
    return [{json:{index:item.index,status:result.status,...(result.reason?{reason:result.reason}:{})}}];
  }
  if(!phases.includes(operation))throw Error('Unknown Cooltech stage');
  if(!s.runner)return [{json:item}];
  const next=await s.runner.advance(operation);
  return [{json:{index:item.index,status:next.result?.status??'stage_complete',...(next.result?.reason?{reason:next.result.reason}:{})}}];
}
