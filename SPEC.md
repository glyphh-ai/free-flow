# Free Flow

A downhill skateboard racing game in the browser, in 3D, free. Like Crabby Knife Fight, but a longboard down a
mountain road against five other riders.

This file is the plan: what is decided, what is built, what comes next. Built parts say so.

## The play (built)

The camera rides just behind and above the player's skater, looking down the hill. The road is a steep coast road
(14 to 26 %) dropping from the top of a green hill to a beach town by the sea: sweepers, a few tight bends,
straights diving at the water, power lines down the sea side. Gravity pulls, the air holds back. The controls are
only the two halves of the screen (or ← →):

- **hold left or right** to carve that way,
- **keep holding** (past 0.8 s) and the board kicks out into a **slide** toward that side, scrubbing speed and
  leaving urethane marks,
- **hold nothing** and the rider **tucks** for speed.

A bend taken faster than the wheels can grip throws the rider to the outside, into the guard rail. Cones, hay bales,
stopped cars, gravel and potholes are on the road: hit a bale or a car and the rider is thrown, tumbles, and gets
back on slow. Tucked in close behind another rider, the player drafts. Five computer riders race too, each with
their own gear; they brake for bends, take the inside and steer round what is in the way. First to the finish wins.

Every day there is a new hill, the same for everyone (the date is the seed). Ride again goes to the next hill.

## The feel (built)

- **Hair** streams back in the wind: strands hung from the back of the head, swung by gravity and flutter, blown
  flat behind at speed (effects.js). Maya has a long ponytail.
- **Music** for each vibe, played live with no files (music.js): Chill is lo-fi with keys and vinyl crackle, Hype is
  house, Gnarly is fast punk, Smooth is jazzy chords. It opens up (its filter rises) the faster the rider goes.
  The ♪ button turns all sound off and on, and is kept.
- **Wind**: a rushing-air sound rising with speed, anime speed lines from the edges of the screen, the edges
  darkening, streaks flying past, the camera buzzing over the asphalt.
- **Slides** leave marks in the vibe's colour and smoke; a fall throws up road dust.
- A low sun over the sea with a glow, the sky mirrored in the water.

## The skater (built)

Each player picks:

- **Skater**: Maya, Dex or Unit-7. Rigged human models (models/), put in a riding stance by turning their bones in
  code (skater.js): crouched, left foot forward, head turned down the hill; folding into the tuck; low with a hand
  out in a slide; thrown in a fall. They lean into every bend.
- **Fit**: the colour of their clothes (on Maya only the clothes change, never her skin).
- **Deck**: Cruiser (quick to turn), Race (all-round), Drop-through (steady, less air), and its colour and graphic.
- **Wheels**: Grip (holds the bends), Freeride, Speed (fastest, lets go sooner), and their colour.
- **Vibe**: Chill, Hype, Gnarly, Smooth: how much they lean and the colour of their slide marks.

The gear is a trade: across twenty hills no deck and wheels win everything (test/sim.mjs checks it). The pick is
kept on the device.

## The pieces

- `sim.js`: the race with no drawing: the hill from a seed, the physics, the computer riders. Same in node.
- `skater.js`: the people and their poses. `board.js`: the longboard. `game.js`: the 3D world, camera, menu,
  controls, sound. `index.html`: the page.
- `vendor/`: three.js (0.187) as files, no build step.
- Tests: `npm test` = `test/sim.mjs` (twenty whole races, determinism, slides, tucks, falls) and
  `test/browser.mjs` (the game in headless Chromium with no server and no port: menu, gear kept, countdown,
  steering, a whole hill to the results, a phone). Screenshots in `test/shots/`.
- `tools/pose.html`: each skater in every pose, from behind and the side, to set poses by eye.
- In the address: `?seed=N`, `?bot` (the computer rides for you), `?go` (skip the menu), `?fast=N`, `?mute`.

## Next (not built)

- Live races against real people (Crabby's `net.js` way), and a daily leaderboard per hill.
- More skaters: the three models are stand-ins from the three.js examples; real skaters (helmets, leathers,
  slide gloves, more faces and bodies) need models made or bought.
- Sign-in and saves as in the other games; a domain; deploy with a `./deploy.sh` like Crabby's.
- Tricks for style points, more places (a desert canyon, a city at night), weather.
