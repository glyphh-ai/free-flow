// game.js : Free Flow in the page. The hill and everything on it, the six riders, the camera behind the player,
// the gear menu, the controls (keys and touch), the sound, and the race clock. The race itself is sim.js.
//
// In the address: ?seed=N rides that hill (otherwise today's hill, the same for everyone), ?bot lets the computer
// ride for the player, ?go skips the menu, ?fast=N runs N times faster (for tests), ?mute.
import * as THREE from 'three';
import { makeRace, step, think, at, STEP, DECKS, WHEELS, rng } from './sim.js';
import { loadPeople, makeSkater, pose, PEOPLE } from './skater.js';
import { makeBoard, GRAPHICS } from './board.js';

const Q = new URLSearchParams(location.search);
const BOT = Q.has('bot'), FAST = Math.max(1, +Q.get('fast') || 1), MUTE = Q.has('mute');
const today = new Date(), DAY = today.getUTCFullYear() * 1000 + Math.floor((today - Date.UTC(today.getUTCFullYear(), 0, 1)) / 864e5);
let seed = +Q.get('seed') || DAY;
const $ = function (id) { return document.getElementById(id); };
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

// ---------- the gear ----------
const FITS = ['#3a86ff', '#ff006e', '#06d6a0', '#ffbe0b', '#f4f1ea', '#222831', '#8338ec', '#fb5607'];
const DECK_COLORS = ['#e4572e', '#1d3557', '#2a9d8f', '#f4a261', '#111111', '#e9c46a', '#9b5de5'];
const WHEEL_COLORS = ['#ffd23f', '#ff5d3a', '#06d6a0', '#3a86ff', '#f4f1ea', '#ff006e'];
// the vibe: how they carry themselves and the colour they leave on the road when they slide
export const VIBES = {
  chill:  { name: 'Chill', trail: '#4cc9f0', lean: 0.7, arms: 0.85 },
  hype:   { name: 'Hype', trail: '#ff006e', lean: 1.2, arms: 1.25 },
  gnarly: { name: 'Gnarly', trail: '#fb5607', lean: 1.0, arms: 1.0 },
  smooth: { name: 'Smooth', trail: '#b5179e', lean: 0.9, arms: 0.7 },
};
const saved = JSON.parse(localStorage.getItem('ff-gear') || 'null') || {};
const gear = Object.assign({ who: 'maya', fit: FITS[0], deck: 'race', deckColor: DECK_COLORS[0], graphic: 'stripes', wheels: 'free', wheelColor: WHEEL_COLORS[0], vibe: 'chill' }, saved);
if (!PEOPLE[gear.who]) gear.who = 'maya';
const RIVALS = ['Kai', 'Rosa', 'Jules', 'Nico', 'Sam', 'Ivy', 'Theo', 'Mara'];

// ---------- the renderer, the sky, the light ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const SKY = new THREE.Color(0xe4f1fa), FOG = new THREE.Color(0xc4dcef), FAR_SEA = new THREE.Color(0x3d8cc0);
scene.fog = new THREE.Fog(FOG, 150, 2200);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 3200);
addEventListener('resize', function () { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// a clear coast sky: a big sphere coloured from the horizon up, and clouds
(function () {
  const g = new THREE.SphereGeometry(1200, 32, 16), c = [], top = new THREE.Color(0x1f6fd1), mid = new THREE.Color(0x6aaee8), low = SKY;
  for (let i = 0; i < g.attributes.position.count; i++) {
    // below the horizon the dome is the far sea, so there is always a clean line where sea meets sky
    const y = g.attributes.position.getY(i) / 1200, col = y < -0.004 ? FAR_SEA.clone().lerp(new THREE.Color(0x0b4f82), Math.min(1, -y * 4)) : y > 0.25 ? mid.clone().lerp(top, Math.min(1, (y - 0.25) / 0.6)) : low.clone().lerp(mid, Math.max(0, y / 0.25));
    c.push(col.r, col.g, col.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.name = 'sky'; sky.renderOrder = -1; scene.add(sky);
  // the sky lights and is mirrored in everything shiny, the sea most of all
  const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(g, sky.material));
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(envScene, 0.01).texture;
  scene.environmentIntensity = 0.55;
  // clouds: big summer cumulus, piled puffs, bright on top and grey underneath, lowest near the horizon
  const puffTex = function (top, bottom) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), lin = x.createLinearGradient(0, 0, 0, 128); lin.addColorStop(0, top); lin.addColorStop(1, bottom);
    x.fillStyle = lin; x.fillRect(0, 0, 128, 128);
    x.globalCompositeOperation = 'destination-in';
    const rad = x.createRadialGradient(64, 64, 10, 64, 64, 64); rad.addColorStop(0, 'rgba(0,0,0,1)'); rad.addColorStop(0.6, 'rgba(0,0,0,0.85)'); rad.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = rad; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  };
  const lit = puffTex('#ffffff', '#dfe6ee'), shade = puffTex('#eef2f6', '#a9b6c4'), r = rng(99);
  for (let i = 0; i < 44; i++) {
    const a = r() * Math.PI * 2, el = 0.03 + Math.pow(r(), 1.5) * 0.4, size = 0.6 + r() * 1.1, cloud = new THREE.Group();
    const n = 8 + Math.floor(r() * 8);
    for (let j = 0; j < n; j++) {
      const up = r(), s = new THREE.Sprite(new THREE.SpriteMaterial({ map: up > 0.35 ? lit : shade, fog: false, depthWrite: false, transparent: true }));
      const w = (50 + r() * 70) * size; s.scale.set(w, w * 0.85, 1);
      s.position.set((r() - 0.5) * 200 * size, (up * 70 - 10) * size * (1 - Math.abs(r() - 0.5)), (r() - 0.5) * 40);
      s.renderOrder = up > 0.35 ? 1 : 0; cloud.add(s);
    }
    cloud.position.set(Math.cos(a) * 1050 * Math.cos(el), 1050 * Math.sin(el), Math.sin(a) * 1050 * Math.cos(el)); cloud.lookAt(0, 0, 0);
    sky.add(cloud);
  }
})();
scene.add(new THREE.HemisphereLight(0xd8ecff, 0x6b7f3a, 1.25));
const sun = new THREE.DirectionalLight(0xfff3dc, 3.0);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 200 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const SUN_DIR = new THREE.Vector3(-0.45, 0.8, 0.4).normalize();

// ---------- textures, drawn ----------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
function speckle(x, w, h, base, n, spread) {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  const r = rng(n);
  for (let i = 0; i < w * h / 6; i++) { const v = Math.floor((r() - 0.5) * spread); x.fillStyle = 'rgba(' + (v > 0 ? '255,255,255,' : '0,0,0,') + Math.abs(v) / 255 + ')'; x.fillRect(r() * w, r() * h, 2, 2); }
}
const asphalt = canvasTex(256, 512, function (x, w, h) {
  speckle(x, w, h, '#45474b', 3, 70);
  x.fillStyle = '#ece8df'; x.fillRect(8, 0, 6, h); x.fillRect(w - 14, 0, 6, h);         // the edge lines
  x.fillStyle = '#f2c230'; x.fillRect(w / 2 - 5, 0, 4, h * 0.5); x.fillRect(w / 2 + 1, 0, 4, h * 0.5);   // the middle: a broken double yellow
}, true);
const grass = canvasTex(256, 256, function (x, w, h) { speckle(x, w, h, '#6f8a3f', 5, 90); }, true);
grass.repeat.set(1, 1);
// the town's walls: rows of windows on a pale wall (each block is tinted its own colour)
function windows() {
  const t = canvasTex(64, 64, function (x, w, h) {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#5d7a92'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) x.fillRect(4 + i * 15, 5 + j * 15, 9, 8);
  }, true);
  return t;
}
const dirt = canvasTex(128, 128, function (x, w, h) { speckle(x, w, h, '#8a7a5c', 7, 90); }, true);

// ---------- the hill ----------
let world = null;
function buildWorld(T) {
  if (world) { scene.remove(world); world.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
  world = new THREE.Group(); scene.add(world);
  const half = T.width / 2, STEPM = 2, SEA = T.y[T.L] - 5;   // the road ends at the beach, the sea just below
  // the sun stands out over the sea, ahead of the riders, and glitters on the water
  const way = new THREE.Vector3(T.x[T.L] - T.x[0], 0, T.z[T.L] - T.z[0]).normalize();
  SUN_DIR.set(way.x * 0.75, 0.6, way.z * 0.75).normalize();
  // the road
  {
    const pos = [], uv = [], idx = [];
    for (let s = 0, n = 0; s <= T.L; s += STEPM, n++) {
      const a = at(T, s, -half - 0.3), b = at(T, s, half + 0.3);
      pos.push(a.x, a.y + 0.02, a.z, b.x, b.y + 0.02, b.z); uv.push(0, s / 9, 1, s / 9);
      if (n) { const i = n * 2; idx.push(i - 2, i - 1, i, i - 1, i + 1, i); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const road = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92 })); road.receiveShadow = true; world.add(road);
  }
  // the ground: a grid over the whole hill, its height from the road nearest: just under it beside the road, rising
  // to the mountain on one side and falling away to the valley on the other
  const near = nearestRoad(T);
  const lo = { x: 1e9, z: 1e9 }, hi = { x: -1e9, z: -1e9 };
  for (let i = 0; i <= T.L; i += 10) { lo.x = Math.min(lo.x, T.x[i]); lo.z = Math.min(lo.z, T.z[i]); hi.x = Math.max(hi.x, T.x[i]); hi.z = Math.max(hi.z, T.z[i]); }
  const PAD = 380, CELL = 6, gx = Math.ceil((hi.x - lo.x + PAD * 2) / CELL), gz = Math.ceil((hi.z - lo.z + PAD * 2) / CELL);
  const ground = function (x, z) { return near(x, z); };
  {
    const g = new THREE.PlaneGeometry(gx * CELL, gz * CELL, gx, gz); g.rotateX(-Math.PI / 2);
    g.translate((lo.x + hi.x) / 2, 0, (lo.z + hi.z) / 2);
    const p = g.attributes.position, col = [];
    const cGrass = new THREE.Color(0x5e9a35), cDry = new THREE.Color(0x9db455), cRock = new THREE.Color(0x9a9183), cShoulder = new THREE.Color(0x8a7a5c), cSand = new THREE.Color(0xe8d6a8);
    for (let i = 0; i < p.count; i++) {
      const h = ground(p.getX(i), p.getZ(i)); p.setY(i, h.y);
      const c = h.dist < half + 1.6 ? cShoulder : h.y < SEA + 4 ? cSand : cGrass.clone().lerp(cDry, h.n * 0.7).lerp(cRock, Math.min(1, Math.max(0, (Math.abs(h.y - h.ry) - 30) / 60)));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const uvs = g.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setXY(i, p.getX(i) / 8, p.getZ(i) / 8);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: grass, vertexColors: true, roughness: 1 })); m.receiveShadow = true; world.add(m);
    grass.repeat.set(1, 1);
  }
  // the guard rails: a steel band on posts down both sides
  {
    const railMat = new THREE.MeshStandardMaterial({ color: 0xc9cdd2, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide });
    [-1, 1].forEach(function (side) {
      const pos = [], idx = [];
      for (let s = 0, n = 0; s <= T.L; s += STEPM, n++) {
        const a = at(T, s, side * (half + 0.35));
        pos.push(a.x, a.y + 0.45, a.z, a.x, a.y + 0.75, a.z);
        if (n) { const i = n * 2; idx.push(i - 2, i - 1, i, i - 1, i + 1, i); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, railMat); m.castShadow = true; world.add(m);
    });
    const n = Math.floor(T.L / 4) * 2, posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), new THREE.MeshStandardMaterial({ color: 0x8d9399, metalness: 0.4, roughness: 0.6 }), n);
    const M = new THREE.Matrix4(); let k = 0;
    for (let s = 0; s < T.L - 2 && k < n; s += 4) [-1, 1].forEach(function (side) { const a = at(T, s, side * (half + 0.45)); M.makeTranslation(a.x, a.y + 0.4, a.z); posts.setMatrixAt(k++, M); });
    posts.count = k; world.add(posts);
  }
  // trees: pines, thick on the mountain side, never on the road
  {
    const r = rng(T.seed * 3 + 11), N = 2600;
    const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshStandardMaterial({ color: 0x2f5a36, roughness: 0.95, flatShading: true }), N * 2);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 1, 5), new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 }), N);
    crown.castShadow = true;
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), cc = new THREE.Color();
    let c = 0, t = 0;
    for (let i = 0; i < N; i++) {
      // few on the sea side, and none close to the road there, so the view down to the water stays open
      const s = r() * T.L, side = r() < 0.8 ? -1 : 1, d = side * (half + (side > 0 ? 22 : 4) + Math.pow(r(), 1.6) * 140), a = at(T, s, d), h = ground(a.x, a.z);
      if (h.dist < half + 3.5 || h.y < SEA + 2) continue;
      const H = 7 + r() * 9, R = H * (0.26 + r() * 0.08);
      ps.set(a.x, h.y + H * 0.15, a.z); sc.set(0.5, H * 0.3, 0.5); M.compose(ps, q, sc); trunk.setMatrixAt(t++, M);
      for (let j = 0; j < 2; j++) { ps.set(a.x, h.y + H * (0.55 + j * 0.25), a.z); sc.set(R * (1 - j * 0.35), H * (0.6 - j * 0.15), R * (1 - j * 0.35)); M.compose(ps, q, sc); crown.setMatrixAt(c, M); crown.setColorAt(c++, cc.setHSL(0.26 + r() * 0.08, 0.45 + r() * 0.2, 0.24 + r() * 0.12)); }
    }
    crown.count = c; trunk.count = t; world.add(crown, trunk);
  }
  // the sea, far below, all the way to the sky
  {
    // ripples: a wave normal map, so the sky and the sun glitter on it
    const N = 256, data = new Uint8Array(N * N * 4), hgt = function (x, y) { const u = x / N * Math.PI * 2, v = y / N * Math.PI * 2; return Math.sin(u * 3 + v * 2) + 0.6 * Math.sin(u * 7 - v * 5 + 1) + 0.35 * Math.sin(u * 13 + v * 11 + 2) + 0.25 * Math.sin(-u * 19 + v * 17); };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1), l = Math.hypot(dx, dy, 0.25), i = (y * N + x) * 4;
      data[i] = (-dx / l * 0.5 + 0.5) * 255; data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; data[i + 2] = (0.25 / l * 0.5 + 0.5) * 255; data[i + 3] = 255;
    }
    const nrm = new THREE.DataTexture(data, N, N); nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping; nrm.repeat.set(350, 350);
    nrm.magFilter = THREE.LinearFilter; nrm.minFilter = THREE.LinearMipmapLinearFilter; nrm.generateMipmaps = true; nrm.anisotropy = renderer.capabilities.getMaxAnisotropy(); nrm.needsUpdate = true;
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), new THREE.MeshStandardMaterial({ color: 0x1a78b8, roughness: 0.14, metalness: 0.05, normalMap: nrm, normalScale: new THREE.Vector2(0.3, 0.3), envMapIntensity: 1.3, fog: false }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(T.x[T.L], SEA, T.z[T.L]); world.add(sea);
    world.userData.sea = nrm;
  }
  // a beach town where the road comes down: white and sand-coloured blocks along the shore
  {
    const r = rng(T.seed + 17), N = 700, end = { x: T.x[T.L], z: T.z[T.L] };
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const town = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ map: windows(), roughness: 0.7 }), N);
    town.castShadow = true; town.receiveShadow = true;
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), ps = new THREE.Vector3(), sc = new THREE.Vector3(), cc = new THREE.Color();
    let n = 0;
    for (let i = 0; i < N * 8 && n < N; i++) {
      const a = r() * Math.PI * 2, d = 30 + Math.sqrt(r()) * 900, x = end.x + Math.cos(a) * d, z = end.z + Math.sin(a) * d, h = ground(x, z);
      if (h.y < SEA + 1 || h.y > SEA + 35 || h.dist < half + 8) continue;
      const tall = d < 400 && r() < 0.35 ? 20 + r() * 55 : 5 + r() * 12, w = 8 + r() * 14;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.round(r() * 4) * Math.PI / 2 + T.h[T.L]);
      ps.set(x, h.y - 1, z); sc.set(w, tall, 8 + r() * 12); M.compose(ps, q, sc); town.setMatrixAt(n, M);
      town.setColorAt(n++, cc.setHSL(0.1 + r() * 0.05, 0.25 * r(), 0.78 + r() * 0.18));
    }
    town.count = n; world.add(town);
  }
  // power poles down the valley side, wires sagging between them
  {
    const poleM = new THREE.MeshStandardMaterial({ color: 0x6b5440, roughness: 1 }), pts = [], N = Math.floor(T.L / 40);
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.17, 10, 6).translate(0, 5, 0), poleM, N), bars = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.14, 0.14), poleM, N);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), ps = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    let last = null;
    for (let i = 0; i < N; i++) {
      const s = 20 + i * 40, a = at(T, s, half + 3.5), h = ground(a.x, a.z), top = h.y + 9.4;
      M.makeTranslation(a.x, h.y - 0.2, a.z); poles.setMatrixAt(i, M);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a.h + Math.PI / 2); ps.set(a.x, top, a.z); M.compose(ps, q, one); bars.setMatrixAt(i, M);
      const ends = [-0.95, 0, 0.95].map(function (o) { return new THREE.Vector3(a.x + Math.cos(a.h) * o, top + 0.08, a.z + Math.sin(a.h) * o); });
      if (last) for (let w = 0; w < 3; w++) for (let k = 0; k < 8; k++) {
        const p0 = last[w].clone().lerp(ends[w], k / 8), p1 = last[w].clone().lerp(ends[w], (k + 1) / 8);
        p0.y -= Math.sin(Math.PI * k / 8) * 1.1; p1.y -= Math.sin(Math.PI * (k + 1) / 8) * 1.1; pts.push(p0, p1);
      }
      last = ends;
    }
    world.add(poles, bars, new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2a2a2a })));
  }
  // what is on the road
  {
    const coneM = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 }), white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const baleM = new THREE.MeshStandardMaterial({ color: 0xd8b75a, roughness: 1 }), holeM = new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 1 });
    const gravelM = new THREE.MeshStandardMaterial({ map: dirt, roughness: 1, transparent: true, opacity: 0.95 });
    const carColors = [0xb23a48, 0x2b4162, 0xe0e0e0, 0x3d5a40, 0x222222];
    T.things.forEach(function (o, i) {
      const a = at(T, o.s, o.d), g = new THREE.Group(); g.position.set(a.x, a.y + 0.02, a.z); g.rotation.y = -a.h;
      if (o.kind === 'cone') {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 14), coneM); c.position.y = 0.37; c.castShadow = true; g.add(c);
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.1, 14), white); b.position.y = 0.45; g.add(b);
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.46), coneM); f.position.y = 0.02; g.add(f);
      } else if (o.kind === 'bale') {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.3, 18), baleM); b.rotation.z = Math.PI / 2; b.position.y = 0.6; b.castShadow = true; g.add(b);
      } else if (o.kind === 'car') {
        const m = new THREE.MeshStandardMaterial({ color: carColors[i % carColors.length], metalness: 0.5, roughness: 0.35 }), glass = new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.8, roughness: 0.1 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, 4.3), m); body.position.y = 0.65; body.castShadow = true; g.add(body);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.2), glass); cab.position.set(0, 1.3, 0.2); cab.castShadow = true; g.add(cab);
        const tg = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 14); tg.rotateZ(Math.PI / 2);
        [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]].forEach(function (w) { const t = new THREE.Mesh(tg, holeM); t.position.set(w[0], 0.34, w[1]); g.add(t); });
        const lights = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: 0xff2a2a })); lights.position.set(0, 0.85, 2.16); g.add(lights);
      } else if (o.kind === 'gravel') {
        const p = new THREE.Mesh(new THREE.CircleGeometry(1, 20), gravelM); p.rotation.x = -Math.PI / 2; p.scale.set(o.r * 1.1, o.len / 2, 1); p.position.y = 0.015; p.receiveShadow = true; g.add(p);
      } else if (o.kind === 'hole') {
        const p = new THREE.Mesh(new THREE.CircleGeometry(o.r, 16), holeM); p.rotation.x = -Math.PI / 2; p.scale.set(1, 0.7, 1); p.position.y = 0.012; g.add(p);
      }
      world.add(g);
    });
  }
  // the start and the finish
  [[8, 'START', '#1d3557'], [T.L - 40, 'FINISH', '#e4572e']].forEach(function (f) {
    const a = at(T, f[0], 0), g = new THREE.Group(); g.position.set(a.x, a.y, a.z); g.rotation.y = -a.h;
    const pole = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.5, roughness: 0.4 });
    [-1, 1].forEach(function (s) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.2, 10), pole); p.position.set(s * (half + 0.9), 2.6, 0); p.castShadow = true; g.add(p); });
    const tex = canvasTex(1024, 128, function (x, w, h) {
      x.fillStyle = f[2]; x.fillRect(0, 0, w, h);
      if (f[1] === 'FINISH') for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) { x.fillStyle = '#111'; x.fillRect(i * 32, j * 32, 32, 32); } else { x.fillStyle = '#fff'; x.fillRect(i * 32, j * 32, 32, 32); }
      x.fillStyle = f[1] === 'FINISH' ? f[2] : '#fff'; if (f[1] === 'FINISH') x.fillRect(w / 2 - 230, 14, 460, 100);
      x.fillStyle = '#fff'; x.font = '900 italic 88px Futura, Avenir Next, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(f[1], w / 2, h / 2 + 4);
    });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(T.width + 1.8, 1.4), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
    banner.position.y = 4.6; g.add(banner);
    if (f[1] === 'FINISH') { const line = new THREE.Mesh(new THREE.PlaneGeometry(T.width, 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff })); line.rotation.x = -Math.PI / 2; line.position.y = 0.035; g.add(line); }
    world.add(g);
  });
  world.userData.ground = ground;
}

// for any point: the road nearest it (a grid of road samples, searched round the point), and so the ground's height
function nearestRoad(T) {
  const B = 20, cells = new Map();
  for (let i = 0; i <= T.L; i += 2) { const k = Math.floor(T.x[i] / B) + ',' + Math.floor(T.z[i] / B); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(i); }
  const half = T.width / 2, noise = function (x, z) { return Math.sin(x * 0.031 + Math.sin(z * 0.017) * 2) * Math.cos(z * 0.027 + x * 0.006) * 0.5 + 0.5; };
  return function (x, z) {
    const cx = Math.floor(x / B), cz = Math.floor(z / B);
    let best = -1, bd = 1e18;
    for (let rr = 0; rr < 12 && best < 0; rr++) {
      for (let i = cx - rr; i <= cx + rr; i++) for (let j = cz - rr; j <= cz + rr; j++) {
        if (rr && i > cx - rr && i < cx + rr && j > cz - rr && j < cz + rr) continue;
        const l = cells.get(i + ',' + j); if (!l) continue;
        for (const n of l) { const dx = x - T.x[n], dz = z - T.z[n], d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = n; } }
      }
      if (best >= 0 && rr < 2) { rr++; for (let i = cx - rr; i <= cx + rr; i++) for (let j = cz - rr; j <= cz + rr; j++) { const l = cells.get(i + ',' + j); if (l) for (const n of l) { const dx = x - T.x[n], dz = z - T.z[n], d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = n; } } } }
    }
    const nz = noise(x, z);
    if (best < 0) return { y: T.y[T.L] - 120, dist: 999, ry: T.y[T.L], n: nz };
    let dist = Math.sqrt(bd), ry = T.y[best];
    // past the bottom of the road: the beach, and the land sinking under the sea
    const along = best >= T.L - 2 ? (x - T.x[T.L]) * Math.sin(T.h[T.L]) - (z - T.z[T.L]) * Math.cos(T.h[T.L]) : 0;
    if (along > 0) return { y: ry - 1 - along * 0.06 - Math.max(0, along - 60) * 0.25, dist: dist, ry: ry, n: nz };
    // which side: the mountain is to the left of the way down, the valley to the right
    const side = (x - T.x[best]) * Math.cos(T.h[best]) + (z - T.z[best]) * Math.sin(T.h[best]);
    let y = ry - 0.35;
    const out = Math.max(0, dist - half - 2.2);
    // the valley side falls away steeply toward the sea, so the view opens down the hill
    // (the hill side only banks up a little, so no wall ever stands between the rider and the sea ahead)
    if (out > 0) y += side < 0 ? 16 * (1 - Math.exp(-out / 18)) : -out * 0.8 - Math.pow(out / 40, 2) * 14;
    y += (nz - 0.5) * Math.min(1, out / 25) * 14;
    return { y: y, dist: dist, ry: ry, n: nz };
  };
}

// ---------- the riders ----------
function makeRider(o) {
  const g = new THREE.Group(), turn = new THREE.Group();     // g: on the road; turn: the board's yaw in a slide
  const board = makeBoard({ deck: o.deck, color: o.deckColor, graphic: o.graphic, wheel: o.wheelColor });
  board.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
  const S = makeSkater(o.who, o.fit);
  S.holder.position.y = 0.12; S.holder.rotation.y = Math.PI / 2;
  turn.add(board, S.holder); g.add(turn);
  // a name over the rivals' heads
  if (o.label) {
    const tex = canvasTex(256, 64, function (x, w, h) { x.font = '800 38px Avenir Next, Futura, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,0.6)'; x.strokeText(o.label, w / 2, h / 2); x.fillStyle = '#fff'; x.fillText(o.label, w / 2, h / 2); });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true })); sp.scale.set(1.6, 0.4, 1); sp.position.y = 2.35; g.add(sp);
  }
  scene.add(g);
  return { g: g, turn: turn, board: board, S: S, o: o, vibe: VIBES[o.vibe] || VIBES.chill, roll: 0, yaw: 0, spin: 0 };
}
function dropRider(r) { scene.remove(r.g); r.g.traverse(function (o) { if (o.geometry && !o.isSkinnedMesh) o.geometry.dispose(); }); }

// urethane on the road: the marks a slide leaves, in the rider's vibe colour
const MARKS = 600;
const marks = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.06, 0.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }), MARKS);
marks.count = MARKS; marks.frustumCulled = false; scene.add(marks);
let markAt = 0;
(function () { const M = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < MARKS; i++) marks.setMatrixAt(i, M); })();
function mark(x, y, z, yaw, color) {
  const M = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y + 0.03, z);
  marks.setMatrixAt(markAt, M); marks.setColorAt(markAt, new THREE.Color(color)); markAt = (markAt + 1) % MARKS;
  marks.instanceMatrix.needsUpdate = true; if (marks.instanceColor) marks.instanceColor.needsUpdate = true;
}

// ---------- the sound: the wheels on the road, a slide, the countdown ----------
let ac = null, roar = null, screech = null;
function startSound() {
  if (ac || MUTE) return;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = last * 6; }
    const mk = function (type, f, q) { const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ac.createGain(); g.gain.value = 0; src.connect(fl); fl.connect(g); g.connect(ac.destination); src.start(); return { f: fl, g: g }; };
    roar = mk('lowpass', 300, 0.7);
    screech = mk('bandpass', 2400, 8);
  } catch (e) { ac = null; }
}
function beep(f, len) { if (!ac) return; const o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(0.12, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + len); o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + len); }
function thud() { if (!ac) return; const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(140, ac.currentTime); o.frequency.exponentialRampToValueAtTime(40, ac.currentTime + 0.3); g.gain.setValueAtTime(0.5, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.35); o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.4); }

// ---------- the controls ----------
// Hold the left or right half of the screen (or ← →) to carve that way; hold it past SLIDE_AFTER and the board kicks
// out into a slide toward that side. Holding nothing, the rider tucks.
const SLIDE_AFTER = 0.8;
const keys = { left: 0, right: 0 }, held = { side: '', t: 0 };
const touches = new Map();
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
function press() {
  // the side pressed last wins while both are held
  let side = '';
  touches.forEach(function (s) { side = s; });
  if (!side) side = keys.right && keys.last === 'right' ? 'right' : keys.left ? 'left' : keys.right ? 'right' : '';
  if (side !== held.side) { held.side = side; held.t = 0; }
}
addEventListener('keydown', function (e) { const k = KEYMAP[e.code]; if (k) { if (!keys[k]) keys.last = k; keys[k] = 1; e.preventDefault(); press(); } });
addEventListener('keyup', function (e) { const k = KEYMAP[e.code]; if (k) { keys[k] = 0; press(); } });
const tap = function (e) { if (mode !== 'race' || e.target.closest('button')) return; e.preventDefault(); touches.delete(e.pointerId); touches.set(e.pointerId, e.clientX < innerWidth / 2 ? 'left' : 'right'); press(); };
const lift = function (e) { if (touches.delete(e.pointerId)) press(); };
addEventListener('pointerdown', tap, { passive: false }); addEventListener('pointerup', lift); addEventListener('pointercancel', lift);
addEventListener('contextmenu', function (e) { e.preventDefault(); });
function playerInput(dt) {
  if (held.side) held.t += dt;
  const sliding = held.side && held.t > SLIDE_AFTER;
  $('touch').className = held.side ? held.side + (sliding ? ' slide' : '') : '';
  return { left: held.side === 'left' ? 1 : 0, right: held.side === 'right' ? 1 : 0, slide: sliding ? 1 : 0, tuck: held.side ? 0 : 1 };
}

// ---------- the race ----------
let R = null, riders = [], mode = 'menu', finishShown = false, lastCrash = 0, msgUntil = 0;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();

function rivalsFor(seedN) {
  const r = rng(seedN * 13 + 7), names = RIVALS.slice(), out = [], ids = Object.keys(PEOPLE), decks = Object.keys(DECKS), wheels = Object.keys(WHEELS), vibes = Object.keys(VIBES);
  for (let i = 0; i < 5; i++) {
    const name = names.splice(Math.floor(r() * names.length), 1)[0];
    out.push({ name: name, label: name, ai: true, skill: 0.87 + r() * 0.11, who: ids[Math.floor(r() * ids.length)], fit: FITS[Math.floor(r() * FITS.length)], deck: decks[Math.floor(r() * decks.length)], deckColor: DECK_COLORS[Math.floor(r() * DECK_COLORS.length)], graphic: GRAPHICS[Math.floor(r() * GRAPHICS.length)], wheels: wheels[Math.floor(r() * wheels.length)], wheelColor: WHEEL_COLORS[Math.floor(r() * WHEEL_COLORS.length)], vibe: vibes[Math.floor(r() * vibes.length)] });
  }
  return out;
}

function newRace() {
  riders.forEach(dropRider); riders = [];
  const me = Object.assign({ name: 'You', ai: BOT }, gear), rivals = rivalsFor(seed);
  R = makeRace(seed, me, rivals);
  if (!world || world.userData.seed !== seed) { buildWorld(R.T); world.userData.seed = seed; }
  [me].concat(rivals).forEach(function (o) { riders.push(makeRider(o)); });
  finishShown = false; lastCrash = 0;
  const M = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < MARKS; i++) marks.setMatrixAt(i, M); marks.instanceMatrix.needsUpdate = true;
  window.ff.R = R;
  place(0);
}
function rebuildMe() {
  if (!R) return;
  dropRider(riders[0]);
  riders[0] = makeRider(Object.assign({ name: 'You' }, gear));
  const p = R.racers[0]; p.deck = gear.deck; p.wheels = gear.wheels;
  place(0);
  localStorage.setItem('ff-gear', JSON.stringify(gear));
}

// put every rider where the race says, posed for what they are doing
const tmp = new THREE.Vector3();
function place(dt) {
  const T = R.T;
  R.racers.forEach(function (p, i) {
    const r = riders[i], a = at(T, p.s, p.d), ahead = at(T, p.s + 1.5, p.d), behind = at(T, p.s - 1.5, p.d);
    const pitch = Math.atan2(ahead.y - behind.y, 3);
    // leaning into a bend: as much as the turn asks, and the steering
    const wantRoll = -Math.atan(p.v * p.v * T.k[Math.min(T.L, Math.floor(p.s))] / 9.81) * 0.9 - p.steer * 0.22 * r.vibe.lean;
    r.roll += (wantRoll - r.roll) * Math.min(1, dt * 8);
    const wantYaw = p.slide * 1.25 * (p.steer < -0.1 ? -1 : 1) + p.vd * 0.04;   // the tail kicks out the way it slides
    r.yaw += (wantYaw - r.yaw) * Math.min(1, dt * 9);
    r.g.position.set(a.x, a.y + 0.02, a.z);
    r.g.rotation.set(pitch, -a.h, 0, 'YXZ');
    r.turn.rotation.set(0, r.yaw, r.crash ? 0 : r.roll, 'YXZ');
    const fall = p.crash > 0 ? 1 : 0;
    if (fall) {
      // thrown: the board skids on ahead, the rider tumbles and slides
      r.spin += dt * 9;
      r.S.holder.rotation.set(Math.min(1.45, r.spin * 0.5), Math.PI / 2, 0, 'YXZ');
      r.S.holder.position.set(Math.sin(r.spin) * 0.3, 0.12 + Math.max(0, Math.sin(Math.min(Math.PI, r.spin * 0.7))) * 0.7, Math.min(2.5, r.spin * 0.4));
      r.board.rotation.z = r.spin * 1.3; r.board.position.z = -Math.min(4, r.spin * 0.8);
    } else {
      r.spin = 0; r.S.holder.rotation.set(0, Math.PI / 2, 0); r.S.holder.position.set(0, 0.12, 0); r.board.rotation.z = 0; r.board.position.z = 0;
      const k = T.k[Math.min(T.L, Math.floor(p.s))];
      pose(r.S, { base: 1, tuck: p.tuck * 1.6, slide: p.slide * 1.8 }, (-wantRoll) * 1.2, R.t);
    }
    if (fall) pose(r.S, { fall: 1 }, 0, R.t);
    // wheels turn
    r.board.userData.wheels.forEach(function (w) { w.rotation.x -= p.v * dt / 0.035; });
    // a slide leaves marks
    if (p.slide > 0.5 && p.v > 4 && !fall && Math.random() < 0.9) { r.board.userData.wheels.forEach(function (w, j) { if (j % 2) return; w.getWorldPosition(tmp); mark(tmp.x, a.y, tmp.z, -a.h + r.yaw, r.vibe.trail); }); }
  });
}

function follow(dt, snap) {
  const p = R.racers[0], T = R.T;
  // close behind at head height, looking down the hill: the road drops away ahead, the sea below
  // (it looks above the road ahead, so the road is seen falling away under the horizon, not tilted flat)
  // low and close, the rider big in the bottom half, the sea's horizon high in the frame
  const back = at(T, p.s - 3.1 - p.v * 0.03, p.d * 0.92), look = at(T, p.s + 20, p.d * 0.6);
  const tall = innerHeight > innerWidth;   // a phone held upright looks further down, the horizon in the top third
  const want = new THREE.Vector3(back.x, back.y + (tall ? 2.0 : 1.8) + (p.crash ? 1.5 : 0), back.z), wantLook = new THREE.Vector3(look.x, want.y - 23 * (tall ? 0.3 : 0.17), look.z);
  if (snap) { camPos.copy(want); camLook.copy(wantLook); }
  camPos.lerp(want, Math.min(1, dt * 5)); camLook.lerp(wantLook, Math.min(1, dt * 7));
  camera.position.copy(camPos);
  const sp = riders[0] ? p.v : 0;
  if (p.bump > 0) camera.position.y += (Math.random() - 0.5) * 0.12;
  camera.lookAt(camLook);
  camera.fov += (64 + Math.min(24, sp * 0.6) - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();
  wind(dt, sp);
  const me = riders[0].g.position;
  sun.position.copy(me).addScaledVector(SUN_DIR, 80); sun.target.position.copy(me);
  scene.getObjectByName('sky').position.copy(camera.position);
}

// rushing air: thin streaks flying past the camera, more and brighter the faster the rider goes
const STREAKS = 90, streakPos = new Float32Array(STREAKS * 6), streakR = rng(5);
const streaks = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false }));
streaks.geometry.setAttribute('position', new THREE.BufferAttribute(streakPos, 3)); streaks.frustumCulled = false;
camera.add(streaks); scene.add(camera);
const streakZ = new Float32Array(STREAKS);
for (let i = 0; i < STREAKS; i++) streakZ[i] = -streakR() * 40;
function wind(dt, v) {
  streaks.material.opacity = Math.max(0, Math.min(0.22, (v - 16) / 40));
  for (let i = 0; i < STREAKS; i++) {
    streakZ[i] += v * dt * 1.4;
    if (streakZ[i] > 0) { streakZ[i] = -30 - streakR() * 12; const a = streakR() * Math.PI * 2, rr = 2.2 + streakR() * 5; streakPos[i * 6] = Math.cos(a) * rr * 1.4; streakPos[i * 6 + 1] = Math.sin(a) * rr; }
    const len = 0.6 + v * 0.06;
    streakPos[i * 6 + 3] = streakPos[i * 6]; streakPos[i * 6 + 4] = streakPos[i * 6 + 1];
    streakPos[i * 6 + 2] = streakZ[i]; streakPos[i * 6 + 5] = streakZ[i] - len;
  }
  streaks.geometry.attributes.position.needsUpdate = true;
}

// the menu: the player's rider turning slowly on the start line
let orbit = 0;
function menuCamera(dt) {
  orbit += dt * 0.35;
  riders.forEach(function (r, i) { r.g.visible = i === 0; });
  const me = riders[0].g.position, wide = innerWidth > 640;
  const r = wide ? 3.3 : 3.9;
  camera.position.set(me.x + Math.cos(orbit) * r, me.y + (wide ? 1.3 : 1.9), me.z + Math.sin(orbit) * r);
  camera.fov = 45; camera.updateProjectionMatrix();
  camera.lookAt(me.x, me.y + (wide ? 0.85 : 0.5), me.z);
  // on a wide screen the rider stands right of the menu
  if (wide) camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.16, 0, innerWidth, innerHeight); else camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.2, innerWidth, innerHeight);
  sun.position.copy(me).addScaledVector(SUN_DIR, 80); sun.target.position.copy(me);
  scene.getObjectByName('sky').position.copy(camera.position);
}

function fmt(t) { if (!(t >= 0)) return '0:00.0'; const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); }
const ORD = function (n) { return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'); };
function hud() {
  const p = R.racers[0];
  $('place').innerHTML = ORD(p.place).replace(/(\d+)(\D+)/, '$1<small>$2</small>') + '<small> / ' + R.racers.length + '</small>';
  $('time').textContent = fmt(p.finished || R.t);
  $('speed').innerHTML = Math.round(p.v * 3.6) + '<small>KM/H</small>';
  const bar = $('bar');
  if (bar.children.length !== R.racers.length) { bar.innerHTML = ''; R.racers.forEach(function (q, i) { const d = document.createElement('i'); d.style.background = riders[i].o.fit; if (!i) d.className = 'me'; bar.appendChild(d); }); }
  R.racers.forEach(function (q, i) { bar.children[i].style.left = (Math.min(1, q.s / (R.T.L - 40)) * 100) + '%'; });
  const flag = $('flag');
  if (R.t < 0) { const n = Math.ceil(-R.t); flag.textContent = n; } else if (R.t < 0.8) flag.textContent = 'GO!'; else flag.textContent = '';
  $('hint').style.opacity = R.t < 5 ? 1 : 0;
  const msg = $('msg');
  if (p.crash > 0 && lastCrash !== p.crashes) { lastCrash = p.crashes; msg.textContent = ['Slammed!', 'Eat it!', 'Gravel rash!', 'Ouch!'][p.crashes % 4]; msgUntil = R.t + 1.4; thud(); }
  else if (p.draft && R.t > msgUntil) { msg.textContent = 'Drafting'; msgUntil = R.t + 0.25; }
  if (R.t > msgUntil) msg.textContent = '';
}
function results() {
  finishShown = true;
  const p = R.racers[0];
  $('rtitle').textContent = p.place === 1 ? 'You won!' : ORD(p.place) + ' place';
  $('rtable').innerHTML = R.order.map(function (q) {
    return '<tr' + (q === p ? ' class="me"' : '') + '><td>' + q.place + '</td><td>' + q.name + '</td><td>' + (q.finished ? fmt(q.finished) : '…') + '</td></tr>';
  }).join('');
  $('results').classList.remove('hide');
}

// ---------- the menu ----------
function opts(id, items, get, set) {
  const box = $(id); box.innerHTML = '';
  items.forEach(function (it) {
    const b = document.createElement('button');
    if (it.color) { b.className = 'sw'; b.style.background = it.color; b.title = it.color; } else { b.className = 'opt'; b.innerHTML = it.label + (it.small ? '<small>' + it.small + '</small>' : ''); }
    if (get() === it.value) b.classList.add('on');
    b.onclick = function () { set(it.value); Array.from(box.children).forEach(function (c) { c.classList.remove('on'); }); b.classList.add('on'); rebuildMe(); };
    box.appendChild(b);
  });
}
function menu() {
  opts('o-who', Object.keys(PEOPLE).map(function (k) { return { value: k, label: PEOPLE[k].name }; }), function () { return gear.who; }, function (v) { gear.who = v; });
  opts('o-fit', FITS.map(function (c) { return { value: c, color: c }; }), function () { return gear.fit; }, function (v) { gear.fit = v; });
  const dsmall = { cruiser: 'quick to turn', race: 'all-round', drop: 'steady, slips the air' };
  opts('o-deck', Object.keys(DECKS).map(function (k) { return { value: k, label: DECKS[k].name.replace(/ \d+"/, ''), small: dsmall[k] }; }), function () { return gear.deck; }, function (v) { gear.deck = v; });
  opts('o-deckc', DECK_COLORS.map(function (c) { return { value: c, color: c }; }), function () { return gear.deckColor; }, function (v) { gear.deckColor = v; gear.graphic = GRAPHICS[(GRAPHICS.indexOf(gear.graphic) + 1) % GRAPHICS.length]; });
  const wsmall = { grip: 'holds the bends', free: 'all-round', fast: 'fastest, slides out' };
  opts('o-wheels', Object.keys(WHEELS).map(function (k) { return { value: k, label: WHEELS[k].name.split(' ')[0], small: wsmall[k] }; }), function () { return gear.wheels; }, function (v) { gear.wheels = v; });
  opts('o-wheelc', WHEEL_COLORS.map(function (c) { return { value: c, color: c }; }), function () { return gear.wheelColor; }, function (v) { gear.wheelColor = v; });
  opts('o-vibe', Object.keys(VIBES).map(function (k) { return { value: k, label: VIBES[k].name }; }), function () { return gear.vibe; }, function (v) { gear.vibe = v; });
}
function toMenu() {
  mode = 'menu'; $('results').classList.add('hide'); $('hud').classList.add('hide'); $('menu').classList.remove('hide');
  newRace();
}
function go() {
  startSound();
  localStorage.setItem('ff-gear', JSON.stringify(gear));
  $('menu').classList.add('hide'); $('results').classList.add('hide'); $('hud').classList.remove('hide');
  if (mode !== 'menu') newRace();
  camera.clearViewOffset();
  riders.forEach(function (r) { r.g.visible = true; });
  mode = 'race'; follow(0, true);
}
$('ride').onclick = go;
$('again').onclick = function () { seed = seed + 1; mode = 'again'; go(); };
$('gear').onclick = toMenu;

// ---------- the loop ----------
let acc = 0, then = performance.now(), lastBeep = 4;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - then) / 1000); then = now;
  if (mode === 'race') {
    acc += dt * FAST;
    while (acc >= STEP) {
      acc -= STEP;
      const me = R.racers[0];
      if (!BOT && !me.finished) me.input = playerInput(STEP);
      step(R);
    }
    if (R.t < 0 && Math.ceil(-R.t) !== lastBeep) { lastBeep = Math.ceil(-R.t); beep(440, 0.15); }
    if (R.t >= 0 && lastBeep > 0) { lastBeep = 0; beep(880, 0.4); }
    place(dt * FAST); follow(dt * FAST); hud();
    const me = R.racers[0];
    if (roar) { roar.g.gain.value = Math.min(0.5, me.v / 50) * (me.crash ? 0.3 : 1); roar.f.frequency.value = 180 + me.v * 22; screech.g.gain.value = me.slide > 0.3 && me.v > 4 ? 0.12 * me.slide : 0; screech.f.frequency.value = 1800 + me.v * 40; }
    if (me.finished && !finishShown && R.t > me.finished + 1.2) results();
  } else {
    if (R) { place(dt); menuCamera(dt); }
  }
  if (world && world.userData.sea) { world.userData.sea.offset.x += dt * 0.004; world.userData.sea.offset.y += dt * 0.0025; }
  renderer.render(scene, camera);
}

window.ff = { R: null, keys: keys, gear: gear, go: go, get mode() { return mode; } };
loadPeople().then(function () {
  menu(); newRace();
  $('loading').classList.add('hide');
  if (Q.has('go') || BOT) { mode = 'menu'; go(); } else $('menu').classList.remove('hide');
  requestAnimationFrame(frame);
  window.ff.ready = true;
});
