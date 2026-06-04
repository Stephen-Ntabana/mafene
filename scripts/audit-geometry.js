/**
 * Audit DXF geometry for Floor 0 — extracts walls, doors, windows,
 * room boundaries, text labels, stairs, and elevator for SVG drawing.
 */
const fs = require('fs');

const FILE = "C:/Users/walte/OneDrive/Desktop/Floor0.dxf → from 0. Story.dxf";
const IMG_W = 1581, IMG_H = 737;

// ─── tokeniser ───────────────────────────────────────────────────────────────
function tokenise(raw) {
  const lines = raw.split(/\r?\n/);
  const toks = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (!isNaN(code)) toks.push({ code, value: lines[i + 1].trim() });
  }
  return toks;
}

// ─── extents ─────────────────────────────────────────────────────────────────
function readExtents(toks) {
  let xMin=Infinity,yMin=Infinity,xMax=-Infinity,yMax=-Infinity;
  for (let i=0;i<toks.length-3;i++){
    if(toks[i].code===9&&toks[i].value==='$EXTMIN'){xMin=parseFloat(toks[i+1].value);yMin=parseFloat(toks[i+2].value);}
    if(toks[i].code===9&&toks[i].value==='$EXTMAX'){xMax=parseFloat(toks[i+1].value);yMax=parseFloat(toks[i+2].value);}
  }
  return {xMin,yMin,xMax,yMax};
}
function makeNorm({xMin,yMin,xMax,yMax},W,H){
  const scale=Math.min(W/(xMax-xMin),H/(yMax-yMin));
  const ox=(W-(xMax-xMin)*scale)/2,oy=(H-(yMax-yMin)*scale)/2;
  return (x,y)=>({px:Math.round(ox+(x-xMin)*scale),py:Math.round(oy+(yMax-y)*scale)});
}

// ─── entity parser ────────────────────────────────────────────────────────────
function parseAll(toks) {
  const ents = [];
  let inE = false, cur = null;
  for (const {code,value} of toks) {
    if(code===2&&value==='ENTITIES'){inE=true;continue;}
    if(code===2&&value==='ENDSEC'&&inE){inE=false;continue;}
    if(!inE)continue;
    if(code===0){
      if(cur)ents.push(cur);
      cur={type:value,layer:'',x:NaN,y:NaN,x2:NaN,y2:NaN,r:0,text:'',
           startAngle:NaN,endAngle:NaN,vertices:[]};
    } else if(cur){
      if(code===8) cur.layer=value;
      if(code===10) cur.x=parseFloat(value);
      if(code===20) cur.y=parseFloat(value);
      if(code===11) cur.x2=parseFloat(value);
      if(code===21) cur.y2=parseFloat(value);
      if(code===40) cur.r=parseFloat(value);
      if(code===1)  cur.text=value;
      if(code===50) cur.startAngle=parseFloat(value);
      if(code===51) cur.endAngle=parseFloat(value);
    }
  }
  if(cur)ents.push(cur);
  return ents;
}

function parsePolylines(toks) {
  const polys=[];let inE=false,cur=null,vx=null;
  for(const {code,value} of toks){
    if(code===2&&value==='ENTITIES'){inE=true;continue;}
    if(code===2&&value==='ENDSEC'&&inE){if(cur?.vertices?.length)polys.push(cur);inE=false;continue;}
    if(!inE)continue;
    if(code===0){
      if(cur?.vertices?.length)polys.push(cur);
      cur=(value==='LWPOLYLINE'||value==='POLYLINE')
        ?{type:value,layer:'',vertices:[],closed:false}:null;
      vx=null;
    }else if(cur){
      if(code===8)cur.layer=value;
      if(code===70&&parseInt(value)&1)cur.closed=true;
      if(code===10)vx=parseFloat(value);
      if(code===20&&vx!==null){cur.vertices.push({x:vx,y:parseFloat(value)});vx=null;}
    }
  }
  return polys;
}

// ─── main ─────────────────────────────────────────────────────────────────────
const raw = fs.readFileSync(FILE,'utf8');
const toks = tokenise(raw);
const ext  = readExtents(toks);
const norm = makeNorm(ext, IMG_W, IMG_H);

const ents  = parseAll(toks);
const polys = parsePolylines(toks);

// Count entities per layer
const layerStats = {};
[...ents,...polys].forEach(e=>{
  if(!layerStats[e.layer])layerStats[e.layer]={LINE:0,ARC:0,CIRCLE:0,TEXT:0,MTEXT:0,INSERT:0,LWPOLY:0,other:0};
  const s=layerStats[e.layer];
  if(e.type==='LINE')s.LINE++;
  else if(e.type==='ARC')s.ARC++;
  else if(e.type==='CIRCLE')s.CIRCLE++;
  else if(e.type==='TEXT')s.TEXT++;
  else if(e.type==='MTEXT')s.MTEXT++;
  else if(e.type==='INSERT')s.INSERT++;
  else if(e.type==='LWPOLYLINE'||e.type==='POLYLINE')s.LWPOLY++;
  else s.other++;
});

console.log('\n=== LAYER INVENTORY ===');
const relevantLayers = ['Walls','Doors','Windows','STAIRS','ELEVATOR','Walkable','Annotation','NAV','Furniture','Interior'];
Object.entries(layerStats)
  .filter(([l])=>relevantLayers.some(k=>l.toLowerCase().includes(k.toLowerCase())))
  .sort((a,b)=>Object.values(b[1]).reduce((s,v)=>s+v,0)-Object.values(a[1]).reduce((s,v)=>s+v,0))
  .forEach(([l,s])=>{
    const total=Object.values(s).reduce((t,v)=>t+v,0);
    if(total===0)return;
    console.log(`  ${l}`);
    Object.entries(s).filter(([,v])=>v>0).forEach(([t,v])=>console.log(`    ${t}: ${v}`));
  });

// ─── Extract walls ────────────────────────────────────────────────────────────
const isWall = l=>l.toLowerCase().includes('wall');
const wallLines = ents.filter(e=>isWall(e.layer)&&e.type==='LINE');
const wallPolys = polys.filter(e=>isWall(e.layer));
console.log(`\n=== WALLS: ${wallLines.length} lines, ${wallPolys.length} polylines ===`);
wallLines.slice(0,5).forEach(l=>{
  const s=norm(l.x,l.y),e2=norm(l.x2,l.y2);
  console.log(`  LINE px(${s.px},${s.py})→(${e2.px},${e2.py})`);
});
wallPolys.slice(0,5).forEach(p=>{
  console.log(`  POLY ${p.vertices.length}v closed=${p.closed} layer=${p.layer}`);
  p.vertices.slice(0,4).forEach(v=>{const pv=norm(v.x,v.y);console.log(`    (${pv.px},${pv.py})`);});
});

// ─── Extract doors ────────────────────────────────────────────────────────────
const isDoor = l=>l.toLowerCase().includes('door');
const doorArcs  = ents.filter(e=>isDoor(e.layer)&&e.type==='ARC');
const doorLines = ents.filter(e=>isDoor(e.layer)&&e.type==='LINE');
const doorPolys = polys.filter(e=>isDoor(e.layer));
console.log(`\n=== DOORS: ${doorArcs.length} arcs, ${doorLines.length} lines, ${doorPolys.length} polylines ===`);
doorArcs.slice(0,4).forEach(a=>{
  const c=norm(a.x,a.y);
  // radius in pixels (approximate using x-scale)
  const xScale=(IMG_W/(ext.xMax-ext.xMin));
  const rPx=Math.round(a.r*xScale);
  console.log(`  ARC centre=(${c.px},${c.py}) r=${rPx}px angle=${a.startAngle.toFixed(0)}→${a.endAngle.toFixed(0)}`);
});

// ─── Extract windows ─────────────────────────────────────────────────────────
const isWin = l=>l.toLowerCase().includes('window');
const winLines = ents.filter(e=>isWin(e.layer)&&e.type==='LINE');
const winPolys = polys.filter(e=>isWin(e.layer));
console.log(`\n=== WINDOWS: ${winLines.length} lines, ${winPolys.length} polylines ===`);

// ─── Extract stairs ───────────────────────────────────────────────────────────
const isStair = l=>l.toLowerCase().includes('stair');
const stairLines = ents.filter(e=>isStair(e.layer)&&e.type==='LINE');
const stairPolys = polys.filter(e=>isStair(e.layer));
console.log(`\n=== STAIRS: ${stairLines.length} lines, ${stairPolys.length} polylines ===`);
stairPolys.slice(0,3).forEach(p=>{
  console.log(`  POLY ${p.vertices.length}v closed=${p.closed}`);
  p.vertices.slice(0,4).forEach(v=>{const pv=norm(v.x,v.y);console.log(`    (${pv.px},${pv.py})`);});
});

// ─── Extract elevator ────────────────────────────────────────────────────────
const isElev = l=>l.toLowerCase().includes('elevator')||l.toLowerCase().includes('lift');
const elevLines = ents.filter(e=>isElev(e.layer)&&e.type==='LINE');
const elevPolys = polys.filter(e=>isElev(e.layer));
console.log(`\n=== ELEVATOR: ${elevLines.length} lines, ${elevPolys.length} polylines ===`);
elevPolys.slice(0,3).forEach(p=>{
  console.log(`  POLY ${p.vertices.length}v`);
  p.vertices.forEach(v=>{const pv=norm(v.x,v.y);console.log(`    (${pv.px},${pv.py})`);});
});

// ─── Text labels with positions ──────────────────────────────────────────────
function cleanText(t){
  return t.replace(/\\A\d;/g,'').replace(/\{\\[^;]*;/g,'').replace(/\{/g,'').replace(/\}/g,'')
    .replace(/\\[fFpPHhWwTQSLlOoKk][^\\ ;{}\n]*;?/g,'').replace(/\s+/g,' ').trim();
}
const textEnts = ents.filter(e=>(e.type==='TEXT'||e.type==='MTEXT')&&!isNaN(e.x)&&!isNaN(e.y));
console.log(`\n=== TEXT LABELS (${textEnts.length} total) ===`);
textEnts.forEach(t=>{
  const label=cleanText(t.text);
  if(!label||label.length<2)return;
  const p=norm(t.x,t.y);
  console.log(`  "${label}" → px(${p.px},${p.py}) [${t.layer}]`);
});

// ─── Full wall polyline output (first 10) for SVG generation ─────────────────
console.log(`\n=== WALL POLYLINES (sample for SVG) ===`);
wallPolys.slice(0,10).forEach((p,i)=>{
  const pts=p.vertices.map(v=>norm(v.x,v.y)).map(pv=>`${pv.px},${pv.py}`).join(' ');
  console.log(`  poly${i} closed=${p.closed}: ${pts}`);
});

// ─── Generate summary stats ───────────────────────────────────────────────────
const allWallVerts = wallPolys.reduce((s,p)=>s+p.vertices.length,0);
console.log(`\n=== SUMMARY ===`);
console.log(`Wall lines: ${wallLines.length}`);
console.log(`Wall poly verts: ${allWallVerts} (across ${wallPolys.length} polys)`);
console.log(`Door arcs: ${doorArcs.length}, door lines: ${doorLines.length}`);
console.log(`Window lines: ${winLines.length}, window polys: ${winPolys.length}`);
console.log(`Stair lines: ${stairLines.length}, stair polys: ${stairPolys.length}`);
console.log(`Elev lines: ${elevLines.length}, elev polys: ${elevPolys.length}`);
console.log(`Text labels: ${textEnts.length}`);
