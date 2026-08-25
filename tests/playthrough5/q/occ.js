(function(){var c=document.querySelector('.cb-count');var r=c.getBoundingClientRect();
 var pts=[[r.x+8,r.y+r.height/2],[r.x+r.width/2,r.y+r.height/2],[r.right-8,r.y+r.height/2]];
 return {t:(c.textContent||'').trim(), box:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],
  hits: pts.map(function(p){var e=document.elementFromPoint(p[0],p[1]);return e?e.tagName+'.'+(e.getAttribute('class')||'').slice(0,24):null;})};})()
