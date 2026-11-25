// sim.js : the race, without any drawing. The hill, the racers, their boards and the computer racers' driving.
// Runs the same in the page and in node (test/sim.mjs). Everything is in metres and seconds, at a fixed 60 steps a
// second, from a seed, so a race with the same seed and the same inputs always comes out the same.
//
// A racer is where it is along the road (s, from the top) and across it (d, + is to the right), its speed v along
// the road and its sideways speed vd. Gravity pulls it down the hill, the air holds it back (less when tucked), a
// corner taken faster than its wheels can grip throws it to the outside, and a slide scrubs speed off fast.

export const STEP = 1 / 60;

export function rng(seed) {
  let a = seed >>> 0 || 1;
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ---------- the hill ----------
// A mountain road one sample a metre: where its middle is (x, y, z), which way it heads, how sharply it bends, how
// steep it is, and what is on it.
export function makeTrack(seed, length) {
  const r = rng(seed), L = length || 2600, N = L + 1;
  const x = new Float32Array(N), y = new Float32Array(N), z = new Float32Array(N), h = new Float32Array(N), k = new Float32Array(N), g = new Float32Array(N);
  // the bends: pieces of road with a curvature each, eased one into the next
  const want = new Float32Array(N), steep = new Float32Array(N);
  let s = 0, side = r() < 0.5 ? 1 : -1;
  want.fill(0, 0, 140);                                      // a straight start to push off on
  s = 140;
  // a ridge road: long straights plunging at the coast, sweepers, now and then a bend to slide; it never turns
  // far from the way down (its heading stays within about 25 degrees of the start's), so the view stays ahead
  let hd = 0;
  while (s < N) {
    const len = 60 + r() * 130, roll = r();
    let c = 0;
    if (roll < 0.35) c = 0;                                  // a straight
    else if (roll < 0.85) c = 1 / (110 + r() * 220);         // a sweeper
    else c = 1 / (45 + r() * 20);                            // a bend to slide
    side = r() < 0.7 ? -side : side;
    if (Math.abs(hd + c * side * len) > 0.42) side = -Math.sign(hd) || 1;
    const turn = Math.min(len, c > 0 ? 0.5 / c : len);       // a sharp bend is short
    const end = Math.min(N, Math.floor(s + turn));
    for (let i = Math.floor(s); i < end; i++) want[i] = c * side;
    hd += c * side * (end - Math.floor(s));
    s = end;
  }
  for (let i = N - 160; i < N; i++) want[i] = 0;             // a straight finish
  // ease: average over 40 m so no bend starts all at once
  const W = 20;
  for (let i = 0; i < N; i++) { let a = 0, n = 0; for (let j = i - W; j <= i + W; j++) if (j >= 0 && j < N) { a += want[j]; n++; } k[i] = a / n; }
  // steepness: 24 to 36 %, a ridge road diving from high above the sea to the beach (it pulls like a gentler hill:
  // see G_PULL, so the speeds stay rideable while it looks as steep as it should)
  let gr = 0.3;
  for (let i = 0; i < N; i++) { if (i % 180 === 0) gr = 0.24 + r() * 0.12; steep[i] = gr; }
  for (let i = 0; i < N; i++) { let a = 0, n = 0; for (let j = i - 60; j <= i + 60; j += 4) if (j >= 0 && j < N) { a += steep[j]; n++; } g[i] = a / n; }
  for (let i = 0; i < 40; i++) g[i] = 0.05 + (g[40] - 0.05) * i / 40;
  for (let i = N - 70; i < N; i++) g[i] = Math.max(0.02, g[i] * (N - i) / 70);   // flattening out at the beach
  // walk it
  for (let i = 1; i < N; i++) {
    h[i] = h[i - 1] + k[i - 1];
    x[i] = x[i - 1] + Math.sin(h[i - 1]);
    z[i] = z[i - 1] - Math.cos(h[i - 1]);
    y[i] = y[i - 1] - g[i - 1];
  }
  const width = 11;
  // what is on the road: cones, hay bales, gravel, potholes, a stopped car; never on the start or the finish
  const things = [];
  let at = 220;
  while (at < L - 200) {
    const kinds = ['cone', 'cone', 'cone', 'bale', 'gravel', 'hole', 'car'], kind = kinds[Math.floor(r() * kinds.length)];
    if (kind === 'cone' && r() < 0.6) {                      // a line of cones across part of the road
      const from = -width / 2 + 1 + r() * (width - 5), n = 3 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) things.push({ kind: 'cone', s: at + i * 1.5, d: from + i * 0.9, r: 0.35 });
    } else if (kind === 'car') {
      const d = (r() < 0.5 ? -1 : 1) * (width / 2 - 1.3);
      things.push({ kind: 'car', s: at, d: d, r: 1.0, len: 2.3 });
    } else if (kind === 'gravel') {
      things.push({ kind: 'gravel', s: at, d: -width / 2 + 2 + r() * (width - 4), r: 1.8, len: 6 });
    } else if (kind === 'bale') {
      things.push({ kind: 'bale', s: at, d: -width / 2 + 1.2 + r() * (width - 2.4), r: 0.8 });
    } else {
      things.push({ kind: kind, s: at, d: -width / 2 + 1 + r() * (width - 2), r: 0.5 });
    }
    at += 38 + r() * 55;
  }
  return { seed: seed, L: L, x: x, y: y, z: z, h: h, k: k, g: g, width: width, things: things };
}

// where (s, d) is in the world, and which way the road heads there
export function at(T, s, d) {
  const i = Math.max(0, Math.min(T.L - 1, Math.floor(s))), f = Math.max(0, Math.min(1, s - i));
  const hx = T.h[i] + (T.h[i + 1] - T.h[i]) * f;
  const cx = T.x[i] + (T.x[i + 1] - T.x[i]) * f, cy = T.y[i] + (T.y[i + 1] - T.y[i]) * f, cz = T.z[i] + (T.z[i + 1] - T.z[i]) * f;
  // right of the way it heads: (cos h, sin h) in x,z
  return { x: cx + Math.cos(hx) * d, y: cy, z: cz + Math.sin(hx) * d, h: hx, k: T.k[i], g: T.g[i] };
}

// ---------- the boards ----------
// What the pieces do. The deck sets how fast it turns and how steady it is; the wheels how they grip and how much
// they let go in a slide. Each is a trade: nothing is better at everything.
export const DECKS = {
  cruiser: { name: 'Cruiser 36"', turn: 1.15, steady: 0.9, drag: 1.0 },
  race:    { name: 'Race 40"', turn: 0.95, steady: 1.1, drag: 0.96 },
  drop:    { name: 'Drop-through 42"', turn: 0.88, steady: 1.2, drag: 0.93 },
};
export const WHEELS = {
  // roll: how freely they roll (more is faster on the straights)
  grip:  { name: 'Grip 78a', grip: 8.0, slide: 8.0, roll: 0.85 },
  free:  { name: 'Freeride 83a', grip: 7.2, slide: 6.6, roll: 1.0 },
  fast:  { name: 'Speed 86a', grip: 6.2, slide: 5.4, roll: 1.1 },
};

const G_PULL = 9.81 * 0.6;
const AIR = 0.0031, TUCK_AIR = 0.0021, ROLL = 0.55;

export function makeRacer(id, opts) {
  return {
    id: id, name: opts.name || 'Racer', deck: opts.deck || 'race', wheels: opts.wheels || 'free', ai: !!opts.ai, skill: opts.skill || 1,
    s: opts.s || 2, d: opts.d || 0, v: 0, vd: 0, steer: 0, tuck: 0, slide: 0, crash: 0, crashes: 0, finished: 0, place: 0,
    draft: 0, onGravel: 0, bump: 0, lastHit: -1, input: { left: 0, right: 0, tuck: 0, slide: 0 },
    lineD: opts.d || 0, think: 0,
  };
}

export function makeRace(seed, player, rivals) {
  const T = makeTrack(seed);
  const racers = [];
  // the player starts at the back in the middle, the rest in a row ahead and one beside
  const grid = [[0, -4], [-3.6, 0], [-1.2, 0], [1.2, 0], [3.6, 0], [2.8, -4], [-2.8, -4]];
  const all = [player].concat(rivals || []);
  all.forEach(function (o, i) { const g = grid[i % grid.length]; racers.push(makeRacer(i, Object.assign({}, o, { d: g[0], s: 6 + g[1] }))); });
  return { T: T, racers: racers, t: -3, done: false, order: [], rnd: rng(seed * 7 + 1) };
}

// one step of the race
export function step(R) {
  const T = R.T, dt = STEP;
  R.t += dt;
  const started = R.t >= 0;
  for (const p of R.racers) {
    if (p.ai) think(R, p);
    if (!started) { p.v = 0; continue; }
    if (p.finished) { p.v = Math.max(0, p.v - 9 * dt); p.s = Math.min(T.L - 3, p.s + p.v * dt); p.slide = p.v > 1 ? 1 : 0; p.tuck = 0; continue; }
    move(R, p, dt);
  }
  // racers bump into each other
  for (let i = 0; i < R.racers.length; i++) for (let j = i + 1; j < R.racers.length; j++) {
    const a = R.racers[i], b = R.racers[j], ds = b.s - a.s, dd = b.d - a.d;
    if (Math.abs(ds) < 1.3 && Math.abs(dd) < 0.75) {
      const push = (0.75 - Math.abs(dd)) * 0.5 * (dd >= 0 ? 1 : -1);
      a.d -= push; b.d += push; a.vd -= push * 4; b.vd += push * 4;
      const back = ds >= 0 ? a : b; back.v *= 0.985;
    }
  }
  // places: finished first by time, then by how far down
  const order = R.racers.slice().sort(function (a, b) { if (a.finished && b.finished) return a.finished - b.finished; if (a.finished) return -1; if (b.finished) return 1; return b.s - a.s; });
  order.forEach(function (p, i) { p.place = i + 1; });
  R.order = order;
  if (!R.done && R.racers[0].finished) R.done = true;
}

function move(R, p, dt) {
  const T = R.T, D = DECKS[p.deck], W = WHEELS[p.wheels], i = Math.max(0, Math.min(T.L - 1, Math.floor(p.s)));
  const inp = p.input, half = T.width / 2;
  if (p.crash > 0) {                                   // down on the road: sliding to a stop, then up again
    p.crash -= dt; p.v = Math.max(0, p.v - 14 * dt); p.s += p.v * dt; p.vd *= 0.9; p.d += p.vd * dt;
    p.d = Math.max(-half + 0.6, Math.min(half - 0.6, p.d));
    if (p.crash <= 0) { p.crash = 0; p.v = Math.max(p.v, 3); }
    return;
  }
  p.tuck += ((inp.tuck && !inp.slide ? 1 : 0) - p.tuck) * Math.min(1, dt * 6);
  p.slide += ((inp.slide ? 1 : 0) - p.slide) * Math.min(1, dt * 8);
  const steerIn = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  p.steer += (steerIn - p.steer) * Math.min(1, dt * 7);
  // along the road
  let a = G_PULL * T.g[i] - (p.tuck > 0.5 ? TUCK_AIR : AIR) * D.drag * p.v * p.v * (1 - 0.35 * p.draft) - ROLL / W.roll;
  if (R.t < 1.6 && p.v < 7) a += 4.5;                  // pushing off at the start
  if (p.slide > 0.2) a -= W.slide * p.slide;
  if (p.onGravel > 0) a -= 4;
  p.v = Math.max(0, p.v + a * dt);
  // a bend: what it takes to hold the line against what the wheels can give
  const kk = T.k[i], need = p.v * p.v * kk;            // + pulls to the left of the road when it bends right? see below
  // the road bends right when k > 0 (heading grows, the right side is the inside); holding d still needs a pull
  // to the inside of v*v*k. What the wheels cannot give throws the racer to the outside (to -d when k > 0).
  const grip = W.grip * (p.onGravel > 0 ? 0.55 : 1) * (1 + 0.35 * p.slide) * (1 - 0.12 * p.tuck);
  const over = Math.abs(need) > grip ? (Math.abs(need) - grip) * Math.sign(need) : 0;
  // steering across
  const turn = 7.5 * D.turn * (1 - 0.45 * p.tuck) * (1 + 1.0 * p.slide);   // a slide carries the board toward the side held
  p.vd += (p.steer * turn - over * 0.9) * dt;
  p.vd *= Math.pow(0.12 / D.steady, dt);               // the board straightens itself out
  const maxVd = 3.2 + p.v * 0.12;
  p.vd = Math.max(-maxVd, Math.min(maxVd, p.vd));
  p.d += p.vd * dt;
  // the inside of a bend is shorter
  p.s += p.v * dt / Math.max(0.7, 1 - kk * p.d);
  // the edge: a guard rail, it costs speed and throws the racer back
  if (p.d > half - 0.45) { p.d = half - 0.45; if (p.vd > 1.5) { p.v *= 0.86; p.bump = 0.4; } p.vd = -Math.abs(p.vd) * 0.3; }
  if (p.d < -half + 0.45) { p.d = -half + 0.45; if (p.vd < -1.5) { p.v *= 0.86; p.bump = 0.4; } p.vd = Math.abs(p.vd) * 0.3; }
  if (p.bump > 0) p.bump -= dt;
  // the things on the road
  p.onGravel = 0;
  for (let n = 0; n < T.things.length; n++) {
    const o = T.things[n], ds = o.s - p.s;
    if (ds > 4 || ds < -(o.len || 1) - 0.5) continue;
    const len = (o.len || o.r * 2) / 2;
    if (Math.abs(p.s - o.s) > len + 0.3 || Math.abs(p.d - o.d) > o.r + 0.25) continue;
    if (o.kind === 'gravel') { p.onGravel = 1; continue; }
    if (n === p.lastHit) continue;
    p.lastHit = n;
    if (o.kind === 'hole') { p.v *= 0.82; p.bump = 0.5; if (p.v > 22 && p.tuck > 0.5) fall(p); continue; }
    if (o.kind === 'cone' && p.v < 9) { p.v *= 0.9; p.bump = 0.3; continue; }
    fall(p);
  }
  // drafting: tucked in behind someone close in front
  p.draft = 0;
  for (const q of R.racers) if (q !== p && q.s - p.s > 1.5 && q.s - p.s < 12 && Math.abs(q.d - p.d) < 1.1 && !q.crash) p.draft = 1;
  if (p.s >= T.L - 40 && !p.finished) p.finished = R.t;
}

function fall(p) { p.crash = 1.6; p.crashes++; p.v *= 0.35; p.tuck = 0; p.slide = 0; }

// ---------- the computer racers ----------
// Looks down the road: slows (slides) for the bend coming if it is too fast for it, takes the inside, and steers
// round whatever is in its way. skill < 1 is slower to brake late and a little less tidy. The same driver plays
// for the player in ?bot.
export function think(R, p) {
  const T = R.T, W = WHEELS[p.wheels], half = T.width / 2;
  if (p.crash || p.finished) { p.input = { left: 0, right: 0, tuck: 0, slide: 0 }; return; }
  // the slowest speed any bend in the next stretch asks for
  let safe = 99, bendK = 0;
  const look = 20 + p.v * 2.6;
  for (let a = 4; a < look; a += 3) {
    const j = Math.min(T.L, Math.floor(p.s + a)), kk = Math.abs(T.k[j]);
    if (kk < 1e-4) continue;
    const vs = Math.sqrt(W.grip * 0.97 / kk) * (0.96 + 0.04 * p.skill);
    // can it brake to vs in the distance there is?
    const room = Math.sqrt(vs * vs + 2 * W.slide * 0.8 * Math.max(0, a - 6));
    if (room < safe) safe = room;
    if (a < 30 && Math.abs(T.k[j]) > Math.abs(bendK)) bendK = T.k[j];
  }
  // a line: the inside of the bend ahead, away from what is on the road
  p.think -= STEP;
  if (p.think <= 0) {
    p.think = 0.15;
    let best = p.d, bestCost = 1e9;
    for (let c = -half + 0.9; c <= half - 0.9; c += 0.5) {
      let cost = Math.abs(c - p.d) * 0.35;
      cost += -Math.sign(bendK) * c * (Math.abs(bendK) > 0.005 ? 0.25 : 0) * p.skill;   // the inside (k>0: right, +d)
      for (const o of T.things) {
        const ds = o.s - p.s;
        if (ds < -1 || ds > 10 + p.v * 1.6) continue;
        const gap = Math.abs(c - o.d) - o.r - 0.6;
        if (gap < 0) cost += o.kind === 'gravel' ? 6 : 40 * (1 + 1 / (1 + ds * 0.1));
        else if (gap < 0.8) cost += 3;
      }
      for (const q of R.racers) if (q !== p && q.s - p.s > 0 && q.s - p.s < 6 && Math.abs(c - q.d) < 0.9) cost += 4;
      if (cost < bestCost) { bestCost = cost; best = c; }
    }
    p.lineD = best;
  }
  const err = p.lineD - (p.d + p.vd * 0.35);
  const inp = { left: err < -0.25 ? 1 : 0, right: err > 0.25 ? 1 : 0, tuck: 0, slide: 0 };
  if (p.v > safe + 0.6 / p.skill) inp.slide = 1;
  else if (p.v < safe - 3 && Math.abs(err) < 1.2) inp.tuck = 1;
  p.input = inp;
}

// run a whole race with the computer driving everyone, for the tests and ?bot
export function runRace(R, maxSeconds) {
  const n = Math.floor((maxSeconds || 400) / STEP);
  for (let i = 0; i < n && !R.racers.every(function (p) { return p.finished; }); i++) step(R);
  return R;
}
