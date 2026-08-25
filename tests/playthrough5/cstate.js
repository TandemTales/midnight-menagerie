(function(){
 var NL=String.fromCharCode(10);
 var txt=function(n){return n?n.innerText.split(NL).join(' | '):null;};
 var box=function(n){var r=n.getBoundingClientRect();return [Math.round(r.x+r.width/2),Math.round(r.y+r.height/2)];};
 var cards=[...document.querySelectorAll('.mm-card')].filter(function(n){return n.offsetParent&&!n.className.match(/probe/);})
   .map(function(n,i){return {i:i,t:txt(n),c:box(n),dis:/is-un|is-dis|no-play|unafford/.test(n.className),cls:n.className};});
 var enemies=[...document.querySelectorAll('.enemy')].map(function(n,i){return {i:i,t:txt(n),c:box(n),cls:n.className};});
 var nerve=txt(document.querySelector('.cb-nerve'));
 var piles=[...document.querySelectorAll('.cb-pile')].map(txt);
 var player=txt(document.querySelector('.cb-player'));
 var st=txt(document.querySelector('.cb-statuses'));
 var inc=txt(document.querySelector('.cb-incoming'));
 var banner=txt(document.querySelector('.cb-banner'));
 var chooser=document.querySelector('.cb-chooser');
 var chv=chooser&&getComputedStyle(chooser).display!=='none'&&chooser.getBoundingClientRect().height>2?txt(chooser):null;
 var hud=txt(document.querySelector('.mm-hud'));
 return {scene:window.MM.state().scene, hud:hud, nerve:nerve, piles:piles, player:player, statuses:st,
         incoming:inc, banner:banner, chooser:chv, enemies:enemies, cards:cards};
})()
