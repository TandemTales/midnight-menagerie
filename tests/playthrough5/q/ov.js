(function(){var out=[];document.querySelectorAll('.cb-intent').forEach(function(iv,i){
 var kids=[...iv.querySelectorAll('.cb-intent__chip, .cb-intent__extras > *')].map(function(n){var r=n.getBoundingClientRect();
   var s=getComputedStyle(n);
   return {t:(n.textContent||'').trim().slice(0,24),b:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],c:s.color,bg:s.backgroundColor};});
 out.push({i:i,kids:kids});});return out;})()
