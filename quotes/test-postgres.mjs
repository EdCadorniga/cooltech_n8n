// npm install --prefix <temporary-dir> @electric-sql/pglite
// node quotes/test-postgres.mjs <temporary-dir>
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const {PGlite}=createRequire(resolve(process.argv[2],'package.json'))('@electric-sql/pglite');
const dir=mkdtempSync(join(tmpdir(),'cooltech-fixture-'));
let db=new PGlite(dir);
try{
 await db.exec(readFileSync(new URL('./ledger.sql',import.meta.url),'utf8'));
 const id='00000000-0000-4000-8000-000000000001';
 const claim=(s,w)=>db.query('SELECT * FROM cooltech_reserve($1,$2,$3)',[id,s,w]);
 const confirm=(s,w,r)=>db.query('SELECT * FROM cooltech_confirm($1,$2,$3,$4)',[id,s,w,r]);
 for(const s of ['quote','note','sha256:fixture']){
   assert.equal((await claim(s,'A')).rows.length,1);
   await assert.rejects(claim(s,'B'),/Pending quote step/);
 }
 await db.close();db=new PGlite(dir);
 await assert.rejects(claim('quote','C'),/Pending quote step/);
 await assert.rejects(confirm('quote','C',id),/Unowned/);
 await assert.rejects(confirm('quote','A',''),/Missing valid write receipt/);
 for(const s of ['quote','note','sha256:fixture']){
   assert.equal((await confirm(s,'A',id)).rows[0].result_uuid,id);
   assert.equal((await claim(s,'retry')).rows.length,0);
 }
 console.log('PASS: pilot PostgreSQL functions, persisted intents, owner and receipt checks, confirmed-step replay.');
}finally{await db.close();rmSync(dir,{recursive:true,force:true});}
