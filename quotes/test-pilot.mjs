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
