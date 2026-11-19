class CooltechQuoteLedger {
  name='cooltechQuoteLedger';
  displayName='Cooltech Quote Ledger';
  properties=[
    {displayName:'Host (TLS hostname)',name:'host',type:'string',default:'',required:true},
    {displayName:'Port',name:'port',type:'number',default:5432,required:true},
    {displayName:'Runtime Role Password',name:'password',type:'string',typeOptions:{password:true},default:'',required:true},
    {displayName:'Private CA PEM (if required)',name:'ca',type:'string',typeOptions:{rows:4},default:''},
  ];
}
module.exports={CooltechQuoteLedger};
