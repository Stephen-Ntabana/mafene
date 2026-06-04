/**
 * Final DXF extractor — outputs TypeScript navigation constants for both floors.
 * Targets: Walkable corridor polys, NAV_NODES, STAIRS, ELEVATOR, TEXT labels.
 */
const fs = require('fs');
const path = require('path');

const FILES = {
  floor0: "C:/Users/walte/OneDrive/Desktop/Floor0.dxf → from 0. Story.dxf",
  floor1: "C:/Users/walte/OneDrive/Desktop/Floor1.dxf → from 1. Story.dxf",
};

// ─── tokeniser ───────────────────────────────────────────────────────────────
function tokenise(text) {
  const lines = text.split(/\r?\n/);
  const tokens = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (!isNaN(code)) tokens.push({ code, value: lines[i + 1].trim() });
  }
  return tokens;
}

// ─── bounding box ────────────────────────────────────────────────────────────
function readExtents(tokens) {
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  for (let i = 0; i < tokens.length - 3; i++) {
    if (tokens[i].code === 9 && tokens[i].value === '$EXTMIN') {
      xMin = parseFloat(tokens[i + 1].value);   // code 10 → X
      yMin = parseFloat(tokens[i + 2].value);   // code 20 → Y
    }
    if (tokens[i].code === 9 && tokens[i].value === '$EXTMAX') {
      xMax = parseFloat(tokens[i + 1].value);
      yMax = parseFloat(tokens[i + 2].value);
    }
  }
  return { xMin, yMin, xMax, yMax };
}

// ─── coordinate normaliser ────────────────────────────────────────────────────
function makeNorm(xMin, yMin, xMax, yMax, imgW = 427, imgH = 584) {
  const scale = Math.min(imgW / (xMax - xMin), imgH / (yMax - yMin));
  const offX  = (imgW - (xMax - xMin) * scale) / 2;
  const offY  = (imgH - (yMax - yMin) * scale) / 2;
  return (x, y) => ({
    px: Math.round(offX + (x - xMin) * scale),
    py: Math.round(offY + (yMax - y) * scale),   // flip Y: DXF up = image down
  });
}

// ─── entity parser (LINE, CIRCLE, INSERT, TEXT, MTEXT) ───────────────────────
function parseEntities(tokens) {
  const out = [];
  let inEnts = false, cur = null;
  for (const { code, value } of tokens) {
    if (code === 2 && value === 'ENTITIES') { inEnts = true; continue; }
    if (code === 2 && value === 'ENDSEC' && inEnts) { inEnts = false; continue; }
    if (!inEnts) continue;

    if (code === 0) {
      if (cur) out.push(cur);
      cur = { type: value, layer: '', x: NaN, y: NaN, x2: NaN, y2: NaN, r: 0, text: '' };
    } else if (cur) {
      if (code === 8)  cur.layer = value;
      // Primary insert/circle/text position
      if (code === 10) cur.x   = parseFloat(value);
      if (code === 20) cur.y   = parseFloat(value);   // ← fixed: was setting cur.x
      // Line end point
      if (code === 11) cur.x2  = parseFloat(value);
      if (code === 21) cur.y2  = parseFloat(value);
      // Radius
      if (code === 40) cur.r   = parseFloat(value);
      // Text content (MTEXT/TEXT)
      if (code === 1)  cur.text = value;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// ─── LWPOLYLINE parser ────────────────────────────────────────────────────────
function parsePolylines(tokens) {
  const out = [];
  let inEnts = false, cur = null, vx = null;
  for (const { code, value } of tokens) {
    if (code === 2 && value === 'ENTITIES') { inEnts = true; continue; }
    if (code === 2 && value === 'ENDSEC' && inEnts) {
      if (cur?.vertices?.length) out.push(cur);
      inEnts = false; continue;
    }
    if (!inEnts) continue;

    if (code === 0) {
      if (cur?.vertices?.length) out.push(cur);
      cur = (value === 'LWPOLYLINE' || value === 'POLYLINE')
        ? { type: value, layer: '', vertices: [], closed: false } : null;
      vx = null;
    } else if (cur) {
      if (code === 8)  cur.layer = value;
      if (code === 70 && (parseInt(value) & 1)) cur.closed = true;
      if (code === 10) vx = parseFloat(value);
      if (code === 20 && vx !== null) { cur.vertices.push({ x: vx, y: parseFloat(value) }); vx = null; }
    }
  }
  return out;
}

// ─── helpers ──────────────────────────────────────────────────────────────────
const hasKw  = (...kw) => l => kw.some(k => l.toLowerCase().includes(k.toLowerCase()));
const isWalk = hasKw('Walkable');
const isNav  = hasKw('NAV_NODES');
const isStair= hasKw('STAIRS', 'Stair');
const isElev = hasKw('ELEVATOR', 'LIFT');
const isText = hasKw('Annotation', 'Text');

function centroid(pts) {
  return { x: pts.reduce((s,p)=>s+p.x,0)/pts.length, y: pts.reduce((s,p)=>s+p.y,0)/pts.length };
}

function cleanText(t) {
  return t.replace(/\\A\d;/g,'').replace(/\{\\[^;]*;/g,'').replace(/\{[^}]*\}/g,s=>s.replace(/\{[^;]*;/g,''))
    .replace(/\{/g,'').replace(/\}/g,'').replace(/\\[fpPWibc]\S+/g,'').replace(/\s+/g,' ').trim();
}

// Deduplicate vertices close together (within `tol` DXF units)
function snapKey(x, y, g = 100) { return `${Math.round(x/g)*g},${Math.round(y/g)*g}`; }

// Build corridor graph from walkable polylines
function buildGraph(walkPolys) {
  const nodeMap = new Map(); // snapKey → {x, y}
  const rawEdges = [];

  for (const poly of walkPolys) {
    const V = poly.vertices;
    for (let i = 0; i < V.length; i++) {
      const v = V[i];
      const k = snapKey(v.x, v.y);
      if (!nodeMap.has(k)) nodeMap.set(k, { x: v.x, y: v.y });
      const nextIdx = poly.closed ? (i + 1) % V.length : i + 1;
      if (!poly.closed && i === V.length - 1) continue;
      rawEdges.push({ from: snapKey(v.x, v.y), to: snapKey(V[nextIdx].x, V[nextIdx].y) });
    }
  }

  // Deduplicate bidirectional edges
  const seen = new Set();
  const edges = [];
  for (const e of rawEdges) {
    const ek = [e.from, e.to].sort().join('||');
    if (!seen.has(ek) && e.from !== e.to) { seen.add(ek); edges.push(e); }
  }

  return { nodeMap, edges };
}

// Find nodes with degree > 2 (real junctions) + degree-1 nodes (dead ends = entrances)
function findJunctions(edges) {
  const degree = new Map();
  for (const { from, to } of edges) {
    degree.set(from, (degree.get(from) || 0) + 1);
    degree.set(to,   (degree.get(to)   || 0) + 1);
  }
  return { degree };
}

// Nearest node key to a point
function nearest(x, y, nodeMap) {
  let bestK = null, bestD = Infinity;
  for (const [k, n] of nodeMap) {
    const d = Math.hypot(x - n.x, y - n.y);
    if (d < bestD) { bestD = d; bestK = k; }
  }
  return { key: bestK, dist: bestD };
}

// ─── main ─────────────────────────────────────────────────────────────────────
function processFloor(label, filePath, outFloor) {
  console.log(`\n${'═'.repeat(68)}`);
  console.log(`  ${label}`);
  console.log('═'.repeat(68));

  const raw    = fs.readFileSync(filePath, 'utf8');
  const tokens = tokenise(raw);
  const ext    = readExtents(tokens);
  const norm   = makeNorm(ext.xMin, ext.yMin, ext.xMax, ext.yMax);

  console.log(`Extents  X[${ext.xMin.toFixed(0)}, ${ext.xMax.toFixed(0)}]  Y[${ext.yMin.toFixed(0)}, ${ext.yMax.toFixed(0)}]`);

  const ents  = parseEntities(tokens);
  const polys = parsePolylines(tokens);

  // ── NAV_NODES ──────────────────────────────────────────────────────────────
  const navEnts = ents.filter(e => isNav(e.layer) && ['CIRCLE','POINT','INSERT','ELLIPSE'].includes(e.type));
  console.log(`\n── NAV_NODES: ${navEnts.length} ──`);
  const navNodes = navEnts.map((n, i) => {
    const p = norm(n.x, n.y);
    console.log(`  N${i}  DXF(${n.x.toFixed(0)}, ${n.y.toFixed(0)})  px(${p.px}, ${p.py})`);
    return { id: `N${i}`, dxfX: n.x, dxfY: n.y, px: p.px, py: p.py };
  });

  // ── Walkable corridor graph ────────────────────────────────────────────────
  const walkPolys = polys.filter(e => isWalk(e.layer));
  const { nodeMap, edges } = buildGraph(walkPolys);
  const { degree } = findJunctions(edges);

  console.log(`\n── Corridor graph: ${nodeMap.size} nodes, ${edges.length} edges ──`);

  // Mark junction types
  const junctionNodes = []; // degree ≥ 3 (corridor intersections)
  const endNodes      = []; // degree = 1 (entrances / dead ends)
  const pathNodes     = []; // degree = 2 (in-path — keep for pathfinding)

  let idx = 0;
  for (const [k, n] of nodeMap) {
    const deg = degree.get(k) || 0;
    const p   = norm(n.x, n.y);
    const obj = { key: k, dxfX: n.x, dxfY: n.y, px: p.px, py: p.py, deg };
    if (deg >= 3)     junctionNodes.push({ ...obj, name: `J${++idx}` });
    else if (deg === 1) endNodes.push({ ...obj, name: `E${++idx}` });
    else              pathNodes.push({ ...obj, name: `P${++idx}` });
  }

  console.log(`  Intersections (deg≥3): ${junctionNodes.length}`);
  console.log(`  Endpoints (deg=1):     ${endNodes.length}`);
  console.log(`  Path points (deg=2):   ${pathNodes.length}`);

  // Print all junction intersections
  console.log('\nJUNCTION POINTS (corridor intersections):');
  junctionNodes.forEach(n => console.log(`  ${n.name}  px(${n.px}, ${n.py})  deg=${n.deg}  dxf(${n.dxfX.toFixed(0)},${n.dxfY.toFixed(0)})`));

  console.log('\nENDPOINTS (entrances/dead-ends):');
  endNodes.forEach(n => console.log(`  ${n.name}  px(${n.px}, ${n.py})  dxf(${n.dxfX.toFixed(0)},${n.dxfY.toFixed(0)})`));

  // ── STAIRS ──────────────────────────────────────────────────────────────────
  const stairPts = [
    ...ents.filter(e => isStair(e.layer) && e.type === 'LINE').map(l => ({ x:(l.x+l.x2)/2, y:(l.y+l.y2)/2 })),
    ...polys.filter(e => isStair(e.layer)).flatMap(p => p.vertices),
  ];
  let stairPx = null;
  if (stairPts.length) { const c = centroid(stairPts); stairPx = norm(c.x, c.y); }
  if (stairPx) console.log(`\nSTAIRS centroid  px(${stairPx.px}, ${stairPx.py})`);

  // ── ELEVATOR ────────────────────────────────────────────────────────────────
  const elevPts = [
    ...ents.filter(e => isElev(e.layer) && e.type === 'LINE').map(l => ({ x:(l.x+l.x2)/2, y:(l.y+l.y2)/2 })),
    ...polys.filter(e => isElev(e.layer)).flatMap(p => p.vertices),
  ];
  let elevPx = null;
  if (elevPts.length) { const c = centroid(elevPts); elevPx = norm(c.x, c.y); }
  if (elevPx) console.log(`ELEVATOR centroid  px(${elevPx.px}, ${elevPx.py})`);

  // ── TEXT LABELS ─────────────────────────────────────────────────────────────
  console.log('\n── TEXT LABELS ──');
  const textEnts = ents.filter(e => (e.type === 'TEXT' || e.type === 'MTEXT') && isText(e.layer));
  const labels = [];
  for (const t of textEnts) {
    const clean = cleanText(t.text);
    if (!clean || clean.length < 2 || clean.toLowerCase() === 'floor') continue;
    const p = norm(t.x, t.y);
    const nr = nearest(t.x, t.y, nodeMap);
    const nrPx = norm(nr.key ? nodeMap.get(nr.key).x : t.x, nr.key ? nodeMap.get(nr.key).y : t.y);
    if (!isNaN(p.py))
      console.log(`  "${clean}"  text→px(${p.px},${p.py})  nearest_node→px(${nrPx.px},${nrPx.py})`);
    else
      console.log(`  "${clean}"  [Y=NaN, text entity has no Y?]`);
    labels.push({ text: clean, px: p.px, py: p.py, nodePx: nrPx });
  }

  // ── All nodes for full output ─────────────────────────────────────────────
  console.log('\n── ALL CORRIDOR NODES (for WALKABLE_CONNECTIONS) ──');
  const allNodes = [...junctionNodes, ...endNodes, ...pathNodes];
  // Build lookup key → name for connections output
  const keyToName = new Map(allNodes.map(n => [n.key, n.name]));

  // ── TypeScript output ──────────────────────────────────────────────────────
  console.log('\n\n' + '─'.repeat(68));
  console.log(`// ===== ${outFloor} — generated from DXF =====`);
  console.log('─'.repeat(68));

  // LOCATIONS: endpoints + named rooms from text labels
  console.log('\nexport const LOCATIONS_' + outFloor + ' = [');
  if (stairPx)  console.log(`  { name: "Stairs",   x: ${stairPx.px}, y: ${stairPx.py}, icon: "📶" },`);
  if (elevPx)   console.log(`  { name: "Lift",     x: ${elevPx.px}, y: ${elevPx.py}, icon: "🔘" },`);
  endNodes.forEach((n, i) => console.log(`  { name: "Entrance ${i+1}", x: ${n.px}, y: ${n.py}, icon: "🚪" },`));
  navNodes.forEach((n, i) => console.log(`  { name: "Node ${i+1}", x: ${n.px}, y: ${n.py}, icon: "📍" },`));
  console.log('];');

  // JUNCTION_POINTS
  console.log('\nexport const JUNCTION_POINTS_' + outFloor + ' = [');
  junctionNodes.forEach(n => console.log(`  { x: ${n.px}, y: ${n.py}, name: "${n.name}" },`));
  endNodes.forEach(n =>      console.log(`  { x: ${n.px}, y: ${n.py}, name: "${n.name}" },`));
  pathNodes.forEach(n =>     console.log(`  { x: ${n.px}, y: ${n.py}, name: "${n.name}" },`));
  console.log('];');

  // WALKABLE_CONNECTIONS — every edge from the corridor graph
  console.log('\nexport const WALKABLE_CONNECTIONS_' + outFloor + ' = [');
  for (const e of edges) {
    const f = nodeMap.get(e.from), t2 = nodeMap.get(e.to);
    if (!f || !t2) continue;
    const fp = norm(f.x, f.y), tp = norm(t2.x, t2.y);
    console.log(`  { from: { x: ${fp.px}, y: ${fp.py} }, to: { x: ${tp.px}, y: ${tp.py} } },`);
  }
  console.log('];');

  return { navNodes, junctionNodes, endNodes, pathNodes, edges, nodeMap, stairPx, elevPx, norm, ext };
}

const f0 = processFloor('FLOOR 0 — Ground Story', FILES.floor0, 'FLOOR0');
const f1 = processFloor('FLOOR 1 — First Story',  FILES.floor1, 'FLOOR1');
