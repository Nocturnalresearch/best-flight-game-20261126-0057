# Meridian Ridge Run

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Nocturnalresearch/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Nocturnalresearch/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

A Three.js flight game. You fly the Kestrel, a single-prop bush plane, out of a mountain valley: full throttle down the runway, pull up, and thread all eight glowing rings — over the lake, past the town, around the ridge — then bring her home for a landing on the same runway. The valley is procedural (seeded hills, a lake, a town, drifting clouds), the plane banks into its turns and sinks below stall speed, and the cockpit view puts the nose, the spinning propeller and the lit instruments in frame.

## How to play

- **↑ / ↓** climb and dive · **← / →** bank and turn
- **W / S** throttle up and down · **Space** airbrake
- **C** swaps chase and cockpit camera · **drag** looks around · **wheel** zooms
- **P** pauses · **M** mutes · **R** restarts from the results screen

Fly through a ring to score 100 points. Finish all eight rings and land cleanly on the runway for a 250-point landing bonus plus 5 points per second left on the clock. Touch terrain or ditch in the lake and the run ends; run out of time and it ends too. The HUD shows altitude (feet), speed (knots), heading, vertical speed, throttle, a compass strip, an artificial horizon, and a guide arrow with the distance to the next ring.

## Run locally

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. No build step, no network requests — the game is plain static files under `game/`, with Three.js vendored under `game/vendor/three/`.

## Shots and self-test

- `?shot=takeoff&seed=7`, `?shot=flight&seed=7`, `?shot=ring&seed=7`, `?shot=results&seed=7` stage the four screenshot scenes with a built-in autopilot flying the real rules.
- `?selftest=1&seed=7` runs the deterministic checks (terrain, takeoff, stall, turns, ring detection, full autopilot course and landing) and reports on `window.__selftest`.
