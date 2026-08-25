(async function(){
 const m = await import('/game/src/state/mapgen.js');
 const out=[];
 for (let s=1; s<=400; s++){
   const map = m.generateRegionMap('foyer', s);
   const byId = Object.fromEntries(map.nodes.map(n=>[n.id,n]));
   // BFS shortest walk from each row0 node, scoring node types found in first 6 rows
   const starts = map.nodes.filter(n=>n.row===0);
   for (const st of starts){
     // greedy walk preferring interesting types
     let cur=st, path=[st.type], seen={};
     for(let i=0;i<7 && cur.next.length;i++){
       const opts=cur.next.map(id=>byId[id]).filter(Boolean);
       const rank=t=>({curiosity:0,safe:1,shop:2,rescue:3,bigScare:4,treasure:5,unknown:6,scuffle:7,boss:8}[t]??9);
       opts.sort((a,b)=>rank(a.type)-rank(b.type)-(seen[a.type]?-0:0));
       cur=opts[0]; path.push(cur.type);
     }
     const set=new Set(path);
     const score=['curiosity','safe','shop'].filter(t=>set.has(t)).length;
     if(score===3) out.push({seed:s,start:st.id,path:path.join('>')});
   }
   if(out.length>6) break;
 }
 return out.slice(0,8);
})()
