import { workflow, node, trigger, newCredential } from '@n8n/workflow-sdk';

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
const batch = node({
  type: 'CUSTOM.cooltechQuotePilot', version: 1,
  config: {
    name: 'Process eligible new website quotes',
    parameters: { operation: 'batch', storageHosts: 'data-cdn-ap-southeast-2.servicem8.com' },
    credentials,
    output: [{ status: 'checked', scanned: 20, candidates: 0, verified: 0, held: 0 }],
  },
});
export default workflow('cooltech-website-quote','COOLTECH_Website_to_Quote')
  .add(manual).to(scan)
  .add(everyFive).to(batch);
