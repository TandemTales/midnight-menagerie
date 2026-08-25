(function(){var c=document.querySelectorAll('.cb-count');return [...c].map(function(n){var r=n.getBoundingClientRect();
 return {t:n.innerText,tip:n.getAttribute('data-tip'),c:[Math.round(r.x+r.width/2),Math.round(r.y+r.height/2)]}})})()
