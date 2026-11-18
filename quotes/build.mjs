import {writeFileSync} from 'node:fs';
const write=(name,data)=>writeFileSync(new URL(name,import.meta.url),data);
const manual='Manual one-message run',adapter='Call one-message pilot adapter',result='Verify pilot result';
const js=jsCode=>({mode:'runOnceForAllItems',jsCode});
const liveResult=`const x=$input.first().json;
if(x.protocol!=='cooltech-one-message-v1'||x.status!=='verified'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(x.quote)||!Number.isInteger(x.files)||x.files<0||x.files>11)
  throw new Error('Pilot not verified; review adapter and ledger without rerunning. '+( /^[a-z_]{1,40}$/.test(x.reason??'')?x.reason:'no_verified_result'));
return [{json:{status:x.status,quote:x.quote,files:x.files}}];`;
const nodes=[
  {name:manual,type:'n8n-nodes-base.manualTrigger',typeVersion:1,parameters:{},position:[0,0]},
  {name:adapter,type:'n8n-nodes-base.httpRequest',typeVersion:4.3,disabled:true,parameters:{
    method:'POST',url:'https://cooltech-pilot.invalid/pilot',authentication:'genericCredentialType',genericAuthType:'httpTemplatedCustomAuth',
    sendHeaders:true,headerParameters:{parameters:[{name:'Content-Length',value:'0'}]},
    options:{timeout:205000,redirect:{redirect:{followRedirects:false}},response:{response:{responseFormat:'json'}}}
   },position:[250,0]},
   {name:result,type:'n8n-nodes-base.code',typeVersion:2,parameters:js(liveResult),position:[500,0]}
];
const edges=[
   {source:manual,target:adapter},
  {source:adapter,target:result}
];
const nodeGroups=[];
const outputs=[{},
  {protocol:'cooltech-one-message-v1',status:'verified',quote:'00000000-0000-4000-8000-000000000001',files:2},
  {status:'verified',quote:'00000000-0000-4000-8000-000000000001',files:2}];
const sdk=nodes.map(({type,typeVersion:version,...config},i)=>`const n${i} = ${i===0?'trigger':'node'}({type:${JSON.stringify(type)},version:${version},config:${JSON.stringify({...config,output:[outputs[i]]})}});`);
const workflowCode=`import {workflow,node,trigger} from '@n8n/workflow-sdk';\n${sdk.join('\n')}\nexport default workflow('cooltech-website-quote','COOLTECH_Website_to_Quote').add(n0).to(n1).to(n2);\n`;
write('workflow.ts',workflowCode);
const payload={code:workflowCode,nodes,edges,nodeGroups};
write('nodes.json',JSON.stringify(payload));
write('bridge.cjs',`()=>(${JSON.stringify(payload)})\n`);
