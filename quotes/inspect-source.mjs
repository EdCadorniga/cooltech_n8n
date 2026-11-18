// Operator preflight: one exact inbox GET, never a list or a mutation.
import {UUID,flag,blank,unsnoozed,sourceTimestamp} from './engine.mjs';
import {serviceM8} from './servicem8.mjs';
import {map} from './mapping.mjs';
const id=process.argv[2], key=process.env.COOLTECH_API_KEY;
if(!UUID.test(id)||!key)throw Error('An exact lowercase inbox UUID and COOLTECH_API_KEY are required');
try{
  const row=await serviceM8({key}).get('inboxmessage',id);
  if(!row||row.uuid!==id){console.log('Exact inbox item not found');process.exitCode=1;}
  else{
    const mapped=map({...row,archived:false,converted_to_job_uuid:'',clients:[id],cutoff:'2000-01-01T00:00:00Z',files:[]});
    console.log(JSON.stringify({source:id,timestamp:row.timestamp,active:flag(row.active),archived:flag(row.is_archived),
      unconverted:blank(row.converted_to_job_uuid),unsnoozed:unsnoozed(row.snooze_until_timestamp),
      timestampRequiresOffset:!Number.isFinite(sourceTimestamp(row.timestamp)),
      hasSender:!!row.from_email,template:mapped.route,photoCount:mapped.links?.length??0}));
  }
}catch(e){console.error('Exact read failed:',e.hold??'unavailable');process.exitCode=1;}
