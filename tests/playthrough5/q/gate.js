(function(){var o=[];document.querySelectorAll('.ev-opt, [class*=ev-opt]').forEach(function(b){var r=b.getBoundingClientRect();
 if(r.height<6)return;o.push({t:(b.textContent||'').replace(/\s+/g,' ').trim().slice(0,90),dis:b.disabled===true||b.getAttribute('aria-disabled')==='true',cls:b.getAttribute('class')});});
 return {opts:o, backpack:window.MM.ctx.run.backpack, carrying:window.MM.ctx.run.carrying};})()
