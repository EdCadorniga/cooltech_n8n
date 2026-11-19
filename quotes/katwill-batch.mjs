import pg from 'pg';
import {ledgerConfig,runKatwillPilot} from './katwill-runtime.mjs';
import {serviceM8} from './servicem8.mjs';
import {selectInbox,timestampOf} from './katwill-scan.mjs';

export async function runInboxBatch({db,key,storageHosts,dryRun=false}){
  const deadline=Date.now()+210000;
  let previous=0;
  const remoteFor=options=>serviceM8({...options,fetcher:async(url,init)=>{
    const delay=previous+750-Date.now();
    if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
    previous=Date.now();
    return fetch(url,init);
  }});
  const conn=new pg.Client(ledgerConfig(db));
  conn.on('error',()=>{});
  try{
    await conn.connect();
    const cutoff=(await conn.query('SELECT cooltech_quotes.rollout_start() AS start')).rows[0]?.start;
    if(!(cutoff instanceof Date))throw Error('Cooltech rollout cutoff has not been set');
    const lock=(await conn.query("SELECT pg_try_advisory_lock(11623637,20) AS acquired")).rows[0].acquired;
    if(!lock)return {status:'already_running'};
    const rows=await remoteFor({key,deadline}).recentInbox();
    const candidates=selectInbox(rows,cutoff.getTime(),Date.now());
    const tally={scanned:rows.length,candidates:candidates.length,verified:0,held:0,skipped:0,deferred:0,
      windowFull:rows.length===20&&rows.every(r=>timestampOf(r.timestamp)>=cutoff.getTime())};
    if(dryRun)return {status:'read_only',...tally};
    for(const candidate of candidates){
      if(Date.now()>deadline-30000){tally.deferred++;continue;}
      const result=await runKatwillPilot({db,key,storageHosts,source:candidate.source,scheduled:candidate,
        batchDeadline:deadline,remoteFor});
      if(result.status==='verified')tally.verified++;
      else if(result.status==='skipped')tally.skipped++;
      else tally.held++;
      if(result.status!=='skipped')await conn.query('SELECT cooltech_quotes.record_batch_result($1,$2,$3)',
        [candidate.source,result.status,result.reason??null]);
    }
    return {status:'checked',...tally};
  }finally{await conn.end().catch(()=>{});}
}
