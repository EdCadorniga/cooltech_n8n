// Synthetic GET responses. Generate three valid one-pixel PNGs via an ancillary
// tEXt chunk; the email copy uses the identical bytes but a different filename.
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV2QAAAAASUVORK5CYII=','base64');
function image(n){
  const text=Buffer.from('tEXtfixture\0'+n), chunk=Buffer.alloc(text.length+8);
  chunk.writeUInt32BE(text.length-4);text.copy(chunk,4);
  let crc=0xffffffff;
  for(const b of text){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  chunk.writeUInt32BE((crc^0xffffffff)>>>0,text.length+4);
  return Buffer.concat([png.subarray(0,-12),chunk,png.subarray(-12)]);
}
const result=[];
for(const {json:m} of $input.all()){
  const binary={},manifest=[],errors=[];
  const inputs=[...m.links.map((p,i)=>({i,name:p.label.replace(/ /g,'-')+'.png',photo:true})),
    ...m.files.filter(f=>!f.inline).map(f=>({i:0,name:f.name,pdf:f.id==='b'}))];
  for(const [i,f] of inputs.entries()){
    const fault=i===0?m.scenario:'';
    const status=fault==='redirect'?302:200;
    const bytes=f.pdf?Buffer.from('%PDF-1.4\nsynthetic fixture\n%%EOF'):fault==='invalid'?Buffer.from('html'):image(f.i);
    const size=fault==='oversize'?10485761:bytes.length;
    if(status!==200||size>10485760||size!==bytes.length||!(f.pdf?bytes.subarray(0,5).toString()==='%PDF-':bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&bytes.subarray(-8,-4).toString()==='IEND')){
      errors.push('transfer:'+i);continue;
    }
    const key='file'+i;
    binary[key]=await this.helpers.prepareBinaryData(bytes,f.name,f.pdf?'application/pdf':'image/png');
    manifest.push({key,name:f.name});
  }
  result.push({json:{...m,manifest,errors},binary});
}
return result;
