(function(){var m=window.MM.ctx.run.snapshot();var by={};m.map.nodes.forEach(function(n){by[n.id]=n});
 var cur=m.currentNodeId; var out=[];
 function walk(id,d,path){ if(d>3)return; var n=by[id]; if(!n)return;
   out.push(' '.repeat(d)+n.id+' '+n.type+' '+n.roomName);
   n.next.forEach(function(x){walk(x,d+1,path)});}
 walk(cur,0,[]);
 return {cur:cur, tree:out.slice(0,30)};})()
