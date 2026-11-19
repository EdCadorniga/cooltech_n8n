class CooltechQuotePilot {
  description={
    name:'cooltechQuotePilot', displayName:'Cooltech: One Website Quote',
    group:['transform'], version:1, description:'Create and verify one approved unsent website Quote',
    defaults:{name:'Run approved Cooltech Quote pilot'}, inputs:['main'], outputs:['main'],
    credentials:[{name:'cooltechQuoteLedger',required:true},{name:'serviceM8CredentialsApi',required:true}],
    properties:[
      {displayName:'Operation',name:'operation',type:'options',default:'preflight',options:[
        {name:'Read-Only Preflight',value:'preflight'},{name:'Run Approved Permit Once',value:'run'},
        {name:'Repair Existing Quote Only',value:'repair'},
      ]},
      {displayName:'Existing Quote UUID',name:'existingQuote',type:'string',required:true,default:'',
        displayOptions:{show:{operation:['repair']}}},
      {displayName:'Source Inbox UUID',name:'source',type:'string',required:true,default:''},
      {displayName:'Approved Client UUID (Optional)',name:'client',type:'string',default:''},
      {displayName:'Known Unsent Baseline Quote UUID (Optional)',name:'baseline',type:'string',default:''},
      {displayName:'Approved ServiceM8 Storage Hostnames',name:'storageHosts',type:'string',default:'',
        description:'Exact HTTPS hostnames, comma separated, verified read-only before the pilot'},
      {displayName:'Source Timestamp UTC Offset',name:'inboxUtcOffset',type:'string',default:'',
        displayOptions:{show:{operation:['preflight']}},
        description:'Verified offset for timestamp without timezone, for example +11:00'},
    ],
  };

  async execute(){
    if(this.getMode()!=='manual'||this.getWorkflow().id!=='WLNTc3jAC37vdSqE'||this.getInputData().length!==1)
      throw new Error('This node can only be used for the single manual Cooltech pilot.');
    const param=name=>this.getNodeParameter(name,0);
    const op=param('operation');
    if(!['preflight','run','repair'].includes(op))throw new Error('Select an explicit Cooltech pilot operation.');
    const existingQuote=op==='repair'?param('existingQuote'):undefined;
    if(op==='repair'&&!existingQuote)throw new Error('Repair requires an existing Quote UUID.');
    const storageHosts=param('storageHosts').split(',').map(s=>s.trim()).filter(Boolean);
    if(storageHosts.some(host=>!/^([a-z0-9-]+\.)+[a-z0-9-]+$/.test(host)))
      throw new Error('Use exact approved storage hostnames.');
    const db=await this.getCredentials('cooltechQuoteLedger');
    const {apiKey:key}=await this.getCredentials('serviceM8CredentialsApi');
    const {runKatwillPilot}=await import('../katwill-runtime.mjs');
    const result=await runKatwillPilot({source:param('source'),client:param('client'),
      baseline:param('baseline'),storageHosts,db,key,existingQuote,preflightOnly:op==='preflight',
      inboxUtcOffset:op==='preflight'?(param('inboxUtcOffset')||undefined):undefined});
    if(result.status!==(op==='preflight'?'preflight_verified':'verified'))
      throw new Error(`Cooltech pilot stopped (${result.step??'preflight'}/${result.reason}); inspect the ledger. Do not rerun a write.`);
    return [[{json:result}]];
  }
}
module.exports={CooltechQuotePilot};
