(function(){var out=[];for(var x=275;x<300;x+=8){for(var y=395;y<412;y+=8){var e=document.elementFromPoint(x,y);
 if(e)out.push(x+','+y+' -> '+e.tagName+'.'+(e.getAttribute('class')||'')+' | '+(e.getAttribute('data-tip')||'').slice(0,80));}}
 return [...new Set(out)];})()
