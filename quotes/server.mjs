import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import pg from 'pg';
import sharp from 'sharp';
import {runPilot,MAX_FILE} from './engine.mjs';
import {ledgerFor} from './postgres.mjs';
import {serviceM8} from './servicem8.mjs';
import {map} from './mapping.mjs';
import {pilotServer} from './pilot-http.mjs';

const digest=b=>createHash('sha256').update(b).digest('hex');
async function inspect(bytes) {
  if(!bytes?.length||bytes.length>MAX_FILE)return null;
  try{
    const image=sharp(bytes,{limitInputPixels:16000000,failOn:'warning'});
    const {format,pages}=await image.metadata();
    if((pages??1)!==1||!['jpeg','png'].includes(format))return null;
    await image.raw().toBuffer(); // fully decode; no magic-byte-only acceptance
    return format==='jpeg'?'jpg':'png';
  }catch{return null;}
}

// Loopback only. Terminate HTTPS and enforce a Katwill-only ingress rule at a
// dedicated reverse proxy; never mount this as a public unauthenticated route.
const token=process.env.COOLTECH_PILOT_TOKEN;
const permit=JSON.parse(process.env.COOLTECH_PILOT_APPROVAL??'null');
const {COOLTECH_PILOT_DATABASE_URL:dsn,COOLTECH_API_KEY:key}=process.env;
if(!dsn||!key)throw Error('Pilot sealed: configuration not approved');
const pool=new pg.Pool({connectionString:dsn,query_timeout:4500,statement_timeout:4000,connectionTimeoutMillis:3000,max:4});
pool.on('error',()=>console.error('Pilot database connection failed'));
const ledger=ledgerFor(pool);
const storageHosts=(process.env.COOLTECH_STORAGE_HOSTS??'').split(',').filter(Boolean);
const server=pilotServer({token,permit,consume:ledger.consume,
  run(p){
    const remote=serviceM8({key,storageHosts});
    return runPilot(p,{remote,ledger,map,uuid:randomUUID,inspect,digest,sleep});
  }
});
server.listen(Number(process.env.COOLTECH_PILOT_PORT??8741),'127.0.0.1');
