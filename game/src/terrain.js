// The valley: one analytic height function shared by the mesh builder and the
// flight model, so the ground you see is the ground you can crash into.
// Rolling hills from layered value noise, a flat strip under the runway, a
// bowl for the lake, and a ring of high mountains at the world edge.
import * as THREE from 'three';
import { WORLD, PALETTE } from './config.js';
import { createRandom, valueNoise } from './random.js';

const NOISE_SEED = 20261126;

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(a, b, v) {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export function groundHeight(x, z) {
  // Layered hills: broad swells plus finer bumps.
  let h = 14
    + 26 * valueNoise(x, z, 420, NOISE_SEED)
    + 11 * valueNoise(x, z, 150, NOISE_SEED + 7)
    + 4 * valueNoise(x, z, 55, NOISE_SEED + 13);
  // A bowl where the lake sits.
  const lakeDx = x - WORLD.lake.x;
  const lakeDz = z - WORLD.lake.z;
  const lakeD = Math.sqrt(lakeDx * lakeDx + lakeDz * lakeDz);
  const lakeDip = smoothstep(WORLD.lake.radius + 90, WORLD.lake.radius - 40, lakeD);
  h -= lakeDip * 22;
  // Mountains rising toward the world edge.
  const edge = Math.max(Math.abs(x), Math.abs(z)) / WORLD.half;
  h += smoothstep(0.62, 1.0, edge) * 190;
  // Flatten the runway strip so takeoffs and landings are level: fully flat
  // inside the strip, easing back to the hills outside it.
  const rx = Math.abs(x - WORLD.runway.x);
  const rz = Math.abs(z - WORLD.runway.z);
  const strip = (1 - smoothstep(WORLD.runway.length / 2, WORLD.runway.length / 2 + 120, rx))
    * (1 - smoothstep(WORLD.runway.width / 2, WORLD.runway.width / 2 + 100, rz));
  h = h * (1 - strip) + 0.5 * strip;
  return h;
}

/** Is a point over the lake's water (below the water level inside the bowl)? */
export function overWater(x, z) {
  const dx = x - WORLD.lake.x;
  const dz = z - WORLD.lake.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  return d < WORLD.lake.radius && groundHeight(x, z) < WORLD.waterLevel;
}

/** Is a point on the runway strip (for landing checks)? */
export function onRunway(x, z) {
  return Math.abs(x - WORLD.runway.x) <= WORLD.runway.length / 2
    && Math.abs(z - WORLD.runway.z) <= WORLD.runway.width / 2 + 4;
}

function heightColour(h, slope, out) {
  if (h > 95) out.setHex(PALETTE.snow);
  else if (slope > 0.55) out.setHex(PALETTE.rock);
  else if (h < 0.2) out.setHex(PALETTE.sand);
  else {
    out.setHex(PALETTE.grassLow).lerp(new THREE.Color(PALETTE.grassHigh), clamp01(h / 70));
  }
  return out;
}

export function buildTerrain(seed) {
  const group = new THREE.Group();
  const rng = createRandom(seed);
  const segments = 150;
  const size = WORLD.size;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  const colour = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    const slope = Math.abs(groundHeight(x + 6, z) - h) / 6 + Math.abs(groundHeight(x, z + 6) - h) / 6;
    heightColour(h, slope, colour);
    colours[i * 3] = colour.r;
    colours[i * 3 + 1] = colour.g;
    colours[i * 3 + 2] = colour.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  ground.receiveShadow = true;
  group.add(ground);

  // The lake: a still blue disc at water level.
  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD.lake.radius, 48),
    new THREE.MeshPhongMaterial({
      color: PALETTE.water, transparent: true, opacity: 0.88, shininess: 120,
    }),
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(WORLD.lake.x, WORLD.waterLevel, WORLD.lake.z);
  group.add(lake);

  // The runway: dark asphalt, white dashes, threshold bars and edge lights.
  const rw = WORLD.runway;
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(rw.length, 0.4, rw.width),
    new THREE.MeshLambertMaterial({ color: PALETTE.asphalt }),
  );
  strip.position.set(rw.x, 0.7, rw.z);
  strip.receiveShadow = true;
  group.add(strip);
  const dashGeo = new THREE.BoxGeometry(14, 0.15, 1.6);
  const dashMat = new THREE.MeshBasicMaterial({ color: PALETTE.marking });
  for (let x = -rw.length / 2 + 25; x < rw.length / 2 - 20; x += 34) {
    const dash = new THREE.Mesh(dashGeo, dashMat);
    dash.position.set(rw.x + x, 0.95, rw.z);
    group.add(dash);
  }
  const barGeo = new THREE.BoxGeometry(2.2, 0.15, 5);
  for (const end of [-1, 1]) {
    for (let k = -2; k <= 2; k += 1) {
      const bar = new THREE.Mesh(barGeo, dashMat);
      bar.position.set(rw.x + end * (rw.length / 2 - 14), 0.95, rw.z + k * 4.4);
      group.add(bar);
    }
  }
  const lightGeo = new THREE.SphereGeometry(0.5, 8, 6);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0x7dff9e });
  for (let x = -rw.length / 2 + 8; x <= rw.length / 2 - 8; x += 28) {
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(lightGeo, lightMat);
      lamp.position.set(rw.x + x, 1.1, rw.z + side * (rw.width / 2 + 1.5));
      group.add(lamp);
    }
  }

  // Windsock beside the runway.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 9, 8),
    new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
  );
  pole.position.set(rw.x - 150, 4.5, rw.z + 34);
  group.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.4, 5, 10),
    new THREE.MeshLambertMaterial({ color: 0xff7a1a }),
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(rw.x - 147.5, 8.4, rw.z + 34);
  group.add(sock);

  // Trees: instanced cones on cylinders, kept off the runway, lake and town.
  const treeCount = 420;
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3, 6);
  const topGeo = new THREE.ConeGeometry(2.6, 8, 8);
  const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.treeTrunk });
  const topMat = new THREE.MeshLambertMaterial({ color: PALETTE.treeTop });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const tops = new THREE.InstancedMesh(topGeo, topMat, treeCount);
  const dummy = new THREE.Object3D();
  let placed = 0;
  let guard = 0;
  while (placed < treeCount && guard < treeCount * 40) {
    guard += 1;
    const x = rng.range(-WORLD.half + 60, WORLD.half - 60);
    const z = rng.range(-WORLD.half + 60, WORLD.half - 60);
    const h = groundHeight(x, z);
    if (h < WORLD.waterLevel + 1 || h > 85) continue;
    if (onRunway(x, z)) continue;
    const dx = x - WORLD.lake.x;
    const dz = z - WORLD.lake.z;
    if (Math.sqrt(dx * dx + dz * dz) < WORLD.lake.radius + 12) continue;
    const tx = x - WORLD.town.x;
    const tz = z - WORLD.town.z;
    if (Math.sqrt(tx * tx + tz * tz) < WORLD.town.radius) continue;
    const s = rng.range(0.8, 1.7);
    dummy.position.set(x, h + 1.5 * s, z);
    dummy.scale.setScalar(s);
    dummy.rotation.y = rng.range(0, Math.PI * 2);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    dummy.position.y = h + (1.5 + 4) * s;
    dummy.updateMatrix();
    tops.setMatrixAt(placed, dummy.matrix);
    placed += 1;
  }
  trunks.count = placed;
  tops.count = placed;
  trunks.castShadow = true;
  tops.castShadow = true;
  group.add(trunks);
  group.add(tops);

  // The town: a cluster of small houses and a church tower by the lake road.
  const houseColours = [0xd8c9a3, 0xc98d6b, 0x9db8c9, 0xb5a6c9, 0xd8d8d8];
  for (let i = 0; i < 42; i += 1) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(10, WORLD.town.radius);
    const x = WORLD.town.x + Math.cos(a) * r;
    const z = WORLD.town.z + Math.sin(a) * r * 0.8;
    const h = groundHeight(x, z);
    if (h < WORLD.waterLevel + 1) continue;
    const w = rng.range(7, 13);
    const d = rng.range(7, 12);
    const tall = rng.range(5, 11);
    const house = new THREE.Mesh(
      new THREE.BoxGeometry(w, tall, d),
      new THREE.MeshLambertMaterial({ color: houseColours[i % houseColours.length] }),
    );
    house.position.set(x, h + tall / 2, z);
    house.rotation.y = rng.range(0, Math.PI);
    house.castShadow = true;
    group.add(house);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(w, d) * 0.75, 3.2, 4),
      new THREE.MeshLambertMaterial({ color: 0x8a4a3a }),
    );
    roof.position.set(x, h + tall + 1.6, z);
    roof.rotation.y = Math.PI / 4 + house.rotation.y;
    group.add(roof);
  }
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(9, 26, 9),
    new THREE.MeshLambertMaterial({ color: 0xe8ddc0 }),
  );
  const towerH = groundHeight(WORLD.town.x, WORLD.town.z - 20);
  tower.position.set(WORLD.town.x, towerH + 13, WORLD.town.z - 20);
  tower.castShadow = true;
  group.add(tower);

  // Drifting clouds: soft white flattened spheres, far above the valley.
  // Unlit, so they read as bright cloud against the sky.
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 });
  const clouds = new THREE.Group();
  for (let i = 0; i < 14; i += 1) {
    const cloud = new THREE.Group();
    const puffs = rng.int(3, 5);
    for (let p = 0; p < puffs; p += 1) {
      const s = rng.range(14, 30);
      const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), cloudMat);
      puff.scale.y = 0.42;
      puff.position.set(p * rng.range(14, 22) - puffs * 9, rng.range(-3, 3), rng.range(-8, 8));
      cloud.add(puff);
    }
    cloud.position.set(rng.range(-1100, 1100), rng.range(230, 330), rng.range(-1100, 1100));
    clouds.add(cloud);
  }
  clouds.name = 'clouds';
  group.add(clouds);

  return { group, clouds };
}
