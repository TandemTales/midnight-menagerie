(()=>{const cs=[...document.querySelectorAll('.mm-card, .card')].filter(n=>n.offsetParent);
 return cs.map(n=>{const r=n.getBoundingClientRect();const st=getComputedStyle(n);
  return {cls:n.className.slice(0,40), x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height),
    tr:st.transform, tt:st.transition.slice(0,90), z:st.zIndex};});})()
