(()=>{const nl=String.fromCharCode(10);const j=s=>(s||"").split(nl).join("|");
return JSON.stringify({
 e:[...document.querySelectorAll(".cb-enemy")].map(e=>j(e.innerText)),
 guard:(document.querySelector(".cb-player__guard")||{}).innerText,
 statuses:j((document.querySelector(".cb-statuses")||{}).innerText),
 hud:document.querySelector(".mm-hud__courage")?document.querySelector(".mm-hud__courage").getAttribute("aria-label"):"",
 nerve:j((document.querySelector("[class*=nerve]")||{}).innerText),
 incoming:j((document.querySelector("[class*=incoming]")||{}).innerText),
 hand:[...document.querySelectorAll(".mm-card")].map(c=>c.getAttribute("aria-label")).filter(Boolean),
 turn:(document.querySelector("[class*=turn]")||{}).innerText})})()
