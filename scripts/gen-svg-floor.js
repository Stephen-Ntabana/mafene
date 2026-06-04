/**
 * Generates constants/floor0SVG.ts — all SVG shapes for Floor 0.
 * Corridor polygons, room boxes (from text labels), and labels.
 */
const fs   = require('fs');
const path = require('path');

const FILE  = "C:/Users/walte/OneDrive/Desktop/Floor0.dxf → from 0. Story.dxf";
const IMG_W = 1581, IMG_H = 737;
const OUT   = path.join(__dirname, '../constants/floor0SVG.ts');

// ─── tokeniser + extents + norm ──────────────────────────────────────────────
function tokenise(raw){
  const lines=raw.split(/\r?\n/),toks=[];
  for(let i=0;i+1<lines.length;i+=2){const c=parseInt(lines[i].trim(),10);if(!isNaN(c))toks.push({code:c,value:lines[i+1].trim()});}
  return toks;
}
function readExt(toks){
  let xMin=Infinity,yMin=Infinity,xMax=-Infinity,yMax=-Infinity;
  for(let i=0;i<toks.length-3;i++){
    if(toks[i].code===9&&toks[i].value==='$EXTMIN'){xMin=parseFloat(toks[i+1].value);yMin=parseFloat(toks[i+2].value);}
    if(toks[i].code===9&&toks[i].value==='$EXTMAX'){xMax=parseFloat(toks[i+1].value);yMax=parseFloat(toks[i+2].value);}
  }
  return {xMin,yMin,xMax,yMax};
}
function makeNorm({xMin,yMin,xMax,yMax},W,H){
  const scale=Math.min(W/(xMax-xMin),H/(yMax-yMin));
  const ox=(W-(xMax-xMin)*scale)/2,oy=(H-(yMax-yMin)*scale)/2;
  return (x,y)=>({px:+(ox+(x-xMin)*scale).toFixed(1),py:+(oy+(yMax-y)*scale).toFixed(1)});
}

// ─── polyline parser ──────────────────────────────────────────────────────────
function parsePolys(toks){
  const out=[];let inE=false,cur=null,vx=null;
  for(const {code,value} of toks){
    if(code===2&&value==='ENTITIES'){inE=true;continue;}
    if(code===2&&value==='ENDSEC'&&inE){if(cur?.vertices?.length)out.push(cur);inE=false;continue;}
    if(!inE)continue;
    if(code===0){if(cur?.vertices?.length)out.push(cur);cur=(value==='LWPOLYLINE'||value==='POLYLINE')?{type:value,layer:'',vertices:[],closed:false}:null;vx=null;}
    else if(cur){if(code===8)cur.layer=value;if(code===70&&parseInt(value)&1)cur.closed=true;if(code===10)vx=parseFloat(value);if(code===20&&vx!==null){cur.vertices.push({x:vx,y:parseFloat(value)});vx=null;}}
  }
  return out;
}

// ─── entity parser (for TEXT/MTEXT + INSERT) ──────────────────────────────────
function parseEnts(toks){
  const out=[];let inE=false,cur=null;
  for(const {code,value} of toks){
    if(code===2&&value==='ENTITIES'){inE=true;continue;}
    if(code===2&&value==='ENDSEC'&&inE){inE=false;continue;}
    if(!inE)continue;
    if(code===0){if(cur)out.push(cur);cur={type:value,layer:'',x:NaN,y:NaN,text:'',blockName:'',rotation:0,scaleX:1,scaleY:1};}
    else if(cur){
      if(code===8)cur.layer=value;
      if(code===10)cur.x=parseFloat(value);
      if(code===20)cur.y=parseFloat(value);
      if(code===1)cur.text=value;
      if(code===2&&cur.type==='INSERT')cur.blockName=value;
      if(code===50)cur.rotation=parseFloat(value);
      if(code===41)cur.scaleX=parseFloat(value);
      if(code===42)cur.scaleY=parseFloat(value);
    }
  }
  if(cur)out.push(cur);
  return out;
}

function cleanText(t){
  return t.replace(/\\A\d;/g,'').replace(/\{\\[^;]*;/g,'').replace(/\{/g,'').replace(/\}/g,'')
    .replace(/\\[fFpPHhWwTQSLlOoKk][^\\ ;{}\n]*;?/g,'').replace(/;/g,' ').replace(/\s+/g,' ').trim();
}

// ─── main ─────────────────────────────────────────────────────────────────────
const raw  = fs.readFileSync(FILE,'utf8');
const toks = tokenise(raw);
const ext  = readExt(toks);
const norm = makeNorm(ext, IMG_W, IMG_H);
const polys = parsePolys(toks);
const ents  = parseEnts(toks);

// Corridor polygons (walkable areas)
const isWalk = l=>l.includes('Walkable');
const walkPolys = polys.filter(e=>isWalk(e.layer));

// Text labels
const textEnts = ents.filter(e=>(e.type==='TEXT'||e.type==='MTEXT')&&!isNaN(e.x)&&!isNaN(e.y));

// NAV_NODES
const isNav = l=>l.includes('NAV_NODES');
const navNodes = ents.filter(e=>isNav(e.layer)&&e.type==='INSERT');

// ─── Compute building bounding box from walkable vertices ─────────────────────
let bxMin=Infinity,byMin=Infinity,bxMax=-Infinity,byMax=-Infinity;
for(const p of walkPolys){
  for(const v of p.vertices){
    const pv=norm(v.x,v.y);
    bxMin=Math.min(bxMin,pv.px); byMin=Math.min(byMin,pv.py);
    bxMax=Math.max(bxMax,pv.px); byMax=Math.max(byMax,pv.py);
  }
}
// Expand a little for margin
const MARGIN=20;
bxMin=Math.max(0,bxMin-MARGIN); byMin=Math.max(0,byMin-MARGIN);
bxMax=Math.min(IMG_W,bxMax+MARGIN); byMax=Math.min(IMG_H,byMax+MARGIN);

console.log(`Building bbox: (${bxMin},${byMin}) → (${bxMax},${byMax})`);
console.log(`Building size: ${bxMax-bxMin} × ${byMax-byMin} px`);

// ─── Corridor polygon points strings ─────────────────────────────────────────
const corridorPolygons = walkPolys.map(p=>({
  points: p.vertices.map(v=>{const pv=norm(v.x,v.y);return `${pv.px},${pv.py}`;}).join(' '),
  closed: p.closed,
}));

// ─── Text labels with positions ──────────────────────────────────────────────
const labels = [];
const seen = new Set();
for(const t of textEnts){
  const label = cleanText(t.text);
  if(!label||label.length<2||label==='GROUND FLOOR')continue;
  const p = norm(t.x, t.y);
  // Deduplicate Glass cabinets (keep first)
  const key = label==='Glass cabinets' ? `${label}_${Math.round(p.px/80)*80}_${Math.round(p.py/80)*80}` : label;
  if(seen.has(key))continue;
  seen.add(key);
  labels.push({ text: label, x: p.px, y: p.py });
}

// ─── Room box definitions from label positions ───────────────────────────────
// Group labels by zone to draw room backgrounds
const ROOM_W = 120, ROOM_H = 90; // default room box size
const rooms = labels
  .filter(l=>!l.text.includes('Glass')&&!l.text.includes('corridors')&&!l.text.includes('circulation'))
  .map(l=>({
    x: l.x - ROOM_W/2, y: l.y - ROOM_H/2,
    w: ROOM_W, h: ROOM_H,
    name: l.text,
  }));

// ─── NAV_NODES ───────────────────────────────────────────────────────────────
const navPoints = navNodes.map((n,i)=>{const p=norm(n.x,n.y);return {x:p.px,y:p.py,id:`N${i+1}`};});

// ─── Emit TypeScript ──────────────────────────────────────────────────────────
const ts = `// Floor 0 programmatic SVG data — generated from DXF
// Canvas: ${IMG_W} × ${IMG_H}  (matches floor0.png dimensions)

export const FLOOR0_CANVAS = { width: ${IMG_W}, height: ${IMG_H} };

/** Building bounding box in canvas pixels */
export const FLOOR0_BUILDING = { x: ${bxMin}, y: ${byMin}, w: ${bxMax-bxMin}, h: ${byMax-byMin} };

/** Walkable corridor areas — render as filled polygons */
export const FLOOR0_CORRIDORS = [
${corridorPolygons.map(p=>`  { points: "${p.points}", closed: ${p.closed} },`).join('\n')}
];

/** Room labels from DXF annotations */
export const FLOOR0_LABELS: { text: string; x: number; y: number }[] = [
${labels.map(l=>`  { text: ${JSON.stringify(l.text)}, x: ${l.x}, y: ${l.y} },`).join('\n')}
];

/** Room boxes (background fills behind labels) */
export const FLOOR0_ROOMS: { x: number; y: number; w: number; h: number; name: string }[] = [
${rooms.map(r=>`  { x: ${r.x}, y: ${r.y}, w: ${r.w}, h: ${r.h}, name: ${JSON.stringify(r.name)} },`).join('\n')}
];

/** Architect-placed navigation nodes */
export const FLOOR0_NAV_NODES: { x: number; y: number; id: string }[] = [
${navPoints.map(n=>`  { x: ${n.x}, y: ${n.y}, id: "${n.id}" },`).join('\n')}
];
`;

fs.writeFileSync(OUT, ts, 'utf8');
console.log(`\nWritten → ${OUT}`);
console.log(`  ${corridorPolygons.length} corridor polygons`);
console.log(`  ${labels.length} unique labels`);
console.log(`  ${rooms.length} room boxes`);
console.log(`  ${navPoints.length} nav nodes`);
