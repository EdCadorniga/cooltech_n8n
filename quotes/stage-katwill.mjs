import {copyFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

if(process.argv.length!==3)throw Error('Usage: node stage-katwill.mjs <new-empty-extension-directory>');
const root=resolve(process.argv[2]);
mkdirSync(root); // refuse to overwrite an existing extension or an installed node
mkdirSync(join(root,'katwill'));
for(const file of [
  'katwill/CooltechQuotePilot.node.js','katwill/CooltechQuoteLedger.credentials.js','katwill/package.json',
  'katwill-runtime.mjs','katwill-scan.mjs','katwill-batch.mjs','engine.mjs','images.mjs','servicem8.mjs','mapping.mjs','map.js','package.json','package-lock.json',
])copyFileSync(fileURLToPath(new URL(file,import.meta.url)),join(root,file));
