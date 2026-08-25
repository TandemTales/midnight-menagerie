(async function(){const p=await import('/game/src/ui/portrait.js');
 return {one:p.formatSeed(1), back:p.parseSeed(p.formatSeed(1)), five:p.formatSeed(5)};})()
