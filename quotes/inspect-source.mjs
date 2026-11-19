// Operator preflight: one exact inbox GET. Optional exact-file checks are also read-only.
import {createHash} from 'node:crypto';
import {UUID,flag,blank,unsnoozed,sourceTimestamp,MAX_TOTAL} from './engine.mjs';
import {serviceM8} from './servicem8.mjs';
import {map} from './mapping.mjs';
const id=process.argv[2], key=process.env.COOLTECH_API_KEY;
if(!UUID.test(id)||!key)throw Error('An exact lowercase inbox UUID and COOLTECH_API_KEY are required');
try{
  const api=serviceM8({key});
  const row=await api.get('inboxmessage',id);
  if(!row||row.uuid!==id){console.log('Exact inbox item not found');process.exitCode=1;}
  else{
    const mapped=map({...row,archived:false,converted_to_job_uuid:'',clients:[id],cutoff:'2000-01-01T00:00:00Z',files:[]});
    const summary={source:id,timestamp:row.timestamp,active:flag(row.active),archived:flag(row.is_archived),
      unconverted:blank(row.converted_to_job_uuid),unsnoozed:unsnoozed(row.snooze_until_timestamp),
      timestampRequiresOffset:!Number.isFinite(sourceTimestamp(row.timestamp)),
      hasSender:!!row.from_email,template:mapped.route,photoCount:mapped.links?.length??0};
    if(process.argv.includes('--check-files')&&mapped.route==='quote'){
      const {inspectImage}=await import('./images.mjs');
      const inventory=await api.list('attachment','related_object_uuid',id);
      const hashes=new Set();
      let total=0;
      for(const {url} of mapped.links){
        const bytes=await api.photo(url);
        total+=bytes.length;
        if(total>MAX_TOTAL||!await inspectImage(bytes))throw Object.assign(new Error(),{hold:'invalid_photo'});
        hashes.add(createHash('sha256').update(bytes).digest('hex'));
      }
      Object.assign(summary,{activeAttachmentRecords:inventory.length,uniqueDecodedPhotos:hashes.size,
        mappedContact:!!(mapped.contact?.first&&mapped.contact?.email),mappedNote:!!mapped.internalNote,
        hasLinkedCompany:UUID.test(row.regarding_company_uuid??'')&&!blank(row.regarding_company_uuid)});
    }
    console.log(JSON.stringify(summary));
  }
}catch(e){console.error('Exact read failed:',e.hold??'unavailable');process.exitCode=1;}
