// Deterministic self-test behind ?selftest=1&seed=N. It never opens the
// render loop: it exercises the height function, the flight model, the ring
// test, the HUD maths and the autopilot's full course, then reports the
// results on window.__selftest and in the document title.
import { STEP, COURSE } from './config.js';
import { createFlight, stepFlight } from './physics.js';
import { groundHeight, onRunway } from './terrain.js';
import { ringPassed } from './rings.js';
import { flyCourse } from './shots.js';
import { createRandom } from './random.js';

const checks = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
}

export function runSelfTest(seed) {
  // 1. The height function is deterministic and the runway is flat.
  const h1 = groundHeight(123, -456);
  const h2 = groundHeight(123, -456);
  check('terrain deterministic', h1 === h2, `h=${h1.toFixed(2)}`);
  const strip = [groundHeight(-200, 0), groundHeight(0, 0), groundHeight(200, 0), groundHeight(0, 10)];
  const flat = Math.max(...strip) - Math.min(...strip) < 0.01;
  check('runway flat', flat, strip.map((v) => v.toFixed(2)).join(','));
  check('runway test', onRunway(0, 0) && !onRunway(0, 200));

  // 2. The seeded RNG repeats itself.
  const a = createRandom(42);
  const b = createRandom(42);
  check('rng deterministic', a.next() === b.next() && a.range(0, 10) === b.range(0, 10));

  // 3. Full throttle from the runway lifts the plane off the ground.
  const f = createFlight();
  let event = '';
  for (let i = 0; i < 60 * 12 && !f.airborne; i += 1) {
    event = stepFlight(f, { pitch: -1, roll: 0, throttleDelta: 1, brake: false }, STEP);
  }
  check('takeoff', f.airborne, `event=${event} speed=${f.speed.toFixed(1)} y=${f.y.toFixed(1)}`);

  // 4. A stalled, power-off plane sinks instead of hovering.
  const g = createFlight();
  g.y = 120;
  g.speed = 10;
  g.airborne = true;
  g.onGround = false;
  const y0 = g.y;
  for (let i = 0; i < 60 * 3; i += 1) {
    stepFlight(g, { pitch: 0, roll: 0, throttleDelta: 0, brake: false }, STEP);
  }
  check('stall sinks', g.y < y0 - 5, `y ${y0.toFixed(1)} -> ${g.y.toFixed(1)}`);

  // 5. Banking right turns the nose right (heading grows toward east).
  const t = createFlight();
  t.y = 150;
  t.speed = 55;
  t.airborne = true;
  t.onGround = false;
  const h0 = t.heading;
  for (let i = 0; i < 60 * 2; i += 1) {
    stepFlight(t, { pitch: 0, roll: 1, throttleDelta: 0, brake: false }, STEP);
  }
  check('bank turns right', t.heading > h0, `heading ${(h0 * 180 / Math.PI).toFixed(1)} -> ${(t.heading * 180 / Math.PI).toFixed(1)}`);

  // 6. Ring detection: dead centre passes, fifty metres out does not.
  const ring = { def: COURSE.rings[0] };
  check('ring centre passes', ringPassed(ring, ring.def.x, ring.def.y, ring.def.z));
  check('ring far misses', !ringPassed(ring, ring.def.x + 50, ring.def.y, ring.def.z));

  // 7. The autopilot flies the whole course and lands, inside the time limit.
  const run = flyCourse(seed, () => false, COURSE.timeLimitSec);
  check(
    'autopilot completes course',
    run.ringsPassed === COURSE.rings.length,
    `${run.ringsPassed}/${COURSE.rings.length} rings, ${Math.round(run.steps * STEP)}s, ${run.event}`,
  );
  check('autopilot lands', run.landed, `event=${run.event} reason=${run.flight.crashReason || '-'}`);

  const passed = checks.filter((c) => c.ok).length;
  const result = { passed, total: checks.length, checks };
  window.__selftest = result;
  document.title = passed === checks.length
    ? `SELFTEST PASS ${passed}/${checks.length}`
    : `SELFTEST FAIL ${passed}/${checks.length}`;
  const pre = document.createElement('pre');
  pre.id = 'selftest';
  pre.style.cssText = 'position:fixed;inset:0;background:#0b1520;color:#eaf6ff;font:14px monospace;padding:24px;z-index:99;white-space:pre-wrap';
  pre.textContent = result.checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'} ${c.name} ${c.detail}`).join('\n');
  document.body.appendChild(pre);
  return result;
}
