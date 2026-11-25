// toon.js : the anime look. Every lit surface is shaded in flat bands of light (cel shading), everything gets an ink
// line round its edges (found from jumps in depth), and the bright things glow (bloom). Plus the big painted-anime
// sky things: towering summer clouds and islands far out on the sea.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------- cel shading ----------
// three bands: shadow, mid, light
const ramp = (function () {
  const t = new THREE.DataTexture(new Uint8Array([105, 105, 105, 255, 185, 185, 185, 255, 255, 255, 255, 255]), 3, 1);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
})();
const done = new Map();
function toonOf(m) {
  if (!m || !m.isMeshStandardMaterial || m.userData.keep) return m;
  if (done.has(m)) return done.get(m);
  const t = new THREE.MeshToonMaterial({
    color: m.color, map: m.map, vertexColors: m.vertexColors, transparent: m.transparent, opacity: m.opacity, side: m.side,
    emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, emissiveMap: m.emissiveMap, alphaTest: m.alphaTest,
    depthWrite: m.depthWrite, fog: m.fog, gradientMap: ramp,
  });
  if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) { t.onBeforeCompile = m.onBeforeCompile; t.customProgramCacheKey = m.customProgramCacheKey; }
  t.name = m.name; done.set(m, t);
  return t;
}
export function toonify(root) {
  root.traverse(function (o) {
    if (!o.isMesh || o.userData.toon) return;
    o.userData.toon = true;
    o.material = Array.isArray(o.material) ? o.material.map(toonOf) : toonOf(o.material);
  });
}

// ---------- ink lines + bloom ----------
// The scene is drawn into a target that keeps its depth; a full-screen pass then darkens every pixel where the depth
// jumps (an object's outline against what is behind it), thinning out with distance.
class InkPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene; this.camera = camera;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.rt.depthTexture = new THREE.DepthTexture(1, 1);
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tDepth: { value: null }, texel: { value: new THREE.Vector2() }, near: { value: 0.1 }, far: { value: 1000 }, ink: { value: new THREE.Color(0x1a1f3a) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: [
        'uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel; uniform float near; uniform float far; uniform vec3 ink; varying vec2 vUv;',
        'float lin(vec2 uv){ float d = texture2D(tDepth, uv).x; return near * far / (far - d * (far - near)); }',
        'void main(){',
        '  vec4 c = texture2D(tColor, vUv);',
        '  float z = lin(vUv);',
        '  float m = 0.0;',
        '  m = max(m, abs(lin(vUv + vec2(texel.x, 0.0)) - z)); m = max(m, abs(lin(vUv - vec2(texel.x, 0.0)) - z));',
        '  m = max(m, abs(lin(vUv + vec2(0.0, texel.y)) - z)); m = max(m, abs(lin(vUv - vec2(0.0, texel.y)) - z));',
        '  float e = smoothstep(0.025, 0.08, m / z) * (1.0 - smoothstep(250.0, 1400.0, z));',
        '  c.rgb = mix(c.rgb, ink * 0.25, e * 0.85);',
        '  gl_FragColor = c;',
        '}'].join('\n'),
      depthTest: false, depthWrite: false,
    }));
  }
  setSize(w, h) { this.rt.setSize(w, h); this.quad.material.uniforms.texel.value.set(1 / w, 1 / h); }
  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this.rt); renderer.clear(); renderer.render(this.scene, this.camera);
    const u = this.quad.material.uniforms;
    u.tColor.value = this.rt.texture; u.tDepth.value = this.rt.depthTexture; u.near.value = this.camera.near; u.far.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(renderer);
  }
}
export function makeLook(renderer, scene, camera) {
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
  composer.addPass(new InkPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.5, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const size = function () { composer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 900 ? 1.5 : 2)); composer.setSize(innerWidth, innerHeight); };
  size(); addEventListener('resize', size);
  return composer;
}

// ---------- the anime sky's big things ----------
// Towering summer clouds (cumulonimbus): heaps of round puffs, bright white on the sunny side and cool blue-grey in
// shadow, with hard cel edges, kilometres away over the sea, taller than anything else in the picture.
export function makeCloudTowers(center, seaY, way, sunDir, seed) {
  let a = seed * 9301 + 49297; const r = function () { a = (a * 9301 + 49297) % 233280; return a / 233280; };
  const g = new THREE.Group();
  const puff = new THREE.IcosahedronGeometry(1, 3);
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: ramp, fog: false, emissive: 0x5d7fb8, emissiveIntensity: 0.25 });
  mat.userData.keep = true;
  const N = 1400, mesh = new THREE.InstancedMesh(puff, mat, N), M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const right = new THREE.Vector3(-way.z, 0, way.x);
  let n = 0;
  const towers = 9;
  for (let k = 0; k < towers; k++) {
    // spread across the view ahead and to the sides, far out
    const ang = (k / (towers - 1) - 0.5) * 2.6 + (r() - 0.5) * 0.25, dist = 5200 + r() * 3500;
    const base = new THREE.Vector3().copy(way).multiplyScalar(Math.cos(ang) * dist).addScaledVector(right, Math.sin(ang) * dist).add(center);
    const H = 1200 + r() * 2200, W = 500 + r() * 700;
    const per = Math.floor(N / towers);
    for (let i = 0; i < per && n < N; i++) {
      const h = Math.pow(r(), 0.8);                                     // up the tower
      const wide = W * (1 - h * 0.55) * (h > 0.85 ? 1.6 : 1);           // narrowing, then the anvil spreading at the top
      const an = r() * Math.PI * 2, rr = Math.sqrt(r()) * wide;
      const R = (90 + r() * 220) * (1 - h * 0.3);
      p.set(base.x + Math.cos(an) * rr, seaY + 150 + h * H, base.z + Math.sin(an) * rr);
      s.set(R, R * 0.85, R); M.compose(p, q, s); mesh.setMatrixAt(n++, M);
    }
  }
  mesh.count = n; mesh.frustumCulled = false; mesh.renderOrder = -0.5;
  g.add(mesh);
  // low flat clouds along the horizon, and a band of sea haze
  return g;
}

// Islands far out on the sea: steep green mountains, bluer and paler the farther they are (painted air)
export function makeIslands(center, seaY, way, seed, fogColor) {
  let a = seed * 7919 + 104729; const r = function () { a = (a * 9301 + 49297) % 233280; return a / 233280; };
  const g = new THREE.Group(), right = new THREE.Vector3(-way.z, 0, way.x);
  const near = new THREE.Color(0x3f7f5a), far = new THREE.Color(fogColor);
  for (let k = 0; k < 7; k++) {
    const ang = (r() - 0.5) * 2.4, dist = 4000 + r() * 5000, base = new THREE.Vector3().copy(way).multiplyScalar(Math.cos(ang) * dist).addScaledVector(right, Math.sin(ang) * dist).add(center);
    const geo = new THREE.ConeGeometry(1, 1, 24, 6); const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) + 0.5, x = pos.getX(i), z = pos.getZ(i), w = 1 + Math.sin(Math.atan2(z, x) * 3 + k) * 0.18 + Math.sin(y * 9 + k) * 0.06; pos.setXYZ(i, x * w, Math.pow(y, 1.3), z * w); }
    geo.computeVertexNormals();
    const tint = near.clone().lerp(far, Math.min(0.85, (dist - 2000) / 5500));
    const m = new THREE.MeshToonMaterial({ color: tint, gradientMap: ramp, fog: false }); m.userData.keep = true;
    const isl = new THREE.Mesh(geo, m), H = 250 + r() * 650, W = H * (1.4 + r() * 1.6);
    isl.scale.set(W, H, W * (0.6 + r() * 0.5)); isl.position.set(base.x, seaY - 5, base.z); isl.rotation.y = r() * 6;
    g.add(isl);
  }
  return g;
}
