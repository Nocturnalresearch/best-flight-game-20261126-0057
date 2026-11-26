// The screenshot scenes behind ?shot=takeoff|flight|ring|results (with
// &seed=N). Each one flies the real rules forward from a fresh flight with a
// simple autopilot — steer at the next ring, mind the altitude — so the frame
// is what a short game really looks like, and the same seed always gives the
// same frame.
import { STEP, COURSE, WORLD, PLANE } from './config.js';
import { createFlight, stepFlight, wrapAngle } from './physics.js';
import { ringPassed } from './rings.js';
import { groundHeight } from './terrain.js';

const DEG = Math.PI / 180;

/** Steer `flight` toward a point: bank into the heading error, pitch at it.
 * `bankCap` (0..1) limits how hard the plane banks — small when close to the
 * target, so the nose stops swinging and flies straight through the ring. */
export function autopilotControl(flight, target, throttle = 0.62, bankCap = 1) {
  const dx = target.x - flight.x;
  const dz = target.z - flight.z;
  const dy = target.y - flight.y;
  const desiredHeading = Math.atan2(dx, -dz);
  const headingError = wrapAngle(desiredHeading - flight.heading);
  const horizontal = Math.max(1, Math.sqrt(dx * dx + dz * dz));
  const desiredPitch = Math.atan2(dy, horizontal);
  const roll = Math.max(-bankCap, Math.min(bankCap, headingError * 1.6));
  const pitch = Math.max(-1, Math.min(1, -desiredPitch / (PLANE.maxPitchDeg * DEG)));
  // Slow down for a hard turn so the nose can come around before the ring
  // slides past; pour it on again once lined up.
  const turnThrottle = Math.abs(headingError) > 15 * DEG ? 0.32 : throttle;
  // Ease off the throttle when diving at the target, pour it on when climbing.
  const throttleDelta = desiredPitch > 8 * DEG ? 0.5 : desiredPitch < -8 * DEG ? -0.3 : 0;
  return {
    pitch, roll, throttleDelta, brake: false,
    _throttleTarget: turnThrottle,
  };
}

function applyThrottle(flight, ctl, dt) {
  // The autopilot holds a steady throttle instead of the player's W/S keys.
  const want = ctl._throttleTarget ?? 0.78;
  flight.throttle += Math.max(-dt, Math.min(dt, want - flight.throttle));
  return { ...ctl, throttleDelta: 0 };
}

/**
 * Fly the course with the autopilot until `stop` says enough.
 * `stop(state)` receives { flight, ringsPassed, steps, event } and returns
 * true to stop. Returns the final state.
 */
export function flyCourse(seed, stop, maxSeconds = 240) {
  const flight = createFlight();
  const maxSteps = Math.floor(maxSeconds / STEP);
  let ringsPassed = 0;
  let event = '';
  let steps = 0;
  let landed = false;
  let landStage = 0; // 0: fly to the downwind point west of the runway; 1: final along it
  for (steps = 0; steps < maxSteps; steps += 1) {
    const next = COURSE.rings[ringsPassed];
    let target;
    let mode = 'course';
    let bankCap = 1;
    let slowForTurn = false;
    if (ringsPassed >= COURSE.rings.length) {
      // All rings done: line up for the runway and come home. First to a
      // downwind point west of the strip, then a long shallow final down
      // the runway itself, so the touchdown is slow, level and aligned.
      mode = 'land';
      const downwind = { x: -650, y: 40, z: 0 };
      if (landStage === 0) {
        target = downwind;
        const d = Math.sqrt(
          (flight.x - downwind.x) ** 2 + (flight.y - downwind.y) ** 2 + (flight.z - downwind.z) ** 2,
        );
        if (d < 120) landStage = 1;
      } else {
        // Final: aim at the runway's centre, at ground level, so the glide
        // stays near -5 degrees and the plane is on the strip, slow and
        // level, when the wheels meet it. (A far, high target flattens the
        // glide and carries the plane past the runway's end.)
        target = { x: 0, y: 0, z: 0 };
      }
    } else {
      // Line up on the leg into the ring with a carrot: a point on the leg
      // line 150 m ahead of the plane's projection onto it. Chasing the
      // carrot steers the plane onto the line (cross-track error becomes a
      // heading correction) instead of merely at the ring, so it threads the
      // hoop instead of orbiting it.
      const prev = ringsPassed === 0
        ? { x: PLANE.startX, y: 60, z: PLANE.startZ }
        : COURSE.rings[ringsPassed - 1];
      const legX = next.x - prev.x;
      const legZ = next.z - prev.z;
      const legLenXZ = Math.sqrt(legX * legX + legZ * legZ) || 1;
      const ux = legX / legLenXZ;
      const uz = legZ / legLenXZ;
      const distToRing = Math.sqrt(
        (next.x - flight.x) ** 2 + (next.y - flight.y) ** 2 + (next.z - flight.z) ** 2,
      );
      if (distToRing > 60) {
        let s = (flight.x - prev.x) * ux + (flight.z - prev.z) * uz;
        s = Math.max(0, Math.min(legLenXZ, s));
        target = {
          x: prev.x + ux * (s + 150),
          y: next.y,
          z: prev.z + uz * (s + 150),
        };
      } else {
        target = next;
        bankCap = 0.3;
      }
      // A sharp turn onto the next leg waits just past this ring: bleed
      // speed off on the approach so the turn after it is tight.
      if (ringsPassed + 1 < COURSE.rings.length && distToRing < 300) {
        const after = COURSE.rings[ringsPassed + 1];
        const nX = after.x - next.x;
        const nZ = after.z - next.z;
        const nLen = Math.sqrt(nX * nX + nZ * nZ) || 1;
        const dot = (ux * nX + uz * nZ) / nLen;
        if (dot < 0.64) slowForTurn = true; // turn sharper than ~50 degrees
      }
    }
    let ctl = autopilotControl(flight, target, slowForTurn ? 0.3 : mode === 'land' ? (landStage === 0 ? 0.35 : 0.22) : 0.62, bankCap);
    ctl = applyThrottle(flight, ctl, STEP);
    event = stepFlight(flight, ctl, STEP);
    if (event === 'landed') landed = true;
    if (ringsPassed < COURSE.rings.length && ringPassed(COURSE.rings[ringsPassed] && { def: COURSE.rings[ringsPassed] }, flight.x, flight.y, flight.z)) {
      ringsPassed += 1;
    }
    if (event === 'crashed' || event === 'landed') break;
    if (stop({ flight, ringsPassed, steps, event, landed })) break;
  }
  return { flight, ringsPassed, steps, event, landed };
}

/**
 * Stage a named scene into a live flight object and return the screen the
 * renderer should draw over it plus the score to show. The caller keeps
 * rendering the staged state; nothing advances after this returns.
 */
export function stageShot(name, flight) {
  if (name === 'takeoff') {
    // Rolling down the runway, just lifting off.
    const state = flyCourse(7, ({ flight: f, steps }) => f.airborne && steps > 60, 20);
    copyFlight(flight, state.flight);
    return { screen: 'play', score: 0, ringsPassed: state.ringsPassed };
  }
  if (name === 'ring') {
    // Freeze the frame on the approach to ring 3, about 50 m out: the ring
    // ahead, the plane in frame, not yet inside the hoop.
    const state = flyCourse(7, ({ flight: f, ringsPassed }) => {
      if (ringsPassed < 2) return false;
      const r = COURSE.rings[2];
      return Math.sqrt((f.x - r.x) ** 2 + (f.y - r.y) ** 2 + (f.z - r.z) ** 2) < 55;
    }, 120);
    copyFlight(flight, state.flight);
    return { screen: 'play', score: state.ringsPassed * COURSE.ringPoints, ringsPassed: state.ringsPassed };
  }
  if (name === 'results') {
    // Fly the whole course and land; a crash still ends on the results screen.
    const state = flyCourse(7, () => false, 240);
    copyFlight(flight, state.flight);
    const score = state.ringsPassed * COURSE.ringPoints + (state.landed ? COURSE.landingBonus : 0);
    return {
      screen: 'over',
      score,
      ringsPassed: state.ringsPassed,
      landed: state.landed,
      crashed: state.event === 'crashed',
      crashReason: state.flight.crashReason,
    };
  }
  // 'flight' (and any unknown name): mid-course over the valley, a little
  // past ring 2 and settled onto the leg to ring 3, so the plane flies
  // wings-level toward the next gold ring instead of mid-hard-bank.
  const state = flyCourse(7, ({ flight: f, ringsPassed, steps }) => {
    if (ringsPassed < 2 || steps <= 60 * 18) return false;
    const r2 = COURSE.rings[1];
    const legX = r2.x - COURSE.rings[0].x;
    const legZ = r2.z - COURSE.rings[0].z;
    const legLen = Math.sqrt(legX * legX + legZ * legZ) || 1;
    const along = ((f.x - r2.x) * legX + (f.z - r2.z) * legZ) / legLen;
    if (along <= 45) return false;
    const r3 = COURSE.rings[2];
    const desired = Math.atan2(r3.x - f.x, -(r3.z - f.z));
    return Math.abs(wrapAngle(desired - f.heading)) < 10 * DEG
      && Math.abs(f.roll) < 12 * DEG;
  }, 120);
  copyFlight(flight, state.flight);
  return { screen: 'play', score: state.ringsPassed * COURSE.ringPoints, ringsPassed: state.ringsPassed };
}

function copyFlight(dst, src) {
  dst.x = src.x;
  dst.y = src.y;
  dst.z = src.z;
  dst.heading = src.heading;
  dst.pitch = src.pitch;
  dst.roll = src.roll;
  dst.speed = src.speed;
  dst.throttle = src.throttle;
  dst.verticalSpeed = src.verticalSpeed;
  dst.airborne = src.airborne;
  dst.landed = src.landed;
  dst.crashed = src.crashed;
  dst.crashReason = src.crashReason;
  dst.onGround = src.onGround;
}
