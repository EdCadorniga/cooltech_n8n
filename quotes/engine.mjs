// The same orchestration is used by the live adapter and the synthetic graph.
export const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export const QUEUE = '01a1ddb2-8d2e-7fb6-a678-ec066fe0fe4b';
export const MAX_FILE = 10 * 1024 * 1024;
export const MAX_TOTAL = 32 * 1024 * 1024;
const zero = '00000000-0000-0000-0000-000000000000';
export const flag = v => [true, 1, '1', 'true'].includes(v) ? true :
  [false, 0, '0', 'false'].includes(v) ? false : undefined;
export const blank = v => v === null || v === '' || v === zero;
export const unsnoozed = v => blank(v)||v==='0000-00-00 00:00:00';
const exact = (row, fields) => row && Object.entries(fields).every(([k,v]) => row[k] === v);
const snapshot = row => JSON.stringify(Object.entries(row).sort(([a],[b])=>a.localeCompare(b)));
const iso = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(v) ? Date.parse(v) : NaN;
const validOffset=v=>typeof v==='string'&&/^[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00)$/.test(v);
export function sourceTimestamp(v,offset){
  if(typeof v==='string'&&/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(v)&&validOffset(offset))
    return iso(v.replace(' ','T')+offset);
  return iso(v);
}
const hold = (code) => { throw Object.assign(new Error(code),{hold:code}); };
export function approval(p, now) {
  const from=iso(p.from), until=iso(p.until), cutoff=iso(p.cutoff);
  const ids=[...(p.emailFiles??[]),...(p.inlineIds??[])];
  if (![p.source,...(p.clientless===true&&p.client===null?[]:[p.client])].every(v=>UUID.test(v)&&v!==zero) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.sender??'') ||
      !Array.isArray(p.emailFiles)||!Array.isArray(p.inlineIds)||ids.length>8||new Set(ids).size!==ids.length||
      !ids.every(v=>UUID.test(v)&&v!==zero)||!(cutoff<=from&&from<=now&&now<=until&&until-from<=15*60000&&from-cutoff<=86400000)||
      (p.inboxUtcOffset!==undefined&&!validOffset(p.inboxUtcOffset))||
      (ids.length && !['inbox','inboxmessage'].includes(p.inboxRelation))) hold('approval_invalid');
  return {cutoff,until};
}

export async function runPilot(p,{remote,ledger,map,uuid,digest,inspect,sleep,now=Date.now,preflightOnly=false}) {
  let step='approval';
  let quote;
  try {
    const window=approval(p,now());
    return await ledger.exclusive(p.source,async tx=>{
      const checkWindow=()=>approval(p,now());
      const source=async()=>{
        const raw=await remote.get('inboxmessage',p.source);
        const stamp=sourceTimestamp(raw?.timestamp,p.inboxUtcOffset);
        if (!raw||raw.uuid!==p.source||flag(raw.active)!==true||flag(raw.is_archived)!==false||
            !blank(raw.converted_to_job_uuid)||!unsnoozed(raw.snooze_until_timestamp)||
            raw.from_email?.toLowerCase()!==p.sender.toLowerCase()||!(window.cutoff<=stamp&&stamp<=now())||
            (p.expectedPhotos!==undefined&&stamp<=now()-86400000))
          hold('source_ineligible');
        const mapped=map({...raw,timestamp:new Date(stamp).toISOString(),archived:false,converted_to_job_uuid:'',
          clients:p.clientless===true?[]:[p.client],clientless:p.clientless===true,cutoff:p.cutoff,files:[]});
        if(mapped.route!=='quote')hold('template_ineligible');
        return {raw,mapped};
      };
      step='source';
      const before=await source();
      const m=before.mapped;
      step='inventory';
      const inventory=async()=>{
        const rows=await remote.list('attachment','related_object_uuid',p.source);
        const expected=[...p.emailFiles,...p.inlineIds].sort();
        if (rows.some(r=>r.related_object_uuid!==p.source||r.related_object!==p.inboxRelation||
            !UUID.test(r.uuid)||flag(r.active)!==true)||JSON.stringify(rows.map(r=>r.uuid).sort())!==JSON.stringify(expected))
          hold('inventory_mismatch');
        return rows;
      };
      const originals=await inventory();
      const files=new Map();
      let total=0;
      const add=async(bytes,label,isPhoto)=>{
        total+=bytes?.length??0;
        if(total>MAX_TOTAL)hold('total_file_budget');
        const ext=await inspect(bytes,isPhoto);
        if(!ext)hold('invalid_file');
        const hash=digest(bytes);
        if(!files.has(hash))files.set(hash,{bytes,hash,ext,name:(label.replace(/[^\w-]+/g,'-').slice(0,70)||'file')+'.'+ext});
      };
      for(const f of m.links)await add(await remote.photo(f.url),f.label,true);
      for(const id of p.emailFiles){
        const row=originals.find(r=>r.uuid===id);
        await add(await remote.file(id),String(row.attachment_name??'email-file').replace(/\.[^.]+$/,''),false);
      }
      if(p.expectedPhotos!==undefined&&files.size!==p.expectedPhotos)hold('unexpected_photo_count');
      if(preflightOnly)return {status:'preflight_verified',files:files.size};
      // Freeze the mapped values and ordered manifest without storing source text or file bytes.
      await tx.plan(digest(JSON.stringify([m.job,m.contact,m.internalNote,[...files.values()].map(f=>[f.hash,f.name])])));
      const fresh=(await source()).raw;
      if(snapshot(fresh)!==snapshot(before.raw))hold('source_changed');
      await inventory();
      // No mutation path uses an ID returned by a prior service call as a fallback.
      const verify=async(read,validate)=>{
        for(const delay of [0,500,3000]){
          if(delay)await sleep(delay);
          const record=await read();
          if(record!==null){if(!validate(record))hold('readback_mismatch');return record;}
        }
        hold('write_unresolved');
      };
      const record=async(key,resource,fields,extra=()=>true,createOnly={})=>{
        step=key.startsWith('file:')?'attachment_metadata':key;
        checkWindow();
        const intent=await tx.intent(key,uuid());
        const id=intent.id;
        const valid=row=>exact(row,{uuid:id,...fields})&&
          (flag(row.active)===true||(['note','jobcontact'].includes(resource)&&row.active===undefined))&&extra(row);
        if(intent.fresh){
          const existing=await remote.get(resource,id);
          if(existing!==null)hold('record_id_collision');
          if(key==='quote'&&snapshot((await source()).raw)!==snapshot(before.raw))hold('source_changed');
          checkWindow();
          try {
            const receipt=await remote.create(resource,{uuid:id,...(['note','jobcontact'].includes(resource)?{}:{active:1}),...fields,...createOnly});
            if(receipt != null && receipt!==id)hold('receipt_mismatch');
          } catch(e){if(e.hold)throw e;} // missing/error receipt is settled ONLY by exact read-back
        }
        await verify(()=>remote.get(resource,id),valid);
        await tx.confirm(key,id);
        return {id,valid};
      };
      const unsent=r=>flag(r.quote_sent)===false&&(!r.quote_sent_stamp||r.quote_sent_stamp==='0000-00-00 00:00:00');
      const {queue_uuid,...unrouted}=m.job;
      const validUnrouted=r=>unsent(r)&&(!p.routeLast||blank(r.queue_uuid))&&(!p.clientless||blank(r.company_uuid));
      let job;
      if(p.existingQuote){
        step='quote';
        const id=p.existingQuote;
        if(!UUID.test(id)||!p.routeLast)hold('invalid_repair');
        const valid=r=>exact(r,{uuid:id,...unrouted})&&flag(r.active)===true&&validUnrouted(r);
        await verify(()=>remote.get('job',id),valid);
        await tx.confirm('quote',id);
        job={id,valid};
      }else{
        job=await record('quote','job',p.routeLast?unrouted:m.job,validUnrouted,p.routeLast?{quote_sent:0}:{});
      }
      quote=job.id;
      const contact=await record('contact','jobcontact',{job_uuid:quote,...m.contact});
      const note=m.internalNote?await record('note','note',{related_object:'job',related_object_uuid:quote,note:m.internalNote}):null;
      const expected=[];
      for(const f of files.values()){
        if(remote.attach){
          step='attachment';
          checkWindow();
          const key='combined:'+f.hash;
          const intent=await tx.intent(key,uuid());
          const id=intent.id;
          const valid=r=>exact(r,{uuid:id,related_object:'job',related_object_uuid:quote,attachment_name:f.name})&&
            flag(r.active)===true&&String(r.file_type??'').replace(/^\./,'').toLowerCase()===f.ext;
          if(intent.fresh){
            if(await remote.get('attachment',id)!==null)hold('record_id_collision');
            checkWindow();
            try{
              const receipt=await remote.attach(id,quote,f.name,f.bytes);
              if(receipt!=null&&receipt!==id)hold('receipt_mismatch');
            }catch(e){if(e.hold)throw e;}
          }
          await verify(()=>remote.get('attachment',id),valid);
          await verify(()=>remote.file(id),bytes=>digest(bytes)===f.hash);
          await tx.confirm(key,id);
          expected.push({a:{id,valid},f});
          continue;
        }
        const a=await record('file:'+f.hash,'attachment',{related_object:'job',related_object_uuid:quote,attachment_name:f.name,file_type:'.'+f.ext});
        step='attachment_bytes';
        checkWindow();
        // Separate durable intent. A metadata UUID alone is not an upload receipt.
        const upload=await tx.intent('upload:'+f.hash,a.id);
        if(upload.id!==a.id)hold('upload_id_mismatch');
        if(upload.fresh){
          checkWindow();
          try{await remote.upload(a.id,f.bytes);}catch(e){if(e.hold)throw e;}
        }
        await verify(()=>remote.file(a.id),bytes=>digest(bytes)===f.hash);
        await tx.confirm('upload:'+f.hash,a.id);
        expected.push({a,f});
      }
      step='final_readback';
      if(!job.valid(await remote.get('job',quote)))hold('quote_changed');
      const contacts=await remote.list('jobcontact','job_uuid',quote);
      if(contacts.length!==1||!contact.valid(contacts[0]))hold('contact_inventory_mismatch');
      if(note&&!note.valid(await remote.get('note',note.id)))hold('note_changed');
      const attached=await remote.list('attachment','related_object_uuid',quote);
      if(attached.length!==expected.length)hold('attachment_inventory_mismatch');
      for(const {a,f} of expected){
        if(!attached.some(a.valid)||digest((await remote.file(a.id))??'')!==f.hash)hold('attachment_changed');
      }
      if(snapshot((await source()).raw)!==snapshot(before.raw))hold('source_changed');
      if(p.routeLast){
        step='queue';
        checkWindow();
        const route=await tx.intent('queue',quote);
        if(route.id!==quote)hold('queue_target_mismatch');
        if(route.fresh){
          checkWindow();
          try{await remote.routeQuote(quote,queue_uuid);}catch(e){if(e.hold)throw e;}
        }
        await verify(()=>remote.get('job',quote),r=>exact(r,{uuid:quote,...m.job})&&flag(r.active)===true&&unsent(r)&&
          (!p.clientless||blank(r.company_uuid)));
        await tx.confirm('queue',quote);
        if(snapshot((await source()).raw)!==snapshot(before.raw))hold('source_changed');
      }
      return {status:'verified',quote,files:files.size};
    });
  } catch(e) {
    return {status:'review',step,reason:e.hold??'adapter_failed',...(quote?{quote}:{})};
  }
}
