import { newCredential, node, trigger, workflow } from '@n8n/workflow-sdk';

const manual = trigger({
  type: 'n8n-nodes-base.manualTrigger', version: 1,
  config: { name: 'Manual one-message run', output: [{}] },
});
const schedule = trigger({
  type: 'n8n-nodes-base.scheduleTrigger', version: 1.4,
  config: {
    name: 'Every five minutes',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } },
    output: [{}],
  },
});
const inbox = node({
  type: '@servicem8/n8n-nodes-servicem8.serviceM8', version: 1,
  config: {
    name: 'List latest 20 inbox items',
    alwaysOutputData: true,
    parameters: { resource: 'inbox', operation: 'getMany', limit: 20 },
    credentials: { serviceM8CredentialsApi: newCredential('COOLTECH ServiceM8 Credentials account') },
    output: [{}],
  },
});
const summary = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Summarize eligible new enquiries',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: String.raw`const cutoff=Date.parse('2026-11-19T07:20:19Z');
const sydney=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',timeZoneName:'longOffset'});
const offset=ms=>sydney.formatToParts(new Date(ms)).find(p=>p.type==='timeZoneName').value.replace('GMT','');
const stamp=t=>{
 if(typeof t!=='string')return NaN;
 if(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(t)){
  const v=t.replace(' ','T');const a=Date.parse(v+'+10:00');if(!Number.isFinite(a))return NaN;
  const b=Date.parse(v+offset(a));return Number.isFinite(b)&&offset(a)===offset(b)?b:NaN;
 }
 return /(?:Z|[+-]\d\d:\d\d)$/.test(t)?Date.parse(t):NaN;
};
const empty=v=>[null,'','00000000-0000-0000-0000-000000000000'].includes(v);
const input=$input.all().map(r=>r.json);
const rows=(input.length===1&&Array.isArray(input[0].messages)?input[0].messages:input).filter(r=>r?.uuid);
if(rows.length>20)throw Error('Inbox batch exceeds 20 items');
const now=Date.now(),seen=new Set();
let candidates=0;
for(const r of rows){
 const t=stamp(r.timestamp),text=String(r.message_text||r.body||''),subject=String(r.subject||'');
 if(seen.has(r.uuid)||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(r.uuid))continue;
 seen.add(r.uuid);
 if(t<cutoff||!(t<=now)||now-t>=86400000||![true,1,'1','true'].includes(r.active)||![false,0,'0','false'].includes(r.is_archived)||!empty(r.converted_to_job_uuid)||!(empty(r.snooze_until_timestamp)||r.snooze_until_timestamp==='0000-00-00 00:00:00'))continue;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.from_email||''))continue;
 if(/^\s*online service enquiry/i.test(r.message_text||'')||/new enquiry\s*[-\u2010-\u2015]\s*cooltech website/i.test(subject))continue;
 if(/^\s*New quote request:/i.test(subject)&&/New website quote request/i.test(text)&&/^\s*Page URL:\s*https:\/\/cooltechac\.com\.au\/[^\s]*\s*$/im.test(text))candidates++;
}
return [{json:{status:'read_only',scanned:rows.length,candidates,writes:0,windowFull:rows.length===20&&rows.every(r=>stamp(r.timestamp)>=cutoff)}}];`,
    },
    output: [{ status: 'read_only', scanned: 20, candidates: 0, writes: 0, windowFull: false }],
  },
});
export default workflow('cooltech-website-quote', 'COOLTECH_Website_to_Quote')
  .add(manual).to(inbox).to(summary).add(schedule).to(inbox);
