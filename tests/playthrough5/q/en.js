(function(){var r=window.MM.ctx.run.snapshot();
 var sc=window.MM.ctx.scenes.current||window.MM.ctx.scenes._cur;
 var eng=sc&&(sc.engine||sc.eng||sc._engine);
 var s=eng?eng.state:null;
 return {runCourage:r.courage+'/'+r.maxCourage,
  engPlayer:s?{hp:s.player.hp,max:s.player.maxHp,block:s.player.block,statuses:s.player.statuses}:null,
  turn:s?s.turn:null,
  enemies:s?s.enemies.map(function(e){return {n:e.name,hp:e.hp,block:e.block,intent:e.intent}}):null,
  hudText:document.querySelector('.mm-hud__courage')?document.querySelector('.mm-hud__courage').innerText:null};})()
