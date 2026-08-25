(function(){var sc=window.MM.ctx.scenes.current;var eng=sc.engine||sc.eng||sc._engine;var s=eng.state;
 return {turn:s.turn, php:s.player.hp, pblock:s.player.block, pstat:s.player.statuses,
  enemies:s.enemies.map(function(e){return {n:e.name,hp:e.hp,dead:e.dead,alive:e.alive,block:e.block,
     it:e.intent&&{name:e.intent.name,type:e.intent.type,dmg:e.intent.damage,hits:e.intent.hits,tot:e.intent.totalDamage,tip:e.intent.tooltip}}}),
  keys:Object.keys(s)};})()
