import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const reserve=read('katwill-ledger.sql').match(/CREATE FUNCTION cooltech_quotes\.reserve\([\s\S]+?\n\$\$;/)?.[0];
if(!reserve)throw Error('Missing reserve routine');
process.stdout.write(read('katwill-repair.sql').replace('RESET ROLE;',
  ()=>`${reserve.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION')}\nRESET ROLE;`));
