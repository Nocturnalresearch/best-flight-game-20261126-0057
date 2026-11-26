// Boot and the one loop for Meridian Ridge Run. The game moves between four
// screens — title, play, paused and game over — and the world advances in
// fixed 1/60 s steps. ?seed=N fixes the valley; ?shot=takeoff|flight|ring|
// results (with &seed=N) stages that scene instead of running the loop,
// paints it twice and sets window.__shotReady for a screenshot; ?selftest=1
// runs the deterministic checks instead of the game.
import * as THREE from 'three';
import { STEP, COURSE, WORLD, PALETTE, BEST_KEY } from './config.js';
import { createRandom } from './random.js';
import { buildTerrain, groundHeight } from './terrain.js';
import { buildPlane, animatePlane } from './plane.js';
import { buildRings, refreshRings, pulseRings, ringPassed } from './rings.js';
import { createFlight, stepFlight, scoreFor } from './physics.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import {
  ACTION_CONFIRM, ACTION_PAUSE, ACTION_CAMERA, ACTION_MUTE, ACTION_RESTART, createInput,
} from './input.js';
import { stageShot } from './shots.js';
import { runSelfTest } from './selftest.js';

const MAX_FRAME = 0.25;
const DEG = Math.PI / 180;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;
const selftest = params.get('selftest') === '1';

if (selftest) {
  runSelfTest(seed);
} else {
  boot();
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage off: the best score lasts this visit only.
  }
}

function boot() {
  const canvas = document.getElementById('game');
  const status = document.getElementById('status');
  const hud = createHud(document);
  const audio = createAudio();
  const input = createInput(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 500, 2400);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x5a6b46, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 900;
  scene.add(sun);
  scene.add(sun.target);

  const { group: terrain, clouds } = buildTerrain(seed);
  scene.add(terrain);
  const { group: plane, prop, gear, navLights } = buildPlane();
  const planeObj = { group: plane, prop, gear, navLights };
  scene.add(plane);
  const { group: ringGroup, rings } = buildRings();
  scene.add(ringGroup);

  const flight = createFlight();
  let screen = 'title';
  let cameraMode = 'chase';
  let best = readBest();
  let ringsPassed = 0;
  let timeLeft = COURSE.timeLimitSec;
  let accumulator = 0;
  let last = performance.now();
  let elapsed = 0;
  let runScore = 0;

  function announce(message) {
    status.textContent = message;
  }

  function score() {
    return scoreFor(ringsPassed, timeLeft, flight.landed);
  }

  function placePlane() {
    plane.position.set(flight.x, flight.y, flight.z);
    plane.rotation.order = 'YXZ';
    plane.rotation.y = -flight.heading;
    // Nose-up is a positive rotation about the plane's local X axis: with the
    // nose along -Z, rotating +X tips -Z upward.
    plane.rotation.x = flight.pitch;
    // Bank right is a negative rotation about local Z: it drops the +X
    // (starboard) wing.
    plane.rotation.z = -flight.roll;
  }

  function forwardVector() {
    return new THREE.Vector3(
      Math.sin(flight.heading) * Math.cos(flight.pitch),
      Math.sin(flight.pitch),
      -Math.cos(flight.heading) * Math.cos(flight.pitch),
    );
  }

  function updateCamera(dt) {
    const fwd = forwardVector();
    const orbit = input.orbit();
    if (cameraMode === 'cockpit') {
      // Pilot's seat, just above the canopy: nose and propeller in frame.
      const local = new THREE.Vector3(0, 1.25, -0.2);
      const offset = local.applyEuler(plane.rotation);
      renderer.domElement.style.cursor = 'none';
      const cam = camera;
      cam.position.copy(plane.position).add(offset);
      cam.lookAt(
        plane.position.x + fwd.x * 300,
        plane.position.y + fwd.y * 300 + 6,
        plane.position.z + fwd.z * 300,
      );
      cam.fov = 72;
      cam.updateProjectionMatrix();
      return;
    }
    const dist = 15 + orbit.zoom;
    const height = 5.5 + orbit.y * 6;
    const back = new THREE.Vector3(-fwd.x, 0, -fwd.z).normalize();
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();
    const target = new THREE.Vector3(flight.x, flight.y, flight.z).addScaledVector(fwd, 18);
    const desired = new THREE.Vector3(flight.x, flight.y, flight.z)
      .addScaledVector(back, dist)
      .addScaledVector(side, orbit.x * 10)
      .add(new THREE.Vector3(0, height, 0));
    // Ease the camera so it trails the plane instead of snapping to it.
    const k = 1 - Math.exp(-dt * 5);
    camera.position.lerp(desired, k);
    camera.lookAt(target);
    camera.fov = 62;
    camera.updateProjectionMatrix();
  }

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 5000);

  function resetRun() {
    const fresh = createFlight();
    Object.assign(flight, fresh);
    ringsPassed = 0;
    timeLeft = COURSE.timeLimitSec;
    runScore = 0;
    for (const ring of rings) ring.passed = false;
    refreshRings(rings, 0);
    input.resetOrbit();
    placePlane();
    camera.position.set(flight.x - 15, flight.y + 6, flight.z + 18);
  }

  function endRun(title, detail) {
    screen = 'over';
    runScore = score();
    if (runScore > best) {
      best = runScore;
      saveBest(best);
    }
    hud.showOver(title, runScore, detail, best);
    announce(`${title}. Score ${runScore}. Best ${best}.`);
  }

  function step(dt) {
    if (screen !== 'play') return;
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      endRun('TIME UP', `${ringsPassed} of ${COURSE.rings.length} rings flown. The valley keeps its secrets.`);
      return;
    }
    const event = stepFlight(flight, input.control(), dt);
    if (ringsPassed < COURSE.rings.length
      && ringPassed(rings[ringsPassed], flight.x, flight.y, flight.z)) {
      rings[ringsPassed].passed = true;
      ringsPassed += 1;
      refreshRings(rings, ringsPassed);
      hud.showToast(`RING ${ringsPassed} — +${COURSE.ringPoints} PTS`);
      audio.ring();
      announce(`Ring ${ringsPassed} of ${COURSE.rings.length}.`);
    }
    if (event === 'takeoff') {
      hud.showToast('AIRBORNE — FLY THE RINGS');
      audio.takeoff();
    } else if (event === 'landed') {
      audio.land();
      const detail = ringsPassed >= COURSE.rings.length
        ? `All ${COURSE.rings.length} rings flown and a clean landing on the runway. Time bonus and landing bonus included.`
        : `Landed early with ${ringsPassed} of ${COURSE.rings.length} rings flown.`;
      endRun(ringsPassed >= COURSE.rings.length ? 'COURSE COMPLETE' : 'LANDED', detail);
    } else if (event === 'crashed') {
      audio.crash();
      endRun('CRASHED', `The Kestrel ${flight.crashReason} after ${ringsPassed} of ${COURSE.rings.length} rings.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      hud.showToast(muted ? 'SOUND OFF' : 'SOUND ON', 1200);
    }
    if (actions & ACTION_CAMERA && screen === 'play') {
      cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
      hud.showToast(cameraMode === 'chase' ? 'CHASE CAMERA' : 'COCKPIT CAMERA', 1200);
    }
    if (actions & ACTION_CONFIRM) {
      audio.ensure();
      if (screen === 'title' || screen === 'over') {
        resetRun();
        screen = 'play';
        hud.show('play');
        hud.showToast('FULL THROTTLE — PULL UP TO LIFT OFF', 3000);
        announce('Playing. Fly through all eight rings, then land on the runway.');
      } else if (screen === 'pause') {
        screen = 'play';
        hud.show('play');
        announce('Playing.');
      }
    }
    if (actions & ACTION_PAUSE) {
      if (screen === 'play') {
        screen = 'pause';
        hud.show('pause');
        announce('Paused.');
      } else if (screen === 'pause') {
        screen = 'play';
        hud.show('play');
        announce('Playing.');
      }
    }
    if (actions & ACTION_RESTART && (screen === 'over' || screen === 'pause')) {
      resetRun();
      screen = 'play';
      hud.show('play');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    elapsed += dt;
    handleActions();
    if (screen === 'play') {
      accumulator += dt;
      while (accumulator >= STEP) {
        step(STEP);
        accumulator -= STEP;
        if (screen !== 'play') break;
      }
    } else {
      accumulator = 0;
    }
    // The world idles behind the title screen: clouds drift, the plane waits.
    clouds.position.x = Math.sin(elapsed * 0.004) * 30;
    animatePlane(planeObj, flight.throttle, elapsed, flight.airborne);
    pulseRings(rings, ringsPassed, elapsed);
    placePlane();
    sun.position.set(flight.x + 180, flight.y + 260, flight.z + 120);
    sun.target.position.set(flight.x, flight.y, flight.z);
    updateCamera(dt);
    audio.update(flight.throttle, flight.speed);
    if (screen !== 'title') {
      hud.update(flight, ringsPassed, timeLeft, score(), ringsPassed < COURSE.rings.length ? rings[ringsPassed] : null);
    }
    renderer.render(scene, camera);
  }

  function runShotMode() {
    const staged = stageShot(shot, flight);
    ringsPassed = staged.ringsPassed ?? 0;
    for (let i = 0; i < rings.length; i += 1) rings[i].passed = i < ringsPassed;
    refreshRings(rings, ringsPassed);
    placePlane();
    camera.position.set(flight.x - 16, flight.y + 6, flight.z + 20);
    timeLeft = COURSE.timeLimitSec - Math.round((staged.score / COURSE.ringPoints) * 9);
    if (staged.screen === 'over') {
      const title = staged.landed ? 'COURSE COMPLETE' : 'CRASHED';
      const detail = staged.landed
        ? `All ${COURSE.rings.length} rings flown and a clean landing on the runway.`
        : `The Kestrel ${staged.crashReason || 'crashed'} after ${ringsPassed} of ${COURSE.rings.length} rings.`;
      hud.showOver(title, staged.score, detail, Math.max(best, staged.score));
      screen = 'over';
    } else {
      screen = 'play';
      hud.show('play');
    }
    let painted = 0;
    function paint() {
      // Snap the camera behind the plane on the first frame: the staged
      // state never moves, so an eased camera would stop halfway.
      updateCamera(1);
      pulseRings(rings, ringsPassed, 1.2);
      hud.update(flight, ringsPassed, timeLeft, staged.score, ringsPassed < COURSE.rings.length ? rings[ringsPassed] : null);
      renderer.render(scene, camera);
      painted += 1;
      if (painted < 2) requestAnimationFrame(paint);
      else window.__shotReady = true;
    }
    requestAnimationFrame(paint);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'pause';
      hud.show('pause');
      announce('Paused.');
    }
  });

  resetRun();
  if (shot) {
    runShotMode();
  } else {
    hud.show('title');
    announce('Meridian Ridge Run. Press Enter or click to start.');
    requestAnimationFrame(frame);
  }
}
