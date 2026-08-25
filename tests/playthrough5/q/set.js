(function(){var sel=[...document.querySelectorAll('select')].map(function(s){var r=s.getBoundingClientRect();
 return {id:s.id,cls:s.className,opts:[...s.options].map(function(o){return o.value}),v:s.value,b:[Math.round(r.x),Math.round(r.y)]}});
 var tog=[...document.querySelectorAll('[role=switch], .set-toggle, button[aria-pressed]')].map(function(t){var r=t.getBoundingClientRect();
 return [t.getAttribute('aria-label')||t.textContent.trim().slice(0,30), t.getAttribute('aria-checked')||t.getAttribute('aria-pressed'), Math.round(r.x),Math.round(r.y)]});
 return {sel:sel, tog:tog};})()
