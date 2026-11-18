const base = 'https://cooltechac.com.au/wp-content/uploads/elementor/forms/';
const labels = ['inside wall','outdoor spot','switchboard'];
const ids = ['both','links','files','none','reply','wrong-body','archived','converted','missing','bad-url','redirect','invalid','oversize','old','ambiguous','partial','throttle'];
const inbox = ids.map((scenario,i) => {
  const links = ['both','links','partial','bad-url','redirect','invalid','oversize'].includes(scenario);
  const system = i%2 ? 'Split' : 'Ducted';
  const uuid = '00000000-0000-4000-8000-'+String(i+1).padStart(12,'0');
  const photoFields = links ? labels.map((label,k)=>'Photo: '+label+' '+(scenario==='bad-url'?'https://example.invalid/':base)+'synthetic-'+k+'.png').join('\n') : '';
  const body = `New website quote requestFixture Person · 0400000000 · fixture@example.invalid

1 Fixture Lane
Open address in Google Maps
Job
System ${system}
Home
Property Example
Sizing
Rooms ${i+1}
Placement
${photoFields}
Customer
Timing Just pricing
Additional details Multiline
second line
ServiceM8 job notes (copy and paste)Job address: 1 Fixture Lane
Contact: Fixture Person 0400000000
Email: fixture@example.invalid
Job description:
INSTALL QUOTE: ${system}
---
Date: synthetic`;
  return {scenario,uuid,subject:(scenario==='reply'?'Re: ':'')+'New quote request: '+system,
    message_text:scenario==='wrong-body'?'Online Service Enquiry':scenario==='missing'?body.replace('Contact: Fixture Person 0400000000','Contact:'):body,
    timestamp:scenario==='old'?'1999-01-01T00:00:00Z':'2030-01-02T00:00:00Z',
    archived:scenario==='archived'?1:0,converted_to_job_uuid:scenario==='converted'?uuid:'',
    clients:scenario==='ambiguous'?['A','B']:['fixture-client'],
    files:['both','files','partial'].includes(scenario)?[{id:'a',name:'customer.png'},{id:'b',name:'layout.pdf'},{id:'logo',inline:true}]:[]};
});
inbox.push(inbox[0]); // duplicate delivery
return [{json:{inbox,cutoff:'2030-01-01T00:00:00Z'}}];
