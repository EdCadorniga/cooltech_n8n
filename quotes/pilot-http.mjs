import {timingSafeEqual} from 'node:crypto';
import {createServer} from 'node:http';
import {approval} from './engine.mjs';

export function pilotServer({token,permit,consume,run,now=Date.now}){
  if(!/^[a-f0-9]{64}$/.test(token??'')||!permit)throw Error('Pilot sealed');
  approval(permit,now());
  const auth=Buffer.from(`Bearer ${token}`);
  const reply=(res,status,result)=>{
    res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({protocol:'cooltech-one-message-v1',...result}));
  };
  return createServer({requestTimeout:5000,headersTimeout:5000},async(req,res)=>{
    const supplied=Buffer.from(req.headers.authorization??'');
    if(supplied.length!==auth.length||!timingSafeEqual(auth,supplied))return reply(res,401,{status:'review',reason:'unauthorized'});
    if(req.url!=='/pilot'||req.method!=='POST'||(req.headers['content-length']??'0')!=='0'||req.headers['transfer-encoding'])
      return reply(res,400,{status:'review',reason:'invalid_request'});
    try {
      approval(permit,now());
      if(!await consume(permit.source))return reply(res,409,{status:'review',reason:'single_run_already_used'});
      return reply(res,200,await run(permit));
    }catch(e){return reply(res,503,{status:'review',reason:e.hold==='approval_invalid'?e.hold:'adapter_unavailable'});}
  });
}
