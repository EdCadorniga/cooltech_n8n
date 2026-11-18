// Build a sealed, one-message pilot lane. No schedule, connection to fixture
// outputs, enabled network writer, or selected database credential.
export function pilot(){
 const nodes=[],edges=[];
 const add=(name,type,typeVersion,parameters,disabled=false)=>{
   nodes.push({name,type,typeVersion,parameters,disabled,position:[(nodes.length%9)*270,700+Math.floor(nodes.length/9)*240]});return name;
 };
 const code=(n,jsCode)=>add(n,'n8n-nodes-base.code',2,{mode:'runOnceForAllItems',jsCode});
 const pg=(n,query,bindings)=>add(n,'n8n-nodes-base.postgres',2.8,{operation:'executeQuery',query,options:{queryBatching:'independently',queryReplacement:'={{ ['+bindings+'] }}'}},true);
 const sm=(n,p)=>add(n,'@servicem8/n8n-nodes-servicem8.serviceM8',1,p,true);
 const link=(a,b)=>edges.push({source:a,target:b});
 const chain=(...ns)=>ns.slice(1).forEach((b,i)=>link(ns[i],b));
 const gate=code('Pilot sealed - no approved UUID',`return [];`);
 link('Manual fixture test',gate);
 const get=sm('Read allowlisted inbox UUID',{resource:'inbox',operation:'get',uuid:'={{ $json.source }}'});
 const map=code('Pilot map and source recheck',`const cfg=$('Pilot sealed - no approved UUID').first().json;
const raw=$input.first().json;
if(!cfg.source||raw.uuid!==cfg.source||Date.now()>Date.parse(cfg.until)||!Number.isFinite(Date.parse(cfg.until))||!cfg.client||!Object.hasOwn(raw,'converted_to_job_uuid')||String(raw.is_archived)!=='0'||String(raw.active)!=='1'||raw.converted_to_job_uuid)throw Error('Pilot source/approval mismatch');
const m={...raw,archived:raw.is_archived,clients:[cfg.client],cutoff:cfg.cutoff,files:[]};
const mapped=(function($input){MAPPER})({all:()=>[{json:m}]})[0].json;
if(mapped.route!=='quote')throw Error('Source no longer eligible');return [{json:mapped}];`);
 const src="$('Pilot map and source recheck').first().json.source";
 const qid="$('Recover quote UUID').first().json.result_uuid";
 const reserve=(n,key)=>pg(n,`SELECT * FROM cooltech_reserve($1,$2,$3)`,`${src},${key},$execution.id`);
 const ack=(n,key,id)=>pg(n,`SELECT * FROM cooltech_confirm($1,$2,$3,$4)`,`${src},${key},$execution.id,${id} ?? ''`);
 const j="$('Pilot map and source recheck').first().json";
 const claim=reserve('Reserve quote intent',"'quote'");
 const create=sm('Create Quote in website queue',{resource:'job',operation:'create',status:'Quote',fields:{field:['queue_uuid','company_uuid','job_address','job_description'].map(field=>({field,value:`={{ ${j}.job.${field} }}`}))}});
 const save=ack('Record created quote',"'quote'","$json.uuid");
 const recover=pg('Recover quote UUID',`SELECT result_uuid FROM cooltech_quote_step WHERE source_uuid=$1 AND step='quote' AND result_uuid IS NOT NULL`,src);
 // If the quote exists the create branch emits nothing; a proven quote UUID
 // can independently resume missing child steps. Unknown intent never writes.
 const pages=add('Page matching inbox window','n8n-nodes-base.httpRequest',4.3,{method:'GET',authentication:'predefinedCredentialType',nodeCredentialType:'serviceM8CredentialsApi',url:'https://api.servicem8.com/api_1.0/inboxmessage.json',sendQuery:true,queryParameters:{parameters:[{name:'limit',value:'25'},{name:'$filter',value:'={{ "uuid eq \'" + $json.source + "\'" }}'}]},options:{timeout:15000,redirect:{redirect:{followRedirects:false}},pagination:{pagination:{paginationMode:'updateAParameterInEachRequest',parameters:{parameters:[{type:'qs',name:'offset',value:'={{ $pageCount * 25 }}'}]},paginationCompleteWhen:'other',completeExpression:'={{ $response.body.messages.length < 25 }}',limitPagesFetched:true,maxRequests:4,requestInterval:500}}}},true);
 const select=code('Require complete bounded scan',`const cfg=$('Pilot sealed - no approved UUID').first().json, pages=$input.all().map(i=>i.json.messages);
if(!pages.length||pages.some(p=>!Array.isArray(p))||pages.at(-1).length>=25)throw Error('Incomplete window - hold checkpoint');
if(!pages.flat().some(m=>m.uuid===cfg.source))throw Error('Pilot message missing');return [{json:{source:cfg.source}}];`);
 chain(gate,pages,select,get,map,claim,create,save,recover);link(map,recover);
 const cc=reserve('Reserve contact intent',"'contact'");
 const contact=sm('Set job contact',{resource:'job',operation:'updateContacts',uuid:`={{ ${qid} }}`,contactType:'Job',contactFields:Object.fromEntries(['first','last','email','mobile'].map(f=>[f,`={{ ${j}.contact.${f} }}`]))});
 chain(recover,cc,contact,ack('Confirm contact',"'contact'",qid));
 const noteGate=code('Select private notes',`return ${j}.internalNote ? $input.all():[];`);
 const cn=reserve('Reserve private note intent',"'note'");
 const note=sm('Add private job diary note',{resource:'job',operation:'addNoteToJob',fields:{note:`={{ ${j}.internalNote }}`,related_object_uuid:`={{ ${qid} }}`}});
 chain(recover,noteGate,cn,note,ack('Confirm diary step',"'note'",qid));
 const photos=code('Choose approved photo URLs',`return ${j}.links.map(p=>{if(!/^https:\\/\\/cooltechac\\.com\\.au\\/wp-content\\/uploads\\/elementor\\/forms\\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\\.(?:jpg|jpeg|png)$/i.test(p.url)||!p.url.startsWith('https://cooltechac.com.au/wp-content/uploads/elementor/forms/'))throw Error('Unapproved URL');return {json:{url:p.url,label:p.label}};});`);
 const download=add('Download photo without credentials','n8n-nodes-base.httpRequest',4.3,{method:'GET',url:'={{ $json.url }}',authentication:'none',sendHeaders:true,headerParameters:{parameters:[{name:'Range',value:'bytes=0-10485760'},{name:'Accept-Encoding',value:'identity'}]},options:{timeout:15000,redirect:{redirect:{followRedirects:false}},response:{response:{fullResponse:true,responseFormat:'file',outputPropertyName:'data'}}}},true);
 chain(recover,photos,download);
 const email=sm('Get original email file bytes',{resource:'attachment',operation:'get',uuid:'={{ $json.uuid }}',downloadFile:true,binaryPropertyName:'data'});
 const inventory=add('List attachments of this inbox UUID','n8n-nodes-base.httpRequest',4.3,{method:'GET',authentication:'predefinedCredentialType',nodeCredentialType:'serviceM8CredentialsApi',url:'https://api.servicem8.com/api_1.0/attachment.json',sendQuery:true,queryParameters:{parameters:[{name:'$filter',value:`={{ "related_object_uuid eq '" + ${src} + "'" }}`},{name:'limit',value:'21'}]},options:{timeout:15000,redirect:{redirect:{followRedirects:false}},response:{response:{fullResponse:true,responseFormat:'json'}}}},true);
 const plan=code('Select verified email file IDs',`const cfg=$('Pilot sealed - no approved UUID').first().json;
const rows=$input.first().json.body;
if(!Array.isArray(cfg.verifiedEmailFiles)||!Array.isArray(rows)||rows.length>20)throw Error('Original attachment inventory not verified');
const selected=rows.filter(f=>Number(f.active)===1&&!cfg.verifiedInlineIds?.includes(f.uuid));
if(selected.length!==cfg.verifiedEmailFiles.length||!cfg.verifiedEmailFiles.every(id=>selected.some(f=>f.uuid===id)))throw Error('Unexpected or missing original email attachment');
return selected.map(f=>{if(f.related_object_uuid!==cfg.source||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(f.uuid))throw Error('Email attachment source mismatch');return {json:{uuid:f.uuid}}});`);
 chain(recover,inventory,plan,email);
 const validation=(isPhoto)=>code(isPhoto?'Check downloaded image bytes':'Check original file bytes',`const out=[];for(const [i,item] of $input.all().entries()){
const b=await this.helpers.getBinaryDataBuffer(i,'data');if(!b.length||b.length>10485760)throw Error('File size outside limit');
${isPhoto?`const {statusCode,headers}=item.json; if(statusCode!==200&&statusCode!==206)throw Error('Photo response rejected');
if(statusCode===206&&headers['content-range']!=='bytes 0-'+(b.length-1)+'/'+b.length)throw Error('Partial file');`:''}
const ext=b.subarray(0,3).toString('hex')==='ffd8ff'&&b.subarray(-2).toString('hex')==='ffd9'?'jpg':b.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&b.subarray(-8,-4).toString()==='IEND'?'png':${isPhoto?`null`:`b.subarray(0,5).toString()==='%PDF-'?'pdf':null`};
if(!ext)throw Error('Unverified file type - review');
const name=${isPhoto?`$('Choose approved photo URLs').itemMatching(i).json.label`:`String(item.binary.data.fileName||'email-file').replace(/\\.[^.]+$/,'')`}.replace(/[^\\w-]/g,'-').slice(0,80)+'.'+ext;
const hash=require('crypto').createHash('sha256').update(b).digest('hex');out.push({json:{hash,name},binary:{data:{...item.binary.data,fileName:name}},pairedItem:{item:i}});}return out;`);
 // Preserve the linked binary across the SQL reservation, using item pairing.
 for(const [port,isPhoto] of [[download,true],[email,false]]){
   const valid=validation(isPhoto),prefix=isPhoto?'Photo':'Email';
   const claim=reserve(prefix+' - reserve digest',"'sha256:'+$json.hash");
   const restore=code(prefix+' - restore binary reference',`return $input.all().map((_,i)=>{const f=$('${valid}').itemMatching(i);return {json:f.json,binary:f.binary,pairedItem:{item:i}};});`);
   const upload=sm(prefix+' - upload binary to quote',{resource:'attachment',operation:'create',relatedObjectType:'job',relatedObjectUuid:`={{ ${qid} }}`,binaryPropertyName:'data',options:{attachment_name:'={{ $binary.data.fileName }}'}});
   const confirm=ack(prefix+' - confirm attachment',`'sha256:'+$('${restore}').item.json.hash`,'$json.uuid');
   chain(port,valid,claim,restore,upload,confirm);
 }
 return {nodes,edges};
}
