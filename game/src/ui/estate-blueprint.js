/** The master survey is assembled from the SAME architectural templates as
 * the playable sections, with roof and foundation drawings shown as insets. */
import { generateRegionMap, MASTER, regionMeta } from '../state/mapgen.js';
import { REGION_ORDER, COMPANIONS } from '../data/schema.js';
import { drawFloorplan } from './blueprint.js';

const PLACEMENT={
  'hedge-maze':[40,60,220,390,'grounds'],
  'pumpkin-grounds':[270,55,300,160,'grounds'],
  greenhouse:[580,55,300,160,'ground'],
  kennels:[270,225,300,210,'ground'],
  'kitchens-cellars':[580,225,300,180,'ground'],
  bathhouse:[890,225,260,180,'ground'],
  nursery:[580,415,300,205,'upper'],
  'sleeping-quarters':[890,415,300,160,'upper'],
  ballroom:[270,630,300,200,'ground'],
  foyer:[580,630,300,200,'ground'],
  'study-library':[890,585,300,245,'ground'],
  graveyard:[40,470,220,330,'grounds'],
  lampworks:[1210,60,190,390,'tower'],
  'attic-observatory':[1210,485,190,345,'roof'],
  crypt:[70,860,320,145,'foundation'],
  'secret-passages':[480,860,360,145,'wall spaces'],
  heart:[900,860,300,145,'below'],
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

export function drawMasterSurvey(g,wings,color){
  g.clearRect(0,0,MASTER.w,MASTER.h);
  g.strokeStyle=color;g.fillStyle=color;g.lineWidth=1.8;
  // The old house's connecting galleries, laid behind the section drawings.
  const links=[['foyer','ballroom'],['foyer','study-library'],['foyer','nursery'],['nursery','sleeping-quarters'],['nursery','kitchens-cellars'],['kitchens-cellars','greenhouse'],['kitchens-cellars','kennels'],['kitchens-cellars','bathhouse'],['kennels','pumpkin-grounds'],['pumpkin-grounds','hedge-maze'],['ballroom','graveyard']];
  for(const [a,b] of links){
    const A=wings.find(w=>w.slug===a),B=wings.find(w=>w.slug===b),ax=A.x+A.w/2,ay=A.y+A.h/2,bx=B.x+B.w/2,by=B.y+B.h/2;
    g.save();g.globalAlpha=.8;
    for(const o of [-3,3]){g.beginPath();g.moveTo(ax,ay+o);g.lineTo(bx,ay+o);g.lineTo(bx,by);g.stroke();}g.restore();
  }
  g.setLineDash([4,6]);g.beginPath();g.moveTo(35,835);g.lineTo(1405,835);g.moveTo(1195,40);g.lineTo(1195,825);g.stroke();g.setLineDash([]);
  g.font='18px Georgia';g.textAlign='left';g.fillText('FOUNDATIONS & WALL SPACES — separate survey below the main house',45,855);
  g.fillText('ROOF / TOWER',1220,465);
}
