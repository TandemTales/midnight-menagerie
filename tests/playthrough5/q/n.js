(function(){var o=[];document.querySelectorAll('.note, .mi-here, .mn-hz, .note-pop').forEach(function(n){var r=n.getBoundingClientRect();
 o.push({c:n.getAttribute('class'),t:(n.textContent||'').replace(/[^ -~]/g,'').slice(0,140),b:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]})});
 var mn=document.querySelector('.map-notes'); return {items:o, notes:mn?(mn.textContent||'').slice(0,400):null};})()
