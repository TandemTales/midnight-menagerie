(function(){window.__t=[];var s=window.MM.ctx.scenes;
 window.MM.bus.on&&0;
 var t0=performance.now();
 var orig=s.go.bind(s);
 s.go=function(n,p,o){var a=performance.now();window.__t.push(['go:'+n,Math.round(a-t0)]);
   var r=orig(n,p,o); Promise.resolve(r).then(function(){window.__t.push(['done:'+n,Math.round(performance.now()-t0)])}); return r;};
 return 1;})()
