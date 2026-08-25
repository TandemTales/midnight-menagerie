(function(){var run=window.MM.ctx.run;
 return {backpackRaw:run.backpack, flags:run.flags, carrying:run.carrying,
   keepsakesForEngine:(run.snapshot?null:null), relicIds:(function(){try{return run.relicsForCombat?run.relicsForCombat():null}catch(e){return 'n/a'}})()};})()
