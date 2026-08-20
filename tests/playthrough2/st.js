(()=>{const s=window.MM.state();const r=s.run;const cs=window.MM.ctx&&window.MM.ctx.combat;
return JSON.stringify({scene:s.scene,courage:r.courage+"/"+r.maxCourage,lost:r.lostThings,
 snacks:(r.snacks||[]).map(x=>x.name||x),keeps:(r.keepsakes||[]).map(k=>k.name),deck:r.deck.length,
 node:r.currentNodeId,depth:r.depth,stats:r.stats,
 hand:[...document.querySelectorAll(".mm-card")].map(c=>c.getAttribute("aria-label")),
 nerve:(document.querySelector("[class*=nerve],[class*=energy]")||{}).innerText,
 enemies:[...document.querySelectorAll(".cb-enemy")].map(e=>e.innerText.replace(/\n/g," | "))})})()
