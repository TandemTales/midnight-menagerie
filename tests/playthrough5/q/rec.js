(function(){window.__rec=[];window.__t0=performance.now();
 const c=[...document.querySelectorAll('.mm-card')][2]; c.id='hovertest';
 const f=()=>{const r=c.getBoundingClientRect();
   window.__rec.push([Math.round(performance.now()-window.__t0),Math.round(r.y),Math.round(r.width)]);
   if(performance.now()-window.__t0<1200)requestAnimationFrame(f);};requestAnimationFrame(f);return 1;})()
