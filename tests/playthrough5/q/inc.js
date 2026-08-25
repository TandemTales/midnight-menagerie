(function(){var sc=window.MM.ctx.scenes.current;var eng=sc.engine;var s=eng.state;
 var live=s.enemies.filter(function(e){return e.alive});
 return {panel:document.querySelector('.cb-incoming').innerText.split(String.fromCharCode(10)).join(' '),
   hidden:document.querySelector('.cb-incoming').hidden,
   turn:s.turn, phase:s.phase, hp:s.player.hp, block:s.player.block,
   live:live.map(function(e){return e.name+' hp'+e.hp+' intent='+(e.intent?e.intent.name+'/'+e.intent.type+'/dmg'+e.intent.damage+'x'+e.intent.hits:'none')}),
   handN:s.piles?Object.keys(s.piles):null};})()
