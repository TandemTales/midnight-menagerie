(function(){var out=[];document.querySelectorAll('.sh-buy, [class*=buy], button').forEach(function(b){var r=b.getBoundingClientRect();
 if(r.height<4)return; out.push([(b.textContent||'').replace(/\s+/g,' ').trim().slice(0,40),Math.round(r.x),Math.round(r.y),Math.round(r.height)]);});
 var sc=null;document.querySelectorAll('*').forEach(function(e){if(e.scrollHeight>e.clientHeight+16&&e.clientHeight>300&&!sc)sc=[e.className,e.clientHeight,e.scrollHeight];});
 return {btns:out, scroller:sc, docH:document.documentElement.scrollHeight, winH:innerHeight};})()
