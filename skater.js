// skater.js : a person on a board. The people are rigged human models (models/*.glb); they are put in a riding
// stance by turning their bones, not by animations, so the stance can follow the ride: a carve leans them in, a
// tuck folds them down, a slide drops them low with a hand on the road, a fall throws them over.
//
// Every turn of a bone is said in the person's own frame at rest: +X is their left, +Y up, +Z the way they face.
// They ride with their left side forward (regular stance), so they face the right of the road.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const PEOPLE = {
  // her skin and her clothes are one picture: only the clothes' colours (this band of hues) take the fit's colour
  maya: { name: 'Maya', file: 'models/Michelle.glb', height: 1.68, clothes: [0.1, 0.26] },
  dex:  { name: 'Dex', file: 'models/Soldier.glb', height: 1.8, clothes: [0, 1] },   // all of him is his gear
  unit: { name: 'Unit-7', file: 'models/Xbot.glb', height: 1.78 },
};

const BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];

// the poses: [x, y, z] turns in radians, in the person's rest frame
const BASE = {
  Hips: [0, 0, 0], Spine: [0.18, 0, 0], Spine1: [0.1, 0, 0], Spine2: [0.05, 0, 0], Neck: [-0.1, 0.5, 0], Head: [-0.1, 0.75, 0],
  LeftArm: [0.2, 0, -1.15], LeftForeArm: [0, 0, -0.25], RightArm: [0.25, 0, 1.2], RightForeArm: [0, 0, 0.3],
  LeftUpLeg: [-0.55, 0, 0.32], LeftLeg: [0.95, 0, 0], LeftFoot: [-0.35, -0.9, 0],
  RightUpLeg: [-0.55, 0, -0.32], RightLeg: [0.95, 0, 0], RightFoot: [-0.35, 0.9, 0],
};
const TUCK = {
  Hips: [0, 0, 0], Spine: [0.55, 0, 0.15], Spine1: [0.35, 0, 0], Spine2: [0.2, 0, 0], Neck: [-0.5, 0.55, 0], Head: [-0.4, 0.7, 0],
  LeftArm: [-0.6, 0, -1.3], LeftForeArm: [0, -0.6, 0], RightArm: [-0.6, 0, 1.3], RightForeArm: [0, 0.6, 0],
  LeftUpLeg: [-1.25, 0, 0.42], LeftLeg: [2.0, 0, 0], LeftFoot: [-0.6, -0.9, 0],
  RightUpLeg: [-1.0, 0, -0.42], RightLeg: [1.85, 0, 0], RightFoot: [-0.7, 0.9, 0],
};
const SLIDE = {
  Hips: [0, 0, 0], Spine: [0.4, 0, -0.35], Spine1: [0.2, 0, -0.15], Spine2: [0.1, 0, 0], Neck: [-0.3, 0.5, 0], Head: [-0.2, 0.7, 0],
  LeftArm: [0.3, 0, -0.6], LeftForeArm: [0, 0, -0.4], RightArm: [0.6, 0, 1.45], RightForeArm: [0, 0, 0.1],
  LeftUpLeg: [-1.3, 0, 0.5], LeftLeg: [2.1, 0, 0], LeftFoot: [-0.6, -0.9, 0],
  RightUpLeg: [-0.9, 0, -0.5], RightLeg: [1.6, 0, 0], RightFoot: [-0.5, 0.9, 0],
};
const FALL = {
  Hips: [0, 0, 0], Spine: [-0.3, 0, 0.2], Spine1: [-0.2, 0, 0], Spine2: [0, 0, 0], Neck: [0.3, 0, 0], Head: [0.2, 0.3, 0],
  LeftArm: [-1.0, 0, -0.2], LeftForeArm: [0, -1, 0], RightArm: [-1.0, 0, 0.2], RightForeArm: [0, 1, 0],
  LeftUpLeg: [-1.2, 0, 0.4], LeftLeg: [1.2, 0, 0], LeftFoot: [0, 0, 0],
  RightUpLeg: [-0.4, 0, -0.3], RightLeg: [0.4, 0, 0], RightFoot: [0, 0, 0],
};
const POSES = { base: BASE, tuck: TUCK, slide: SLIDE, fall: FALL };

const cache = {};
export function loadPeople() {
  const loader = new GLTFLoader();
  return Promise.all(Object.keys(PEOPLE).map(function (id) {
    return loader.loadAsync(new URL('./' + PEOPLE[id].file, import.meta.url).href).then(function (g) { cache[id] = g; });
  }));
}

// the clothes take the fit's colour: every pixel of the picture whose hue is in the band and that has some colour
// to it gets the fit's hue and saturation, keeping its own light and shade
function recolour(mat, tint, band) {
  const c = new THREE.Color(tint), hsl = {}; c.getHSL(hsl);
  mat.onBeforeCompile = function (sh) {
    sh.uniforms.fitHSL = { value: new THREE.Vector3(hsl.h, hsl.s, hsl.l) };
    sh.uniforms.band = { value: new THREE.Vector2(band[0], band[1]) };
    sh.fragmentShader = 'uniform vec3 fitHSL;\nuniform vec2 band;\n' +
      'vec3 rgb2hsv(vec3 c){vec4 K=vec4(0.,-1./3.,2./3.,-1.);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);float e=1.0e-10;return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x);}\n' +
      'vec3 hsv2rgb(vec3 c){vec4 K=vec4(1.,2./3.,1./3.,3.);vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);}\n' +
      sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' +
        '{ vec3 hv = rgb2hsv(diffuseColor.rgb); float inBand = step(band.x, hv.x) * step(hv.x, band.y) * step(0.25, hv.y);\n' +
        '  vec3 to = hsv2rgb(vec3(fitHSL.x, fitHSL.y, clamp(hv.z * (0.35 + fitHSL.z * 1.3), 0.0, 1.0)));\n' +
        '  diffuseColor.rgb = mix(diffuseColor.rgb, to, inBand); }');
  };
  mat.customProgramCacheKey = function () { return 'fit' + tint + band.join(','); };
}

function findBone(root, name) {
  let hit = null;
  root.traverse(function (o) { if (!hit && o.isBone && o.name.replace(/[^A-Za-z0-9]/g, '').endsWith('mixamorig' + name)) hit = o; });
  return hit;
}

// one person, dressed in `tint` (their clothes are multiplied by it), standing ready on nothing
export function makeSkater(id, tint) {
  const g = cache[id], P = PEOPLE[id];
  const body = SkeletonUtils.clone(g.scene);
  // the rest pose: the T-pose clip where there is one
  const tpose = g.animations.find(function (a) { return /tpose/i.test(a.name); });
  if (tpose) { const m = new THREE.AnimationMixer(body); m.clipAction(tpose).play(); m.update(0); m.stopAllAction(); }
  body.traverse(function (o) {
    if (o.isMesh) {
      o.castShadow = true; o.frustumCulled = false;
      o.material = o.material.clone();
      if (tint && P.clothes) recolour(o.material, tint, P.clothes);
      else if (tint && !/visor|joints/i.test(o.material.name)) o.material.color.copy(new THREE.Color(tint)).lerp(new THREE.Color(0xffffff), 0.35);
      if (/joints/i.test(o.material.name) && tint) o.material.color.set(0x222222);
    }
  });
  // size: measured standing in the rest pose
  body.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(body), h = box.max.y - box.min.y;
  const scale = P.height / h;
  const holder = new THREE.Group(), inner = new THREE.Group();
  inner.add(body); holder.add(inner);
  body.scale.multiplyScalar(scale);
  body.updateMatrixWorld(true);
  // the models do not all face the same way: turn each so its left is +X and it faces +Z, measured from its
  // shoulders, and from then on every turn is said in that frame
  const la = findBone(body, 'LeftArm').getWorldPosition(new THREE.Vector3()), ra = findBone(body, 'RightArm').getWorldPosition(new THREE.Vector3());
  const left = la.sub(ra).setY(0).normalize(), up = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3().crossVectors(left, up);
  const C = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, up, fwd));
  body.quaternion.premultiply(C.invert());
  body.updateMatrixWorld(true);
  const bodyInv = new THREE.Quaternion();
  inner.getWorldQuaternion(bodyInv); bodyInv.invert();
  const bones = {};
  BONES.forEach(function (n) {
    const b = findBone(body, n); if (!b) return;
    const pw = new THREE.Quaternion(); b.parent.getWorldQuaternion(pw); pw.premultiply(bodyInv);
    bones[n] = { bone: b, rest: b.quaternion.clone(), pw: pw, pwi: pw.clone().invert() };
  });
  const feet = [findBone(body, 'LeftFoot'), findBone(body, 'RightFoot'), findBone(body, 'LeftToeBase'), findBone(body, 'RightToeBase')].filter(Boolean);
  return { holder: holder, inner: inner, body: body, bones: bones, feet: feet, id: id, mix: { base: 1, tuck: 0, slide: 0, fall: 0 } };
}

const qa = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), box = new THREE.Box3();
// put the person in a blend of the poses. w = { base, tuck, slide, fall } (they need not add to 1), lean = how far
// they lean into a carve (+ to their toes, the right of the road), t = the clock, for a little life
export function pose(S, w, lean, t) {
  for (const n in S.bones) {
    const B = S.bones[n];
    let x = 0, y = 0, z = 0, sum = 0;
    for (const k in w) { const p = POSES[k][n]; if (!p || !w[k]) continue; x += p[0] * w[k]; y += p[1] * w[k]; z += p[2] * w[k]; sum += w[k]; }
    if (sum > 0) { x /= sum; y /= sum; z /= sum; }
    if (n === 'Spine') { x += lean * 0.25; }
    if (n === 'LeftArm' || n === 'RightArm') { z += Math.sin(t * 2.1 + (n === 'LeftArm' ? 0 : 1.3)) * 0.05; }
    e.set(x, y, z, 'YXZ'); qa.setFromEuler(e);
    // turn about axes of the rest frame: local = pw^-1 * q * pw * rest
    B.bone.quaternion.copy(B.pwi).multiply(qa).multiply(B.pw).multiply(B.rest);
  }
  // stand them on the deck: the lowest foot on it, the feet's middle over the middle of the board
  S.inner.position.set(0, 0, 0);
  S.holder.updateWorldMatrix(true, true);
  let lo = 1e9, mx = 0, mz = 0;
  const inv = new THREE.Matrix4().copy(S.holder.matrixWorld).invert();
  S.feet.forEach(function (f) { f.getWorldPosition(v); v.applyMatrix4(inv); if (v.y < lo) lo = v.y; mx += v.x; mz += v.z; });
  mx /= S.feet.length; mz /= S.feet.length;
  S.inner.position.set(-mx, -lo + 0.02, -mz);
}
