// music.js : the soundtrack, played live in WebAudio, no files. Each vibe has its own: Chill is a lo-fi beat with
// warm keys and vinyl crackle, Hype is house, Gnarly is fast punk, Smooth is late-night jazz chords. The faster the
// rider goes, the more the music opens up (its filter rises).
const VIBES = {
  // bpm, swing, chords (MIDI notes, one chord a bar), the drum pattern (16 steps: k kick, s snare, h hat, o open hat)
  chill:  { bpm: 82, swing: 0.18, keys: 'rhodes', drive: 0, chords: [[53, 57, 60, 64, 67], [52, 55, 59, 62], [50, 53, 57, 60, 64], [48, 52, 55, 59]],
            drums: 'k......k..k.....|....s.......s...|h.h.h.h.h.h.h.h.', bass: [41, 40, 38, 36], crackle: 1, cut: [900, 3200] },
  hype:   { bpm: 124, swing: 0, keys: 'stab', drive: 0.2, chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]],
            drums: 'k...k...k...k...|....s.......s...|..o...o...o...o.', bass: [45, 41, 43, 40], offBass: 1, crackle: 0, cut: [700, 6000] },
  gnarly: { bpm: 168, swing: 0, keys: 'power', drive: 0.9, chords: [[40, 47, 52], [43, 50, 55], [45, 52, 57], [38, 45, 50]],
            drums: 'k.k...k.k.k...k.|....s.......s...|h.h.h.h.h.h.h.h.', bass: [28, 31, 33, 26], crackle: 0, cut: [1400, 7000] },
  smooth: { bpm: 92, swing: 0.25, keys: 'rhodes', drive: 0, chords: [[50, 53, 57, 60, 64], [43, 53, 59, 64], [48, 52, 55, 59, 62], [45, 49, 55, 58]],
            drums: 'k.....k...k.....|....s.......s...|h..h..h.h..h..h.', bass: [38, 31, 36, 33], crackle: 1, cut: [1100, 4200] },
};
const hz = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };

export function makeMusic(ac, out) {
  const bus = ac.createGain(); bus.gain.value = 0;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
  bus.connect(lp); lp.connect(out);
  let V = VIBES.chill, step = 0, nextAt = 0, timer = 0, playing = false, bar = 0;
  const noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const shaper = ac.createWaveShaper(); shaper.curve = (function () { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = Math.tanh(x * 6); } return c; })();
  const fuzz = ac.createGain(); fuzz.gain.value = 0.25; shaper.connect(fuzz); fuzz.connect(bus);

  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function noiseHit(t, type, f, q, peak, d) {
    const s = ac.createBufferSource(); s.buffer = noise; const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ac.createGain(); env(g, t, 0.002, peak, d); s.connect(fl); fl.connect(g); g.connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.05);
  }
  function kick(t) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14); env(g, t, 0.003, 0.9, 0.32); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.4); }
  function snare(t) { noiseHit(t, 'bandpass', 1900, 0.9, V.keys === 'power' ? 0.7 : 0.45, 0.16); const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 190; env(g, t, 0.002, 0.25, 0.09); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.12); }
  function hat(t, open) { noiseHit(t, 'highpass', 7500, 0.5, open ? 0.16 : 0.1, open ? 0.22 : 0.04); }
  function note(t, m, len, kind) {
    const g = ac.createGain();
    if (kind === 'rhodes') {
      [1, 2, 3].forEach(function (h, i) { const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = hz(m) * h; o.detune.value = (Math.random() - 0.5) * 8; const gg = ac.createGain(); gg.gain.value = [0.5, 0.18, 0.05][i]; o.connect(gg); gg.connect(g); o.start(t); o.stop(t + len + 0.6); });
      env(g, t, 0.012, 0.11, len + 0.5); g.connect(bus);
    } else if (kind === 'stab') {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(400, t + 0.2);
      o.connect(f); f.connect(g); env(g, t, 0.005, 0.08, 0.2); g.connect(bus); o.start(t); o.stop(t + 0.3);
    } else if (kind === 'power') {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.connect(g); env(g, t, 0.005, 0.35, len); g.connect(shaper); o.start(t); o.stop(t + len + 0.05);
    } else if (kind === 'bass') {
      const o = ac.createOscillator(); o.type = V.keys === 'power' ? 'sawtooth' : 'triangle'; o.frequency.value = hz(m); o.connect(g); env(g, t, 0.008, V.keys === 'power' ? 0.2 : 0.4, len); g.connect(V.keys === 'power' ? shaper : bus); o.start(t); o.stop(t + len + 0.05);
    }
  }
  function crackle(t, len) { for (let i = 0; i < 6; i++) if (Math.random() < 0.7) noiseHit(t + Math.random() * len, 'highpass', 2500 + Math.random() * 3000, 1, 0.05 + Math.random() * 0.08, 0.004); }

  function play(t) {
    const sixteenth = 60 / V.bpm / 4, i = step % 16, ch = V.chords[bar % V.chords.length], rows = V.drums.split('|');
    const intro = bar < 2;                                       // two bars of keys alone first
    if (!intro) {
      if (rows[0][i] === 'k') kick(t);
      if (rows[1][i] === 's') snare(t);
      if (rows[2][i] === 'h') hat(t, false); else if (rows[2][i] === 'o') hat(t, true);
    }
    if (V.keys === 'rhodes' && (i === 0 || (i === 10 && bar % 2))) ch.forEach(function (m, j) { note(t + j * 0.012, m, i === 0 ? sixteenth * 9 : sixteenth * 5, 'rhodes'); });
    if (V.keys === 'stab' && [2, 6, 10, 14].indexOf(i) >= 0) ch.forEach(function (m) { note(t, m + 12, 0.15, 'stab'); });
    if (V.keys === 'power' && !intro && i % 2 === 0) ch.forEach(function (m) { note(t, m, sixteenth * 1.8, 'power'); });
    if (V.keys === 'power' && intro && i === 0) ch.forEach(function (m) { note(t, m, sixteenth * 14, 'power'); });
    const root = V.bass[bar % V.bass.length];
    if (!intro) {
      if (V.offBass) { if (i % 4 === 2) note(t, root, sixteenth * 1.5, 'bass'); }
      else if (V.keys === 'power') { if (i % 2 === 0) note(t, root, sixteenth * 1.7, 'bass'); }
      else if (i === 0 || i === 7 || i === 10) note(t, i === 7 ? root + 7 : root, sixteenth * (i === 0 ? 5 : 2.5), 'bass');
    }
    if (V.crackle && i === 0) crackle(t, sixteenth * 16);
    step++; if (step % 16 === 0) bar++;
    const swing = (step % 2) ? V.swing * sixteenth : -V.swing * sixteenth;
    return sixteenth + swing;
  }
  function tick() {
    while (nextAt < ac.currentTime + 0.25) nextAt += play(Math.max(nextAt, ac.currentTime + 0.01));
  }
  return {
    start: function (vibe) {
      V = VIBES[vibe] || VIBES.chill; step = 0; bar = 0; nextAt = ac.currentTime + 0.1;
      fuzz.gain.value = V.drive ? 0.25 : 0;
      bus.gain.cancelScheduledValues(ac.currentTime); bus.gain.setValueAtTime(0.0001, ac.currentTime); bus.gain.exponentialRampToValueAtTime(0.55, ac.currentTime + 1.5);
      if (!playing) { playing = true; timer = setInterval(tick, 60); }
      tick();
    },
    stop: function () { bus.gain.cancelScheduledValues(ac.currentTime); bus.gain.setTargetAtTime(0.0001, ac.currentTime, 0.4); setTimeout(function () { clearInterval(timer); playing = false; }, 1500); },
    // 0..1: how fast the rider is going; the faster, the brighter
    speed: function (x) { lp.frequency.setTargetAtTime(V.cut[0] + (V.cut[1] - V.cut[0]) * Math.min(1, Math.max(0, x)), ac.currentTime, 0.3); },
    get playing() { return playing; },
  };
}
