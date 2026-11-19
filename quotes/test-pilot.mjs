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
import {selectInbox,timestampOf} from './katwill-scan.mjs';
import {phaseRunner} from './katwill-stages.mjs';
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
test('stages advance real work only in order, then stop after a hold',async()=>{
  const events=[];
  const runner=phaseRunner(async checkpoint=>{
    await checkpoint('create_quote');
    events.push('create');
    await checkpoint('photos');
    events.push('photos');
    return {status:'review',reason:'fixture_error'};
  });
  assert.deepEqual(await runner.peek(),{phase:'create_quote'});
  await assert.rejects(runner.advance('photos'),/order mismatch/);
  assert.deepEqual(events,[]);
  assert.deepEqual(await runner.advance('create_quote'),{phase:'photos'});
  assert.deepEqual(events,['create']);
  assert.equal((await runner.advance('photos')).result.status,'review');
  assert.equal((await runner.advance('queue')).result.status,'review');
  assert.deepEqual(events,['create','photos']);
  await runner.close();
});
test('20-item intake excludes pre-rollout, pilot, unrelated and duplicate records',()=>{
  const base={uuid:id,from_email:'customer@example.invalid',active:'1',is_archived:'0',
    converted_to_job_uuid:'',snooze_until_timestamp:'0000-00-00 00:00:00',
    subject:'New quote request: Website',timestamp:'2026-11-19 20:00:00',
    message_text:'New website quote request\nPage URL: https://cooltechac.com.au/quote/'};
  const stamp=Date.parse('2026-11-19T09:00:00Z');
  assert.equal(timestampOf(base.timestamp),stamp);
  assert.equal(selectInbox([base,base,{...base,subject:'Other'},{...base,from_email:'admin@sm8setup.com.au'}],
    stamp-1,stamp+1).length,1);
  assert.equal(selectInbox([base],stamp+1,stamp+2).length,0);
  assert.equal(selectInbox([{...base,subject:base.subject+' New Enquiry - Cooltech Website'}],stamp-1,stamp+1).length,0);
  assert.throws(()=>selectInbox(Array(21).fill(base),stamp-1,stamp+1));
});
test('Katwill runtime verifies one Quote and three decoded photos with no repeat POST',async()=>{
  const db=new PGlite();
  const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const client=uid(2),baseline=uid(3),lost=uid(4);
  const bindingSql="SELECT current_database()='cooltech_quotes'";
  const migration=readFileSync(new URL('./katwill-ledger.sql',import.meta.url),'utf8');
  const repairMigration=execFileSync(process.execPath,[fileURLToPath(new URL('./build-repair-migration.mjs',import.meta.url))],{encoding:'utf8'});
  const rolloutMigration=execFileSync(process.execPath,[fileURLToPath(new URL('./build-rollout-migration.mjs',import.meta.url))],{encoding:'utf8'});
  const scheduledSource=uid(5);
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
        snooze_until_timestamp:null,from_email:k===scheduledSource?'customer@example.invalid':'admin@sm8setup.com.au',
        timestamp:stamp,subject:'New quote request: Web',
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
Fixture scope
---
Page URL: https://cooltechac.com.au/quotes/`.split('\n').filter(line=>k!==scheduledSource||!line.startsWith('Photo:')).join('\n')};
      return hide&&resource==='job'?null:remoteRows.get(resource+k)??null;
    },
    async list(resource,field,k){return [...remoteRows].filter(([p,r])=>p.startsWith(resource)&&r[field]===k).map(([,r])=>r);},
    async create(resource,row){
      posts.push(resource);
      remoteRows.set(resource+row.uuid,{...row,...(resource==='job'?{quote_sent:false,quote_sent_stamp:'0000-00-00 00:00:00',queue_uuid:'',company_uuid:row.company_uuid??''}:{})});
      if(resource==='job'){
        assert.equal(row.status,'Quote');
        assert.equal(row.quote_sent,0);
        assert.equal(row.queue_uuid,undefined);
        assert.equal(row.company_uuid,undefined);
        throw new Error('response lost after commit');
      }
      return row.uuid;
    },
    async photo(url){return photos[Number(url.at(-5))-1];},
    async upload(k,b){posts.push('bytes');uploaded.set(k,b);},
    async attach(k,quote,name,b){
      posts.push('attachment');
      remoteRows.set('attachment'+k,{uuid:k,related_object:'job',related_object_uuid:quote,attachment_name:name,active:1,file_type:'.png'});
      uploaded.set(k,b);
      return k;
    },
    async file(k){return uploaded.get(k)??null;},
    async routeQuote(k,queue){
      posts.push('queue');
      remoteRows.get('job'+k).queue_uuid=queue;
      throw new Error('queue acknowledgment lost after commit');
    },
  };
  const args={source:id,client:'',baseline:'',key:'synthetic',db:{host:'fixture.invalid',port:5432,password:'fixture'},
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
    await db.exec(`CREATE ROLE cooltech_quote_runtime; CREATE ROLE cooltech_quote_owner;
      GRANT USAGE ON SCHEMA cooltech_quotes TO cooltech_quote_runtime;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA cooltech_quotes TO cooltech_quote_runtime;
      GRANT ALL ON SCHEMA cooltech_quotes TO cooltech_quote_owner;
      GRANT ALL ON ALL TABLES IN SCHEMA cooltech_quotes TO cooltech_quote_owner;
      ALTER FUNCTION cooltech_quotes.reserve(uuid,text,uuid) OWNER TO cooltech_quote_owner`);
    await db.exec(repairMigration.replace("current_database() <> 'cooltech_quotes'",`current_database() <> '${testDb}'`));
    for(const source of [id,lost])await db.query(`INSERT INTO cooltech_quotes.pilot
      (source,client,baseline_quote,opens_at,closes_at,inbox_utc_offset)
      VALUES($1,NULL,NULL,now()-interval '1 minute',now()+interval '10 minutes','+11:00')`,[source]);
    assert.equal((await runKatwillPilot({...args,preflightOnly:true})).status,'preflight_verified');
    assert.deepEqual(posts,[]);
    assert.equal((await db.query('SELECT claimed_at FROM cooltech_quotes.pilot WHERE source=$1',[id])).rows[0].claimed_at,null);
    const result=await runKatwillPilot(args);
    assert.equal(result.status,'verified',JSON.stringify(result));
    assert.equal(result.files,3);
    assert.equal(remoteRows.get('job'+result.quote).job_address,'1 Fixture Lane');
    assert.equal(remoteRows.get('job'+result.quote).queue_uuid,QUEUE);
    assert.deepEqual(posts,['job','jobcontact','note','attachment','attachment','attachment','queue']);
    assert.equal((await runKatwillPilot(args)).reason,'permit_closed_or_used');
    hide=true;
    const failure=await runKatwillPilot({...args,source:lost});
    assert.equal(failure.reason,'write_unresolved',JSON.stringify(failure));
    assert.equal((await runKatwillPilot({...args,source:lost})).reason,'permit_closed_or_used');
    assert.equal(posts.filter(p=>p==='job').length,2); // one for each approved source
    assert.equal((await db.query('SELECT count(*)::int AS n FROM cooltech_quotes.pilot WHERE closed_at IS NOT NULL')).rows[0].n,2);
    assert.equal((await db.query("SELECT verified_at FROM cooltech_quotes.intent WHERE source=$1 AND step='quote'",[lost])).rows[0].verified_at,null);
    const existingQuote=(await db.query("SELECT target FROM cooltech_quotes.intent WHERE source=$1 AND step='quote'",[lost])).rows[0].target;
    await db.query("INSERT INTO cooltech_quotes.repair(source,quote,expires) VALUES($1,$2,clock_timestamp()+interval '5 minutes')",[lost,existingQuote]);
    hide=false;
    const repaired=await runKatwillPilot({...args,source:lost,existingQuote});
    assert.equal(repaired.status,'verified',JSON.stringify(repaired));
    assert.equal(repaired.quote,existingQuote);
    assert.equal(posts.filter(p=>p==='job').length,2);
    assert.equal((await runKatwillPilot({...args,source:lost,existingQuote})).reason,'repair_closed_or_used');
    await db.exec(rolloutMigration.replace("current_database() <> 'cooltech_quotes'",`current_database() <> '${testDb}'`));
    await db.exec("INSERT INTO cooltech_quotes.rollout(starts_at) VALUES (now()-interval '1 minute')");
    const scheduled={stamp:Date.parse(stamp),rawStamp:stamp,sender:'customer@example.invalid'};
    const staged=phaseRunner(checkpoint=>runKatwillPilot({...args,source:scheduledSource,scheduled,checkpoint}));
    for(const phase of ['source','inventory','create_quote','contact','diary','photos','verify_details','queue','verify_quote']){
      assert.equal((await staged.peek()).phase,phase);
      await staged.advance(phase);
    }
    const batch=(await staged.peek()).result;
    assert.equal(batch.status,'verified',JSON.stringify(batch));
    assert.equal(batch.files,0);
    assert.equal((await runKatwillPilot({...args,source:scheduledSource,scheduled})).status,'skipped');
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
    await reserve('queue',target,false);
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
