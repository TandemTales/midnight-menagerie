import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CombatFX} from '../../game/src/fx/combatfx.js';
const data=JSON.parse(fs.readFileSync('docs/ui-pass/SPINEL-r51-proofs/failed-crowd-diagnostic.json','utf8')).results.at(-1).all;
const actors=data.protectedBoxes.filter(a=>a.id),plates=data.protectedBoxes.filter(a=>!a.id);
const widths={player:208,e0:138,e1:210,e2:156,e3:223};
for(const ids of actors.map(a=>[a.id]).concat([actors.map(a=>a.id)])){
 const f=Object.create(CombatFX.prototype);f.w=1280;f.h=800;
 f._ownerCaption=a=>({w:widths[a.id],h:23,el:{style:{}}});
 f.nums=ids.map(id=>({live:1,actorId:id,wordW:271.4058317754816,wordH:40.85679188018002,ownerBounds:{actor:actors.find(a=>a.id===id)},el:{style:{transform:'translate3d(0px,0px,0) scale(1)'},dataset:{}}}));
 const times=[];let fit;for(let i=0;i<120;i++){const begin=performance.now();fit=f._fitWords({actors,plates});if(i>=20)times.push(performance.now()-begin);}times.sort((a,b)=>a-b);const t=performance.now();
 if(ids.length===1)assert(fit,'Every owner must have a feasible local place');assert(f.wordLayout.visited<=384);
 console.log(JSON.stringify({ids,fit,p95:times[95],max:times.at(-1),layout:f.wordLayout,boxes:f.nums.map(n=>({owner:n.actorId,box:n.wordBox}))}));
}
