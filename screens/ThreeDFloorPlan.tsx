/**
 * 3D floor plan viewer.
 * Loads a .glb model via expo-gl + three.js and overlays navigation
 * (path line, user sphere, destination pin) in world space.
 *
 * Camera controls:
 *   1-finger drag  → orbit (rotate)
 *   2-finger pinch → zoom
 *   2-finger drag  → pan
 */

import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { ExpoWebGLRenderingContext, GLView } from "expo-gl";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";

// ─── Types ────────────────────────────────────────────────────────────────────

type Pt  = { x: number; y: number };
type Loc = { name: string; x: number; y: number; icon: string };

interface Props {
  floor:               0 | 1;
  locations:           Loc[];
  userPos:             (Pt & { name: string }) | null;
  selectedDestination: (Pt & { name: string }) | null;
  path:                Pt[];
  arrived:             boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Static require()s must live at module level (Metro limitation)
const FLOOR_ASSETS = [
  require("../assets/models/floor0.glb"),
  require("../assets/models/floor1.glb"),
] as const;

// 2D navigation pixel-space bounding box (from DXF analysis)
const NAV_BOX = { xMin: 475, xMax: 1131, yMin: 39, yMax: 682 };

// ─── Decode base64 → ArrayBuffer without atob (safe for all Hermes versions) ─

function b64ToBuffer(b64: string): ArrayBuffer {
  const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean  = b64.replace(/=/g, "");
  const len    = clean.length;
  const outLen = Math.floor(len * 3 / 4);
  const buf    = new ArrayBuffer(outLen);
  const bytes  = new Uint8Array(buf);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = table.indexOf(clean[i]);
    const b = table.indexOf(clean[i + 1]);
    const c = clean[i + 2] ? table.indexOf(clean[i + 2]) : -1;
    const d = clean[i + 3] ? table.indexOf(clean[i + 3]) : -1;
    bytes[p++] = (a << 2) | (b >> 4);
    if (c !== -1) bytes[p++] = ((b & 0xf) << 4) | (c >> 2);
    if (d !== -1) bytes[p++] = ((c & 0x3) << 6) | d;
  }
  return buf;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ThreeDFloorPlan({
  floor,
  locations,
  userPos,
  selectedDestination,
  path,
  arrived,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [status,  setStatus]  = useState("Loading model…");
  const [error,   setError]   = useState<string | null>(null);

  // Three.js core refs — never cause re-renders
  const glRef        = useRef<ExpoWebGLRenderingContext | null>(null);
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef     = useRef<THREE.Scene | null>(null);
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null);
  const rafRef       = useRef<number | null>(null);

  // Navigation overlay refs
  const modelBoxRef  = useRef<THREE.Box3 | null>(null);
  const pathLineRef  = useRef<THREE.Line | null>(null);
  const userDotRef   = useRef<THREE.Mesh | null>(null);
  const destPinRef   = useRef<THREE.Mesh | null>(null);
  const locDotsRef   = useRef<THREE.Mesh[]>([]);

  // Orbit camera state
  const orbit = useRef({ theta: 0.4, phi: 0.9, radius: 35 });
  const target = useRef(new THREE.Vector3(0, 0, 0));
  // Touch tracking
  const touch1     = useRef({ x: 0, y: 0 });
  const pinchDist  = useRef(0);
  const panStart   = useRef({ x: 0, y: 0 });
  const isPanning  = useRef(false);

  // ── Camera position from spherical coords ──────────────────────────────────
  const positionCamera = useCallback(() => {
    const cam = cameraRef.current;
    if (!cam) return;
    const { theta, phi, radius } = orbit.current;
    const t = target.current;
    cam.position.set(
      t.x + radius * Math.sin(phi) * Math.sin(theta),
      t.y + radius * Math.cos(phi),
      t.z + radius * Math.sin(phi) * Math.cos(theta),
    );
    cam.lookAt(t);
  }, []);

  // ── Map 2D nav coordinate → 3D world position ─────────────────────────────
  const navToWorld = useCallback((px: number, py: number, yOffset = 0.25): THREE.Vector3 => {
    const box = modelBoxRef.current;
    if (!box) return new THREE.Vector3(0, yOffset, 0);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const tx = (px - NAV_BOX.xMin) / (NAV_BOX.xMax - NAV_BOX.xMin);
    const tz = (py - NAV_BOX.yMin) / (NAV_BOX.yMax - NAV_BOX.yMin);
    return new THREE.Vector3(
      center.x - size.x / 2 + tx * size.x,
      center.y + yOffset,
      center.z - size.z / 2 + tz * size.z,
    );
  }, []);

  // ── Rebuild path line ──────────────────────────────────────────────────────
  const rebuildPath = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (pathLineRef.current) { scene.remove(pathLineRef.current); pathLineRef.current.geometry.dispose(); }
    if (path.length < 2) return;
    const pts = path.map(p => navToWorld(p.x, p.y, 0.3));
    const geo  = new THREE.BufferGeometry().setFromPoints(pts);
    const mat  = new THREE.LineBasicMaterial({ color: 0x0066cc, linewidth: 3 });
    pathLineRef.current = new THREE.Line(geo, mat);
    scene.add(pathLineRef.current);
  }, [path, navToWorld]);

  // ── User position sphere ───────────────────────────────────────────────────
  const rebuildUser = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (userDotRef.current) { scene.remove(userDotRef.current); }
    if (!userPos) return;
    const pos = navToWorld(userPos.x, userPos.y, 0.5);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 20, 20),
      new THREE.MeshStandardMaterial({ color: 0x0066cc, emissive: 0x002266, metalness: 0.3, roughness: 0.4 }),
    );
    mesh.position.copy(pos);
    mesh.castShadow = true;
    userDotRef.current = mesh;
    scene.add(mesh);
  }, [userPos, navToWorld]);

  // ── Destination pin ────────────────────────────────────────────────────────
  const rebuildDest = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (destPinRef.current) { scene.remove(destPinRef.current); }
    if (!selectedDestination) return;
    const pos = navToWorld(selectedDestination.x, selectedDestination.y, 1.8);
    const geo  = new THREE.ConeGeometry(0.25, 1.0, 8);
    geo.rotateX(Math.PI); // tip points down
    const mat  = new THREE.MeshStandardMaterial({
      color: arrived ? 0x4caf50 : 0xff4444,
      emissive: arrived ? 0x1a6620 : 0x660000,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.castShadow = true;
    destPinRef.current = mesh;
    scene.add(mesh);
  }, [selectedDestination, arrived, navToWorld]);

  // ── Location dots (small amber cylinders) ─────────────────────────────────
  const rebuildLocDots = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    locDotsRef.current.forEach(m => scene.remove(m));
    locDotsRef.current = [];
    if (!modelBoxRef.current) return;
    const geo = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffb300, metalness: 0.2, roughness: 0.5 });
    locations.forEach(loc => {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(navToWorld(loc.x, loc.y, 0.04));
      scene.add(m);
      locDotsRef.current.push(m);
    });
  }, [locations, navToWorld]);

  // ── Load model and set up GL ───────────────────────────────────────────────
  const onContextCreate = useCallback(async (gl: ExpoWebGLRenderingContext) => {
    glRef.current = gl;
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;

    // Renderer using expo-gl context
    const renderer = new THREE.WebGLRenderer({
      context: gl as unknown as WebGLRenderingContext,
      canvas: {
        width: W, height: H, style: {},
        addEventListener: () => {}, removeEventListener: () => {},
        clientWidth: W, clientHeight: H,
        getContext: () => gl,
      } as unknown as HTMLCanvasElement,
    });
    renderer.setSize(W, H, false);
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdde3ec);
    scene.fog = new THREE.FogExp2(0xdde3ec, 0.012);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 300);
    cameraRef.current = camera;
    positionCamera();

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xfff0e0, 1.1);
    sun.position.set(20, 40, 15);
    sun.castShadow = true;
    Object.assign(sun.shadow.mapSize, { width: 2048, height: 2048 });
    Object.assign(sun.shadow.camera, { near: 1, far: 150, left: -40, right: 40, top: 40, bottom: -40 });
    scene.add(sun);
    const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.35);
    fillLight.position.set(-15, 20, -10);
    scene.add(fillLight);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8080a0, 0.3);
    scene.add(hemi);

    // Subtle ground grid
    const grid = new THREE.GridHelper(80, 80, 0xb0b8c8, 0xc8d0dc);
    (grid.material as THREE.Material).opacity = 0.4;
    (grid.material as THREE.Material).transparent = true;
    grid.position.y = -0.02;
    scene.add(grid);

    // Load GLB asset
    try {
      setStatus("Reading model file…");
      const asset = Asset.fromModule(FLOOR_ASSETS[floor]);
      await asset.downloadAsync();

      setStatus("Parsing geometry…");
      const b64 = await FileSystem.readAsStringAsync(asset.localUri!, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const buffer = b64ToBuffer(b64);

      await new Promise<void>((resolve, reject) => {
        new GLTFLoader().parse(buffer, "", gltf => {
          const model = gltf.scene;

          // Enable shadows on all meshes
          model.traverse(child => {
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh) {
              mesh.castShadow    = true;
              mesh.receiveShadow = true;
            }
          });

          // Centre the model
          const box    = new THREE.Box3().setFromObject(model);
          const centre = box.getCenter(new THREE.Vector3());
          model.position.sub(centre);
          model.position.y -= box.min.y - centre.y; // sit on y=0

          // Recompute box after centering
          modelBoxRef.current = new THREE.Box3().setFromObject(model);
          scene.add(model);

          // Auto-fit camera
          const size  = new THREE.Vector3();
          modelBoxRef.current.getSize(size);
          const maxXZ = Math.max(size.x, size.z);
          orbit.current.radius = maxXZ * 0.9;
          orbit.current.phi    = 0.75;
          positionCamera();

          // Draw location dots now that box is known
          rebuildLocDots();
          resolve();
        }, reject);
      });

      setLoading(false);
    } catch (e: any) {
      console.error("[3D] Load error:", e);
      setError(String(e?.message ?? e));
      setLoading(false);
    }

    // Render loop
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      // Gently bob the user marker
      if (userDotRef.current) {
        userDotRef.current.position.y += Math.sin(Date.now() * 0.003) * 0.002;
      }
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    animate();
  }, [floor, positionCamera, rebuildLocDots]);

  // Re-render nav overlays when props change
  useEffect(() => { if (!loading) rebuildPath();    }, [path,                loading, rebuildPath]);
  useEffect(() => { if (!loading) rebuildUser();    }, [userPos,             loading, rebuildUser]);
  useEffect(() => { if (!loading) rebuildDest();    }, [selectedDestination, loading, rebuildDest]);
  useEffect(() => { if (!loading) rebuildLocDots(); }, [locations,           loading, rebuildLocDots]);

  // Cleanup
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // ── Touch gesture handler (transparent overlay) ────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder:       () => true,
      onMoveShouldSetPanResponder:        () => true,
      onStartShouldSetPanResponderCapture: () => false,

      onPanResponderGrant: (e) => {
        const ts = e.nativeEvent.touches;
        if (ts.length === 1) {
          touch1.current = { x: ts[0].pageX, y: ts[0].pageY };
          isPanning.current = false;
        } else if (ts.length === 2) {
          const dx = ts[1].pageX - ts[0].pageX;
          const dy = ts[1].pageY - ts[0].pageY;
          pinchDist.current = Math.hypot(dx, dy);
          panStart.current  = { x: (ts[0].pageX + ts[1].pageX) / 2, y: (ts[0].pageY + ts[1].pageY) / 2 };
          isPanning.current = true;
        }
      },

      onPanResponderMove: (e) => {
        const ts = e.nativeEvent.touches;
        const cam = cameraRef.current;
        if (!cam) return;

        if (ts.length === 1 && !isPanning.current) {
          // Orbit
          const dx = ts[0].pageX - touch1.current.x;
          const dy = ts[0].pageY - touch1.current.y;
          touch1.current = { x: ts[0].pageX, y: ts[0].pageY };
          orbit.current.theta -= dx * 0.007;
          orbit.current.phi    = Math.max(0.12, Math.min(Math.PI / 2.1, orbit.current.phi + dy * 0.006));
          positionCamera();

        } else if (ts.length === 2) {
          const dx  = ts[1].pageX - ts[0].pageX;
          const dy  = ts[1].pageY - ts[0].pageY;
          const dist = Math.hypot(dx, dy);
          const midX = (ts[0].pageX + ts[1].pageX) / 2;
          const midY = (ts[0].pageY + ts[1].pageY) / 2;

          // Pinch → zoom
          const zoomDelta = (pinchDist.current - dist) * 0.06;
          orbit.current.radius = Math.max(4, Math.min(100, orbit.current.radius + zoomDelta));
          pinchDist.current = dist;

          // Two-finger drag → pan
          const panDX = (midX - panStart.current.x) * 0.03;
          const panDY = (midY - panStart.current.y) * 0.03;
          panStart.current = { x: midX, y: midY };
          const right   = new THREE.Vector3().crossVectors(cam.getWorldDirection(new THREE.Vector3()), cam.up).normalize();
          target.current.addScaledVector(right, -panDX);
          target.current.y += panDY;

          positionCamera();
        }
      },
      onPanResponderRelease: () => { isPanning.current = false; },
    })
  ).current;

  return (
    <View style={styles.root}>
      <GLView style={styles.gl} onContextCreate={onContextCreate} />

      {/* Transparent gesture capture layer */}
      <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers} pointerEvents="box-only" />

      {loading && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#0066CC" />
          <Text style={styles.statusText}>{status}</Text>
        </View>
      )}

      {error && (
        <View style={styles.overlay}>
          <Text style={styles.errorText}>⚠ {error}</Text>
        </View>
      )}

      {!loading && !error && (
        <View style={styles.hint}>
          <Text style={styles.hintText}>1-finger: rotate  ·  2-finger: zoom / pan</Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:       { flex: 1, borderRadius: 14, overflow: "hidden" },
  gl:         { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center", alignItems: "center",
    backgroundColor: "rgba(240,242,248,0.92)",
  },
  statusText: { marginTop: 14, fontSize: 15, color: "#444", fontWeight: "500" },
  errorText:  { fontSize: 13, color: "#c62828", textAlign: "center", padding: 24 },
  hint: {
    position: "absolute", bottom: 8, alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 20,
  },
  hintText:   { color: "white", fontSize: 11 },
});
