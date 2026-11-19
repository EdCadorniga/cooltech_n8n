return $input.all().map(({json:m})=>{
  const body=(String(m.message_text??'').trim()||String(m.body??'').trim()).replace(/\r\n?/g,'\n');
  const source=m.uuid;
  const done=(route,reason)=>({json:{source,scenario:m.scenario,route,reason}});
  const subject=String(m.subject||'');
  if(/^\s*online service enquiry/i.test(String(m.message_text||''))||
     subject.replace(/[\u2010-\u2015]/g,'-').replace(/\s+/g,' ').toLowerCase().includes('new enquiry - cooltech website'))return done('skip','jobs overlap');
  const marker=/New website quote request/i.exec(body);
  if(!marker)return done('skip','markers');
  if(!Number.isFinite(Date.parse(m.timestamp))||!Number.isFinite(Date.parse(m.cutoff)))return done('review','timestamp');
  if(Date.parse(m.timestamp)<Date.parse(m.cutoff)||Number(m.archived)||m.converted_to_job_uuid)return done('skip','source state');
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(source)||
     m.clients?.length!==(m.clientless===true?0:1)||body.length>50000)return done('review','identity');
  const parts=body.slice(marker.index).split(/ServiceM8 job notes \(copy and paste\)/i);
  if(parts.length!==2)return done('review','template');
  const details=parts[1].trimStart();
  const site=details.match(/^Job address:\s*(.+?)(?=\n[ \t]*Contact:)/s)?.[1]?.trim();
  const contact=details.match(/^[ \t]*Contact:\s*(\S[^\n]*?)\s+(\+?[\d ()-]{8,22})[ \t]*$/m);
  const email=details.match(/^[ \t]*Email:\s*([^\s@]+@[^\s@]+\.[^\s@]+)[ \t]*$/m)?.[1];
  const fields=parts[0].match(/(?:^|\n)[ \t]*Job[ \t]*\n([\s\S]*)$/)?.[1];
  const suppliedPhone=contact?.[2].replace(/[ ()-]/g,'')??'';
  const domestic=suppliedPhone.replace(/^\+?61/,'0');
  // The form has emitted bare 61 + area + seven digits. Keep that value
  // verbatim as a non-dialed Phone field rather than inventing a missing digit.
  const phoneField=/^04\d{8}$/.test(domestic)?'mobile':
    /^0[2378]\d{8}$/.test(domestic)||/^61[2378]\d{7}$/.test(suppliedPhone)?'phone':null;
  const note=details.split(/^[ \t]*---[ \t]*$/m,1)[0].trim();
  if(!site||site.length>500||!contact||contact[1].length>120||!phoneField||!email||email.length>254||!fields||
     !/^Job address:/m.test(note)||!/^[ \t]*Status:[ \t]*Quote[ \t]*$/m.test(note)||
     !/^[ \t]*Job description:[ \t]*\n\s*\S/m.test(note)||note.length>10000)return done('review','missing mandatory field');
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
  if(links.length>3||new Set(links.map(p=>p.label.toLowerCase())).size!==links.length||answers.join('\n').length>12000)return done('review','template bounds');
  return {json:{source,scenario:m.scenario,route:'quote',links,files:m.files,
    job:{status:'Quote',queue_uuid:'01a1ddb2-8d2e-7fb6-a678-ec066fe0fe4b',...(m.clientless===true?{}:{company_uuid:m.clients[0]}),job_address:site,job_description:answers.join('\n')},
    contact:{type:'JOB',first:contact[1].split(/\s+/)[0],last:contact[1].split(/\s+/).slice(1).join(' '),[phoneField]:suppliedPhone,email},
    internalNote:note+(links.length?'\n\nSource photos\n'+links.map(p=>p.label+': '+p.url).join('\n'):'')}};
});
