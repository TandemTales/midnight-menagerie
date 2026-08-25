(()=>{const NL=String.fromCharCode(10);
 return [...document.querySelectorAll('.map-node.is-legal')].map(n=>{const r=n.getBoundingClientRect();
   return [Math.round(r.x+r.width/2),Math.round(r.y+r.height/2),n.innerText.split(NL).join(' | ')]});})()
