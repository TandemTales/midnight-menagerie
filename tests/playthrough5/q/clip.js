(function(){
 var btns=[...document.querySelectorAll('button')].filter(function(b){return /Lost Things/.test(b.textContent||'')});
 return btns.map(function(b){var r=b.getBoundingClientRect();
  var cx=r.x+r.width/2, cy=r.y+r.height/2;
  var top=document.elementFromPoint(cx,cy);
  var covered = top? !(b===top||b.contains(top)) : true;
  return {t:(b.textContent||'').replace(/\s+/g,' ').trim().slice(0,26), y:Math.round(r.y), h:Math.round(r.height),
   bottomOff: Math.round(r.bottom-innerHeight), covered:covered, topEl: top?top.tagName+'.'+(top.getAttribute('class')||'').slice(0,26):null};});})()
