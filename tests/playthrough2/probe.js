(()=>{const nl=String.fromCharCode(10);
 const sels=["[class*=rule]","[class*=hazard]","[class*=modifier]","[class*=banner]",".cb-room",".cb-rules"];
 const out=[];
 sels.forEach(s=>{document.querySelectorAll(s).forEach(e=>out.push(s+" :: "+e.className+" :: "+(e.innerText||"").split(nl).join(" ").slice(0,100)))});
 return out.join(nl)||"(none)"})()
