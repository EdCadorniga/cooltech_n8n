import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const source=read('katwill-standard-intake.ts').split('jsCode: String.raw`')[1].split('`,')[0];
const mapper=read('map.js');
const nodes=[],edges=[];
const api='https://api.servicem8.com/api_1.0/';
const add=(name,type,version,parameters,credential)=>{nodes.push({name,type,typeVersion:version,parameters,
  position:[260*(nodes.length%7),260*Math.floor(nodes.length/7)],...(credential?{credentials:credential}:{} )});return name;};
const link=(a,b,index=0)=>edges.push({source:a,target:b,sourceIndex:index});
const chain=(...list)=>list.slice(1).forEach((n,i)=>link(list[i],n));
const code=(name,jsCode)=>add(name,'n8n-nodes-base.code',2,{mode:'runOnceForAllItems',jsCode});
const sm8={serviceM8CredentialsApi:{id:'Gii70BGIUVSFSVwi',name:'COOLTECH ServiceM8 Credentials account'}};
const pg={postgres:{name:'Cooltech Quotes Postgres TLS'}};
const sql=(name,query,replacements)=>add(name,'n8n-nodes-base.postgres',2.8,{operation:'executeQuery',query,
  options:{queryReplacement:`={{ ${replacements} }}`}},pg);
const http=(name,method,url,{auth=true,body,binary,multipart=false}={})=>{
  const parameters={method,url,authentication:auth?'predefinedCredentialType':'none',
    ...(auth?{nodeCredentialType:'serviceM8CredentialsApi'}:{}),
    options:{timeout:12000,redirect:{redirect:{followRedirects:false}},
      response:{response:{fullResponse:true,neverError:true,responseFormat:binary?'file':'json',
        ...(binary?{outputPropertyName:'data'}:{})}}}};
  if(body)Object.assign(parameters,{sendBody:true,contentType:'json',specifyBody:'json',jsonBody:body});
  if(multipart)Object.assign(parameters,{sendBody:true,contentType:'multipart-form-data',
    bodyParameters:{parameters:[
      {name:'uuid',value:'={{ $json.target }}'},
      {name:'related_object',value:'job'},
      {name:'related_object_uuid',value:'={{ $json.fields.related_object_uuid }}'},
      {name:'attachment_name',value:'={{ $json.fields.attachment_name }}'},
      {parameterType:'formBinaryData',name:'file',inputDataFieldName:'data'},
    ]}});
  return add(name,'n8n-nodes-base.httpRequest',4.5,parameters,auth?sm8:undefined);
};
const sw=(name,field,values)=>add(name,'n8n-nodes-base.switch',3.4,{mode:'rules',
  rules:{values:values.map(value=>({renameOutput:true,outputKey:value,conditions:{combinator:'and',
    options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},
    conditions:[{leftValue:`={{ String($json.${field}) }}`,rightValue:value,operator:{type:'string',operation:'equals'}}]}}))},
  options:{fallbackOutput:'extra'}});
const loop=name=>add(name,'n8n-nodes-base.splitInBatches',3,{batchSize:1});
const manual=add('Manual one-message run','n8n-nodes-base.manualTrigger',1,{});
const schedule=add('Every five minutes','n8n-nodes-base.scheduleTrigger',1.4,{rule:{interval:[{field:'minutes',minutesInterval:5}]}});
const list=name=>add(name,'@servicem8/n8n-nodes-servicem8.serviceM8',1,{resource:'inbox',operation:'getMany',limit:20},sm8);
chain(manual,list('List latest 20 inbox items'),code('Summarize eligible new enquiries',source));
const intake=code('Select new website quote candidates',source.replace('let candidates=0;','const candidates=[];')
  .replace('candidates++;','candidates.push({json:{source:r.uuid,sender:r.from_email,stampISO:new Date(t).toISOString(),offset:offset(t),cutoff:new Date(cutoff).toISOString()}});')
  .replace(/return \[\{json:\{status:'read_only'.*$/m,'return candidates;'));
const each=loop('One enquiry at a time');
chain(schedule,list('Fetch 20 ServiceM8 inbox items'),intake,each);
link(each,code('Summarize completed batch',`return [{json:{completed:$input.all().length}}];`),0);
const exact=http('Reload exact inbox item','GET',`={{ '${api}inboxmessage/' + $json.source + '.json' }}`);
link(each,exact,1);
const ref=name=>`$('${name}').item.json`;
const mapping=code('Map submission and validate source',`
const known=${ref(each)}, r=$json.body;
if($json.statusCode!==200||r?.uuid!==known.source||r.from_email!==known.sender||
   ![1,'1',true].includes(r.active)||![0,'0',false].includes(r.is_archived)||
   ![null,'','00000000-0000-0000-0000-000000000000'].includes(r.converted_to_job_uuid)||
   ![null,'','0000-00-00 00:00:00','00000000-0000-0000-0000-000000000000'].includes(r.snooze_until_timestamp))
  throw Error('Inbox source is no longer eligible');
const hash=x=>require('crypto').createHash('sha256').update(JSON.stringify(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)))).digest('hex');
const shaped={...r,timestamp:known.stampISO,cutoff:known.cutoff,clients:[],clientless:true,archived:false,converted_to_job_uuid:'',files:[]};
const mapped=(($input)=>{${mapper}})({all:()=>[{json:shaped}]})[0].json;
return [{json:{...known,...mapped,snapshot:hash(r)}}];`);
link(exact,mapping);
const eligibility=sw('Mapped quote or manual review','route',['quote']);
link(mapping,eligibility);link(eligibility,each,1);
const inv=http('Check original inbox attachments','GET',`={{ '${api}attachment.json?$filter=' + encodeURIComponent("active eq 1 and related_object_uuid eq '" + $json.source + "'") }}`);
link(eligibility,inv);
const fan=code('Prepare allowlisted photo requests',`
const m=${ref(mapping)};
if($json.statusCode!==200||!Array.isArray($json.body)||$json.body.length)
  throw Error('Inbox with original attachments needs manual review');
return m.links.length?m.links.map((l,index)=>({json:{...l,index}})):[{json:{index:-1}}];`);
const photoGate=sw('Has website photos?','index',['-1']);
chain(inv,fan,photoGate);
const head=http('Check website photo size','HEAD','={{ $json.url }}',{auth:false});
link(photoGate,head,1);
const bounded=code('Allow only bounded image responses',`
return $input.all().map((item,i)=>{
  const response=item.json, l=$('${fan}').itemMatching(i).json;
  const length=Number(response.headers?.['content-length']);
  if(response.statusCode!==200||!Number.isInteger(length)||length<1||length>10485760||
    !/^image\\/(jpeg|png)(?:$|;)/i.test(response.headers?.['content-type']||''))throw Error('Photo headers failed preflight');
  return {json:{...l,length},pairedItem:{item:i}};
});`);
const photo=http('Download approved website photos','GET','={{ $json.url }}',{auth:false,binary:true});
chain(head,bounded,photo);
const checkBinary=code('Check downloaded image bytes',`
const out=[];
for(const [i,item] of $input.all().entries()){
 const l=$('${bounded}').itemMatching(i).json,b=await this.helpers.getBinaryDataBuffer(i,'data');
 const png=b.length>=24&&b.subarray(0,8).toString('hex')==='89504e470d0a1a0a';
 const jpg=b.length>=4&&b[0]===255&&b[1]===216&&b.at(-2)===255&&b.at(-1)===217;
 if(b.length!==l.length||!item.binary?.data||!(png||jpg))throw Error('Photo response did not match preflight');
 out.push({json:{...l,hash:require('crypto').createHash('sha256').update(b).digest('hex'),ext:png?'png':'jpg'},binary:item.binary,pairedItem:{item:i}});
}
return out;`);
link(photo,checkBinary);
const decode=add('Decode website photos','n8n-nodes-base.editImage',1.1,{operation:'resize',dataPropertyName:'data',width:64,height:64,options:{}});
link(checkBinary,decode);
const manifest=code('Freeze verified Quote plan',`
const raw=$input.all();
const m=$('${mapping}').itemMatching(0).json, crypto=require('crypto');
const photos=[],binary={},seen=new Set();
if(raw[0]?.json.index!==-1){
 for(const [i,item] of raw.entries()){
  const verified=$('${checkBinary}').itemMatching(i);
  if(!item.binary?.data||!verified?.binary?.data)throw Error('Image was not decoded');
  const f=verified.json;if(seen.has(f.hash))continue;seen.add(f.hash);
  const slot='photo'+photos.length;
  const name=f.label.replace(/[^\\w-]+/g,'-')+'.'+f.ext;
  photos.push({slot,hash:f.hash,name,ext:f.ext});
  binary[slot]={...verified.binary.data,fileName:name};
 }
}
const plan=crypto.createHash('sha256').update(JSON.stringify([m.job,m.contact,m.internalNote,photos.map(p=>[p.hash,p.name])])).digest('hex');
return [{json:{...m,photos,plan},binary,pairedItem:{item:0}}];`);
link(photoGate,manifest);link(decode,manifest);
const claim=sql('Claim source and seal Quote plan','SELECT cooltech_quotes.standard_claim($1::uuid,$2::timestamptz,$3,$4,$5::integer) AS claimed',
  '[$json.source,$json.stampISO,$json.offset,$json.plan,$json.photos.length]');
const claimed=sw('Did the ledger claim this enquiry?','claimed',['true']);
chain(manifest,claim,claimed);link(claimed,each,1);
const actions=code('Prepare exact-UUID write sequence',`
const m=${ref(manifest)}, uuid=require('crypto').randomUUID,job=uuid();
const {queue_uuid,...base}=m.job;
const items=[
 {step:'quote',target:job,resource:'job',fields:{...base,quote_sent:0}},
 {step:'contact',target:uuid(),resource:'jobcontact',fields:{job_uuid:job,...m.contact}},
 {step:'note',target:uuid(),resource:'note',fields:{related_object:'job',related_object_uuid:job,note:m.internalNote}},
 ...m.photos.map(f=>({step:'combined:'+f.hash,target:uuid(),resource:'attachment',fields:{related_object:'job',related_object_uuid:job,attachment_name:f.name,file_type:'.'+f.ext},file:f})),
 {step:'queue',target:job,resource:'job',fields:{queue_uuid}}
];
return items.map(a=>({json:{...a,source:m.source,job},...(a.file?{binary:{data:$('${manifest}').item.binary[a.file.slot]}}:{})}));`);
link(claimed,actions);
const steps=add('One durable write step at a time','n8n-nodes-base.splitInBatches',3,{batchSize:1,
  options:{reset:'={{ $json.step === "quote" }}'}});
link(actions,steps);
const reservation=sql('Reserve exact write UUID','SELECT cooltech_quotes.reserve($1::uuid,$2,$3::uuid) AS reserved',
  '[$json.source,$json.step,$json.target]');
link(steps,reservation,1);
const restore=code('Require reservation before HTTP write',`
if($json.reserved!==true)throw Error('Unresolved ledger intent; do not retry');
const a=$('${steps}').item;return [{json:a.json,binary:a.binary}];`);
link(reservation,restore);
const recheck=http('Recheck inbox immediately before write','GET',`={{ '${api}inboxmessage/' + $json.source + '.json' }}`);
link(restore,recheck);
const prepare=code('Check exact inbox snapshot before write',`
const a=$('${restore}').item,r=$json.body,m=${ref(manifest)};
const digest=require('crypto').createHash('sha256').update(JSON.stringify(Object.entries(r??{}).sort(([x],[y])=>x.localeCompare(y)))).digest('hex');
if($json.statusCode!==200||r?.uuid!==a.json.source||digest!==m.snapshot)throw Error('Inbox changed; no write attempted');
return [{json:{...a.json,kind:a.json.step==='queue'?'route':a.json.file?'photo':'record'},binary:a.binary}];`);
link(recheck,prepare);
const routes=sw('Select ServiceM8 write','kind',['record','photo','route']);
link(prepare,routes);
const no=code('Unexpected operation — stop',`throw Error('Unknown write operation');`);link(routes,no,3);
const create=http('Create Quote contact or diary record once','POST',`={{ '${api}' + $json.resource + '.json' }}`,
  {body:'={{ {...$json.fields,uuid:$json.target} }}'});
const upload=http('Upload photo once','POST',`${api}attachment.json`,{multipart:true});
const route=http('Move completed Quote to website queue','POST',`={{ '${api}job/' + $json.target + '.json' }}`,{body:'={{ $json.fields }}'});
[create,upload,route].forEach((n,i)=>link(routes,n,i));
const receipt=http('Read exact ServiceM8 record','GET',`={{ '${api}' + ${ref(prepare)}.resource + '/' + ${ref(prepare)}.target + '.json' }}`);
[create,upload,route].forEach(n=>link(n,receipt));
const verify=code('Verify ServiceM8 record fields',`
const a=${ref(prepare)},r=$json.body;
const bool=v=>[0,false,'0','false'].includes(v);
const exact=(obj,fields)=>Object.entries(fields).every(([k,v])=>obj[k]===v);
if($json.statusCode!==200||r?.uuid!==a.target||
   !exact(r,Object.fromEntries(Object.entries(a.fields).filter(([k])=>k!=='quote_sent')))||
   (a.resource==='job'&&(r.status!=='Quote'||!bool(r.quote_sent)||!['','0000-00-00 00:00:00',null].includes(r.quote_sent_stamp)))||
   (a.step==='quote'&&!['',null,'00000000-0000-0000-0000-000000000000'].includes(r.queue_uuid)))
  throw Error('Exact ServiceM8 readback failed; do not recreate');
return [{json:{...a,kind:a.file?'photo':'record'}}];`);
link(receipt,verify);
const verifyGate=sw('Requires photo byte verification?','kind',['photo']);
link(verify,verifyGate);
const redirect=http('Read authenticated photo redirect','GET',`={{ '${api}attachment/' + $json.target + '.file' }}`,{binary:true});
link(verifyGate,redirect,0);
const checkRedirect=code('Validate ServiceM8 CDN hostname',`
const url=new URL($json.headers?.location??'https://invalid.example');
if($json.statusCode!==302||url.protocol!=='https:'||url.hostname!=='data-cdn-ap-southeast-2.servicem8.com'||
  url.username||url.password||url.port)throw Error('Unverified ServiceM8 storage redirect');
return [{json:{url:url.href}}];`);
const bytes=http('Download uploaded photo without credentials','GET','={{ $json.url }}',{auth:false,binary:true});
const digest=code('Verify uploaded photo digest',`
const a=${ref(verify)},b=await this.helpers.getBinaryDataBuffer(0,'data');
if($json.statusCode!==200||require('crypto').createHash('sha256').update(b).digest('hex')!==a.file.hash)
 throw Error('Uploaded photo bytes do not match');
return [{json:a}];`);
chain(redirect,checkRedirect,bytes,digest);
const confirm=sql('Confirm exact write receipt in ledger','SELECT cooltech_quotes.confirm($1::uuid,$2,$3::uuid) AS verified','[$json.source,$json.step,$json.target]');
link(verifyGate,confirm,1);link(digest,confirm);
const next=code('Continue only with verified receipt',`if($json.verified!==true)throw Error('Ledger refused confirmation');return [{json:{status:'verified'}}];`);
chain(confirm,next,steps);
const complete=sql('Close verified enquiry in ledger','SELECT cooltech_quotes.standard_finish($1::uuid) AS completed',`[${ref(manifest)}.source]`);
link(steps,complete,0);link(complete,each);

export {nodes,edges};
if(process.argv[1]?.endsWith('build-standard.mjs'))console.log(JSON.stringify({nodes,edges},null,2));
