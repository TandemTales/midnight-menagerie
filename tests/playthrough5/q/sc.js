(function(){var m=document.querySelector('.mm-settings-modal');
 var out=[];var walk=function(n,d){var r=n.getBoundingClientRect();
   out.push([d,n.tagName+'.'+(n.getAttribute('class')||'').slice(0,30),Math.round(r.y),Math.round(r.height),n.clientHeight,n.scrollHeight,getComputedStyle(n).overflowY]);
   if(d<3)[...n.children].forEach(function(c){walk(c,d+1)});};
 walk(m,0); return out;})()
