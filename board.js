// board.js : a longboard, built from shapes: the deck (its length from the deck picked, its graphic underneath), the
// grip tape on top, two trucks, four wheels in the wheels' colour. It points down -Z; its top is at y = 0.12.
import * as THREE from 'three';

const LEN = { cruiser: 0.92, race: 1.0, drop: 1.06 };
export const GRAPHICS = ['stripes', 'flame', 'dots', 'plain'];

function deckTexture(color, graphic) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = color; x.fillRect(0, 0, 64, 256);
  x.fillStyle = 'rgba(255,255,255,0.85)';
  if (graphic === 'stripes') for (let i = 0; i < 6; i++) x.fillRect(0, 30 + i * 36, 64, 12);
  if (graphic === 'dots') for (let i = 0; i < 40; i++) { x.beginPath(); x.arc((i * 37) % 64, (i * 53) % 256, 5, 0, 7); x.fill(); }
  if (graphic === 'flame') { x.fillStyle = '#ffd23f'; for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(i * 14, 256); x.quadraticCurveTo(i * 14 + 20, 160, i * 14 + 6, 70 + i * 9); x.quadraticCurveTo(i * 14 + 14, 170, i * 14 + 14, 256); x.fill(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function makeBoard(o) {
  const L = LEN[o.deck] || 1, W = 0.25, g = new THREE.Group();
  // the deck: a rounded outline, a little thick, the tails turned up
  const s = new THREE.Shape(), hw = W / 2, hl = L / 2;
  s.moveTo(-hw, -hl + hw); s.lineTo(-hw, hl - hw); s.quadraticCurveTo(-hw, hl, 0, hl); s.quadraticCurveTo(hw, hl, hw, hl - hw);
  s.lineTo(hw, -hl + hw); s.quadraticCurveTo(hw, -hl, 0, -hl); s.quadraticCurveTo(-hw, -hl, -hw, -hl + hw);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 2, curveSegments: 8 });
  geo.rotateX(Math.PI / 2);                                      // lying flat, long along z
  // kick: bend the ends up
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i), over = Math.abs(z) - hl * 0.72; if (over > 0) p.setY(i, p.getY(i) + over * over * 2.2); }
  geo.computeVertexNormals();
  // uvs for the graphic: across x, along z
  const uv = geo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + hw) / W, (p.getZ(i) + hl) / L);
  const under = new THREE.MeshStandardMaterial({ map: deckTexture(o.color || '#e4572e', o.graphic || 'stripes'), roughness: 0.55 });
  const deck = new THREE.Mesh(geo, [new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 1 }), under]);
  // ExtrudeGeometry groups: 0 = the faces (top and bottom), 1 = the sides; the top is grip, the rest the graphic
  deck.geometry.clearGroups();
  const idx = geo.index ? geo.index.count : p.count;
  deck.geometry.addGroup(0, idx, 1);
  deck.position.y = 0.112; deck.castShadow = true;
  g.add(deck);
  const grip = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.94, L * 0.72), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 1 }));
  grip.rotation.x = -Math.PI / 2; grip.position.y = 0.1145 + 0.0; g.add(grip);
  // trucks and wheels
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8bec4, metalness: 0.8, roughness: 0.35 });
  const wheel = new THREE.MeshStandardMaterial({ color: o.wheel || '#ffd23f', roughness: 0.6 });
  const wgeo = new THREE.CylinderGeometry(0.035, 0.035, 0.05, 20); wgeo.rotateZ(Math.PI / 2);
  const wheels = [];
  [-1, 1].forEach(function (end) {
    const tz = end * hl * 0.6;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.08), metal); base.position.set(0, 0.09, tz); g.add(base);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, W * 0.95, 8), metal); axle.rotation.z = Math.PI / 2; axle.position.set(0, 0.04, tz); g.add(axle);
    const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.03), metal); hanger.position.set(0, 0.055, tz); g.add(hanger);
    [-1, 1].forEach(function (side) { const w = new THREE.Mesh(wgeo, wheel); w.position.set(side * W * 0.5, 0.035, tz); w.castShadow = true; g.add(w); wheels.push(w); });
  });
  g.userData.wheels = wheels;
  return g;
}
