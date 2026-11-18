const {createHash}=require('crypto');
const ledger=new Map(), remote=new Map(), events=[];
const digest=b=>createHash('sha256').update(b).digest('hex');
const items=$input.all();
for(let i=0;i<items.length;i++){
  const {json:m}=items[i],key=m.source;
  const row=ledger.get(key)||{steps:{},files:{}}; ledger.set(key,row);
  if(row.complete)continue;
  const payloads=[];
  for(const f of m.manifest){
    const bytes=await this.helpers.getBinaryDataBuffer(i,f.key);
    payloads.push({hash:digest(bytes),name:f.name,bytes});
  }
  // Both maps are simulated adapters. Persist intent before calling a writer.
  // After an uncertain response only reconcile; no match -> human review.
  for(let attempt=0;attempt<3;attempt++){
    const once=(table,id,write,loseResponse=false)=>{
      const correlation=key+'/'+id;
      if(table[id]==='confirmed')return;
      if(table[id]==='intent'){
        if(!remote.has(correlation))throw Error('unresolved intent');
      }else{
        table[id]='intent';
        remote.set(correlation,write());events.push(correlation);
        if(loseResponse&&attempt===0)throw Error('response lost');
      }
      table[id]='confirmed';
    };
    try{
      if(m.scenario==='throttle'&&attempt===0)throw Error('simulated 429 before write');
      once(row.steps,'quote',()=>({uuid:'quote-'+key,...m.job}),m.scenario==='both');
      row.quote=remote.get(key+'/quote').uuid;
      once(row.steps,'contact',()=>({...m.contact,job_uuid:row.quote}));
      if(m.internalNote)once(row.steps,'note',()=>({private:true,text:m.internalNote,job_uuid:row.quote}),m.scenario==='links');
      for(const f of payloads)once(row.files,f.hash,()=>({job_uuid:row.quote,filename:f.name,hash:digest(f.bytes)}),m.scenario==='partial');
      row.complete=m.errors.length===0;
      break;
    }catch(e){if(e.message==='unresolved intent'||attempt===2)throw e;}
  }
  const q=remote.get(key+'/quote'), c=remote.get(key+'/contact');
  const count=Object.keys(row.files).length;
  const expected={both:4,links:3,files:2,none:0,redirect:2,invalid:2,oversize:2,partial:4,throttle:0}[m.scenario];
  if(count!==expected||q.status!=='Quote'||q.queue_uuid!=='01a1ddb2-8d2e-7fb6-a678-ec066fe0fe4b'||q.job_address!=='1 Fixture Lane'||!q.job_description.includes('Additional details Multiline\nsecond line')||q.job_description.includes('https://')||c.first!=='Fixture'||c.last!=='Person'||c.mobile!=='0400000000'||c.email!=='fixture@example.invalid')throw Error('Mapping/file assertion: '+m.scenario);
  if(m.links.length&&(!remote.get(key+'/note').private||!m.links.every(p=>m.internalNote.includes(p.label+': '+p.url))))throw Error('Private note assertion');
  if(row.complete===['redirect','invalid','oversize'].includes(m.scenario))throw Error('Completion assertion');
}
if(ledger.size!==9||events.length!==new Set(events).size)throw Error('Replay/coverage assertion');
return [{json:{mode:'simulated',uniqueQuotes:ledger.size,complete:[...ledger.values()].filter(r=>r.complete).length,transferReview:3,attachments:[...ledger.values()].reduce((n,r)=>n+Object.keys(r.files).length,0),duplicateWrites:0}}];
