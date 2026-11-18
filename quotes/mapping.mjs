import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('./map.js',import.meta.url),'utf8');
const mapper=new Function('$input',code);
export const map=m=>mapper({all:()=>[{json:m}]})[0].json;
