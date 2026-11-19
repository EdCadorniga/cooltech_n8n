import { workflow, node, trigger, newCredential, splitInBatches, nextBatch } from '@n8n/workflow-sdk';

const manual = trigger({
  type: 'n8n-nodes-base.manualTrigger', version: 1,
  config: { name: 'Manual one-message run', output: [{}] },
});
const everyFive = trigger({
  type: 'n8n-nodes-base.scheduleTrigger', version: 1.4,
  config: {
    name: 'Every five minutes',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } },
    output: [{}],
  },
});
const credentials = {
  cooltechQuoteLedger: newCredential('Cooltech Quote Ledger'),
  serviceM8CredentialsApi: newCredential('COOLTECH ServiceM8 Credentials account'),
};
const scan = node({
  type: 'CUSTOM.cooltechQuotePilot', version: 1,
  config: {
    name: 'Inspect latest 20 inbox items',
    parameters: { operation: 'scan', storageHosts: 'data-cdn-ap-southeast-2.servicem8.com' },
    credentials,
    output: [{ status: 'read_only', scanned: 20, candidates: 0 }],
  },
});
const stage=(name:string,operation:string)=>node({
  type:'CUSTOM.cooltechQuotePilot',version:1,
  config:{name,parameters:{operation,storageHosts:'data-cdn-ap-southeast-2.servicem8.com'},credentials,
    output:[{index:0,status:'stage_complete'}]},
});
const fetchInbox=stage('Fetch latest 20 ServiceM8 items','fetch_inbox');
const select=stage('Select eligible website enquiries','select_candidates');
const loop=splitInBatches({version:3,config:{name:'One enquiry at a time',parameters:{batchSize:1}}});
const claim=stage('Claim source in Cooltech ledger','claim');
const source=stage('Reload and map submission','source');
const inventory=stage('Validate photo and file inventory','inventory');
const create=stage('Create unsent Quote','create_quote');
const contact=stage('Add job contact','contact');
const diary=stage('Write internal diary note','diary');
const photos=stage('Upload and check website photos','photos');
const details=stage('Verify contact diary and files','verify_details');
const queue=stage('Move to X-New Website Quotes','queue');
const verify=stage('Verify final unsent Quote','verify_quote');
const record=stage('Record outcome in ledger','record_result');
const summary=stage('Summarize quote run','summarize');
export default workflow('cooltech-website-quote','COOLTECH_Website_to_Quote')
  .add(manual).to(scan)
  .add(everyFive).to(fetchInbox).to(select)
  .to(loop.onDone(summary).onEachBatch(claim.to(source).to(inventory).to(create).to(contact).to(diary)
    .to(photos).to(details).to(queue).to(verify).to(record).to(nextBatch(loop))))
  .group('Intake',[fetchInbox,select],{description:'Fetch the newest 20 inbox items and apply the website quote eligibility rules.'})
  .group('Process and verify each Quote',[claim,source,inventory,create,contact,diary,photos,details,queue,verify,record],
    {description:'Claim each source, validate and write the Quote, then route it and record the verified result.'});
