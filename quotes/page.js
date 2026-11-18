const {inbox,cutoff}=$input.first().json;
// The mock list is an immutable snapshot. Persist the cursor and all page UUIDs
// together before acknowledging a production page; never advance on a list error.
const pageSize=3, pageBudget=2, output=[];
let offset=0,polls=0;
while(offset<inbox.length && polls<4){
  polls++;
  for(let page=0;page<pageBudget && offset<inbox.length;page++){
    const rows=inbox.slice(offset,offset+pageSize);
    for(const row of rows) output.push({json:{...row,cutoff}});
    offset+=rows.length;
  }
}
if(offset!==inbox.length || polls<2) throw Error('Pagination coverage');
return output;
