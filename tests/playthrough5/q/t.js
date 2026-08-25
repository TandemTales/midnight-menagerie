(function(){var t=document.querySelector('.mm-hand__threshold');var r=t.getBoundingClientRect();
 var h=document.querySelector('.mm-hand__hit');var hr=h.getBoundingClientRect();
 return {thr:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],
         thrStyle:getComputedStyle(t).display+'/'+getComputedStyle(t).opacity,
         hit:[Math.round(hr.x),Math.round(hr.y),Math.round(hr.width),Math.round(hr.height)],
         deny:document.querySelector('.cb-deny').innerText};})()
