(async function(){const m=await import('/game/src/state/mapgen.js');const out=[];
 for(let s=1;s<400;s++){const map=m.generateRegionMap('foyer',s);
  const r=map.nodes.filter(n=>n.type==='rescue');
  if(r.length&&r[0].row<=2) out.push({seed:s,row:r[0].row,id:r[0].id});
  if(out.length>4)break;}
 return out;})()
