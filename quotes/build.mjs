// Run from repo root. Output: the self-contained, credential-free SDK export.
import {readFileSync,writeFileSync} from 'node:fs';
import {pilot} from './pilot.mjs';
const names={fixture:'Synthetic inbox',page:'Bounded fixture pages',map:'Match and map template',binary:'Validate fixture downloads and email files',reconcile:'Simulate writes and reconcile',excluded:'Assert skip and review outcomes'};
const defs=[],configs=[];
function add(id,builder,type,version,name,parameters){
  const config={name,parameters};
  configs.push({name,type,typeVersion:version,parameters});
  defs.push(`const ${id} = ${builder}(${JSON.stringify({type,version,config}) .replace('"={{ $json.route }}"',`expr('{{ $json.route }}')`)});`);
}
add('start','trigger','n8n-nodes-base.manualTrigger',1,'Manual fixture test',{});
for(const [id,name] of Object.entries(names))add(id,'node','n8n-nodes-base.code',2,name,{mode:'runOnceForAllItems',jsCode:readFileSync(`quotes/${id}.js`,'utf8')});
add('route','switchCase','n8n-nodes-base.switch',3.4,'Quote candidate?',{mode:'rules',rules:{values:[{renameOutput:true,outputKey:'Quote',conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{leftValue:'={{ $json.route }}',rightValue:'quote',operator:{type:'string',operation:'equals'}}],combinator:'and'}}]},options:{fallbackOutput:'extra',renameFallbackOutput:'Skip or review'}});
writeFileSync('quotes/workflow.ts',`import {workflow,node,trigger,switchCase,expr} from '@n8n/workflow-sdk';\n${defs.join('\n')}\nexport default workflow('cooltech-website-quote','COOLTECH_Website_to_Quote').add(start).to(fixture).to(page).to(map).to(route.onCase(0,binary.to(reconcile)).onCase(1,excluded)).group('Intake and mapping',[fixture,page,map],{description:'Bounded synthetic inbox, dual markers, site and contact mapping.'}).group('File and retry checks',[binary,reconcile],{description:'Pass synthetic binaries directly to stub writers; reconcile ambiguous outcomes by source UUID.'});\n`);
const p=pilot(),variables={'Manual fixture test':'start'};
const ops=[];
for(const [i,n] of p.nodes.entries()){
 const v=variables[n.name]='p'+i;
 if(n.parameters.jsCode)n.parameters.jsCode=n.parameters.jsCode.replace('MAPPER',()=>readFileSync('quotes/map.js','utf8'));
 const {type,typeVersion:version,...config}=n;
 const stringify=o=>JSON.stringify(o).replace(/"=(\{\{(?:[^"\\]|\\.)*?\}\})"/g,(_,v)=>`expr(${JSON.stringify(JSON.parse('"'+v+'"'))})`);
 defs.push(`const ${v}=node({type:${JSON.stringify(type)},version:${version},config:${stringify(config)}});`);
 configs.push({name:n.name,type,typeVersion:version,parameters:n.parameters});
 ops.push({type:'addNode',node:n});
}
const stages=[
 ['Pilot source',['Pilot sealed - no approved UUID','Page matching inbox window','Require complete bounded scan','Read allowlisted inbox UUID','Pilot map and source recheck'],'Sealed UUID and time window; bounded pages and fresh source state before a claim.'],
 ['Quote intent',['Reserve quote intent','Create Quote in website queue','Record created quote'],'Reserve a unique source key before creating an unsent quote, then persist its UUID.'],
 ['Contact intent',['Reserve contact intent','Set job contact','Confirm contact'],'Apply only to the job contact of the recovered quote.'],
 ['Private notes',['Select private notes','Reserve private note intent','Add private job diary note','Confirm diary step'],'Keep the labelled URLs in the internal job diary.'],
 ['Photo transfer',['Choose approved photo URLs','Download photo without credentials','Check downloaded image bytes','Photo - reserve digest','Photo - restore binary reference','Photo - upload binary to quote','Photo - confirm attachment'],'Validate host, response and image markers; claim digest and pass binary to the quote.'],
 ['Email transfer',['List attachments of this inbox UUID','Select verified email file IDs','Get original email file bytes','Check original file bytes','Email - reserve digest','Email - restore binary reference','Email - upload binary to quote','Email - confirm attachment'],'Check original inventory, skip verified inline files, and share the same per-source digest ledger.']
];
stages[0][1].push(...stages[1][1],'Recover quote UUID');
stages[0][0]='Pilot source and quote';
stages.splice(1,1);
Object.assign(variables,Object.fromEntries(Object.entries(names).map(([v,n])=>[n,v])),{'Quote candidate?':'route'});
stages.unshift(['Synthetic acceptance',[...Object.values(names),'Quote candidate?'],'Manual fixtures exercise bounded pages, mapping, exclusion, binary transfer and uncertain writes.']);
ops.push(...p.edges.map(e=>({type:'addConnection',...e})),{type:'setNodeGroups',nodeGroups:stages.map(([name,nodeNames,description])=>({name,nodeNames,description}))});
const base=readFileSync('quotes/workflow.ts','utf8').split('export default ')[1].split('.group(')[0];
writeFileSync('quotes/workflow.ts',`import {workflow,node,trigger,switchCase,expr} from '@n8n/workflow-sdk';\n${defs.join('\n')}\nexport default ${base}\n${p.edges.map(e=>`.add(${variables[e.source]}.to(${variables[e.target]}))`).join('\n')}\n${stages.map(([n,ns,d])=>`.group(${JSON.stringify(n)},[${ns.map(k=>variables[k]).join(',')}],{description:${JSON.stringify(d)}})`).join('\n')};\n`);
writeFileSync('quotes/nodes.json',JSON.stringify({configs,ops}));
