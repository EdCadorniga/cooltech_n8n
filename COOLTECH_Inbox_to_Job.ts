import { workflow, node, trigger, switchCase, newCredential, expr } from '@n8n/workflow-sdk';

const checkInbox = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Check Inbox',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 10 }] } },
    position: [240, 300],
  },
  output: [{}],
});

const configNode = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'CONFIG',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `return [{ json: { targetQueueName: 'X-New Jobs Created Automation', targetQueueUuid: '423e140e-89ce-4616-a685-245674278d7b' } }];`,
    },
    position: [480, 300],
  },
  output: [{ targetQueueName: 'X-New Jobs Created Automation', targetQueueUuid: '423e140e-89ce-4616-a685-245674278d7b' }],
});

const listInboxMessages = node({
  type: '@servicem8/n8n-nodes-servicem8.serviceM8',
  version: 1,
  config: {
    name: 'List Inbox Messages',
    parameters: {
      resource: 'inbox',
      operation: 'getMany',
      inboxFilter: 'all',
      inboxSearch: '',
      limit: 20,
    },
    credentials: { serviceM8CredentialsApi: newCredential('COOLTECH ServiceM8 Credentials account') },
    executeOnce: true,
    position: [720, 300],
  },
  output: [{ uuid: 'msg-uuid', body: 'message body', message_text: 'Online Service Enquiry', subject: 'Subj', fromName: 'John', fromEmail: 'john@test.com', date: '2024-01-01T00:00:00.000Z', converted_to_job_uuid: null }],
});

const filterAndRoute = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Filter & Route',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const items = $input.all();
const queueUuid = $("CONFIG").item.json.targetQueueUuid;

const toTs = (value) => {
  const ts = Date.parse(value || '');
  return Number.isNaN(ts) ? 0 : ts;
};

const result = items
  .map((item) => item.json)
  .filter((msg) => msg && !msg.converted_to_job_uuid)
  .sort((a, b) => toTs(b.date) - toTs(a.date))
  .slice(0, 5)
  .map((msg) => {
    let type = null;
    if (msg.message_text && msg.message_text.startsWith('Online Service Enquiry')) {
      type = 'online';
    } else if (msg.subject && msg.subject.includes('New Enquiry - Cooltech Website')) {
      type = 'website';
    }

    return type ? {
      uuid: msg.uuid,
      body: msg.body,
      message_text: msg.message_text,
      fromName: msg.fromName,
      fromEmail: msg.fromEmail,
      subject: msg.subject,
      queueUuid,
      type,
    } : null;
  })
  .filter((msg) => msg !== null);

return result.map((msg) => ({ json: msg }));`,
    },
    position: [960, 300],
  },
  output: [{ uuid: 'msg-uuid', body: 'message body', message_text: 'Online Service Enquiry', fromName: 'John', fromEmail: 'john@test.com', subject: 'Subj', queueUuid: 'queue-uuid', type: 'online' }],
});

const routeByType = switchCase({
  version: 3.4,
  config: {
    name: 'Route by Type',
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          {
            outputKey: 'Online',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
              conditions: [{ leftValue: expr('{{ $json.type }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'online' }],
              combinator: 'and',
            },
          },
          {
            outputKey: 'Website',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
              conditions: [{ leftValue: expr('{{ $json.type }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'website' }],
              combinator: 'and',
            },
          },
        ],
      },
      options: { fallbackOutput: 'none' },
    },
    position: [1200, 300],
  },
});

const convertOnlineToJob = node({
  type: '@servicem8/n8n-nodes-servicem8.serviceM8',
  version: 1,
  config: {
    name: 'Convert Online to Job',
    parameters: {
      resource: 'inbox',
      operation: 'convertToJob',
      uuid: expr('{{ $json.uuid }}'),
      fields: {},
    },
    credentials: { serviceM8CredentialsApi: newCredential('COOLTECH ServiceM8 Credentials account') },
    position: [1440, 100],
  },
  output: [{ uuid: 'new-job-uuid' }],
});

const mergeOnlineData = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Merge Online Data',
    parameters: {
      mode: 'runOnceForEachItem',
      language: 'javaScript',
      jsCode: `const item = $("Filter & Route").item.json;
const body = item.body || '';
const lines = body.split('\\n');
const serviceIndex = lines.findIndex((line) => line.startsWith('Service'));
const description = serviceIndex >= 0 ? lines.slice(serviceIndex).join('\\n') : body;

return [{
  json: {
    jobUuid: $json.uuid,
    description,
    queueUuid: item.queueUuid,
  },
}];`,
    },
    position: [1680, 100],
  },
  output: [{ jobUuid: 'new-job-uuid', description: 'Service: Test', queueUuid: 'queue-uuid' }],
});

const updateOnlineJob = node({
  type: '@servicem8/n8n-nodes-servicem8.serviceM8',
  version: 1,
  config: {
    name: 'Update Online Job',
    parameters: {
      resource: 'job',
      operation: 'update',
      uuid: expr('{{ $json.jobUuid }}'),
      fields: {
        field: [
          { field: 'job_description', value: expr('{{ $json.description }}') },
          { field: 'queue_uuid', value: expr('{{ $json.queueUuid }}') },
        ],
      },
    },
    credentials: { serviceM8CredentialsApi: newCredential('COOLTECH ServiceM8 Credentials account') },
    position: [1920, 100],
  },
  output: [{}],
});

const convertWebsiteToJob = node({
  type: '@servicem8/n8n-nodes-servicem8.serviceM8',
  version: 1,
  config: {
    name: 'Convert Website to Job',
    parameters: {
      resource: 'inbox',
      operation: 'convertToJob',
      uuid: expr('{{ $json.uuid }}'),
      fields: {},
    },
    credentials: { serviceM8CredentialsApi: newCredential('COOLTECH ServiceM8 Credentials account') },
    position: [1440, 500],
  },
  output: [{ uuid: 'new-job-uuid' }],
});

const mergeWebsiteData = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Merge Website Data',
    parameters: {
      mode: 'runOnceForEachItem',
      language: 'javaScript',
      jsCode: `const item = $("Filter & Route").item.json;
const body = item.body || '';
const lines = body.split('\\n');
const emailLine = lines.find((line) => line.startsWith('Email:'));
const phoneLine = lines.find((line) => line.startsWith('Phone:'));
const nameLine = lines.find((line) => line.startsWith('Name:'));
const contactEmail = emailLine ? emailLine.replace('Email:', '').trim() : (item.fromEmail || '');
const contactPhone = phoneLine ? phoneLine.replace('Phone:', '').trim() : '';
const fullName = nameLine ? nameLine.replace('Name:', '').trim() : (item.fromName || '');
const nameParts = fullName.split(/\\s+/).filter(Boolean);
const contactFirst = nameParts[0] || fullName;
const contactLast = nameParts.slice(1).join(' ');
const enquiryIndex = body.indexOf("You've received a new enquiry");
const description = enquiryIndex >= 0 ? body.substring(enquiryIndex) : body;

return [{
  json: {
    jobUuid: $json.uuid,
    description,
    queueUuid: item.queueUuid,
    contactFirst,
    contactLast,
    contactEmail,
    contactPhone,
  },
}];`,
    },
    position: [1680, 500],
  },
  output: [{ jobUuid: 'new-job-uuid', description: 'enquiry text', queueUuid: 'queue-uuid', contactFirst: 'John', contactLast: 'Citizen', contactEmail: 'john@test.com', contactPhone: '0400000000' }],
});

const createJobContact = node({
  type: '@servicem8/n8n-nodes-servicem8.serviceM8',
  version: 1,
  config: {
    name: 'Create Job Contact',
    parameters: {
      resource: 'job',
      operation: 'updateContacts',
      uuid: expr('{{ $json.jobUuid }}'),
      contactType: 'Job',
      contactFields: {
        first: expr('{{ $json.contactFirst }}'),
        last: expr('{{ $json.contactLast }}'),
        email: expr('{{ $json.contactEmail }}'),
        phone: expr('{{ $json.contactPhone }}'),
      },
    },
    credentials: { serviceM8CredentialsApi: newCredential('COOLTECH ServiceM8 Credentials account') },
    position: [1920, 500],
  },
  output: [{}],
});

const updateWebsiteJob = node({
  type: '@servicem8/n8n-nodes-servicem8.serviceM8',
  version: 1,
  config: {
    name: 'Update Website Job',
    parameters: {
      resource: 'job',
      operation: 'update',
      uuid: expr('{{ $("Merge Website Data").item.json.jobUuid }}'),
      fields: {
        field: [
          { field: 'job_description', value: expr('{{ $("Merge Website Data").item.json.description }}') },
          { field: 'queue_uuid', value: expr('{{ $("Merge Website Data").item.json.queueUuid }}') },
        ],
      },
    },
    credentials: { serviceM8CredentialsApi: newCredential('COOLTECH ServiceM8 Credentials account') },
    position: [2160, 500],
  },
  output: [{}],
});

export default workflow('cooltech-inbox-to-job', 'COOLTECH_Inbox_to_Job')
  .add(checkInbox)
  .to(configNode)
  .to(listInboxMessages)
  .to(filterAndRoute)
  .to(
    routeByType
      .onCase(0, convertOnlineToJob.to(mergeOnlineData).to(updateOnlineJob))
      .onCase(1, convertWebsiteToJob.to(mergeWebsiteData).to(createJobContact).to(updateWebsiteJob)),
  );
