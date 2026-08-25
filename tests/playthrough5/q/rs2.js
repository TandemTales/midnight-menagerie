(async function(){const m=await import('/game/src/state/mapgen.js');const rows={};
 for(let s=1;s<120;s++){const map=m.generateRegionMap('foyer',s);
  map.nodes.filter(n=>n.type==='rescue').forEach(n=>{rows[n.row]=(rows[n.row]||0)+1});}
 return rows;})()
