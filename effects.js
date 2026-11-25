// effects.js : what makes the ride feel fast. Hair that streams back in the wind (strands hung from the head and
// moved by gravity, the air and the rider's speed), urethane smoke from a slide, and the sun's glow.
import * as THREE from 'three';

// ---------- hair ----------
// A ponytail of strands. Each is a chain of points: the first held at the back of the head, the rest swinging
// free (verlet), pulled down by gravity and held back by the air the rider rushes through, with a flutter.
const SEG = 9;
export function makeHair(S, color, length) {
  const head = S.bones.Head && S.bones.Head.bone;
  if (!head) return null;
  const strands = [], group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
  for (let k = 0; k < 9; k++) {
    const len = (length || 0.55) * (0.75 + Math.random() * 0.4), pts = [], prev = [];
    for (let i = 0; i < SEG; i++) { pts.push(new THREE.Vector3()); prev.push(new THREE.Vector3()); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEG * 2 * 3), 3));
    const idx = []; for (let i = 0; i < SEG - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.castShadow = true;
    group.add(mesh);
    strands.push({ pts: pts, prev: prev, seg: len / (SEG - 1), width: 0.035 + Math.random() * 0.03, off: new THREE.Vector3((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.04, 0), phase: Math.random() * 10, mesh: mesh, fresh: true });
  }
  return { head: head, top: S.bones.Head.bone, strands: strands, group: group };
}

const hp = new THREE.Vector3(), hq = new THREE.Quaternion(), up = new THREE.Vector3(), anchor = new THREE.Vector3(), tmp = new THREE.Vector3(), side = new THREE.Vector3(), camDir = new THREE.Vector3();
// back: the way the wind blows (opposite to travel, a unit vector); speed in m/s; t the clock
export function stepHair(H, back, speed, t, dt, camera) {
  if (!H) return;
  H.head.getWorldPosition(hp); H.head.getWorldQuaternion(hq);
  up.set(0, 1, 0).applyQuaternion(hq);
  dt = Math.min(dt, 1 / 20);                                     // a slow frame never flings it
  const steps = Math.max(1, Math.min(3, Math.round(dt / (1 / 60))));
  const h = dt / steps;
  camera.getWorldDirection(camDir);
  for (const s of H.strands) {
    // the tie: at the back of the head, a little up
    anchor.copy(hp).addScaledVector(up, 0.1).addScaledVector(back, 0.09);
    anchor.x += s.off.x; anchor.y += s.off.y;
    if (s.fresh) { for (let i = 0; i < SEG; i++) { s.pts[i].copy(anchor).addScaledVector(back, i * s.seg); s.prev[i].copy(s.pts[i]); } s.last = anchor.clone(); s.fresh = false; }
    // the strand rides along with the head (the rider's own motion is not the wind's): carry it by how far the head
    // moved, then let the air and gravity act on it
    tmp.subVectors(anchor, s.last); s.last.copy(anchor);
    if (tmp.lengthSq() > 400) { s.fresh = true; continue; }   // a jump (a new race): hang it afresh
    for (let i = 0; i < SEG; i++) { s.pts[i].add(tmp); s.prev[i].add(tmp); }
    for (let n = 0; n < steps; n++) {
      s.pts[0].copy(anchor); s.prev[0].copy(anchor);
      for (let i = 1; i < SEG; i++) {
        const p = s.pts[i], q = s.prev[i];
        tmp.subVectors(p, q);                                     // velocity * h
        // the air: still air, so the strand is dragged back hard at speed; a flutter that grows with speed
        const flutter = Math.sin(t * (14 + i * 3) + s.phase + i) * (0.4 + speed * 0.06);
        const wind = Math.min(60, speed * speed * 0.09);
        const ax = back.x * wind + Math.cos(t * 11 + s.phase) * flutter * 3, ay = -9.8 + Math.sin(t * 9 + s.phase * 2 + i) * flutter * 2, az = back.z * wind + Math.sin(t * 13 + s.phase) * flutter * 3;
        q.copy(p);
        p.addScaledVector(tmp, 0.94).add(tmp.set(ax * h * h, ay * h * h, az * h * h));
      }
      // keep each piece its length, and out of the head
      for (let it = 0; it < 3; it++) for (let i = 1; i < SEG; i++) {
        const a = s.pts[i - 1], b = s.pts[i]; tmp.subVectors(b, a); const d = tmp.length() || 1e-6, f = (d - s.seg) / d;
        if (i === 1) b.addScaledVector(tmp, -f); else { a.addScaledVector(tmp, f * 0.5); b.addScaledVector(tmp, -f * 0.5); }
        tmp.subVectors(b, hp); const r = tmp.length(); if (r < 0.13) b.addScaledVector(tmp, (0.13 - r) / r);
      }
      // last, from the tie down: each piece exactly its length, so it never stretches
      for (let i = 1; i < SEG; i++) { const a = s.pts[i - 1], b = s.pts[i]; tmp.subVectors(b, a); const d = tmp.length() || 1e-6; b.copy(a).addScaledVector(tmp, s.seg / d); }
    }
    // the ribbon, turned to face the camera, thinning to the ends
    const pos = s.mesh.geometry.attributes.position;
    for (let i = 0; i < SEG; i++) {
      const a = s.pts[Math.max(0, i - 1)], b = s.pts[Math.min(SEG - 1, i + 1)];
      tmp.subVectors(b, a); side.crossVectors(tmp, camDir).normalize();
      const w = s.width * (1 - i / SEG * 0.85) * (i === 0 ? 0.7 : 1);
      pos.setXYZ(i * 2, s.pts[i].x + side.x * w, s.pts[i].y + side.y * w, s.pts[i].z + side.z * w);
      pos.setXYZ(i * 2 + 1, s.pts[i].x - side.x * w, s.pts[i].y - side.y * w, s.pts[i].z - side.z * w);
    }
    pos.needsUpdate = true; s.mesh.geometry.computeVertexNormals(); s.mesh.geometry.computeBoundingSphere();
  }
}
export function resetHair(H) { if (H) H.strands.forEach(function (s) { s.fresh = true; }); }

// ---------- smoke: puffs of burnt urethane from a slide, and dust from a fall ----------
const PUFFS = 260;
export function makeSmoke() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(PUFFS * 3), life = new Float32Array(PUFFS), size = new Float32Array(PUFFS), col = new Float32Array(PUFFS * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('life', new THREE.BufferAttribute(life, 1));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { scale: { value: 600 } },
    vertexShader: 'attribute float life; attribute float size; attribute vec3 color; varying float vLife; varying vec3 vCol; uniform float scale;\n' +
      'void main(){ vLife = life; vCol = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = life > 0.0 ? size * scale / -mv.z : 0.0; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vLife; varying vec3 vCol;\n' +
      'void main(){ if (vLife <= 0.0) discard; vec2 c = gl_PointCoord - 0.5; float r = length(c); float a = smoothstep(0.5, 0.0, r) * min(1.0, vLife) * 0.55; gl_FragColor = vec4(vCol, a); }',
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
  const vel = new Float32Array(PUFFS * 3);
  let at = 0;
  return {
    points: pts,
    puff: function (x, y, z, color, vx, vy, vz, sz) {
      const i = at; at = (at + 1) % PUFFS;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
      life[i] = 1.4; size[i] = sz || 0.35; const c = new THREE.Color(color); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    },
    step: function (dt) {
      for (let i = 0; i < PUFFS; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt; size[i] += dt * 1.4;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        vel[i * 3] *= 1 - dt * 2.5; vel[i * 3 + 2] *= 1 - dt * 2.5; vel[i * 3 + 1] += dt * 0.6;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.life.needsUpdate = true; geo.attributes.size.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    },
    resize: function (h) { mat.uniforms.scale.value = h * 0.8; },
  };
}

// ---------- the sun: a bright disc with a soft glow, out over the sea ----------
export function makeSun() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,250,1)'); g.addColorStop(0.08, 'rgba(255,252,235,1)'); g.addColorStop(0.18, 'rgba(255,240,200,0.45)'); g.addColorStop(0.5, 'rgba(255,230,180,0.12)'); g.addColorStop(1, 'rgba(255,230,180,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  s.scale.set(420, 420, 1); s.renderOrder = 2;
  return s;
}
