(function(){var m=window.MM.ctx.run.snapshot();var by={};m.map.nodes.forEach(function(n){by[n.id]=n});
 var out=[];function walk(id,d){ if(d>4)return; var n=by[id]; if(!n)return;
   out.push(' '.repeat(d)+n.id+' '+n.type); n.next.forEach(function(x){walk(x,d+1)});}
 walk(m.currentNodeId,0); return out.slice(0,40);})()
