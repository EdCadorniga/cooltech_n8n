import {UUID, flag, blank, unsnoozed, sourceTimestamp} from './engine.mjs';

const sydney=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',timeZoneName:'longOffset'});
export const inboxOffset=ms=>sydney.formatToParts(new Date(ms)).find(p=>p.type==='timeZoneName').value.replace('GMT','');
export const timestampOf=raw=>{
  const trial=sourceTimestamp(raw,'+10:00');
  if(!Number.isFinite(trial))return NaN;
  const exact=sourceTimestamp(raw,inboxOffset(trial));
  return inboxOffset(trial)===inboxOffset(exact)?exact:NaN;
};
export function scheduledMatch(row){
  if(!row||!UUID.test(row.uuid??'')||flag(row.active)!==true||flag(row.is_archived)!==false||
    !blank(row.converted_to_job_uuid)||!unsnoozed(row.snooze_until_timestamp)||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.from_email??''))return false;
  const body=String(row.message_text||row.body||'');
  if(/^\s*online service enquiry/i.test(row.message_text??'')||
    /new enquiry\s*[-\u2010-\u2015]\s*cooltech website/i.test(row.subject??''))return false;
  return /^\s*New quote request:/i.test(row.subject??'')&&
    /New website quote request/i.test(body)&&
    /^\s*Page URL:\s*https:\/\/cooltechac\.com\.au\/[^\s]*\s*$/im.test(body);
}
export function selectInbox(rows,cutoff,now){
  if(!Array.isArray(rows)||rows.length>20||!Number.isFinite(cutoff))throw Error('Invalid bounded inbox scan');
  const seen=new Set();
  return rows.filter(row=>{
    if(!scheduledMatch(row)||seen.has(row.uuid))return false;
    seen.add(row.uuid);
    const stamp=timestampOf(row.timestamp);
    return cutoff<=stamp&&stamp<=now&&now-stamp<86400000;
  }).map(row=>({source:row.uuid,stamp:timestampOf(row.timestamp), rawStamp:row.timestamp,sender:row.from_email}))
    .sort((a,b)=>a.stamp-b.stamp);
}
