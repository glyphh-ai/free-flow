// node test/sim.mjs : the race without a page. Every hill, from a seed, is the same every time; the computer racers
// get down every hill in a race-like time without falling over and over; the gear is a trade (no board wins every
// hill); a slide slows a racer down; a racer that hits a hay bale falls; the finish stops them before the road ends.
import assert from 'assert';
import { makeTrack, makeRace, runRace, step, DECKS, WHEELS, STEP } from '../sim.js';

const ai = function (name, skill, deck, wheels) { return { name: name, ai: true, skill: skill, deck: deck, wheels: wheels }; };
const field = function () { return [ai('A', 0.92, 'cruiser', 'grip'), ai('B', 0.96, 'drop', 'fast'), ai('C', 1, 'race', 'grip'), ai('D', 0.9, 'race', 'fast'), ai('E', 0.94, 'drop', 'free')]; };

// the same seed, the same hill
const a = makeTrack(42), b = makeTrack(42), c = makeTrack(43);
assert.deepStrictEqual(Array.from(a.x.slice(0, 500)), Array.from(b.x.slice(0, 500)));
assert.notDeepStrictEqual(Array.from(a.x.slice(0, 2000)), Array.from(c.x.slice(0, 2000)));
assert(a.things.every(function (o) { return o.s > 200 && o.s < a.L - 180 && Math.abs(o.d) < a.width / 2; }), 'nothing on the start, the finish, or off the road');

// twenty hills, everyone driven by the computer
const times = [], wins = {};
for (let seed = 1; seed <= 20; seed++) {
  const R = runRace(makeRace(seed, ai('P', 1, 'race', 'free'), field()), 400);
  R.racers.forEach(function (p) {
    assert(p.finished > 90 && p.finished < 220, 'seed ' + seed + ' ' + p.name + ' finished in ' + p.finished);
    assert(p.crashes <= 4, 'seed ' + seed + ' ' + p.name + ' fell ' + p.crashes + ' times');
    assert(p.s <= R.T.L, 'stopped before the road ends');
    times.push(p.finished);
  });
  const w = R.order[0]; const k = w.deck + '/' + w.wheels; wins[k] = (wins[k] || 0) + 1;
}
assert(Object.keys(wins).length >= 3, 'no one set of gear wins everything: ' + JSON.stringify(wins));

// same race, same result
const r1 = runRace(makeRace(7, ai('P', 1, 'race', 'free'), field()), 400), r2 = runRace(makeRace(7, ai('P', 1, 'race', 'free'), field()), 400);
assert.deepStrictEqual(r1.racers.map(function (p) { return p.finished; }), r2.racers.map(function (p) { return p.finished; }));

// a slide slows down; a tuck goes faster
function speedAfter(input, secs) {
  const R = makeRace(5, { name: 'P' }, []); R.t = 0; const p = R.racers[0]; p.v = 20; p.s = 160;
  R.T.things.length = 0;
  for (let i = 0; i < secs / STEP; i++) { p.input = input; step(R); }
  return p.v;
}
assert(speedAfter({ slide: 1 }, 1.5) < 14, 'a slide scrubs speed');
assert(speedAfter({ tuck: 1 }, 6) > speedAfter({}, 6) + 1, 'a tuck is faster');

// a hay bale in the way: down
{
  const R = makeRace(5, { name: 'P' }, []); R.t = 0; const p = R.racers[0]; p.s = 300; p.d = 0; p.v = 15;
  R.T.things = [{ kind: 'bale', s: 304, d: 0, r: 0.8 }];
  for (let i = 0; i < 60; i++) { p.input = {}; step(R); }
  assert.strictEqual(p.crashes, 1, 'hit the bale');
}

const avg = times.reduce(function (x, y) { return x + y; }, 0) / times.length;
console.log('OK sim: 20 hills, ' + times.length + ' runs, average ' + avg.toFixed(1) + ' s, winners by gear ' + JSON.stringify(wins));
