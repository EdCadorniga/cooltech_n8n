export async function scenarios({runPilot,map,digest}, makeLedger){
  const must=(v,label)=>{if(!v)throw Error('Pilot fixture failed: '+label);};
  const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  const img=n=>Buffer.from('fixture-image-'+n);
  const time=Date.parse('2030-01-02T00:03:00Z');
  let next=100;
  async function model(n,fault){
    const source=id(n),original=id(n+30),sender='test@example.invalid';
    const raw={uuid:source,active:true,is_archived:false,snooze_until_timestamp:null,converted_to_job_uuid:null,
      from_email:sender,subject:n===2?'Website form delivery':'New quote request: Split',timestamp:'2030-01-02T00:01:00Z',
      message_text:`${n===1?'Mailer preamble\n\n':''}New website quote request
Job
System Split
Sizing
Rooms 2
Placement
Photo: inside wall https://cooltechac.com.au/wp-content/uploads/elementor/forms/a.png
Photo: outdoor spot https://cooltechac.com.au/wp-content/uploads/elementor/forms/b.png
${fault==='partial'?'Photo: switchboard https://cooltechac.com.au/wp-content/uploads/elementor/forms/c.png':''}
Customer
Additional details Multiline
second line
ServiceM8 job notes (copy and paste)${n===1?'\n':''}Job address: 1 Fixture Lane
Contact: Fixture Person ${n===1?'6125550100':'0400 000 000'}
Email: test@example.invalid
Category: Install quote
Status: Quote
Lead source: Website quote form (Referral)

Job description:
INSTALL QUOTE: ${n===1?'DUCTED':'SPLIT'}
Fixture scope

---
Date: Synthetic${n===2?'':'\nPage URL: https://cooltechac.com.au/services/ducted/?ref=example'}`};
    const data=new Map(), bytes=new Map([[original,img(1)]]),events=[];
    const originalRow={uuid:original,active:1,related_object:'inboxmessage',related_object_uuid:source,attachment_name:'duplicate.png'};
    let reveal,hidden=false;
    const remote={
      async get(resource,k){
        if(resource==='inboxmessage')return {...raw};
        if((fault==='lostCreate'&&resource==='job'&&hidden)||(fault==='noteNotCommitted'&&resource==='note'))return null;
        return data.get(resource+k)??null;
      },
      async list(resource,field,k){
        if(k===source)return [originalRow];
        return [...data.entries()].filter(([r,x])=>r.startsWith(resource)&&x[field]===k).map(([,x])=>x);
      },
      async photo(url){return img(url.endsWith('a.png')?1:url.endsWith('b.png')?2:3);},
      async create(resource,row){
        must(!data.has(resource+row.uuid),'no repeated create');
        events.push(resource);
        if(fault==='noteNotCommitted'&&resource==='note')return undefined;
        data.set(resource+row.uuid,{...row,...(resource==='job'?{quote_sent:0}:{})});
        if(fault==='lostCreate'&&resource==='job'){hidden=true;throw Error('committed then error');}
        if(fault==='wrongReceipt'&&resource==='job')return id(90);
        if(fault==='missingReceipts'&&['jobcontact','note'].includes(resource))return undefined;
        return row.uuid;
      },
      async upload(k,b){
        events.push('upload');
        if(fault==='partial'&&b.equals(img(2))){reveal=()=>bytes.set(k,b);throw Error('upload acknowledgement lost');}
        bytes.set(k,b);
      },
      async file(k){return bytes.get(k)??null;}
    };
    const p={source,client:id(88),sender,from:'2030-01-02T00:02:00Z',until:'2030-01-02T00:10:00Z',
      cutoff:'2030-01-02T00:00:00Z',emailFiles:[original],inlineIds:[],inboxRelation:'inboxmessage'};
    const ledger=await makeLedger();
    const d={remote,ledger,map,digest,uuid:()=>id(++next),inspect:b=>b?.length?'png':null,sleep:async()=>{},now:()=>time};
    return {p,d,raw,data,events,reveal:()=>{hidden=false;reveal?.();}};
  }
  const a=await model(1,'lostCreate');
  must((await runPilot(a.p,a.d)).reason==='write_unresolved','lost create first hold');
  a.reveal();
  const recovered=await runPilot(a.p,a.d);
  must(recovered.status==='verified'&&recovered.files===2&&a.events.filter(x=>x==='job').length===1,'lost create recovery and mixed dedupe');
  must(a.data.get('job'+recovered.quote).job_description.includes('Additional details Multiline\nsecond line'),'description');
  const fixed=[...a.data.entries()].find(([k])=>k.startsWith('jobcontact'))[1];
  const diary=[...a.data.entries()].find(([k])=>k.startsWith('note'))[1];
  must(fixed.phone==='6125550100'&&!fixed.mobile&&fixed.first==='Fixture'&&fixed.last==='Person','international landline maps to Phone');
  must(diary.note.includes('Lead source: Website quote form (Referral)')&&diary.note.includes('INSTALL QUOTE: DUCTED')&&
    diary.note.includes('Source photos')&&!diary.note.includes('Page URL:'),'complete private diary note and links');
  const b=await model(2,'missingReceipts');
  must((await runPilot(b.p,b.d)).status==='verified','missing receipts resolved by exact readback');
  const mobile=[...b.data.entries()].find(([k])=>k.startsWith('jobcontact'))[1];
  must(mobile.mobile==='0400000000'&&!mobile.phone,'mobile maps to Mobile');
  const c=await model(3,'noteNotCommitted');
  must((await runPilot(c.p,c.d)).reason==='write_unresolved','missing note receipt and record hold');
  await runPilot(c.p,c.d);
  must(c.events.filter(x=>x==='note').length===1&&!c.events.includes('upload'),'no blind note replay');
  const e=await model(4,'partial');
  const first=await runPilot(e.p,e.d);
  must(first.reason==='write_unresolved'&&first.step==='attachment_bytes','partial upload hold');
  must(e.events.filter(x=>x==='attachment').length===2&&e.events.filter(x=>x==='upload').length===2,'third attachment unclaimed after partial failure');
  const count=e.events.length;
  e.reveal();
  const resumed=await runPilot(e.p,e.d);
  must(resumed.status==='verified'&&resumed.files===3&&e.events.slice(count).join(',')==='attachment,upload','partial upload recovered; only the third file is written');
  const f=await model(5);
  let release,started;
  const wait=new Promise(r=>{release=r;}), entered=new Promise(r=>{started=r;});
  const get=f.d.remote.get;
  f.d.remote.get=async(...args)=>{started();await wait;return get(...args);};
  const working=runPilot(f.p,f.d);
  await entered;
  const competitor=await runPilot(f.p,f.d);
  release();
  must(competitor.reason==='claim_busy'&&(await working).status==='verified'&&f.events.filter(x=>x==='job').length===1,'competing claims');
  const g=await model(6);
  g.raw.is_archived='true';
  must((await runPilot(g.p,g.d)).reason==='source_ineligible'&&!g.events.length,'archived');
  g.raw.is_archived=false;
  g.raw.subject+=' New Enquiry – Cooltech Website';
  must((await runPilot(g.p,g.d)).reason==='template_ineligible'&&!g.events.length,'published jobs overlap');
  g.raw.subject='New quote request: Split';
  const genuine=g.raw.message_text;
  g.raw.message_text=genuine.replace('New website quote request','Website message');
  must((await runPilot(g.p,g.d)).reason==='template_ineligible'&&!g.events.length,'subject and URL alone do not match');
  g.raw.message_text='The phrase New website quote request is mentioned, but no form was submitted.';
  must((await runPilot(g.p,g.d)).reason==='template_ineligible'&&!g.events.length,'marker without valid template holds');
  g.raw.message_text='  ';
  g.raw.body=genuine.split('\n---')[0].replace('New website quote request','NEW WEBSITE QUOTE REQUEST');
  g.raw.timestamp='2030-01-02 10:01:00';
  g.raw.snooze_until_timestamp='0000-00-00 00:00:00';
  must((await runPilot(g.p,g.d)).reason==='source_ineligible'&&!g.events.length,'inbox timestamp without verified offset holds');
  g.p.inboxUtcOffset='+10:00';
  must((await runPilot(g.p,g.d)).status==='verified','body fallback, no footer and verified inbox offset');
  const h=await model(7,'wrongReceipt');
  must((await runPilot(h.p,h.d)).reason==='receipt_mismatch'&&h.events.length===1,'wrong receipt blocks child writes');
  return {status:'verified',mode:'synthetic',cases:8};
}

export function stubLedger(){
  const keys=new Map(),locks=new Set(),plans=new Map();
  return {async exclusive(source,task){
    if(locks.has(source))throw Object.assign(Error('busy'),{hold:'claim_busy'});
    locks.add(source);
    try{return await task({
      async plan(hash){
        if(plans.has(source)&&plans.get(source)!==hash)throw Object.assign(Error('plan changed'),{hold:'plan_changed'});
        plans.set(source,hash);
      },
      async intent(step,id){
        const key=source+step;
        if(keys.has(key))return {id:keys.get(key),fresh:false};
        keys.set(key,id);return {id,fresh:true};
      },
      async confirm(step,id){if(keys.get(source+step)!==id)throw Error('invalid receipt');}
    });}finally{locks.delete(source);}
  }};
}
