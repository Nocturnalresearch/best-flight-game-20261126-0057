// The Kestrel: a small single-prop bush plane built from primitives, nose
// pointing along local -Z so rotation.y = -heading flies it where it points.
// The propeller spins, the nav lights blink, and the landing gear folds up
// once the wheels leave the runway.
import * as THREE from 'three';
import { PALETTE } from './config.js';

export function buildPlane() {
  const group = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: PALETTE.planeBody });
  const cream = new THREE.MeshLambertMaterial({ color: PALETTE.planeCream });
  const dark = new THREE.MeshLambertMaterial({ color: PALETTE.planeDark });
  const glass = new THREE.MeshPhongMaterial({
    color: 0x18242e, shininess: 160, specular: 0x99ccff,
  });

  // Fuselage: a tapered cylinder along Z, nose at -Z.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.95, 5.4, 12), body);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.castShadow = true;
  group.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.4, 12), cream);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -3.4;
  nose.castShadow = true;
  group.add(nose);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.6, 12), cream);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 3.4;
  group.add(tail);

  // Canopy: a dark glass bubble the pilot sits under.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 10), glass);
  canopy.scale.set(0.9, 0.75, 1.7);
  canopy.position.set(0, 0.62, -0.9);
  group.add(canopy);

  // Main wing and tailplane: flattened boxes with a cream stripe.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.22, 1.7), cream);
  wing.position.set(0, 0.12, -0.4);
  wing.castShadow = true;
  group.add(wing);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(11.05, 0.06, 0.3), body);
  stripe.position.set(0, 0.25, -0.4);
  group.add(stripe);
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 1.1), cream);
  tailplane.position.set(0, 0.35, 3.2);
  group.add(tailplane);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.7, 1.4), body);
  fin.position.set(0, 0.95, 3.2);
  group.add(fin);

  // Propeller: hub plus two blades, spinning around the nose axis.
  const prop = new THREE.Group();
  prop.position.z = -4.2;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 10), dark);
  hub.rotation.x = Math.PI / 2;
  prop.add(hub);
  const bladeGeo = new THREE.BoxGeometry(0.32, 3.4, 0.1);
  for (const angle of [0, Math.PI]) {
    const blade = new THREE.Mesh(bladeGeo, dark);
    blade.rotation.z = angle;
    blade.position.y = 0;
    prop.add(blade);
  }
  // The two blades form one cross: rotate the second pair by 90 degrees.
  const blade2 = new THREE.Mesh(bladeGeo, dark);
  blade2.rotation.z = Math.PI / 2;
  prop.add(blade2);
  group.add(prop);

  // Landing gear: two fixed legs with wheels, hidden once airborne.
  const gear = new THREE.Group();
  const legGeo = new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, dark);
    leg.position.set(side * 0.85, -0.9, -0.6);
    leg.rotation.z = side * 0.25;
    gear.add(leg);
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.position.set(side * 1.05, -1.45, -0.6);
    wheel.castShadow = true;
    gear.add(wheel);
  }
  group.add(gear);

  // Navigation lights: red port, green starboard, white tail.
  const navLights = {};
  const lightGeo = new THREE.SphereGeometry(0.14, 8, 6);
  const mkLight = (color, x, y, z) => {
    const m = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  navLights.port = mkLight(0xff2a2a, -5.55, 0.12, -0.4);
  navLights.starboard = mkLight(0x2aff66, 5.55, 0.12, -0.4);
  navLights.tail = mkLight(0xffffff, 0, 0.4, 4.15);

  return { group, prop, gear, navLights };
}

/** Spin the propeller by throttle and blink the nav lights. */
export function animatePlane(plane, throttle, time, airborne) {
  plane.prop.rotation.z -= (4 + throttle * 42) * (1 / 60);
  const blink = Math.sin(time * 5) > 0;
  plane.navLights.tail.visible = blink;
  plane.gear.visible = !airborne;
}
