import { workflow, node, trigger, switchCase, splitInBatches, nextBatch, newCredential, expr } from '@n8n/workflow-sdk';

const checkInbox = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Check Inbox',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } },
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

const isSpamOrTestWebsiteEnquiry = (msg) => {
  const body = String(msg.message_text || '').toLowerCase();
  const subject = String(msg.subject || '').toLowerCase();
  const email = String(msg.from_email || msg.fromEmail || '').toLowerCase();

  const spamSignals = [
    'ai-driven seo',
    'local and global rankings',
    'audit report',
    'design-related issues',
    'optimize its ranking',
    'should i send more information',
    'test for automation',
  ];

  return subject.includes('new enquiry') && spamSignals.some((signal) => body.includes(signal) || email.includes(signal));
};

const result = items
  .map((item) => item.json)
  .filter((msg) => msg && !msg.converted_to_job_uuid)
  .sort((a, b) => toTs(b.date) - toTs(a.date))
  .slice(0, 20)
  .map((msg) => {
    const normalizedMessageText = String(msg.message_text || '').trim().toLowerCase();
    const normalizedSubject = String(msg.subject || '')
      .replace(/[\u2010-\u2015]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    let type = null;
    if (normalizedMessageText.startsWith('online service enquiry')) {
      type = 'online';
    } else if (normalizedSubject.includes('new enquiry - cooltech website')) {
      if (isSpamOrTestWebsiteEnquiry(msg)) {
        return null;
      }
      type = 'website';
    }

    return type ? {
      uuid: msg.uuid,
      body: msg.body,
      message_text: msg.message_text,
      fromName: msg.from_name || msg.fromName,
      fromEmail: msg.from_email || msg.fromEmail,
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

const processMatchedItems = splitInBatches({
  version: 3,
  config: {
    name: 'Process Matched Items',
    parameters: {
      batchSize: 1,
    },
    position: [1200, 300],
  },
});

const routeResolvedOnlineItem = switchCase({
  version: 3.4,
  config: {
    name: 'Route Resolved Online Item',
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          {
            outputKey: 'Process',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
              conditions: [{ leftValue: expr('{{ $json.route }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'process' }],
              combinator: 'and',
            },
          },
          {
            outputKey: 'Skip',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
              conditions: [{ leftValue: expr('{{ $json.route }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'skip' }],
              combinator: 'and',
            },
          },
        ],
      },
      options: { fallbackOutput: 'none' },
    },
    position: [3152, 100],
  },
});

const routeResolvedWebsiteItem = switchCase({
  version: 3.4,
  config: {
    name: 'Route Resolved Website Item',
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          {
            outputKey: 'Process',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
              conditions: [{ leftValue: expr('{{ $json.route }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'process' }],
              combinator: 'and',
            },
          },
          {
            outputKey: 'Skip',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
              conditions: [{ leftValue: expr('{{ $json.route }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'skip' }],
              combinator: 'and',
            },
          },
        ],
      },
      options: { fallbackOutput: 'none' },
    },
    position: [3152, 500],
  },
});

const finishOnlineItem = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Finish Online Item',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: 'return $input.all().map(item => ({ json: item.json }));',
    },
    position: [3600, 100],
  },
  output: [{}],
});

const finishWebsiteItem = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Finish Website Item',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: 'return $input.all().map(item => ({ json: item.json }));',
    },
    position: [4048, 500],
  },
  output: [{}],
});

const convertOnlineToJob = node({
  type: '@servicem8/n8n-nodes-servicem8.serviceM8',
  version: 1,
  config: {
    name: 'Convert Online to Job',
    onError: 'continueErrorOutput',
    parameters: {
      resource: 'inbox',
      operation: 'convertToJob',
      uuid: expr('{{ $json.uuid }}'),
      fields: {},
    },
    credentials: { serviceM8CredentialsApi: newCredential('COOLTECH ServiceM8 Credentials account') },
    position: [1680, 100],
  },
  output: [{ uuid: 'new-job-uuid' }],
});

const waitBeforeFetchOnline = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: 'Wait Before Fetch Online',
    parameters: {
      resume: 'timeInterval',
      amount: 0.5,
      unit: 'seconds',
    },
    position: [1920, 100],
  },
  output: [{}],
});

const fetchConvertedOnlineMessage = node({
  type: '@servicem8/n8n-nodes-servicem8.serviceM8',
  version: 1,
  config: {
    name: 'Fetch Converted Online Message',
    onError: 'continueErrorOutput',
    parameters: {
      resource: 'inbox',
      operation: 'get',
      uuid: expr('{{ $("Filter & Route").item.json.uuid }}'),
    },
    credentials: { serviceM8CredentialsApi: newCredential('COOLTECH ServiceM8 Credentials account') },
    position: [2160, 100],
  },
  output: [{ uuid: 'msg-uuid', converted_to_job_uuid: 'new-job-uuid' }],
});

const uuidResolvedOnline = switchCase({
  version: 3.4,
  config: {
    name: 'UUID Resolved? (Online)',
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          {
            outputKey: 'Resolved',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
              conditions: [{ leftValue: expr("{{ $json.converted_to_job_uuid ? 'resolved' : 'retry' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'resolved' }],
              combinator: 'and',
            },
          },
          {
            outputKey: 'Retry',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
              conditions: [{ leftValue: expr("{{ $json.converted_to_job_uuid ? 'resolved' : 'retry' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'retry' }],
              combinator: 'and',
            },
          },
        ],
      },
      options: { fallbackOutput: 'none' },
    },
    position: [2256, 100],
  },
});

const waitOnlineRetry = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: 'Wait Online Retry',
    parameters: {
      resume: 'timeInterval',
      amount: 3,
      unit: 'seconds',
    },
    position: [2480, 196],
  },
  output: [{}],
});

const fetchOnlineRetry = node({
  type: '@servicem8/n8n-nodes-servicem8.serviceM8',
  version: 1,
  config: {
    name: 'Fetch Online Retry',
    parameters: {
      resource: 'inbox',
      operation: 'get',
      uuid: expr('{{ $("Filter & Route").item.json.uuid }}'),
    },
    credentials: { serviceM8CredentialsApi: newCredential('COOLTECH ServiceM8 Credentials account') },
    position: [2704, 196],
  },
  output: [{ uuid: 'msg-uuid', converted_to_job_uuid: 'new-job-uuid' }],
});

const mergeOnlineData = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Merge Online Data',
    onError: 'continueErrorOutput',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const items = $input.all();
const result = [];
let convertResult = {};

try {
  convertResult = $('Convert Online to Job').first().json || {};
} catch (error) {
  convertResult = {};
}

for (const item of items) {
  const { message_text, body, converted_to_job_uuid } = item.json;
  const text = String(message_text || body || '').trim();
  const lines = text.split('\\n');
  const serviceIndex = lines.findIndex((l) => l.trimStart().startsWith('Service'));
  const rawDesc = serviceIndex >= 0 ? lines.slice(serviceIndex).join('\\n').trim() : text;

  const descLines = rawDesc.split('\\n');
  const cleaned = [];
  let prevBlank = false;
  for (const line of descLines) {
    const t = line.trim();
    if (t === '') {
      if (!prevBlank) { cleaned.push(''); prevBlank = true; }
    } else {
      cleaned.push(t); prevBlank = false;
    }
  }
  while (cleaned.length > 0 && cleaned[cleaned.length - 1] === '') cleaned.pop();
  const description = cleaned.join('\\n');

  const jobUuid = String(converted_to_job_uuid || convertResult.uuid || '');
  const queueUuid = $('CONFIG').first().json.targetQueueUuid;

  result.push({
    json: {
      route: jobUuid ? 'process' : 'skip',
      jobUuid,
      description,
      queueUuid,
    },
  });
}

return result;`,
    },
    position: [2928, 100],
  },
  output: [{ route: 'process', jobUuid: 'new-job-uuid', description: 'Service: Test', queueUuid: 'queue-uuid' }],
});

const updateOnlineJob = node({
  type: '@servicem8/n8n-nodes-servicem8.serviceM8',
  version: 1,
  config: {
    name: 'Update Online Job',
    onError: 'continueErrorOutput',
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
    position: [3376, 100],
  },
  output: [{}],
});

const convertWebsiteToJob = node({
  type: '@servicem8/n8n-nodes-servicem8.serviceM8',
  version: 1,
  config: {
    name: 'Convert Website to Job',
    onError: 'continueErrorOutput',
    parameters: {
      resource: 'inbox',
      operation: 'convertToJob',
      uuid: expr('{{ $json.uuid }}'),
      fields: {},
    },
    credentials: { serviceM8CredentialsApi: newCredential('COOLTECH ServiceM8 Credentials account') },
    position: [1680, 500],
  },
  output: [{ uuid: 'new-job-uuid' }],
});

const waitBeforeFetchWebsite = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: 'Wait Before Fetch Website',
    parameters: {
      resume: 'timeInterval',
      amount: 0.5,
      unit: 'seconds',
    },
    position: [1920, 500],
  },
  output: [{}],
});

const fetchConvertedWebsiteMessage = node({
  type: '@servicem8/n8n-nodes-servicem8.serviceM8',
  version: 1,
  config: {
    name: 'Fetch Converted Website Message',
    onError: 'continueErrorOutput',
    parameters: {
      resource: 'inbox',
      operation: 'get',
      uuid: expr('{{ $("Filter & Route").item.json.uuid }}'),
    },
    credentials: { serviceM8CredentialsApi: newCredential('COOLTECH ServiceM8 Credentials account') },
    position: [2160, 500],
  },
  output: [{ uuid: 'msg-uuid', converted_to_job_uuid: 'new-job-uuid' }],
});

const uuidResolvedWebsite = switchCase({
  version: 3.4,
  config: {
    name: 'UUID Resolved? (Website)',
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          {
            outputKey: 'Resolved',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
              conditions: [{ leftValue: expr("{{ $json.converted_to_job_uuid ? 'resolved' : 'retry' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'resolved' }],
              combinator: 'and',
            },
          },
          {
            outputKey: 'Retry',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
              conditions: [{ leftValue: expr("{{ $json.converted_to_job_uuid ? 'resolved' : 'retry' }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'retry' }],
              combinator: 'and',
            },
          },
        ],
      },
      options: { fallbackOutput: 'none' },
    },
    position: [2256, 500],
  },
});

const waitWebsiteRetry = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: 'Wait Website Retry',
    parameters: {
      resume: 'timeInterval',
      amount: 3,
      unit: 'seconds',
    },
    position: [2480, 596],
  },
  output: [{}],
});

const fetchWebsiteRetry = node({
  type: '@servicem8/n8n-nodes-servicem8.serviceM8',
  version: 1,
  config: {
    name: 'Fetch Website Retry',
    parameters: {
      resource: 'inbox',
      operation: 'get',
      uuid: expr('{{ $("Filter & Route").item.json.uuid }}'),
    },
    credentials: { serviceM8CredentialsApi: newCredential('COOLTECH ServiceM8 Credentials account') },
    position: [2704, 596],
  },
  output: [{ uuid: 'msg-uuid', converted_to_job_uuid: 'new-job-uuid' }],
});

const mergeWebsiteData = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Merge Website Data',
    onError: 'continueErrorOutput',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const items = $input.all();
const result = [];
let convertResult = {};

try {
  convertResult = $('Convert Website to Job').first().json || {};
} catch (error) {
  convertResult = {};
}

const findValueAfterLabel = (lines, label) => {
  const idx = lines.findIndex((l) => l.trimStart().startsWith(label));
  if (idx === -1) return '';
  for (let i = idx + 1; i < lines.length; i++) {
    const val = lines[i].trim();
    if (val) return val;
  }
  return '';
};

for (const item of items) {
  const inbox = item.json;
  const jobUuid = String(inbox.converted_to_job_uuid || convertResult.uuid || '');

  const body = String(inbox.body || inbox.message_text || '').trim();
  const lines = body.split('\\n');

  const fullName = findValueAfterLabel(lines, 'Full Name:') || findValueAfterLabel(lines, 'Name:') || String(inbox.fromName || inbox.from_name || '');
  const nameParts = fullName.split(/\\s+/).filter(Boolean);
  const contactFirst = nameParts[0] || '';
  const contactLast = nameParts.slice(1).join(' ');
  const contactEmail = findValueAfterLabel(lines, 'Email:') || String(inbox.fromEmail || inbox.from_email || '');
  const contactPhone = findValueAfterLabel(lines, 'Phone:');

  const enquiryIndex = body.indexOf("You've received a new enquiry");
  const rawDesc = enquiryIndex >= 0 ? body.substring(enquiryIndex).trim() : body;
  const descLines = rawDesc.split('\\n');
  const cleaned = [];
  let prevBlank = false;
  for (const line of descLines) {
    const t = line.trim();
    if (t === '') {
      if (!prevBlank) { cleaned.push(''); prevBlank = true; }
    } else {
      cleaned.push(t); prevBlank = false;
    }
  }
  while (cleaned.length > 0 && cleaned[cleaned.length - 1] === '') cleaned.pop();
  const description = cleaned.join('\\n');

  result.push({
    json: {
      route: jobUuid ? 'process' : 'skip',
      jobUuid,
      description,
      queueUuid: $('CONFIG').first().json.targetQueueUuid,
      contactFirst,
      contactLast,
      contactEmail,
      contactPhone,
    },
  });
}

return result;`,
    },
    position: [2928, 500],
  },
  output: [{ route: 'process', jobUuid: 'new-job-uuid', description: 'enquiry text', queueUuid: 'queue-uuid', contactFirst: 'John', contactLast: 'Citizen', contactEmail: 'john@test.com', contactPhone: '0400000000' }],
});

const createJobContact = node({
  type: '@servicem8/n8n-nodes-servicem8.serviceM8',
  version: 1,
  config: {
    name: 'Create Job Contact',
    onError: 'continueErrorOutput',
    parameters: {
      resource: 'job',
      operation: 'updateContacts',
      uuid: expr('{{ $json.jobUuid }}'),
      contactFields: {
        first: expr('{{ $json.contactFirst }}'),
        last: expr('{{ $json.contactLast }}'),
        email: expr('{{ $json.contactEmail }}'),
        phone: expr('{{ $json.contactPhone }}'),
      },
    },
    credentials: { serviceM8CredentialsApi: newCredential('COOLTECH ServiceM8 Credentials account') },
    position: [3376, 500],
  },
  output: [{}],
});

const restoreWebsiteContext = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Restore Website Context',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const savedContext = $('Merge Website Data').first().json;
return $input.all().map((item) => ({
  json: {
    jobUuid: savedContext.jobUuid,
    description: savedContext.description,
    queueUuid: savedContext.queueUuid,
    contactResult: item.json,
  },
}));`,
    },
    position: [3600, 500],
  },
  output: [{}],
});

const updateWebsiteJob = node({
  type: '@servicem8/n8n-nodes-servicem8.serviceM8',
  version: 1,
  config: {
    name: 'Update Website Job',
    onError: 'continueErrorOutput',
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
    position: [3824, 500],
  },
  output: [{}],
});

export default workflow('cooltech-inbox-to-job', 'COOLTECH_Inbox_to_Job')
  .add(checkInbox)
  .to(configNode)
  .to(listInboxMessages)
  .to(filterAndRoute)
  .to(
    processMatchedItems.onEachBatch(
      routeByType
        .onCase(
          0,
          convertOnlineToJob
            .to(waitBeforeFetchOnline)
            .to(fetchConvertedOnlineMessage)
            .to(uuidResolvedOnline.onCase(0, mergeOnlineData).onCase(1, waitOnlineRetry.to(fetchOnlineRetry).to(mergeOnlineData)))
            .to(routeResolvedOnlineItem.onCase(0, updateOnlineJob.to(finishOnlineItem)).onCase(1, finishOnlineItem)),
        )
        .onCase(
          1,
          convertWebsiteToJob
            .to(waitBeforeFetchWebsite)
            .to(fetchConvertedWebsiteMessage)
            .to(uuidResolvedWebsite.onCase(0, mergeWebsiteData).onCase(1, waitWebsiteRetry.to(fetchWebsiteRetry).to(mergeWebsiteData)))
            .to(routeResolvedWebsiteItem.onCase(0, createJobContact.to(restoreWebsiteContext).to(updateWebsiteJob).to(finishWebsiteItem)).onCase(1, finishWebsiteItem)),
        ),
    ),
  );

convertOnlineToJob.onError(waitBeforeFetchOnline);
convertWebsiteToJob.onError(waitBeforeFetchWebsite);
fetchConvertedOnlineMessage.onError(finishOnlineItem);
mergeOnlineData.onError(finishOnlineItem);
updateOnlineJob.onError(finishOnlineItem);
finishOnlineItem.to(nextBatch(processMatchedItems));
fetchConvertedWebsiteMessage.onError(finishWebsiteItem);
mergeWebsiteData.onError(finishWebsiteItem);
createJobContact.onError(finishWebsiteItem);
updateWebsiteJob.onError(finishWebsiteItem);
finishWebsiteItem.to(nextBatch(processMatchedItems));
