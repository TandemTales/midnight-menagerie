(function(){return [...document.querySelectorAll('.rs-door')].map(function(b){var r=b.getBoundingClientRect();
 var top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
 return {t:(b.textContent||'').replace(/\s+/g,' ').trim().slice(0,32), dis:b.disabled, box:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],
  hit: top? (b===top||b.contains(top)) : false, tab:b.tabIndex};});})()
