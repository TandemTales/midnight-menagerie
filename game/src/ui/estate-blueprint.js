/** The master survey is assembled from the SAME architectural templates as
 * the playable sections, with roof and foundation drawings shown as insets. */
import { generateRegionMap, MASTER, regionMeta } from '../state/mapgen.js';
import { REGION_ORDER, COMPANIONS } from '../data/schema.js';
import { drawFloorplan } from './blueprint.js';

/* ROUND 60 (DIOPSIDE): THE HOUSE ON ONE PLATE. Every wing's plan is a long
   range about 3.4 times as wide as it is deep, and the old placement boxed them
   into squares and towers, so the Hedge Maze was drawn 98 px wide at 1280 and
   every nameplate was bigger than the plan it named. Now the plate is three
   ranges of five above a foundation row, each plan as wide as its range: the
   grounds down the west side, the house's two ranges east of them with the
   Foyer at the front door (south, the foot of the sheet), and below stairs the
   Crypt, the Passages and the Heart. Sections abut: the empty paper each plan
   sheet carries above and below its footprint is the gutter the surveyor's
   caption is lettered in. The north-east bay is the sheet's key and rose. */
export const PLATE={col:[24,500,976],w:448,row:[8,180,352,524,696],h:172,below:896,rule:886,key:[976,8]};
const P=(c,r,level)=>[PLATE.col[c],r<0?PLATE.below:PLATE.row[r],PLATE.w,PLATE.h,level];
const PLACEMENT={
  'hedge-maze':P(0,0,'grounds'),
  'pumpkin-grounds':P(0,1,'grounds'),
  greenhouse:P(0,2,'ground'),
  kennels:P(0,3,'ground'),
  graveyard:P(0,4,'grounds'),
  'attic-observatory':P(1,0,'roof'),
  nursery:P(1,1,'upper'),
  'kitchens-cellars':P(1,2,'ground'),
  ballroom:P(1,3,'ground'),
  foyer:P(1,4,'ground'),
  lampworks:P(2,1,'tower'),
  'sleeping-quarters':P(2,2,'upper'),
  bathhouse:P(2,3,'ground'),
  'study-library':P(2,4,'ground'),
  crypt:P(0,-1,'foundation'),
  'secret-passages':P(1,-1,'wall spaces'),
  heart:P(2,-1,'below'),
};
const maps=new Map();
export function surveyMap(slug){
  if(!maps.has(slug))maps.set(slug,generateRegionMap(slug,42,{style:'plan'}));
  return maps.get(slug);
}

/** Cancel shared tile edges, then walk the remaining outside contours. */
export function footprintRings(tiles){
  const edges=new Map(),key=p=>p.join(',');
  // Rooms meet halls along partial wall spans, so split at every structural
  // coordinate before cancelling shared boundaries. This works for both
  // rectangular bays and the restored stepped, lengthwise section outlines.
  const xs=[...new Set(tiles.flatMap(r=>[r.x0,r.x1]))].sort((a,b)=>a-b);
  const ys=[...new Set(tiles.flatMap(r=>[r.y0,r.y1]))].sort((a,b)=>a-b);
  const occupied=Array.from({length:ys.length-1},(_,j)=>Array.from({length:xs.length-1},(_,i)=>{
    const x=(xs[i]+xs[i+1])/2,y=(ys[j]+ys[j+1])/2;
    return tiles.some(r=>x>r.x0&&x<r.x1&&y>r.y0&&y<r.y1);
  }));
  const edge=(a,b)=>edges.set(`${key(a)}>${key(b)}`,{a,b});
  for(let j=0;j<ys.length-1;j++)for(let i=0;i<xs.length-1;i++){
    if(!occupied[j][i])continue;
    const a=[xs[i],ys[j]],b=[xs[i+1],ys[j]],c=[xs[i+1],ys[j+1]],d=[xs[i],ys[j+1]];
    if(!occupied[j-1]?.[i])edge(a,b);
    if(!occupied[j][i+1])edge(b,c);
    if(!occupied[j+1]?.[i])edge(c,d);
    if(!occupied[j][i-1])edge(d,a);
  }
  const rings=[];
  while(edges.size){
    const first=edges.entries().next().value;edges.delete(first[0]);
    const ring=[...first[1].a,...first[1].b];let end=first[1].b;
    while(key(end)!==key(first[1].a)){
      const next=[...edges].find(([,e])=>key(e.a)===key(end));if(!next)break;
      edges.delete(next[0]);end=next[1].b;ring.push(...end);
    }
    rings.push(ring);
  }
  return rings;
}

export function estateSections(){
  return REGION_ORDER.map(slug=>{
    const plan=surveyMap(slug).plan,[left,top,maxW,maxH,level]=PLACEMENT[slug],meta=regionMeta(slug);
    const scale=Math.min(maxW/plan.sheet.w,maxH/plan.sheet.h),w=plan.sheet.w*scale,h=plan.sheet.h*scale;
    const x=left+(maxW-w)/2,y=top+(maxH-h)/2;
    const outline=footprintRings(plan.footprint).map(r=>r.map((v,i)=>(i%2?y:x)+v*scale));
    const middle=plan.footprint.reduce((best,r)=>{
      const dist=q=>Math.hypot((q.x0+q.x1)/2-plan.sheet.w/2,(q.y0+q.y1)/2-plan.sheet.h/2);
      return dist(r)<dist(best)?r:best;
    });
    return {slug,meta,n:meta.section,x,y,w,h,nx:x/MASTER.w,ny:y/MASTER.h,nw:w/MASTER.w,nh:h/MASTER.h,
      outline,pole:[x+(middle.x0+middle.x1)/2*scale,y+(middle.y0+middle.y1)/2*scale],span:[x,x+w],level,companion:COMPANIONS.find(c=>c.region===slug)||null};
  });
}

/** Shared raster/vector drawing, never a separately authored image crop. */
export function drawSurveySection(g,slug,width,height,color){
  const map=surveyMap(slug),plan=map.plan;
  g.save();g.scale(width/plan.sheet.w,height/plan.sheet.h);
  // Master drawings show permanent architecture. Tonight's damage and the
  // kids' numbered routes belong to the investigation overlay on the wing.
  drawFloorplan(g,{...plan,secrets:[],blockers:[]},{regionId:slug,seed:42});
  g.restore();g.save();g.globalCompositeOperation='source-in';g.fillStyle=color;g.fillRect(0,0,width,height);g.restore();
}

/** A wing's footprint box on the master, in estate px. */
export function footBox(w){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const r of (w.outline||[]))for(let i=0;i+1<r.length;i+=2){
    x0=Math.min(x0,r[i]);x1=Math.max(x1,r[i]);y0=Math.min(y0,r[i+1]);y1=Math.max(y1,r[i+1]);
  }
  if(!Number.isFinite(x0))return {x0:w.x,y0:w.y,x1:w.x+w.w,y1:w.y+w.h};
  return {x0,y0,x1,y1};
}

/** The plate's own drawing under the seventeen plans (round 60): its neat
 * line, the galleries that join one range to the next across the gutters, the
 * garden wall round the grounds, the house's outer wall round its two ranges,
 * and the foundation rule. Everything here lies in the paper BETWEEN plans. */
export function drawMasterSurvey(g,wings,color){
  g.clearRect(0,0,MASTER.w,MASTER.h);
  g.strokeStyle=color;g.fillStyle=color;g.lineCap='round';g.lineJoin='round';
  const W=Object.fromEntries(wings.map(w=>[w.slug,footBox(w)]));
  let s=0x5eed1;const rnd=()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);
  /* a pen line, wandering a hair off true and heavier where the nib loaded */
  const pen=(x0,y0,x1,y1,wd=1.6)=>{
    const L=Math.hypot(x1-x0,y1-y0),n=Math.max(2,Math.ceil(L/14)),nx=(y1-y0)/L,ny=-(x1-x0)/L;
    g.lineWidth=wd*(.85+rnd()*.3);g.beginPath();
    for(let i=0;i<=n;i++){const t=i/n,o=(rnd()-.5)*.9;g[i?'lineTo':'moveTo'](x0+(x1-x0)*t+nx*o,y0+(y1-y0)*t+ny*o);}
    g.stroke();
  };
  /* the neat line round the whole plate: a heavy rule and a hairline inside */
  g.globalAlpha=.85;
  const R=(i,wd)=>{pen(i,i,MASTER.w-i,i,wd);pen(MASTER.w-i,i,MASTER.w-i,MASTER.h-i,wd);pen(MASTER.w-i,MASTER.h-i,i,MASTER.h-i,wd);pen(i,MASTER.h-i,i,i,wd);};
  R(3,3.2);g.globalAlpha=.6;R(9,1.2);
  /* a gallery: two walls across the gutter, a door tick at each end */
  const gallery=(ax,ay,bx,by,half=7)=>{
    const L=Math.hypot(bx-ax,by-ay);if(L<4)return;
    const nx=-(by-ay)/L*half,ny=(bx-ax)/L*half;
    g.globalAlpha=.78;
    pen(ax+nx,ay+ny,bx+nx,by+ny,1.9);pen(ax-nx,ay-ny,bx-nx,by-ny,1.9);
    g.globalAlpha=.5;pen(ax+nx*1.6,ay+ny*1.6,ax-nx*1.6,ay-ny*1.6,1.3);pen(bx+nx*1.6,by+ny*1.6,bx-nx*1.6,by-ny*1.6,1.3);
  };
  /* across the column gutters, joined at mid-depth of the nearer plan */
  const across=[['hedge-maze','attic-observatory'],['pumpkin-grounds','nursery'],['nursery','lampworks'],['greenhouse','kitchens-cellars'],['kitchens-cellars','sleeping-quarters'],['kennels','ballroom'],['ballroom','bathhouse'],['graveyard','foyer'],['foyer','study-library'],['crypt','secret-passages'],['secret-passages','heart']];
  for(const [a,b] of across){
    const A=W[a],B=W[b],y=(Math.max(A.y0,B.y0)+Math.min(A.y1,B.y1))/2;
    gallery(A.x1,y,B.x0,y);
  }
  /* down the row gutters, at the plans' outer ends, clear of the captions */
  const down=[['attic-observatory','nursery',.06],['nursery','kitchens-cellars',.94],['kitchens-cellars','ballroom',.06],['ballroom','foyer',.94],['lampworks','sleeping-quarters',.94],['sleeping-quarters','bathhouse',.06],['bathhouse','study-library',.94],['hedge-maze','pumpkin-grounds',.94],['greenhouse','kennels',.06]];
  for(const [a,b,f] of down){
    const A=W[a],B=W[b],x=A.x0+(A.x1-A.x0)*f;
    gallery(x,A.y1,x,B.y0,6);
  }
  /* the garden wall round the grounds: a dotted hedge line in the gutter */
  const gw=[PLATE.col[0]-7,PLATE.row[0]+10,PLATE.col[0]+PLATE.w+6,PLATE.rule-6];
  g.globalAlpha=.55;g.setLineDash([1.5,7]);g.lineWidth=3;
  g.strokeRect(gw[0],gw[1],gw[2]-gw[0],gw[3]-gw[1]);g.setLineDash([]);
  /* the house's outer wall round its two ranges, doubled, a step outside them */
  const L0=PLATE.col[1]-6,T0=PLATE.row[0]+10,CX=PLATE.col[1]+PLATE.w+12,T1=PLATE.row[1]+10,R0=PLATE.col[2]+PLATE.w+6,B0=PLATE.rule-6;
  const house=[[L0,T0,-1,-1],[CX,T0,1,-1],[CX,T1,1,-1],[R0,T1,1,-1],[R0,B0,1,1],[L0,B0,-1,1]];
  g.globalAlpha=.42;
  for(const o of [0,5]){
    for(let i=0;i<house.length;i++){
      const a=house[i],b=house[(i+1)%house.length];
      pen(a[0]+a[2]*o,a[1]+a[3]*o,b[0]+b[2]*o,b[1]+b[3]*o,1.4);
    }
  }
  /* the foundation rule: the ground line, doubled and broken, with the stair
     down from the Foyer drawn through it */
  g.globalAlpha=.7;g.setLineDash([14,6,3,6]);g.lineWidth=2;
  g.beginPath();g.moveTo(18,PLATE.rule);g.lineTo(MASTER.w-18,PLATE.rule);g.stroke();
  g.lineWidth=1;g.beginPath();g.moveTo(18,PLATE.rule+5);g.lineTo(MASTER.w-18,PLATE.rule+5);g.stroke();g.setLineDash([]);
}
