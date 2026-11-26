// The flight model: arcade, but honest. Speed follows the throttle, the
// wings bank the plane into a turn, pitch trades speed for height, and below
// stall speed the Kestrel sinks. Touch down slow and level on the runway and
// it lands; touch anything else and it crashes.
import { PLANE, COURSE, WORLD } from './config.js';
import { groundHeight, onRunway, overWater } from './terrain.js';

const DEG = Math.PI / 180;

export function wrapAngle(rad) {
  while (rad > Math.PI) rad -= Math.PI * 2;
  while (rad < -Math.PI) rad += Math.PI * 2;
  return rad;
}

export function createFlight() {
  return {
    x: PLANE.startX,
    y: groundHeight(PLANE.startX, PLANE.startZ) + 1.6,
    z: PLANE.startZ,
    heading: PLANE.startHeadingDeg * DEG,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    verticalSpeed: 0,
    airborne: false,
    landed: false,
    crashed: false,
    crashReason: '',
    onGround: true,
  };
}

/**
 * Advance the flight one fixed step. `ctl` holds the pilot's inputs:
 * pitch (-1 climb .. 1 dive), roll (-1 left .. 1 right), throttleDelta,
 * brake. Returns an event string: '' | 'takeoff' | 'landed' | 'crashed'.
 */
export function stepFlight(f, ctl, dt) {
  if (f.crashed || f.landed) return '';

  // Throttle eases toward its target; the brake cuts speed hard on the ground.
  f.throttle = Math.max(0, Math.min(1, f.throttle + ctl.throttleDelta * dt));
  const targetSpeed = PLANE.minSpeed + f.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
  const accel = f.onGround ? 14 : 9;
  f.speed += Math.max(-accel * dt, Math.min(accel * dt, targetSpeed - f.speed));
  if (ctl.brake) f.speed = Math.max(0, f.speed - PLANE.brake * 55 * dt);

  // Attitude eases toward what the stick asks for.
  const pitchTarget = -ctl.pitch * PLANE.maxPitchDeg * DEG;
  const rollTarget = ctl.roll * PLANE.maxRollDeg * DEG;
  const ease = 1 - Math.exp(-dt * 3.2);
  f.pitch += (pitchTarget - f.pitch) * ease;
  f.roll += (rollTarget - f.roll) * ease;

  // A banked turn: heading follows the roll, faster when the wings bite.
  // Roll is positive bank-right, and banking right turns the nose right,
  // which grows the heading (0 north, 90 east).
  const turnRate = (9.81 * Math.tan(f.roll)) / Math.max(f.speed, 12) * 1.15;
  f.heading = wrapAngle(f.heading + turnRate * dt);

  // Lift: the wing only holds the plane up above stall speed.
  const liftFactor = Math.max(0, Math.min(1, (f.speed - PLANE.stallSpeed * 0.55) / (PLANE.stallSpeed * 0.6)));
  const climb = Math.sin(f.pitch) * f.speed * (0.35 + 0.65 * liftFactor);
  const sink = f.speed < PLANE.stallSpeed ? (PLANE.stallSpeed - f.speed) * 0.35 : 0;
  f.verticalSpeed = climb - sink;

  const fx = Math.sin(f.heading) * Math.cos(f.pitch);
  const fz = -Math.cos(f.heading) * Math.cos(f.pitch);
  f.x += fx * f.speed * dt;
  f.z += fz * f.speed * dt;
  f.y += f.verticalSpeed * dt;

  // Soft world edge: the mountains turn the plane back instead of a wall.
  const edge = Math.max(Math.abs(f.x), Math.abs(f.z));
  if (edge > WORLD.half - 40) {
    const want = Math.atan2(-f.x, f.z);
    f.heading = wrapAngle(f.heading + wrapAngle(want - f.heading) * dt * 1.5);
  }
  if (f.y > 420) {
    f.y = 420;
    f.pitch = Math.min(f.pitch, 0);
  }

  const ground = groundHeight(f.x, f.z);
  if (!f.airborne) {
    // Rolling on the ground: stay glued to it unless fast and pulling up.
    f.y = ground + 1.6;
    f.onGround = true;
    // Pitch is positive nose-up, so a pull means pitch above +4 degrees.
    if (f.speed > PLANE.stallSpeed && f.pitch > 4 * DEG) {
      f.airborne = true;
      f.onGround = false;
      return 'takeoff';
    }
    return '';
  }
  if (f.y <= ground + 1.6) {
    f.y = ground + 1.6;
    f.onGround = true;
    f.airborne = false;
    const gentle = Math.abs(f.pitch) < 9 * DEG && Math.abs(f.roll) < 14 * DEG
      && f.speed < 46 && f.verticalSpeed > -6;
    if (onRunway(f.x, f.z) && gentle) {
      f.landed = true;
      f.pitch = 0;
      f.roll = 0;
      return 'landed';
    }
    if (overWater(f.x, f.z)) {
      f.crashed = true;
      f.crashReason = 'ditched in the lake';
    } else {
      f.crashed = true;
      f.crashReason = 'crashed into the terrain';
    }
    return 'crashed';
  }
  f.onGround = false;
  return '';
}

/** Score so far: rings flown plus bonuses added at the end of a run. */
export function scoreFor(ringsPassed, timeLeftSec, landed) {
  let score = ringsPassed * COURSE.ringPoints;
  if (ringsPassed >= COURSE.rings.length) score += Math.round(timeLeftSec) * COURSE.timeBonusPerSec;
  if (landed) score += COURSE.landingBonus;
  return score;
}
