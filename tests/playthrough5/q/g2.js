(function(){var g=document.querySelector('.mm-hud__gear');
 var out={gearHTML:g?g.outerHTML.slice(0,200):null, gearHidden:g?g.hidden:null,
  backpack:window.MM.ctx.run.snapshot().backpack};
 var last=[...document.querySelectorAll('.mm-hud__chip, .mm-hud button, .mm-hud [tabindex]')].map(function(n){
   var r=n.getBoundingClientRect();return [n.getAttribute('class'),n.getAttribute('aria-label')||n.textContent.trim().slice(0,20),Math.round(r.x),Math.round(r.width)]});
 out.chips=last; return out;})()
