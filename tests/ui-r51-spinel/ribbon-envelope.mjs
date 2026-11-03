/** Real CombatFX measurement/animation against asymmetric DOM + ink fixtures. */
import assert from 'node:assert/strict';
import { CombatFX } from '../../game/src/fx/combatfx.js';
const rows=[];
for(const ink of [
 {left:-50,right:50,top:-12,bottom:12},
 {left:-50,right:50,top:-15,bottom:12},
 {left:-54,right:53,top:-16,bottom:14},
 {left:-50,right:61,top:-12,bottom:19},
]) for(const mag of [0,4,30,1000]) {
 const dom={left:-50,right:50,top:-12,bottom:12};let measured=false;
 const el={style:{transform:'translate3d(800px,400px,0) scale(1.9)'},dataset:{},classList:{toggle(){}},getBoundingClientRect(){assert.equal(this.style.transform,'none');measured=true;return dom;}};
 globalThis.document={createRange:()=>({selectNodeContents(node){assert.equal(node,el)},getBoundingClientRect(){assert.ok(measured);return ink;}})};
 const fx=Object.create(CombatFX.prototype);fx.showNumbers=true;fx.nums=[{el,live:0}];fx._syncOwnerCaptions=()=>{};
 fx._fitWords=()=>{const n=fx.nums[0];n.wordBox={left:100,top:100,right:100+n.wordW,bottom:100+n.wordH};n.x=100+n.wordW/2+n.wordDX;n.y=100+n.wordH/2+n.wordDY;return true;};
 fx.number(200,200,'+2 Vulnerable',{kind:'debuff',mag,actorId:'owner',actor:{}});
 const n=fx.nums[0],bounds={left:Math.min(dom.left,ink.left),right:Math.max(dom.right,ink.right),top:Math.min(dom.top,ink.top),bottom:Math.max(dom.bottom,ink.bottom)};
 for(let i=0;i<1000;i++){
  n.t=n.dur*(i/1000);fx._updateNumbers(0);
  const m=el.style.transform.match(/translate3d\(([-.\d]+)px,([-.\d]+)px,0\) scale\(([-.\d]+)\)/);assert.ok(m);
  const [,x,y,scale]=m.map(Number),actual={left:x+bounds.left*scale,right:x+bounds.right*scale,top:y+bounds.top*scale,bottom:y+bounds.bottom*scale};
  const outside=Math.max(0,n.wordBox.left-actual.left,actual.right-n.wordBox.right,n.wordBox.top-actual.top,actual.bottom-n.wordBox.bottom);
  assert.ok(outside<1e-6,JSON.stringify({ink,mag,i,outside,actual,expected:n.wordBox}));
 }
 rows.push({ink,mag,samples:1000,width:n.wordW,height:n.wordH,offset:[n.wordDX,n.wordDY]});
}
// Numeric damage never enters the new owned-word measurement path.
{
 globalThis.document={createRange(){throw Error('Numeric damage must not measure word ink')}};
 const fx=Object.create(CombatFX.prototype);fx.showNumbers=true;fx.nums=[{live:0,el:{style:{},dataset:{},classList:{toggle(){}},offsetHeight:24}}];fx._syncOwnerCaptions=()=>{};
 fx.number(200,200,30,{kind:'damage',mag:30});const n=fx.nums[0];assert.equal(n.actorId,null);assert.ok(n.rise>0);fx._updateNumbers(.2);assert.ok(!n.el.style.transform.includes(',200.0px,'));
}
console.log(JSON.stringify({passed:true,animatedSamples:16000,numericMotionPreserved:true,rows},null,2));
