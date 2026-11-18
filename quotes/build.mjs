import {readFileSync,writeFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const write=(name,data)=>writeFileSync(new URL(name,import.meta.url),data);
const manual='Manual fixture test',gate='Pilot sealed - no approved UUID',route='Select approved execution mode';
const stub='Run exact pilot engine with stubs',adapter='Call one-message pilot adapter',result='Verify pilot result';
const js=jsCode=>({mode:'runOnceForAllItems',jsCode});
const shared=['engine.mjs','scenarios.mjs'].map(n=>read(n).replace(/^export /gm,'')).join('\n');
const tests=`const {createHash}=require('crypto');\n${shared}
const map=m=>(function($input){${read('map.js')}})({all:()=>[{json:m}]})[0].json;
return [{json:await scenarios({runPilot,map,digest:b=>createHash('sha256').update(b).digest('hex')},stubLedger)}];`;
const liveResult=`const x=$input.first().json;
if(x.protocol!=='cooltech-one-message-v1'||x.status!=='verified'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(x.quote)||!Number.isInteger(x.files)||x.files<0||x.files>11)
  throw new Error('Pilot not verified; review adapter and ledger without rerunning. '+( /^[a-z_]{1,40}$/.test(x.reason??'')?x.reason:'no_verified_result'));
return [{json:{status:x.status,quote:x.quote,files:x.files}}];`;
const nodes=[
  {name:manual,type:'n8n-nodes-base.manualTrigger',typeVersion:1,parameters:{},position:[0,0]},
  {name:gate,type:'n8n-nodes-base.code',typeVersion:2,parameters:js(`return [{json:{mode:'synthetic'}}];`),position:[250,0]},
  {name:route,type:'n8n-nodes-base.switch',typeVersion:3.4,parameters:{mode:'rules',rules:{values:['synthetic','approved-pilot'].map(s=>({
    renameOutput:true,outputKey:s,conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},
      conditions:[{leftValue:'={{ $json.mode }}',rightValue:s,operator:{type:'string',operation:'equals'}}],combinator:'and'}
  }))},options:{fallbackOutput:'none'}},position:[500,0]},
  {name:stub,type:'n8n-nodes-base.code',typeVersion:2,parameters:js(tests),position:[750,-140]},
  {name:adapter,type:'n8n-nodes-base.httpRequest',typeVersion:4.3,disabled:true,parameters:{
    method:'POST',url:'https://cooltech-pilot.invalid/pilot',authentication:'genericCredentialType',genericAuthType:'httpTemplatedCustomAuth',
    sendHeaders:true,headerParameters:{parameters:[{name:'Content-Length',value:'0'}]},
    options:{timeout:205000,redirect:{redirect:{followRedirects:false}},response:{response:{responseFormat:'json'}}}
  },position:[750,140]},
  {name:result,type:'n8n-nodes-base.code',typeVersion:2,parameters:js(liveResult),position:[1000,140]}
];
const edges=[
  {source:manual,target:gate},{source:gate,target:route},
  {source:route,target:stub,sourceIndex:0},{source:route,target:adapter,sourceIndex:1},
  {source:adapter,target:result}
];
const nodeGroups=[{name:'One-message pilot (sealed)',nodeNames:[adapter,result],description:'One authenticated call; verify the adapter receipt. Sealed by default.'}];
const stringify=o=>JSON.stringify(o).replace(/"=(\{\{(?:[^"\\]|\\.)*?\}\})"/g,(_,v)=>`expr(${JSON.stringify(JSON.parse('"'+v+'"'))})`);
const outputs=[{},{mode:'synthetic'},{mode:'synthetic'},{status:'verified',mode:'synthetic',cases:8},
  {protocol:'cooltech-one-message-v1',status:'verified',quote:'00000000-0000-4000-8000-000000000001',files:2},
  {status:'verified',quote:'00000000-0000-4000-8000-000000000001',files:2}];
const sdk=nodes.map(({type,typeVersion:version,...config},i)=>`const n${i} = ${['trigger','node','switchCase'][i]??'node'}({type:${JSON.stringify(type)},version:${version},config:${stringify({...config,output:[outputs[i]]})}});`);
const workflowCode=`import {workflow,node,trigger,switchCase,expr} from '@n8n/workflow-sdk';\n${sdk.join('\n')}\nexport default workflow('cooltech-website-quote','COOLTECH_Website_to_Quote').add(n0).to(n1).to(n2.onCase(0,n3).onCase(1,n4.to(n5))).group('One-message pilot (sealed)',[n4,n5],{description:'One authenticated call; verify the adapter receipt. Sealed by default.'});\n`;
write('workflow.ts',workflowCode);
const payload={code:workflowCode,nodes,edges,nodeGroups};
write('nodes.json',JSON.stringify(payload));
write('bridge.cjs',`()=>(${JSON.stringify(payload)})\n`);
