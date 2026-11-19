import {MAX_FILE,UUID} from './engine.mjs';

const BASE='https://api.servicem8.com/api_1.0/';
const photoURL=/^https:\/\/cooltechac\.com\.au\/wp-content\/uploads\/elementor\/forms\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:jpe?g|png)$/i;
const resources=new Set(['job','jobcontact','note','attachment','inboxmessage','company','queue']);
const writable=new Set(['job','jobcontact','note','attachment']);
const fail=hold=>Object.assign(new Error(hold),{hold});
const notFound=async r=>{await r.body?.cancel();return null;};
export async function readBounded(r,max){
  const size=r.headers.get('content-length');
  if(r.status!==200||r.headers.has('content-range')||(size!==null&&(!/^\d+$/.test(size)||Number(size)>max))){
    await r.body?.cancel();
    throw fail('unexpected_response');
  }
  if(!r.body)throw fail('missing_body');
  const reader=r.body.getReader(),chunks=[];
  let length=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      length+=value.length;
      if(length>max)throw fail('transfer_limit');
      chunks.push(value);
    }
    if(!length)throw fail('missing_body');
    return Buffer.concat(chunks,length);
  }finally{
    await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}
export function serviceM8({key,storageHosts=[],fetcher=fetch,deadline=Date.now()+180000}){
  const json=async r=>JSON.parse((await readBounded(r,1024*1024)).toString('utf8'));
  const getPath=(resource,id,ext='json')=>{
    if(!resources.has(resource)||!UUID.test(id))throw fail('invalid_api_path');
    return `${resource}/${id}.${ext}`;
  };
  const request=(url,init={})=>{
    const remaining=deadline-Date.now();
    if(remaining<=0)throw fail('adapter_timeout');
    return fetcher(url,{...init,redirect:'manual',signal:AbortSignal.timeout(Math.min(12000,remaining))});
  };
  const api=(path,init={})=>request(BASE+path,{...init,headers:{...init.headers,'X-Api-Key':key}});
  const write=async (path,body,contentType)=>{
    const r=await api(path,{method:'POST',headers:contentType?{'Content-Type':contentType}:{},body});
    await r.body?.cancel();
    if(!r.ok)throw Error('write response uncertain');
    return r.headers.get('x-record-uuid');
  };
  return {
    async recentInbox(){
      const r=await api('inboxmessage.json?limit=20');
      const payload=await json(r);
      if(!Array.isArray(payload.messages)||payload.messages.length>20)throw fail('invalid_inbox_page');
      return payload.messages;
    },
    async get(resource,id){
      const r=await api(getPath(resource,id));
      return r.status===404?notFound(r):json(r);
    },
    async list(resource,field,id){
      if(!((['attachment','note'].includes(resource)&&field==='related_object_uuid')||(resource==='jobcontact'&&field==='job_uuid'))||!UUID.test(id))
        throw fail('invalid_filter');
      const q=new URLSearchParams({'$filter':`${field} eq '${id}'${resource==='attachment'?" and active eq 1":''}`});
      const r=await api(`${resource}.json?${q}`);
      if(r.headers.has('x-next-cursor')||r.headers.has('link')){
        await r.body?.cancel(); throw fail('inventory_incomplete');
      }
      const rows=await json(r);
      if(!Array.isArray(rows)||rows.length>20||rows.some(x=>!x||x[field]!==id))throw fail('inventory_incomplete');
      return rows;
    },
    create(resource,body){
      if(!writable.has(resource)||!UUID.test(body.uuid))throw fail('invalid_write');
      return write(`${resource}.json`,JSON.stringify(body),'application/json');
    },
    routeQuote(id,queue){
      if(queue!=='01a1ddb2-8d2e-7fb6-a678-ec066fe0fe4b')throw fail('invalid_queue');
      return write(getPath('job',id),JSON.stringify({queue_uuid:queue}),'application/json');
    },
    attach(id,job,name,bytes){
      if(![id,job].every(x=>UUID.test(x))||!/^[\w-]+\.(jpg|png)$/.test(name)||!bytes.length||bytes.length>MAX_FILE)
        throw fail('invalid_attachment');
      const body=new FormData();
      for(const [k,v] of Object.entries({uuid:id,related_object:'job',related_object_uuid:job,attachment_name:name}))body.set(k,v);
      body.set('file',new Blob([bytes],{type:name.endsWith('.jpg')?'image/jpeg':'image/png'}),name);
      return write('attachment.json',body);
    },
    upload(id,bytes){
      if(bytes.length>MAX_FILE)throw fail('transfer_limit');
      return write(getPath('attachment',id,'file'),bytes,'application/octet-stream');
    },
    async file(id){
      let r=await api(getPath('attachment',id,'file'));
      if([302,303,307,308].includes(r.status)){
        const loc=r.headers.get('location');
        await r.body?.cancel();
        const u=new URL(loc??'about:blank');
        if(u.protocol!=='https:'||u.username||u.password||u.port||!storageHosts.includes(u.hostname))throw fail('storage_redirect_unapproved');
        r=await request(u,{headers:{'Accept-Encoding':'identity'}});
      }
      return r.status===404?notFound(r):readBounded(r,MAX_FILE);
    },
    async photo(url){
      if(!photoURL.test(url)||!url.startsWith('https://cooltechac.com.au/wp-content/uploads/elementor/forms/'))throw fail('photo_url_unapproved');
      return readBounded(await request(url,{headers:{'Accept-Encoding':'identity'}}),MAX_FILE);
    }
  };
}
