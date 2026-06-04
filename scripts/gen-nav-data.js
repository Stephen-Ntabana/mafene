/**
 * Generates floorData.ts — the navigation constants for both floors.
 * Reads the DXF files, extracts the corridor graphs, cross-stitches
 * isolated loops where they share boundaries, and emits TypeScript.
 */
const fs   = require('fs');
const path = require('path');

const FILES = {
  floor0: "C:/Users/walte/OneDrive/Desktop/Floor0.dxf → from 0. Story.dxf",
  floor1: "C:/Users/walte/OneDrive/Desktop/Floor1.dxf → from 1. Story.dxf",
};

const OUT = path.join(__dirname, '../constants/floorData.ts');

// ─── tokeniser ───────────────────────────────────────────────────────────────
function tokenise(raw) {
  const lines = raw.split(/\r?\n/);
  const toks  = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (!isNaN(code)) toks.push({ code, value: lines[i + 1].trim() });
  }
  return toks;
}

// ─── extents ─────────────────────────────────────────────────────────────────
function readExtents(toks) {
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  for (let i = 0; i < toks.length - 3; i++) {
    if (toks[i].code === 9 && toks[i].value === '$EXTMIN') {
      xMin = parseFloat(toks[i+1].value);
      yMin = parseFloat(toks[i+2].value);
    }
    if (toks[i].code === 9 && toks[i].value === '$EXTMAX') {
      xMax = parseFloat(toks[i+1].value);
      yMax = parseFloat(toks[i+2].value);
    }
  }
  return { xMin, yMin, xMax, yMax };
}

function makeNorm({ xMin, yMin, xMax, yMax }, imgW, imgH) {
  const scale = Math.min(imgW / (xMax - xMin), imgH / (yMax - yMin));
  const offX  = (imgW - (xMax - xMin) * scale) / 2;
  const offY  = (imgH - (yMax - yMin) * scale) / 2;
  return (x, y) => ({
    px: Math.round(offX + (x - xMin) * scale),
    py: Math.round(offY + (yMax - y) * scale),
  });
}

// ─── entity parser ────────────────────────────────────────────────────────────
function parseEntities(toks) {
  const out = [];
  let inE = false, cur = null;
  for (const { code, value } of toks) {
    if (code === 2 && value === 'ENTITIES') { inE = true; continue; }
    if (code === 2 && value === 'ENDSEC' && inE) { inE = false; continue; }
    if (!inE) continue;
    if (code === 0) { if (cur) out.push(cur); cur = { type: value, layer: '', x: NaN, y: NaN }; }
    else if (cur) {
      if (code === 8)  cur.layer = value;
      if (code === 10) cur.x     = parseFloat(value);
      if (code === 20) cur.y     = parseFloat(value);
      if (code === 1)  cur.text  = value;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// ─── LWPOLYLINE parser ────────────────────────────────────────────────────────
function parsePolylines(toks) {
  const out = [];
  let inE = false, cur = null, vx = null;
  for (const { code, value } of toks) {
    if (code === 2 && value === 'ENTITIES')  { inE = true; continue; }
    if (code === 2 && value === 'ENDSEC' && inE) { if (cur?.vertices?.length) out.push(cur); inE = false; continue; }
    if (!inE) continue;
    if (code === 0) {
      if (cur?.vertices?.length) out.push(cur);
      cur = (value === 'LWPOLYLINE' || value === 'POLYLINE')
        ? { type: value, layer: '', vertices: [], closed: false } : null;
      vx = null;
    } else if (cur) {
      if (code === 8)  cur.layer = value;
      if (code === 70 && parseInt(value) & 1) cur.closed = true;
      if (code === 10) vx = parseFloat(value);
      if (code === 20 && vx !== null) { cur.vertices.push({ x: vx, y: parseFloat(value) }); vx = null; }
    }
  }
  return out;
}

const isWalk  = l => l.includes('Walkable');
const isNav   = l => l.includes('NAV_NODES');
const isStair = l => l.includes('STAIRS') || l.includes('Stair');
const isElev  = l => l.includes('ELEVATOR') || l.includes('LIFT');

function centroid(pts) {
  return pts.length
    ? { x: pts.reduce((s,p)=>s+p.x,0)/pts.length, y: pts.reduce((s,p)=>s+p.y,0)/pts.length }
    : null;
}

// ─── Graph from walkable polylines ───────────────────────────────────────────
function buildGraph(walkPolys, norm) {
  const SNAP = 100;
  const snap = (x,y) => `${Math.round(x/SNAP)*SNAP},${Math.round(y/SNAP)*SNAP}`;

  const nodeMap = new Map(); // key → {x,y,px,py}
  const polyEdges = [];      // edges tagged with which poly they came from
  let polyId = 0;

  for (const poly of walkPolys) {
    const V = poly.vertices;
    const id = polyId++;
    for (let i = 0; i < V.length; i++) {
      const v = V[i];
      const k = snap(v.x, v.y);
      if (!nodeMap.has(k)) {
        const p = norm(v.x, v.y);
        nodeMap.set(k, { x: v.x, y: v.y, px: p.px, py: p.py });
      }
      const ni = poly.closed ? (i+1) % V.length : i+1;
      if (!poly.closed && i === V.length - 1) continue;
      const k2 = snap(V[ni].x, V[ni].y);
      polyEdges.push({ from: k, to: k2, polyId: id });
    }
  }

  // Dedup intra-poly edges
  const seen = new Set();
  const edges = [];
  for (const e of polyEdges) {
    const ek = [e.from, e.to].sort().join('||');
    if (!seen.has(ek) && e.from !== e.to) { seen.add(ek); edges.push(e); }
  }

  // Cross-loop stitching: connect nodes from DIFFERENT polygons that are
  // within STITCH_PX pixels of each other in image space (shared corridor wall)
  const STITCH_PX = 12;
  const allKeys = [...nodeMap.keys()];
  for (let a = 0; a < allKeys.length; a++) {
    for (let b = a + 1; b < allKeys.length; b++) {
      const ka = allKeys[a], kb = allKeys[b];
      const na = nodeMap.get(ka), nb = nodeMap.get(kb);
      const dist = Math.hypot(na.px - nb.px, na.py - nb.py);
      if (dist > 0 && dist <= STITCH_PX) {
        const ek = [ka, kb].sort().join('||');
        if (!seen.has(ek)) { seen.add(ek); edges.push({ from: ka, to: kb, stitch: true }); }
      }
    }
  }

  return { nodeMap, edges };
}

// ─── Process one floor ────────────────────────────────────────────────────────
function processFloor(filePath, imgW, imgH) {
  const _imgW = imgW, _imgH = imgH;
  const raw  = fs.readFileSync(filePath, 'utf8');
  const toks = tokenise(raw);
  const ext  = readExtents(toks);
  const norm = makeNorm(ext, imgW, imgH);

  const ents  = parseEntities(toks);
  const polys = parsePolylines(toks);

  // NAV_NODES
  const navEnts = ents.filter(e => isNav(e.layer) && ['CIRCLE','POINT','INSERT','ELLIPSE'].includes(e.type));
  const navNodes = navEnts.map(n => { const p = norm(n.x, n.y); return { dxfX: n.x, dxfY: n.y, px: p.px, py: p.py }; });

  // Walkable graph
  const walkPolys = polys.filter(e => isWalk(e.layer));
  const { nodeMap, edges } = buildGraph(walkPolys, norm);

  // Stairs centroid
  const stairPts = [
    ...ents.filter(e => isStair(e.layer) && e.type === 'LINE').map(l => ({ x: (l.x + l.x2) / 2, y: (l.y + l.y2) / 2 })),
    ...polys.filter(e => isStair(e.layer)).flatMap(p => p.vertices),
  ];
  const stairC = centroid(stairPts);
  const stairPx = stairC ? norm(stairC.x, stairC.y) : null;

  // Elevator centroid
  const elevPts = [
    ...ents.filter(e => isElev(e.layer) && e.type === 'LINE').map(l => ({ x: (l.x + l.x2) / 2, y: (l.y + l.y2) / 2 })),
    ...polys.filter(e => isElev(e.layer)).flatMap(p => p.vertices),
  ];
  const elevC = centroid(elevPts);
  const elevPx = elevC ? norm(elevC.x, elevC.y) : null;

  return { navNodes, nodeMap, edges, stairPx, elevPx, ext, imgW: _imgW, imgH: _imgH };
}

// ─── Build TypeScript string ─────────────────────────────────────────────────
function buildTS(floorKey, { navNodes, nodeMap, edges, stairPx, elevPx, imgW, imgH }, roomDefs) {
  const lines = [];
  const p = s => lines.push(s);

  // Canvas size (matches the actual PNG dimensions)
  p(`export const CANVAS_${floorKey} = { width: ${imgW}, height: ${imgH} };`);
  p('');

  // LOCATIONS — named destinations
  p(`export const LOCATIONS_${floorKey} = [`);
  if (stairPx)  p(`  { name: "Stairs", x: ${stairPx.px}, y: ${stairPx.py}, icon: "📶" },`);
  if (elevPx)   p(`  { name: "Lift",   x: ${elevPx.px},  y: ${elevPx.py},  icon: "🔘" },`);
  roomDefs.forEach(r => p(`  { name: "${r.name}", x: ${r.x}, y: ${r.y}, icon: "${r.icon}" },`));
  navNodes.forEach((n, i) => p(`  { name: "Point ${i+1}", x: ${n.px}, y: ${n.py}, icon: "📍" },`));
  p('];');
  p('');

  // JUNCTION_POINTS — all corridor nodes (used in BFS pathfinding)
  p(`export const JUNCTION_POINTS_${floorKey} = [`);
  let ji = 1;
  for (const [, n] of nodeMap) {
    p(`  { x: ${n.px}, y: ${n.py}, name: "J${ji++}" },`);
  }
  p('];');
  p('');

  // WALKABLE_CONNECTIONS
  p(`export const WALKABLE_CONNECTIONS_${floorKey} = [`);
  for (const e of edges) {
    const f = nodeMap.get(e.from), t2 = nodeMap.get(e.to);
    if (!f || !t2) continue;
    const tag = e.stitch ? ' // cross-corridor stitch' : '';
    p(`  { from: { x: ${f.px}, y: ${f.py} }, to: { x: ${t2.px}, y: ${t2.py} } },${tag}`);
  }
  p('];');
  p('');

  // DESTINATION_TO_JUNCTION — nearest junction for each named location
  p(`export const DESTINATION_TO_JUNCTION_${floorKey}: Record<string, { x: number; y: number }> = {`);
  const allNodes = [...nodeMap.values()];
  const nearest = (px, py) => {
    let best = allNodes[0], bestD = Infinity;
    for (const n of allNodes) {
      const d = Math.hypot(px - n.px, py - n.py);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  };

  const allLocs = [
    ...(stairPx ? [{ name: 'Stairs', ...stairPx }] : []),
    ...(elevPx  ? [{ name: 'Lift',   ...elevPx  }] : []),
    ...roomDefs.map(r => ({ name: r.name, px: r.x, py: r.y })),
    ...navNodes.map((n, i) => ({ name: `Point ${i+1}`, px: n.px, py: n.py })),
  ];
  for (const loc of allLocs) {
    const jn = nearest(loc.px, loc.py);
    p(`  "${loc.name}": { x: ${jn.px}, y: ${jn.py} },`);
  }
  p('};');
  p('');

  return lines.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log('Parsing Floor 0...');
const f0 = processFloor(FILES.floor0, 1581, 737);
console.log(`  ${f0.nodeMap.size} nodes, ${f0.edges.length} edges (incl. ${f0.edges.filter(e=>e.stitch).length} stitches)`);

console.log('Parsing Floor 1...');
const f1 = processFloor(FILES.floor1, 1599, 745);
console.log(`  ${f1.nodeMap.size} nodes, ${f1.edges.length} edges (incl. ${f1.edges.filter(e=>e.stitch).length} stitches)`);

// Room definitions — pixel coords recomputed for 1581×737 / 1599×745 image space.
// DXF source coords confirmed from text annotation positions in the parser output.
const rooms0 = [
  { name: "Gents Washroom",  x: 535, y: 599, icon: "🚻" },
  { name: "Ladies Washroom", x: 547, y: 183, icon: "🚺" },
  { name: "Corridor",        x: 756, y: 258, icon: "🏃" },
  { name: "Balcony",         x: 843, y:  59, icon: "🌿" },
  { name: "Shop 1",          x: 350, y: 212, icon: "🛍️" },
  { name: "Shop 2",          x: 426, y: 183, icon: "🛍️" },
  { name: "Shop 3",          x: 555, y: 203, icon: "🛍️" },
  { name: "Shop 4",          x: 426, y: 280, icon: "🛍️" },
  { name: "Shop 5",          x: 350, y: 280, icon: "🛍️" },
  { name: "Shop 6",          x:1112, y: 514, icon: "🛍️" },
  { name: "Shop 7",          x:1428, y: 514, icon: "🛍️" },
  { name: "Shop 8",          x: 904, y: 236, icon: "🛍️" },
  { name: "Shop_101",        x: 756, y: 399, icon: "🛍️" },
];

const rooms1 = [
  { name: "Gents Washroom",  x: 546, y: 606, icon: "🚻" },
  { name: "Ladies Washroom", x: 557, y: 187, icon: "🚺" },
  { name: "Corridor",        x: 766, y: 264, icon: "🏃" },
  { name: "Shop 101",        x: 354, y: 215, icon: "🛍️" },
  { name: "Shop 102",        x: 431, y: 185, icon: "🛍️" },
  { name: "Shop 103",        x: 562, y: 205, icon: "🛍️" },
  { name: "Shop 104",        x: 431, y: 284, icon: "🛍️" },
  { name: "Shop 105",        x: 354, y: 284, icon: "🛍️" },
  { name: "Shop 106",        x:1126, y: 519, icon: "🛍️" },
  { name: "Shop 107",        x:1443, y: 519, icon: "🛍️" },
  { name: "Shop 108",        x: 915, y: 239, icon: "🛍️" },
];

const ts = [
  '// ─────────────────────────────────────────────────────────────────────────',
  '// Navigation data extracted from DXF floor plans.',
  '// Floor 0 = Ground Story  |  Floor 1 = First Story',
  '// Each floor: LOCATIONS (named destinations), JUNCTION_POINTS (BFS graph nodes),',
  '// WALKABLE_CONNECTIONS (graph edges), DESTINATION_TO_JUNCTION (routing helper).',
  '// ─────────────────────────────────────────────────────────────────────────',
  '',
  buildTS('FLOOR0', f0, rooms0),
  buildTS('FLOOR1', f1, rooms1),
].join('\n');

fs.writeFileSync(OUT, ts, 'utf8');
console.log(`\nWritten → ${OUT}`);

// Summary stats
const s0 = f0.edges.filter(e=>e.stitch).length;
const s1 = f1.edges.filter(e=>e.stitch).length;
console.log(`\nFloor 0: ${f0.nodeMap.size} junction nodes | ${f0.edges.length} edges (${s0} cross-corridor)`);
console.log(`Floor 1: ${f1.nodeMap.size} junction nodes | ${f1.edges.length} edges (${s1} cross-corridor)`);
console.log('\nNext steps:');
console.log('  1. Export PNG floor plan images from the DXF files');
console.log('  2. Place them at assets/images/floor0.png and floor1.png');
console.log('  3. Import floorData.ts into the indoor navigation screen');
