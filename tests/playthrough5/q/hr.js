(function(){var out=[];
 document.querySelectorAll('*').forEach(function(n){ if((n.textContent||'').trim()==='House Rule'||(n.textContent||'').trim()==='HOUSE RULE'){
  var s=getComputedStyle(n); out.push({cls:n.getAttribute('class'),color:s.color,bg:s.backgroundColor,bgi:s.backgroundImage.slice(0,120),fs:s.fontSize});}});
 return out;})()
