(function(){var h=document.querySelector('.mm-hud__courage');
 return {out:h.outerHTML.slice(0,700), inner:h.innerText, hud:document.querySelector('.mm-hud').innerText.split(String.fromCharCode(10)).join(' | ')};})()
