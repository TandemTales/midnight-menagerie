/** The master survey is assembled from the SAME architectural templates as
 * the playable sections, with roof and foundation drawings shown as insets. */
import { generateRegionMap, MASTER, regionMeta } from '../state/mapgen.js';
import { REGION_ORDER, COMPANIONS } from '../data/schema.js';
import { drawFloorplan } from './blueprint.js';

/* ROUND 61 REPAIR: THE HOUSE AS ONE RECOVERED PLAN AGAIN. Round 60 set the
   seventeen plans in three even files of five, every plan the same strip at
   the same size, and survey 12's judges read it as "a catalogue, not a house"
   against survey 10's painted plan, where each wing had its own shape in its
   own place. The plans are still the PLAYABLE ones (the seam this file exists
   for); what changes is how the surveyor laid them on the plate: each wing at
   its own scale, the long ranges run east-west and the towers and galleries
   turned north-south (`rot`, a quarter turn), and the whole set composed as
   one estate -- the grounds down the west, the house's main block on its axis
   with the Foyer at the front, the towers of the east range, the glasshouse
   on the south lawn and below stairs along the foot. Each plan's caption is
   lettered on open paper under it (`cap`), a tower's on two lines; the key
   and the rose keep the north-east bay. */
export const PLATE={key:[1084,6,358,148],rose:[1006,820,46],rule:884};
/* x, y: the plan sheet's top-left on the plate; k: plate px per plan px;
   rot: 0, or 90 for a quarter turn clockwise (the wing's door at the top) */
const P=(x,y,k,rot,level,cap='below')=>({x,y,k,rot,level,cap});
const PLACEMENT={
  'hedge-maze':P(44,30,0.074,90,'grounds'),
  'pumpkin-grounds':P(223,5,0.073,0,'grounds'),
  'sleeping-quarters':P(208,222,0.062,0,'upper'),
  graveyard:P(8,553,0.064,0,'grounds'),
  kennels:P(29,729,0.058,0,'ground'),
  'kitchens-cellars':P(354,405,0.07,90,'ground'),
  'attic-observatory':P(620,4,0.074,0,'roof'),
  'study-library':P(540,186,0.074,0,'ground'),
  ballroom:P(514,371,0.08,0,'ground'),
  foyer:P(500,580,0.084,0,'ground'),
  nursery:P(944,250,0.068,90,'upper','above'),
  lampworks:P(1094,160,0.066,90,'tower'),
  bathhouse:P(1274,252,0.064,90,'ground'),
  greenhouse:P(1056,688,0.07,0,'ground'),
  crypt:P(59,904,0.064,0,'foundation'),
  'secret-passages':P(551,896,0.064,0,'wall spaces'),
  heart:P(1041,903,0.066,0,'below'),
};
/** A plan point (sheet px) on the plate (estate px), for one placed wing. */
export function toPlate(s,u,v){
  if(s.rot===90)return [s.x+(s.sheetH-v)*s.k,s.y+u*s.k];
  return [s.x+u*s.k,s.y+v*s.k];
}
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
    const plan=surveyMap(slug).plan,{x,y,k,rot,level,cap}=PLACEMENT[slug],meta=regionMeta(slug);
    const W=plan.sheet.w,H=plan.sheet.h,turned=rot===90;
    const w=(turned?H:W)*k,h=(turned?W:H)*k;
    const s={x,y,k,rot:turned?90:0,sheetW:W,sheetH:H};
    const outline=footprintRings(plan.footprint).map(r=>{
      const out=[];
      for(let i=0;i+1<r.length;i+=2)out.push(...toPlate(s,r[i],r[i+1]));
      return out;
    });
    const middle=plan.footprint.reduce((best,r)=>{
      const dist=q=>Math.hypot((q.x0+q.x1)/2-W/2,(q.y0+q.y1)/2-H/2);
      return dist(r)<dist(best)?r:best;
    });
    let fx0=Infinity,fx1=-Infinity;
    for(const r of outline)for(let i=0;i<r.length;i+=2){fx0=Math.min(fx0,r[i]);fx1=Math.max(fx1,r[i]);}
    /* the paper a caption may take: a range's own width; a tower's caption
       is set on two lines and may stand a little wider than the tower */
    const cx=(fx0+fx1)/2,half=turned?Math.max((fx1-fx0)*.9,116):w/2;
    return {slug,meta,n:meta.section,x,y,w,h,k,rot:s.rot,sheetW:W,sheetH:H,cap,stack:turned,
      nx:x/MASTER.w,ny:y/MASTER.h,nw:w/MASTER.w,nh:h/MASTER.h,
      outline,pole:toPlate(s,(middle.x0+middle.x1)/2,(middle.y0+middle.y1)/2),span:[cx-half,cx+half],level,companion:COMPANIONS.find(c=>c.region===slug)||null};
  });
}

/** Shared raster/vector drawing, never a separately authored image crop.
 * `width` x `height` is the wing's box on the plate as drawn there: a turned
 * wing (`rot` 90) is drawn turned, its door at the top. */
export function drawSurveySection(g,slug,width,height,color,rot=0){
  const map=surveyMap(slug),plan=map.plan;
  g.save();
  if(rot===90){g.translate(width,0);g.rotate(Math.PI/2);g.scale(height/plan.sheet.w,width/plan.sheet.h);}
  else g.scale(width/plan.sheet.w,height/plan.sheet.h);
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

/** Where a wing's caption is lettered, in estate px, as wide and as deep as
 * it can be at the Deck's 1280 (about half a plate px per estate px): the
 * paper the plate's own drawing keeps clear. */
export function captionZone(w){
  const b=footBox(w),cx=(b.x0+b.x1)/2;
  const hw=w.stack?Math.max((b.x1-b.x0)*.9,118):Math.max((b.x1-b.x0)/2,130),deep=w.stack?86:48;
  return w.cap==='above'?{x0:cx-hw,x1:cx+hw,y0:b.y0-deep,y1:b.y0}:{x0:cx-hw,x1:cx+hw,y0:b.y1,y1:b.y1+deep};
}

/** The plate's own drawing under the seventeen plans (round 61): its neat
 * line; the galleries that join each wing to the next across the paper
 * between them; the grounds' trees, planted on the open lawn round the
 * house; and the ground line over the floors below stairs. Everything here
 * lies on the paper BETWEEN plans and never under a caption. */
export function drawMasterSurvey(g,wings,color){
  g.clearRect(0,0,MASTER.w,MASTER.h);
  g.strokeStyle=color;g.fillStyle=color;g.lineCap='round';g.lineJoin='round';
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
  const F=wings.map(w=>({w,b:footBox(w),c:captionZone(w)}));
  const [kx,ky,kw,kh]=PLATE.key,[rx,ry,rr]=PLATE.rose;
  const keep=[...F.map(f=>f.c),{x0:kx,y0:ky,x1:kx+kw,y1:ky+kh},{x0:rx-rr-12,y0:ry-rr-26,x1:rx+rr+12,y1:ry+rr+12}];
  const hits=(r,list)=>list.some(q=>r.x0<q.x1&&r.x1>q.x0&&r.y0<q.y1&&r.y1>q.y0);
  /* THE HOUSE AS ONE BUILDING (round 61): the wings that are the house proper
     stand inside one outer wall, drawn round them all and the courts and
     halls between, so the plate reads as a house and its grounds rather than
     seventeen drawings laid side by side. The grounds' wings are hedged
     round; the floors below stairs are outlined in hidden line. Each is a
     plan-closing of the wings' sheets and captions (a square dilation, then
     the same erosion), so the walls step with the wings they hold. */
  const MW=MASTER.w,MH=MASTER.h;
  const maskOf=(rects)=>{
    const m=new Uint8Array(MW*MH);
    for(const r of rects){
      const x0=Math.max(0,Math.floor(r.x0)),x1=Math.min(MW,Math.ceil(r.x1)),y0=Math.max(0,Math.floor(r.y0)),y1=Math.min(MH,Math.ceil(r.y1));
      for(let y=y0;y<y1;y++)m.fill(1,y*MW+x0,y*MW+x1);
    }
    return m;
  };
  const grow=(m,R)=>{
    const t=new Uint8Array(MW*MH),o=new Uint8Array(MW*MH);
    for(let y=0;y<MH;y++){const b=y*MW;let c=0;for(let x=-R;x<MW;x++){if(x+R<MW&&m[b+x+R])c++;if(x-R-1>=0&&m[b+x-R-1])c--;if(x>=0)t[b+x]=c>0?1:0;}}
    for(let x=0;x<MW;x++){let c=0;for(let y=-R;y<MH;y++){if(y+R<MH&&t[(y+R)*MW+x])c++;if(y-R-1>=0&&t[(y-R-1)*MW+x])c--;if(y>=0)o[y*MW+x]=c>0?1:0;}}
    return o;
  };
  const not=(m)=>{const o=new Uint8Array(m.length);for(let i=0;i<m.length;i++)o[i]=m[i]?0:1;return o;};
  const close=(m,R)=>not(grow(not(grow(m,R)),R));
  const GROUP={
    house:['attic-observatory','study-library','ballroom','foyer','nursery','lampworks','bathhouse','kitchens-cellars','sleeping-quarters'],
    grounds:['hedge-maze','pumpkin-grounds','graveyard','kennels'],
    below:['crypt','secret-passages','heart'],
  };
  const sheetOf=(f)=>({x0:f.w.x-4,y0:f.w.y-4,x1:f.w.x+f.w.w+4,y1:f.w.y+f.w.h+4});
  const mass={};
  for(const [name,slugs] of Object.entries(GROUP)){
    const own=F.filter(f=>slugs.includes(f.w.slug));
    if(!own.length)continue;
    let m=close(maskOf(own.flatMap(f=>[sheetOf(f),f.c])),name==='house'?58:44);
    /* never round another group's wing, the key or the rose */
    const other=grow(maskOf([...F.filter(f=>!slugs.includes(f.w.slug)).flatMap(f=>[sheetOf(f),f.c]),keep[keep.length-2],keep[keep.length-1]]),10);
    for(let i=0;i<m.length;i++)if(other[i])m[i]=0;
    mass[name]=m;
  }
  {
    const cv=document.createElement('canvas');cv.width=MW;cv.height=MH;
    const cg=cv.getContext('2d'),img=cg.createImageData(MW,MH),px=img.data;
    const ink=/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color)||[0,'2a','18','0b'];
    const IR=parseInt(ink[1],16),IG=parseInt(ink[2],16),IB=parseInt(ink[3],16);
    /* the plans themselves, by their own footprints: the courts' wash and the
       vaults' hatching stop at a wing's walls, not at its bounding box */
    const plans=new Uint8Array(MW*MH);
    {
      const pc=document.createElement('canvas');pc.width=MW;pc.height=MH;
      const pg=pc.getContext('2d');pg.fillStyle='#000';
      for(const f of F){pg.beginPath();for(const r of f.w.outline||[]){for(let i=0;i+1<r.length;i+=2)pg[i?'lineTo':'moveTo'](r[i],r[i+1]);pg.closePath();}pg.fill();}
      const d=pg.getImageData(0,0,MW,MH).data;
      for(let i=0;i<plans.length;i++)plans[i]=d[i*4+3]>0?1:0;
    }
    const put=(i,a)=>{if(a>px[i*4+3]){px[i*4]=IR;px[i*4+1]=IG;px[i*4+2]=IB;px[i*4+3]=a;}};
    if(mass.house){
      /* the outer wall, heavy, and its plinth line a step outside it; the
         courts and halls inside laid in a wash and hatched as paving */
      const C=mass.house,w5=grow(C,5),w9=grow(C,9),w11=grow(C,11);
      for(let i=0;i<C.length;i++){
        if(C[i]){if(!plans[i]){const x=i%MW,y=(i/MW)|0;put(i,((x+y)%5===0)?150:88);}}
        else if(w5[i])put(i,240);
        else if(w11[i]&&!w9[i])put(i,170);
      }
    }
    if(mass.grounds){
      /* the grounds' clipped hedge: a band of close-set bushes */
      const C=mass.grounds,a=grow(C,10),b=grow(C,2);
      for(let i=0;i<C.length;i++){
        if(a[i]&&!b[i]){const x=i%MW,y=(i/MW)|0,dx=(x%7)-3,dy=(y%7)-3;if(dx*dx+dy*dy<=8)put(i,dx*dx+dy*dy>=5?210:120);}
      }
    }
    if(mass.below){
      /* below stairs: the vaults' outline in hidden line, dashed */
      const C=mass.below,a=grow(C,4),b=grow(C,1);
      for(let i=0;i<C.length;i++){
        if(a[i]&&!b[i]){const x=i%MW,y=(i/MW)|0;if(((x+y)>>3)%2===0)put(i,210);}
        else if(C[i]&&!plans[i]){const x=i%MW,y=(i/MW)|0;if((x-y+4096)%9===0)put(i,46);}
      }
    }
    cg.putImageData(img,0,0);
    g.save();g.globalAlpha=1;g.drawImage(cv,0,0);g.restore();
  }
  const massed=(x,y)=>{const i=(Math.round(y)*MW+Math.round(x));return !!(mass.house?.[i]||mass.below?.[i]);};
  /* a gallery: two walls across the paper, a door tick at each end */
  const gallery=(ax,ay,bx,by,half=7)=>{
    const L=Math.hypot(bx-ax,by-ay);if(L<4)return;
    const nx=-(by-ay)/L*half,ny=(bx-ax)/L*half;
    /* its floor laid in a wash, as the plans' own halls are */
    g.save();g.globalAlpha=.16;g.beginPath();g.moveTo(ax+nx,ay+ny);g.lineTo(bx+nx,by+ny);g.lineTo(bx-nx,by-ny);g.lineTo(ax-nx,ay-ny);g.closePath();g.fill();g.restore();
    g.globalAlpha=.85;
    pen(ax+nx,ay+ny,bx+nx,by+ny,2.1);pen(ax-nx,ay-ny,bx-nx,by-ny,2.1);
    g.globalAlpha=.52;pen(ax+nx*1.6,ay+ny*1.6,ax-nx*1.6,ay-ny*1.6,1.3);pen(bx+nx*1.6,by+ny*1.6,bx-nx*1.6,by-ny*1.6,1.3);
  };
  /* every pair of neighbours whose walls face each other across a short run
     of paper is joined, side by side at mid-depth, one above the other near
     an end (a caption is lettered under a plan's middle) */
  const boxes=F.map(f=>f.b);
  for(let i=0;i<F.length;i++)for(let j=0;j<F.length;j++){
    if(i===j)continue;
    const A=F[i].b,B=F[j].b,others=boxes.filter((_,q)=>q!==i&&q!==j);
    const gx=B.x0-A.x1,lo=Math.max(A.y0,B.y0)+10,hi=Math.min(A.y1,B.y1)-10;
    if(gx>3&&gx<96&&hi-lo>=14){
      const y=(lo+hi)/2,r={x0:A.x1,x1:B.x0,y0:y-9,y1:y+9};
      if(!hits(r,keep)&&!hits(r,others))gallery(A.x1,y,B.x0,y);
    }
    const gy=B.y0-A.y1,l2=Math.max(A.x0,B.x0)+10,h2=Math.min(A.x1,B.x1)-10;
    if(gy>3&&gy<110&&h2-l2>=14){
      for(const x of [l2+6,h2-6]){
        const r={x0:x-8,x1:x+8,y0:A.y1,y1:B.y0};
        if(hits(r,keep)||hits(r,others))continue;
        gallery(x,A.y1,x,B.y0,6);break;
      }
    }
  }
  /* the grounds: trees on the open lawn, wherever a crown clears every plan,
     every caption, the key and the rose, and the plate's own margin */
  /* a crown: lobed, its outline erased wherever the crown in front of it
     stands (they are planted back to front), so a grove is drawn as one
     wood of overlapping crowns, shaded to the south-east and stippled */
  const crown=(x,y,r)=>{
    const n=7+Math.floor(rnd()*3),p0=rnd()*6.283,path=new Path2D();
    for(let i=0;i<=n;i++){
      const a=p0+i/n*6.283,b=p0+(i+.5)/n*6.283,rr0=r*(.84+rnd()*.14);
      const px=x+Math.cos(a)*rr0,py=y+Math.sin(a)*rr0;
      if(!i)path.moveTo(px,py);else path.quadraticCurveTo(x+Math.cos(b)*r*1.2,y+Math.sin(b)*r*1.2,px,py);
    }
    return path;
  };
  const tree=(x,y,r)=>{
    const c=crown(x,y,r);
    g.save();g.globalCompositeOperation='destination-out';g.globalAlpha=1;g.fill(c);g.restore();
    /* its shadow on the lawn, cast to the south-east */
    g.save();g.globalAlpha=.16;g.beginPath();g.ellipse(x+r*.55,y+r*.7,r*.95,r*.55,0,0,6.283);g.fill();g.restore();
    g.save();g.globalCompositeOperation='destination-out';g.fill(c);g.restore();
    g.globalAlpha=.86;g.lineWidth=1.35;g.stroke(c);
    g.save();g.clip(c);g.globalAlpha=.42;g.lineWidth=.85;
    for(let t=-r*.2;t<r*1.5;t+=2.3){g.beginPath();g.moveTo(x+t,y+r*1.3);g.lineTo(x+t+r*1.3,y);g.stroke();}
    g.globalAlpha=.7;
    for(let i=0;i<4;i++){const a=rnd()*6.283,d=rnd()*r*.6;g.beginPath();g.arc(x+Math.cos(a)*d-r*.2,y+Math.sin(a)*d-r*.2,.9,0,6.283);g.fill();}
    g.restore();
  };
  /* planted in groves and belts, not a lattice: a slow, fixed swell of
     ground decides where the trees stand thick and where the lawn is open;
     a tree keeps a path's width off every plan */
  const grove=(x,y)=>Math.sin(x/97+1.3)*Math.cos(y/83-.4)+.6*Math.sin((x+y)/61+2.1)+.45*Math.cos((x-2*y)/131);
  const open=(x,y,r)=>{
    if(x-r<20||y-r<20||x+r>MASTER.w-20||y+r>MASTER.h-20)return false;
    const q={x0:x-r-18,y0:y-r-18,x1:x+r+18,y1:y+r+18};
    return !hits(q,boxes)&&!hits({x0:x-r-3,y0:y-r-3,x1:x+r+3,y1:y+r+3},keep);
  };
  const plant=[];
  for(let y=30;y<MASTER.h-24;y+=13)for(let x=30+((y/13)%2)*7;x<MASTER.w-24;x+=14){
    const px=x+(rnd()-.5)*8,py=y+(rnd()-.5)*8,gv=grove(px,py);
    if(gv<.05)continue;
    const r=7+rnd()*4+Math.min(3,gv*2);
    if(rnd()<.5+gv*.3&&open(px,py,r)&&!massed(px,py)&&!massed(px-r,py)&&!massed(px+r,py)&&!massed(px,py-r)&&!massed(px,py+r))plant.push([px,py,r]);
  }
  plant.sort((a,b)=>a[1]-b[1]);
  for(const [x,y,r] of plant)tree(x,y,r);
  /* the ground line over the floors below stairs, doubled and broken, left
     off wherever a caption is lettered across it */
  g.globalAlpha=.7;g.setLineDash([14,6,3,6]);
  const y0=PLATE.rule,breaks=keep.filter(q=>q.y0<y0+8&&q.y1>y0-4).map(q=>[q.x0-6,q.x1+6]).sort((a,b)=>a[0]-b[0]);
  for(const [yy,wd] of [[y0,2],[y0+5,1]]){
    g.lineWidth=wd;let x=18;
    for(const [a,b] of [...breaks,[MASTER.w-18,MASTER.w-18]]){
      if(a>x){g.beginPath();g.moveTo(x,yy);g.lineTo(Math.min(a,MASTER.w-18),yy);g.stroke();}
      x=Math.max(x,b);
    }
  }
  g.setLineDash([]);g.globalAlpha=1;
}
