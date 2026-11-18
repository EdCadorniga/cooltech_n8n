return $input.all().map(({json:m})=>{
  const body=String(m.message_text||m.body||'').replace(/\r/g,'');
  const source=m.uuid;
  const done=(route,reason)=>({json:{source,scenario:m.scenario,route,reason}});
  if(!body.startsWith('New website quote request')||!String(m.subject).startsWith('New quote request:'))return done('skip','markers');
  if(!Number.isFinite(Date.parse(m.timestamp))||!Number.isFinite(Date.parse(m.cutoff)))return done('review','timestamp');
  if(Date.parse(m.timestamp)<Date.parse(m.cutoff)||Number(m.archived)||m.converted_to_job_uuid)return done('skip','source state');
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(source)||m.clients.length!==1)return done('review','identity');
  const parts=body.split(/ServiceM8 job notes \(copy and paste\)/i);
  if(parts.length!==2)return done('review','template');
  const site=parts[1].match(/^Job address:[ \t]*(.+?)(?=\nContact:)/s)?.[1]?.trim();
  const contact=parts[1].match(/^Contact:[ \t]*(\S[^\n]*?)\s+(\+?[\d ()-]{8,20})[ \t]*$/m);
  const email=parts[1].match(/^Email:[ \t]*([^\s@]+@[^\s@]+\.[^\s@]+)[ \t]*$/m)?.[1];
  const fields=parts[0].match(/(?:^|\n)[ \t]*Job[ \t]*\n([\s\S]*)$/)?.[1];
  if(!site||!contact||!email||!fields)return done('review','missing mandatory field');
  const links=[],answers=['Job'];
  for(const line of fields.split('\n').map(v=>v.trim()).filter(Boolean)){
    if(/^Photo:/i.test(line)){
      const p=line.match(/^Photo:\s*(inside wall|outdoor spot|switchboard)\s*:?\s*(\S+)?$/i);
      if(!p)return done('review','unknown photo field');
      if(!p[2])continue;
      if(!/^https:\/\/cooltechac\.com\.au\/wp-content\/uploads\/elementor\/forms\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:jpe?g|png)$/i.test(p[2])||!p[2].startsWith('https://cooltechac.com.au/wp-content/uploads/elementor/forms/'))return done('review','unapproved URL');
      links.push({label:p[1],url:p[2]});
    }else if(/https?:\/\//i.test(line))return done('review','unexpected URL');
    else answers.push(/^(Home|Sizing|Placement|Customer)$/.test(line)?'\n'+line:line);
  }
  return {json:{source,scenario:m.scenario,route:'quote',links,files:m.files,
    job:{status:'Quote',queue_uuid:'01a1ddb2-8d2e-7fb6-a678-ec066fe0fe4b',company_uuid:m.clients[0],job_address:site,job_description:answers.join('\n')},
    contact:{type:'JOB',first:contact[1].split(' ')[0],last:contact[1].split(' ').slice(1).join(' '),mobile:contact[2],email},
    internalNote:links.map(p=>p.label+': '+p.url).join('\n')}};
});
