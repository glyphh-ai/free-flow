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
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const SKY = new THREE.Color(0xf2c9a0), FOG = new THREE.Color(0xd9c7b8);
scene.fog = new THREE.Fog(FOG, 60, 420);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 3200);
addEventListener('resize', function () { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// a late-afternoon sky: a big sphere coloured from the horizon up
(function () {
  const g = new THREE.SphereGeometry(1200, 32, 16), c = [], top = new THREE.Color(0x4a7fc1), mid = new THREE.Color(0xa9c7e8), low = SKY;
  for (let i = 0; i < g.attributes.position.count; i++) {
    const y = g.attributes.position.getY(i) / 1200, col = y > 0.25 ? mid.clone().lerp(top, Math.min(1, (y - 0.25) / 0.6)) : low.clone().lerp(mid, Math.max(0, (y + 0.05) / 0.3));
    c.push(col.r, col.g, col.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.name = 'sky'; scene.add(sky);
})();
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x5a6b3a, 1.25));
const sun = new THREE.DirectionalLight(0xffe2b8, 2.6);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 200 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const SUN_DIR = new THREE.Vector3(-0.55, 0.62, 0.55).normalize();

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
const dirt = canvasTex(128, 128, function (x, w, h) { speckle(x, w, h, '#8a7a5c', 7, 90); }, true);

// ---------- the hill ----------
let world = null;
function buildWorld(T) {
  if (world) { scene.remove(world); world.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
  world = new THREE.Group(); scene.add(world);
  const half = T.width / 2, STEPM = 2;
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
  const PAD = 260, CELL = 5, gx = Math.ceil((hi.x - lo.x + PAD * 2) / CELL), gz = Math.ceil((hi.z - lo.z + PAD * 2) / CELL);
  const ground = function (x, z) { return near(x, z); };
  {
    const g = new THREE.PlaneGeometry(gx * CELL, gz * CELL, gx, gz); g.rotateX(-Math.PI / 2);
    g.translate((lo.x + hi.x) / 2, 0, (lo.z + hi.z) / 2);
    const p = g.attributes.position, col = [];
    const cGrass = new THREE.Color(0x6f8a3f), cDry = new THREE.Color(0xa59a62), cRock = new THREE.Color(0x8b8378), cShoulder = new THREE.Color(0x8a7a5c);
    for (let i = 0; i < p.count; i++) {
      const h = ground(p.getX(i), p.getZ(i)); p.setY(i, h.y);
      const c = h.dist < half + 1.6 ? cShoulder : cGrass.clone().lerp(cDry, h.n).lerp(cRock, Math.min(1, Math.max(0, (Math.abs(h.y - h.ry) - 20) / 40)));
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
      const s = r() * T.L, side = r() < 0.62 ? -1 : 1, d = side * (half + 4 + Math.pow(r(), 1.6) * 140), a = at(T, s, d), h = ground(a.x, a.z);
      if (h.dist < half + 3.5) continue;
      const H = 7 + r() * 9, R = H * (0.26 + r() * 0.08);
      ps.set(a.x, h.y + H * 0.15, a.z); sc.set(0.5, H * 0.3, 0.5); M.compose(ps, q, sc); trunk.setMatrixAt(t++, M);
      for (let j = 0; j < 2; j++) { ps.set(a.x, h.y + H * (0.55 + j * 0.25), a.z); sc.set(R * (1 - j * 0.35), H * (0.6 - j * 0.15), R * (1 - j * 0.35)); M.compose(ps, q, sc); crown.setMatrixAt(c, M); crown.setColorAt(c++, cc.setHSL(0.33 + r() * 0.06, 0.35 + r() * 0.15, 0.2 + r() * 0.1)); }
    }
    crown.count = c; trunk.count = t; world.add(crown, trunk);
  }
  // far mountains, in the haze
  {
    const r = rng(T.seed + 5), mat = new THREE.MeshStandardMaterial({ color: 0x8794a6, roughness: 1, flatShading: true, fog: false });
    const cx = (lo.x + hi.x) / 2, cz = (lo.z + hi.z) / 2, span = Math.hypot(hi.x - lo.x, hi.z - lo.z) / 2;
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * Math.PI * 2 + r() * 0.2, dist = span + 650 + r() * 250, H = 150 + r() * 260;
      const m = new THREE.Mesh(new THREE.ConeGeometry(H * (1 + r()), H, 6 + Math.floor(r() * 3)), mat);
      m.position.set(cx + Math.cos(ang) * dist, T.y[Math.floor(T.L / 2)] - 60 + H / 2, cz + Math.sin(ang) * dist); m.rotation.y = r() * 6;
      world.add(m);
    }
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
    const dist = Math.sqrt(bd), ry = T.y[best];
    // which side: the mountain is to the left of the way down, the valley to the right
    const side = (x - T.x[best]) * Math.cos(T.h[best]) + (z - T.z[best]) * Math.sin(T.h[best]);
    let y = ry - 0.35;
    const out = Math.max(0, dist - half - 2.2);
    if (out > 0) y += side < 0 ? out * 0.55 + Math.pow(out / 40, 2) * 12 : -out * 0.45 - Math.pow(out / 50, 2) * 10;
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
const keys = { left: 0, right: 0, tuck: 0, slide: 0 };
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'tuck', KeyW: 'tuck', ArrowDown: 'slide', KeyS: 'slide', Space: 'slide', ShiftLeft: 'slide' };
addEventListener('keydown', function (e) { const k = KEYMAP[e.code]; if (k) { keys[k] = 1; e.preventDefault(); } });
addEventListener('keyup', function (e) { const k = KEYMAP[e.code]; if (k) keys[k] = 0; });
[['tl', 'left'], ['tr', 'right'], ['tt', 'tuck'], ['ts', 'slide']].forEach(function (b) {
  const el = $(b[0]);
  const on = function (e) { e.preventDefault(); keys[b[1]] = 1; el.classList.add('on'); }, off = function (e) { e.preventDefault(); keys[b[1]] = 0; el.classList.remove('on'); };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
});

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
    const wantYaw = p.slide * 1.25 + p.vd * 0.04;
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
  const back = at(T, p.s - 4.6 - p.v * 0.05, p.d * 0.85), look = at(T, p.s + 9, p.d * 0.7);
  const want = new THREE.Vector3(back.x, back.y + 2.0 + (p.crash ? 1.5 : 0), back.z), wantLook = new THREE.Vector3(look.x, look.y + 0.7, look.z);
  if (snap) { camPos.copy(want); camLook.copy(wantLook); }
  camPos.lerp(want, Math.min(1, dt * 5)); camLook.lerp(wantLook, Math.min(1, dt * 7));
  camera.position.copy(camPos);
  const sp = riders[0] ? p.v : 0;
  if (p.bump > 0) camera.position.y += (Math.random() - 0.5) * 0.12;
  camera.lookAt(camLook);
  camera.fov += (60 + Math.min(22, sp * 0.55) - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();
  const me = riders[0].g.position;
  sun.position.copy(me).addScaledVector(SUN_DIR, 80); sun.target.position.copy(me);
  scene.getObjectByName('sky').position.copy(camera.position);
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
      if (!BOT && !me.finished) me.input = { left: keys.left, right: keys.right, tuck: keys.tuck, slide: keys.slide };
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
