(()=>{const m=window.MM.ctx.run.snapshot().map; return m.nodes.map(n=>[n.id,n.type,n.roomName,n.next.join(',')]);})()
