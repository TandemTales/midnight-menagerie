/** Lengthwise architectural expansion of the original local branch graph. */
import { RNG, hashSeed } from '../core/rng.js';

export const PASSAGE_KITS = Object.freeze({
  foyer:['painting','fireplace','statue','panel','bellpull','stair'],
  nursery:['dollhouse','wardrobe','underbed','panel','toybox'],
  'sleeping-quarters':['underbed','wardrobe','linen','mirror','stair'],
  'kitchens-cellars':['dumbwaiter','coalchute','coldstore','trapdoor','fireplace'],
  greenhouse:['cistern','trellis','vent','rootdoor'],
  graveyard:['sarcophagus','tunnel','grate','rootdoor'],
  'study-library':['bookcase','globe','painting','fireplace','ladder'],
  'attic-observatory':['roofwalk','ladder','clock','trapdoor'],
  lampworks:['lift','gear','vent','ladder'],
  ballroom:['piano','mirror','curtain','statue','dumbwaiter'],
  crypt:['sarcophagus','grate','stair','cistern'],
  'hedge-maze':['trellis','rootdoor','tunnel','gap'],
  'secret-passages':['panel','clock','bellpull','linen','vent'],
  bathhouse:['cistern','drain','mirror','linen'],
  kennels:['kennel','tunnel','feedhatch','trapdoor'],
  'pumpkin-grounds':['rootdoor','trellis','cistern','tunnel'],
  heart:['mirror','clock','painting','gear','stair'],
});
export const OBSTRUCTIONS = Object.freeze({rubble:'ceiling fell in!',flood:'too deep — go round',roots:'roots grew through it',collapse:'floor is GONE',bars:'gate rusted shut',furniture:'furniture barricade',books:'shelves fell over',gears:'gears will not stop',glass:'fallen glass roof'});

const rect=(id,name,x0,y0,x1,y1,extra={})=>({id,name,x0,y0,x1,y1,...extra});
const centre=r=>[(r.x0+r.x1)/2,(r.y0+r.y1)/2];

export function layOutMansion(map){
  const draft=map.plan.draft, SX=2.25,SY=2.2,GAP=76,LEFT=300;
  const rng=new RNG(hashSeed(`local-house-v5|${map.regionId}|${map.seed}`));
  const baseY=Math.min(...draft.rooms.map(r=>r.y0));
  const Y=y=>250+(y-baseY)*SY;
  const X=(x,row)=>LEFT+(x-draft.cols[0])*SX+row*GAP;
  const plan={v:5,style:map.plan.style,form:map.regionId,circulation:'local-branches',
    sheet:{w:0,h:0},rooms:[],annexes:[],halls:[],doors:[],secrets:[],blockers:[],
    entries:{},entryVia:{},courts:[],cols:[],junctions:[],hallLinks:[],footprint:[]};
  const nodeById=new Map(map.nodes.map(n=>[n.id,n])),roomById=new Map();
  for(const d of draft.rooms){
    const n=nodeById.get(d.id),r=rect(n.id,n.roomName,X(d.x0,n.row),Y(d.y0),X(d.x1,n.row),Y(d.y1),
      {row:n.row,type:n.type,tag:n.roomTag,side:1});
    plan.rooms.push(r);roomById.set(r.id,r);
  }
  // A principal chamber projects from the long facade. Keep its original
  // thresholds, so the larger room does not change the local branch graph.
  const ordinary=plan.rooms.filter(r=>r.type!=='boss');
  const area=r=>(r.x1-r.x0)*(r.y1-r.y0);
  const smallest=Math.min(...ordinary.map(area));
  const outer=ordinary.filter(r=>r.row>0&&r.row<map.rows-2&&!ordinary.some(q=>q.row===r.row&&q.y1>r.y1));
  const principal=outer.find(r=>/parlor|dining|library|nursery|kitchen|study|drawing|chamber|suite|hall/i.test(r.name))||outer[Math.floor(outer.length/2)];
  if(principal)principal.y1=Math.max(principal.y1,principal.y0+smallest*2.1/(principal.x1-principal.x0));
  // Neighboring choice columns retain the old brick-bond relationship. A real
  // cross passage now separates each pair instead of moving the choices to a
  // remote suite. Most connections cross only this 76px-wide hallway.
  const cross=[];
  for(let row=0;row<map.rows;row++){
    const rooms=plan.rooms.filter(r=>r.row===row || row>0&&r.row===row-1);
    const x1=X(draft.cols[row],row),x0=x1-(row?GAP:112);
    const y0=Math.min(...rooms.map(r=>r.y0)),y1=Math.max(...rooms.map(r=>r.y1));
    const h=rect(`cross-${row}`,row?'CROSS GALLERY':'ENTRANCE HALL',x0,y0,x1,y1,{vertical:true,x:(x0+x1)/2});
    cross.push(h);plan.halls.push(h);plan.cols.push(x1);
  }
  const points=new Map(),hallPoints=new Map();
  const point=(hall,y)=>{
    const id=`${hall.id}:${y.toFixed(4)}`;
    if(!points.has(id)){
      points.set(id,{id,point:[hall.x,y]});
      if(!hallPoints.has(hall.id))hallPoints.set(hall.id,[]);
      hallPoints.get(hall.id).push({id,y});
    }
    return id;
  };
  const addDoor=(e,r,role,y,hall)=>{
    const d={id:`${e.from || 'entry'}>${e.to}:${role}`,x:role==='exit'?r.x1:r.x0,y,w:58,
      kind:r.type==='boss'?'boss':'door',opens:role==='exit'?'west':'east',to:r.id,
      latch:true,routeFrom:e.from,routeTo:e.to,role,hallNode:point(hall,y)};
    plan.doors.push(d);return d;
  };
  const bypasses=new Map();
  for(const h of draft.halls){
    const r=h.t,corr=rect(`bypass-${r}`,'SIDE PASSAGE',X(h.x0,r),Y(h.y0),X(h.x1,r),Y(h.y1),{y:Y(h.y)});
    plan.halls.push(corr);bypasses.set(`${h.from}>${h.to}`,corr);
    const a=point(cross[r],corr.y),b=point(cross[r+1],corr.y);
    plan.hallLinks.push({a,b,blocked:false});
    for(const x of [corr.x0,corr.x1])plan.doors.push({x,y:corr.y,w:(corr.y1-corr.y0)-8,kind:'hall'});
  }
  // On nights with no generated secret, dress one existing short optional
  // bypass as a concealed passage. It adds no edge and skips only one stage.
  const localSecret=!map.edges.some(e=>e.kind==='secret')
    ? map.edges.filter(e=>bypasses.has(`${e.from}>${e.to}`)&&nodeById.get(e.from).next.length>1)
      .sort((a,b)=>{
        const length=e=>{const A=centre(roomById.get(e.from)),B=centre(roomById.get(e.to));return Math.hypot(A[0]-B[0],A[1]-B[1]);};
        return length(a)-length(b);
      })[0] : null;
  let serial=0;
  for(const e of map.edges){
    const a=roomById.get(e.from),b=roomById.get(e.to);
    if(e.kind==='secret'||e===localSecret){
      // Preserve the recipe's zero-to-two optional shortcuts. Do not convert
      // ordinary choices into portals or invent extra distant connections.
      e.kind='secret';e.passageId=`S${String(++serial).padStart(2,'0')}`;
      e.device=PASSAGE_KITS[map.regionId][(serial-1+rng.int(PASSAGE_KITS[map.regionId].length))%PASSAGE_KITS[map.regionId].length];
      e.via=[[a.x1-42,a.y1-36],[b.x0+42,b.y1-36]];
      e.reason='An optional shortcut past a few rooms; the ordinary branches remain available.';
      plan.secrets.push({from:e.from,to:e.to,device:e.device,id:e.passageId,a:e.via[0],b:e.via[1]});
      continue;
    }
    const bypass=bypasses.get(`${e.from}>${e.to}`),y=bypass?bypass.y:Y(e.via[0][1]);
    const out=addDoor(e,a,'exit',y,cross[a.row+1]),into=addDoor(e,b,'entry',y,cross[b.row]);
    e.kind='hall';e.exitDoor=out.id;e.entryDoor=into.id;
    e.via=[[out.x,y],[cross[a.row+1].x,y],...(bypass?[[bypass.x0,y],[bypass.x1,y],[cross[b.row].x,y]]:[]),[into.x,y]];
  }
  const entrance=cross[0],frontY=(entrance.y0+entrance.y1)/2;
  plan.entryHallNode=point(entrance,frontY);
  plan.doors.push({x:entrance.x0,y:frontY,w:90,kind:'front',exterior:true});
  for(const id of map.startIds){
    const r=roomById.get(id),y=centre(r)[1],d=addDoor({from:null,to:id},r,'entry',y,entrance);
    plan.entries[id]=[entrance.x0,frontY];
    plan.entryVia[id]=[[entrance.x0,frontY],[entrance.x,frontY],[entrance.x,y],[d.x,y]];
  }
  // Damage divides cross passages between the forward exits, never across a
  // valid route. This leaves the local forks intact instead of forcing a long
  // detour round the building or a replacement supernatural edge.
  const kit=plan.style==='garden'?['roots','flood','bars']:['rubble','furniture','bars','collapse'];
  for(let row=1;row<cross.length;row++){
    const h=cross[row],ports=(hallPoints.get(h.id)||[]).sort((a,b)=>a.y-b.y);
    const gaps=ports.slice(1).map((p,i)=>({lo:ports[i].y,hi:p.y})).filter(p=>p.hi-p.lo>130);
    let blockY=null;
    if(row%3===1&&gaps.length){
      const gap=gaps[rng.int(gaps.length)];blockY=(gap.lo+gap.hi)/2;
      const kind=kit[rng.int(kit.length)];
      plan.blockers.push({id:`blocked-${row}`,x:h.x,y:blockY,w:GAP,vert:false,kind,note:OBSTRUCTIONS[kind],permanent:true});
    }
    for(let i=1;i<ports.length;i++)plan.hallLinks.push({a:ports[i-1].id,b:ports[i].id,blocked:blockY!==null&&ports[i-1].y<blockY&&ports[i].y>blockY});
  }
  const entryPorts=hallPoints.get(entrance.id).sort((a,b)=>a.y-b.y);
  for(let i=1;i<entryPorts.length;i++)plan.hallLinks.push({a:entryPorts[i-1].id,b:entryPorts[i].id,blocked:false});
  plan.junctions=[...points.values()];
  const spaces=[...plan.rooms,...plan.halls];
  plan.footprint=spaces.map(({x0,y0,x1,y1})=>({x0,y0,x1,y1}));
  plan.box={x0:Math.min(...spaces.map(r=>r.x0)),y0:Math.min(...spaces.map(r=>r.y0)),x1:Math.max(...spaces.map(r=>r.x1)),y1:Math.max(...spaces.map(r=>r.y1))};
  plan.sheet={w:Math.ceil(plan.box.x1+190),h:Math.ceil(Math.max(1850,plan.box.y1+290))};
  for(const n of map.nodes){const c=centre(roomById.get(n.id));n.x=c[0]/plan.sheet.w;n.y=c[1]/plan.sheet.h;}
  for(const h of map.hazards){const ns=map.nodes.filter(n=>h.nodeIds.includes(n.id));h.rect={x0:Math.min(...ns.map(n=>n.x))-.02,x1:Math.max(...ns.map(n=>n.x))+.02,y0:Math.min(...ns.map(n=>n.y))-.03,y1:Math.max(...ns.map(n=>n.y))+.03};}
  map.plan=plan;return map;
}

/** Open the particular source/arrival thresholds on offered routes, rather
 * than opening every doorway of a room with several possible entrances. */
export function mansionDoorStates(map,currentId){
  return map.plan.doors.filter(d=>d.latch).map(d=>({...d,open:d.routeFrom===currentId}));
}
