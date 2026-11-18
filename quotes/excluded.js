const got=$input.all().map(x=>x.json.scenario+':'+x.json.route).sort();
const expected=['reply:skip','wrong-body:skip','archived:skip','converted:skip','missing:review','bad-url:review','old:skip','ambiguous:review'].sort();
if(got.join()!==expected.join())throw Error('Gate assertion: '+got.join());
return [{json:{mode:'simulated',excluded:got.length,decisions:got}}];
