import { workflow, node, trigger, placeholder, newCredential } from '@n8n/workflow-sdk';

const manual = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Manual one-message run', output: [{}] },
});
const preflight = node({
  type: 'CUSTOM.cooltechQuotePilot',
  version: 1,
  config: {
    name: 'Cooltech Quote Read-Only Preflight',
    parameters: {
      operation: 'preflight',
      source: placeholder('Exact approved inbox UUID'),
      client: '',
      baseline: '',
      storageHosts: 'data-cdn-ap-southeast-2.servicem8.com',
      inboxUtcOffset: '',
    },
    credentials: {
      cooltechQuoteLedger: newCredential('Cooltech Quote Ledger'),
      serviceM8CredentialsApi: newCredential('COOLTECH ServiceM8 Credentials account'),
    },
    output: [{ status: 'preflight_verified', files: 3 }],
  },
});
export default workflow('cooltech-website-quote', 'COOLTECH_Website_to_Quote').add(manual).to(preflight);
