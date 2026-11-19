import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {PGlite} from '@electric-sql/pglite';
import {scenarios,stubLedger} from './scenarios.mjs';
import {runPilot} from './engine.mjs';
import {QUEUE} from './engine.mjs';
import {runKatwillPilot} from './katwill-runtime.mjs';
import {map} from './mapping.mjs';
import {ledgerFor} from './postgres.mjs';
import {readBounded,serviceM8} from './servicem8.mjs';
import {pilotServer} from './pilot-http.mjs';
import {inspectImage} from './images.mjs';
import sharp from 'sharp';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const digest=b=>createHash('sha256').update(b).digest('hex');
const id='00000000-0000-4000-8000-000000000001';
test('Katwill runtime verifies one Quote and three decoded photos with no repeat POST',async()=>{
  const db=new PGlite();
  const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const client=uid(2),baseline=uid(3),lost=uid(4);
  const bindingSql="SELECT current_database()='cooltech_quotes'";
  const migration=readFileSync(new URL('./katwill-ledger.sql',import.meta.url),'utf8');
  const testDb=(await db.query('SELECT current_database() AS name')).rows[0].name;
  const stamp=new Date(Date.now()-1000).toISOString();
  const remoteRows=new Map(), uploaded=new Map(), posts=[];
  const photos=await Promise.all(['blue','red','green'].map(background=>
    sharp({create:{width:16,height:16,channels:3,background}}).png().toBuffer()));
  let hide=false;
  const remote={
    async get(resource,k){
      if(resource==='company')return {uuid:client,active:1};
      if(resource==='queue')return {uuid:QUEUE,name:'X-New Website Quotes',active:1};
      if(resource==='job'&&k===baseline)return {uuid:k,queue_uuid:QUEUE,status:'Quote',active:1,quote_sent:0};
      if(resource==='inboxmessage')return {uuid:k,active:1,is_archived:0,converted_to_job_uuid:null,
        snooze_until_timestamp:null,from_email:'admin@sm8setup.com.au',timestamp:stamp,
        message_text:`New website quote request
Job
System Split
Photo: Inside wall https://cooltechac.com.au/wp-content/uploads/elementor/forms/1.png
Photo: Outdoor spot https://cooltechac.com.au/wp-content/uploads/elementor/forms/2.png
Photo: Switchboard https://cooltechac.com.au/wp-content/uploads/elementor/forms/3.png
ServiceM8 job notes (copy and paste)
Job address: 1 Fixture Lane
Contact: Fixture Person 0400 000 000
Email: test@example.invalid
Category: Install quote
Status: Quote
Job description:
INSTALL QUOTE: SPLIT
Fixture scope`};
      return hide&&resource==='job'?null:remoteRows.get(resource+k)??null;
    },
    async list(resource,field,k){return [...remoteRows].filter(([p,r])=>p.startsWith(resource)&&r[field]===k).map(([,r])=>r);},
    async create(resource,row){
      posts.push(resource);
      remoteRows.set(resource+row.uuid,{...row,...(resource==='job'?{quote_sent:0}:{})});
      if(resource==='job')throw new Error('response lost after commit');
      return row.uuid;
    },
    async photo(url){return photos[Number(url.at(-5))-1];},
    async upload(k,b){posts.push('bytes');uploaded.set(k,b);},
    async file(k){return uploaded.get(k)??null;},
  };
  const args={source:id,client,baseline,key:'synthetic',db:{host:'fixture.invalid',port:5432,password:'fixture'},
    remoteFor:()=>remote,wait:async()=>{},
    connect:cfg=>{
      assert.equal(cfg.database,'cooltech_quotes');
      assert.equal(cfg.user,'cooltech_quote_runtime');
      assert.equal(cfg.ssl.rejectUnauthorized,true);
      return {
        connect:()=>db.exec('SET ROLE cooltech_quote_runtime'),
        // PGlite uses a single physical session. Production requires a direct
        // login, not SET ROLE; this substitution is fixture-only.
        query:(sql,params)=>db.query(sql.startsWith(bindingSql)?
          sql.replace("current_database()='cooltech_quotes'",`current_database()='${testDb}'`)
            .replace('AND session_user=current_user',''):sql,params),
        end:()=>db.exec('RESET ROLE'),
      };
    }};
  try{
    await db.exec(migration.replace("current_database() <> 'cooltech_quotes'",`current_database() <> '${testDb}'`));
    await db.exec(`CREATE ROLE cooltech_quote_runtime;
      GRANT USAGE ON SCHEMA cooltech_quotes TO cooltech_quote_runtime;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA cooltech_quotes TO cooltech_quote_runtime`);
    for(const source of [id,lost])await db.query(`INSERT INTO cooltech_quotes.pilot
      (source,client,baseline_quote,opens_at,closes_at,inbox_utc_offset)
      VALUES($1,$2,$3,now()-interval '1 minute',now()+interval '10 minutes','+11:00')`,[source,client,baseline]);
    assert.equal((await runKatwillPilot({...args,preflightOnly:true})).status,'preflight_verified');
    assert.deepEqual(posts,[]);
    assert.equal((await db.query('SELECT claimed_at FROM cooltech_quotes.pilot WHERE source=$1',[id])).rows[0].claimed_at,null);
    const result=await runKatwillPilot(args);
    assert.equal(result.status,'verified',JSON.stringify(result));
    assert.equal(result.files,3);
    assert.equal(remoteRows.get('job'+result.quote).job_address,'1 Fixture Lane');
    assert.deepEqual(posts,['job','jobcontact','note','attachment','bytes','attachment','bytes','attachment','bytes']);
    assert.equal((await runKatwillPilot(args)).reason,'permit_closed_or_used');
    hide=true;
    const failure=await runKatwillPilot({...args,source:lost});
    assert.equal(failure.reason,'write_unresolved',JSON.stringify(failure));
    assert.equal((await runKatwillPilot({...args,source:lost})).reason,'permit_closed_or_used');
    assert.equal(posts.filter(p=>p==='job').length,2); // one for each approved source
    assert.equal((await db.query('SELECT count(*)::int AS n FROM cooltech_quotes.pilot WHERE closed_at IS NOT NULL')).rows[0].n,2);
    assert.equal((await db.query("SELECT verified_at FROM cooltech_quotes.intent WHERE source=$1 AND step='quote'",[lost])).rows[0].verified_at,null);
  }finally{await db.close();}
});
test('Katwill ledger: only a live permit can mint each intent once',async()=>{
  const db=new PGlite();
  const client='00000000-0000-4000-8000-000000000002';
  const target='00000000-0000-4000-8000-000000000003';
  const hash=digest('file');
  const check=async(sql,params,expected)=>assert.equal((await db.query(sql,params)).rows[0].ok,expected);
  const claim=(source,company,expected)=>check('SELECT cooltech_quotes.claim($1,$2,$3) AS ok',[source,company,target],expected);
  const reserve=(step,uuid,expected)=>check('SELECT cooltech_quotes.reserve($1,$2,$3) AS ok',[id,step,uuid],expected);
  const confirm=(step,uuid,expected)=>check('SELECT cooltech_quotes.confirm($1,$2,$3) AS ok',[id,step,uuid],expected);
  try{
    const migration=readFileSync(new URL('./katwill-ledger.sql',import.meta.url),'utf8');
    await assert.rejects(db.exec(migration),/Expected the dedicated cooltech_quotes database/);
    await db.exec('ROLLBACK');
    const testDb=(await db.query('SELECT current_database() AS name')).rows[0].name;
    assert.match(testDb,/^[a-z_]+$/);
    await db.exec(migration.replace("current_database() <> 'cooltech_quotes'",`current_database() <> '${testDb}'`));
    await db.exec(`CREATE ROLE cooltech_quote_runtime;
      GRANT USAGE ON SCHEMA cooltech_quotes TO cooltech_quote_runtime;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA cooltech_quotes TO cooltech_quote_runtime;`);
    await db.query(`INSERT INTO cooltech_quotes.pilot(source,client,baseline_quote,opens_at,closes_at,inbox_utc_offset)
      VALUES ($1,$2,$3,now()-interval '1 minute',now()+interval '10 minutes','+11:00')`,[id,client,target]);
    await db.exec('SET ROLE cooltech_quote_runtime');
    await assert.rejects(db.query('SELECT * FROM cooltech_quotes.pilot'),/permission denied/);
    await reserve('quote',target,false);
    await claim(id,target,false);
    await claim(id,client,true);
    await claim(id,client,false);
    await reserve('quote',target,false);
    await check('SELECT cooltech_quotes.plan($1,$2) AS ok',[id,digest('plan')],true);
    await reserve('contact',target,false);
    await reserve('quote',target,true);
    await reserve('quote',client,false); // lost create response: no second POST
    await confirm('quote',client,false);
    await confirm('quote',target,true);
    await reserve('upload:'+hash,target,false);
    await reserve('file:'+hash,target,true);
    await confirm('file:'+hash,target,true);
    await reserve('upload:'+hash,client,false);
    await reserve('upload:'+hash,target,true);
    await db.exec('RESET ROLE');
    await db.query('UPDATE cooltech_quotes.pilot SET closed_at=now() WHERE source=$1',[id]);
    await db.exec('SET ROLE cooltech_quote_runtime');
    await reserve('note',target,false);
    await claim(id,client,false);
    await confirm('upload:'+hash,target,true);
  }finally{await db.close();}
});
test('same pilot engine and stubs as hosted graph',async()=>{
  assert.equal((await scenarios({runPilot,map,digest},stubLedger)).cases,8);
});
test('live and read-only preflight use the same full image decoder',async()=>{
  const image=()=>sharp({create:{width:16,height:16,channels:3,background:'blue'}});
  const jpg=await image().jpeg().toBuffer();
  assert.equal(await inspectImage(jpg),'jpg');
  assert.equal(await inspectImage(await image().png().toBuffer()),'png');
  assert.equal(await inspectImage(jpg.subarray(0,-40)),null);
  assert.equal(await inspectImage(await image().webp().toBuffer()),null);
});
test('durable PostgreSQL intents, one shot and wrong receipt',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'cooltech-quotes-'));
  let db=new PGlite(dir);
  const pool={query:(...args)=>db.query(...args).then(r=>({...r,rowCount:r.rows.length||r.affectedRows})),
    connect:async()=>({query:(...args)=>pool.query(...args),release:()=>{}})};
  try{
    await db.exec(readFileSync(new URL('./pilot-ledger.sql',import.meta.url),'utf8'));
    const ledger=ledgerFor(pool);
    assert.equal(await ledger.consume(id),true);
    await ledger.exclusive(id,async tx=>{
      await tx.plan(digest('plan'));
      assert.deepEqual(await tx.intent('quote',id),{id,fresh:true});
      await assert.rejects(tx.confirm('quote','00000000-0000-4000-8000-000000000002'),/invalid_receipt/);
    });
    await db.close();
    db=new PGlite(dir);
    assert.equal(await ledger.consume(id),false);
    await ledger.exclusive(id,async tx=>{
      await assert.rejects(tx.plan(digest('different')),/plan_changed/);
      assert.deepEqual(await tx.intent('quote','00000000-0000-4000-8000-000000000002'),{id,fresh:false});
      await tx.confirm('quote',id);
    });
  }finally{await db.close();rmSync(dir,{recursive:true,force:true});}
});
test('stream budget, partial/redirect rejection and unauthenticated storage hop',async()=>{
  let cancelled=false;
  const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(4));},cancel(){cancelled=true;}});
  await assert.rejects(readBounded(new Response(stream),6),/transfer_limit/);
  assert.equal(cancelled,true);
  await assert.rejects(readBounded(new Response('partial',{status:206}),10),/unexpected_response/);
  const calls=[];
  const m8=serviceM8({key:'synthetic',storageHosts:['store.example.invalid'],fetcher:async(url,init)=>{
    calls.push({url:String(url),headers:init.headers,redirect:init.redirect});
    return calls.length===1?new Response(null,{status:302,headers:{location:'https://store.example.invalid/file'}}):new Response('bytes');
  }});
  assert.equal((await m8.file(id)).toString(),'bytes');
  assert.equal(calls[0].headers['X-Api-Key'],'synthetic');
  assert.equal(calls[1].headers['X-Api-Key'],undefined);
  assert.ok(calls.every(c=>c.redirect==='manual'));
  await assert.rejects(m8.photo('https://evil.example/a.png'),/photo_url_unapproved/);
});
test('authenticated HTTP envelope, bounded permit and one invocation',async()=>{
  let now=Date.parse('2030-01-02T00:03:00Z'), consumed=false,calls=0;
  const token='a'.repeat(64);
  const permit={source:id,client:id,sender:'test@example.invalid',emailFiles:[],inlineIds:[],
    from:'2030-01-02T00:02:00Z',cutoff:'2030-01-02T00:01:00Z',until:'2030-01-02T00:10:00Z'};
  const server=pilotServer({token,permit,now:()=>now,async consume(source){
    assert.equal(source,id);if(consumed)return false;consumed=true;return true;
  },async run(p){
    assert.equal(p,permit);calls++;
    return {status:'verified',files:2,quote:id};
  }});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  try{
    const url=`http://127.0.0.1:${server.address().port}/pilot`,headers={Authorization:'Bearer '+token};
    assert.equal((await fetch(url,{method:'POST'})).status,401);
    assert.equal((await fetch(url,{method:'POST',headers,body:'override'})).status,400);
    const rs=await Promise.all([fetch(url,{method:'POST',headers}),fetch(url,{method:'POST',headers})]);
    assert.deepEqual(rs.map(r=>r.status).sort(),[200,409]);
    assert.deepEqual(await rs.find(r=>r.ok).json(),{protocol:'cooltech-one-message-v1',status:'verified',files:2,quote:id});
    assert.equal(calls,1);
    now=Date.parse('2030-01-02T00:11:00Z');
    assert.equal((await (await fetch(url,{method:'POST',headers})).json()).reason,'approval_invalid');
  }finally{await new Promise(r=>server.close(r));}
});
test('generated manual-only n8n path: unbound HTTP and receipt contract',()=>{
  execFileSync(process.execPath,[fileURLToPath(new URL('./build.mjs',import.meta.url))]);
  const {nodes,edges}=JSON.parse(readFileSync(new URL('./nodes.json',import.meta.url),'utf8'));
  const manual=nodes.find(n=>n.type.endsWith('.manualTrigger'));
  const receipt=nodes.find(n=>n.name==='Verify pilot result');
  const http=nodes.find(n=>n.type.endsWith('httpRequest'));
  assert.equal(nodes.length,3);
  assert.equal(http.disabled,true);
  assert.equal(http.parameters.url,'https://cooltech-pilot.invalid/pilot');
  assert.deepEqual(edges,[{source:manual.name,target:http.name},{source:http.name,target:receipt.name}]);
  const verify=json=>new Function('$input',receipt.parameters.jsCode)({first:()=>({json})});
  assert.deepEqual(verify({protocol:'cooltech-one-message-v1',status:'verified',quote:id,files:2}),[{json:{status:'verified',quote:id,files:2}}]);
  assert.throws(()=>verify({status:'verified',quote:id,files:2}),/no_verified_result/);
  assert.throws(()=>verify({protocol:'cooltech-one-message-v1',status:'review',reason:'write_unresolved'}),/write_unresolved/);
});
