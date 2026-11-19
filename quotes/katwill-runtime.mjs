import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import pg from 'pg';
import {approval,flag,QUEUE,runPilot,UUID} from './engine.mjs';
import {inspectImage} from './images.mjs';
import {map} from './mapping.mjs';
import {serviceM8} from './servicem8.mjs';

const digest=b=>createHash('sha256').update(b).digest('hex');
const requireOk=(value,hold)=>{
  if(value!==true)throw Object.assign(new Error(hold),{hold});
};

export async function runKatwillPilot({
  source,client,baseline,key,db,storageHosts=[],now=Date.now,preflightOnly=false,inboxUtcOffset,
  connect=cfg=>new pg.Client(cfg), remoteFor=serviceM8, wait=sleep,
}){
  const port=Number(db?.port);
  client=client||null;
  baseline=baseline||null;
  if(![source,...(client===null?[]:[client]),...(baseline===null?[]:[baseline])].every(x=>typeof x==='string'&&UUID.test(x))||
     typeof key!=='string'||!key.trim()||!db?.host||!db?.password||!Number.isInteger(port)||port<1||port>65535)
    return {status:'review',reason:'configuration_invalid'};
  const conn=connect({
    host:db.host,port,database:'cooltech_quotes',
    user:'cooltech_quote_runtime',password:db.password,
    ssl:{rejectUnauthorized:true,...(db.ca?{ca:db.ca}:{})},
    connectionTimeoutMillis:3000,query_timeout:4500,statement_timeout:4000,
  });
  conn.on?.('error',()=>{}); // Never log driver errors that could contain connection details.
  const row=async (sql,args=[]) => (await conn.query(sql,args)).rows[0];
  const rpc=async (name, args)=> (await row({
    claim:'SELECT cooltech_quotes.claim($1,$2,$3) AS ok',
    plan:'SELECT cooltech_quotes.plan($1,$2) AS ok',
    reserve:'SELECT cooltech_quotes.reserve($1,$2,$3) AS ok',
    confirm:'SELECT cooltech_quotes.confirm($1,$2,$3) AS ok',
    close:'SELECT cooltech_quotes.close($1) AS ok',
  }[name],args))?.ok;
  let claimed=false;
  let result;
  try{
    await conn.connect();
    // Do not invoke even a ledger routine unless the role and database are scoped.
    const binding=await row(`SELECT current_database()='cooltech_quotes'
      AND current_user='cooltech_quote_runtime' AND session_user=current_user
      AND NOT has_database_privilege(current_user, current_database(), 'CREATE')
      AND NOT has_schema_privilege(current_user,'cooltech_quotes','CREATE')
      AND NOT has_table_privilege(current_user,'cooltech_quotes.pilot','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      AND NOT has_table_privilege(current_user,'cooltech_quotes.intent','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      AND NOT EXISTS (
        SELECT FROM pg_catalog.pg_roles r
        WHERE (r.rolname<>current_user AND pg_has_role(r.oid,'MEMBER'))
          OR (r.rolname=current_user AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls))
      ) AS ok`);
    requireOk(binding?.ok,'database_scope_invalid');
    let settings;
    if(preflightOnly){
      const from=now();
      settings={opens_at:new Date(from),closes_at:new Date(from+180000),
        inbox_utc_offset:inboxUtcOffset,expected_photos:3};
    }else{
      requireOk(await rpc('claim',[source,client,baseline]),'permit_closed_or_used');
      claimed=true;
      settings=await row('SELECT * FROM cooltech_quotes.settings($1)',[source])??{};
    }
    const {opens_at,closes_at,inbox_utc_offset,expected_photos}=settings;
    const permit={
      source,client,clientless:client===null,routeLast:true,sender:'admin@sm8setup.com.au',
      from:opens_at?.toISOString(),until:closes_at?.toISOString(),
      cutoff:opens_at&&new Date(opens_at.getTime()-86400000).toISOString(),
      inboxUtcOffset:inbox_utc_offset,expectedPhotos:expected_photos,emailFiles:[],inlineIds:[],
    };
    approval(permit,now());
    const remote=remoteFor({key,storageHosts,deadline:Math.min(closes_at.getTime(),now()+180000)});
    const [company,queue,example]=await Promise.all([
      client&&remote.get('company',client),remote.get('queue',QUEUE),baseline&&remote.get('job',baseline),
    ]);
    if(client)requireOk(company?.uuid===client&&flag(company.active)===true,'approved_client_unavailable');
    requireOk(queue?.uuid===QUEUE&&queue.name==='X-New Website Quotes'&&flag(queue.active)===true,'queue_unavailable');
    if(baseline)requireOk(example?.uuid===baseline&&example.queue_uuid===QUEUE&&example.status==='Quote'&&
      flag(example.active)===true&&flag(example.quote_sent)===false&&!example.quote_sent_stamp,'baseline_quote_unverified');
    const ledger={exclusive:async (id,task)=>{
      if(preflightOnly)return task({});
      requireOk(id===source&&claimed,'permit_mismatch');
      return task({
        async plan(hash){requireOk(await rpc('plan',[id,hash]),'plan_not_frozen');},
        async intent(step,target){
          requireOk(await rpc('reserve',[id,step,target]),'intent_not_reserved');
          return {fresh:true,id:target};
        },
        async confirm(step,target){requireOk(await rpc('confirm',[id,step,target]),'receipt_not_confirmed');},
      });
    }};
    result=await runPilot(permit,{remote,ledger,map,uuid:randomUUID,inspect:inspectImage,digest,sleep:wait,now,preflightOnly});
  }catch(e){
    result={status:'review',reason:e.hold??'runtime_unavailable'};
  }finally{
    if(claimed){
      let closed=false;
      try{closed=await rpc('close',[source]);}catch{}
      if(closed!==true)result={...result,status:'review',reason:'permit_close_unconfirmed'};
    }
    await conn.end().catch(()=>{});
  }
  return {protocol:'cooltech-one-message-v1',...result};
}
