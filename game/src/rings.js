// The ring course: eight glowing gates the pilot flies through in order.
// The next ring burns gold and pulses; passed rings turn green; later rings
// stay a calm blue. A ring counts when the plane crosses its plane within
// the hoop.
import * as THREE from 'three';
import { COURSE, PALETTE } from './config.js';

function ringLabelSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(10, 20, 34, 0.72)';
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(10, 10, 1);
  return sprite;
}

export function buildRings() {
  const group = new THREE.Group();
  const rings = COURSE.rings.map((def, index) => {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(COURSE.ringRadius, 1.5, 12, 48),
      new THREE.MeshBasicMaterial({ color: PALETTE.ringLater, transparent: true, opacity: 0.92 }),
    );
    mesh.position.set(def.x, def.y, def.z);
    // Face the ring along the course: toward the next ring (or the runway).
    const next = COURSE.rings[(index + 1) % COURSE.rings.length];
    mesh.lookAt(next.x, next.y, next.z);
    const label = ringLabelSprite(String(index + 1));
    // Below the hoop, so the badge never collides with the compass strip
    // when the ring sits high in the frame.
    label.position.set(def.x, def.y - COURSE.ringRadius - 6, def.z);
    group.add(mesh);
    group.add(label);
    return {
      index, def, mesh, label, passed: false,
    };
  });
  return { group, rings };
}

/** Recolour rings by course state: next gold, passed green, later blue. */
export function refreshRings(rings, nextIndex) {
  for (const ring of rings) {
    const colour = ring.passed
      ? PALETTE.ringDone
      : ring.index === nextIndex ? PALETTE.ringNext : PALETTE.ringLater;
    ring.mesh.material.color.setHex(colour);
  }
}

/** Pulse the next ring so it reads from far away. */
export function pulseRings(rings, nextIndex, time) {
  const ring = rings[nextIndex];
  if (!ring) return;
  const s = 1 + Math.sin(time * 4) * 0.045;
  ring.mesh.scale.setScalar(s);
}

/**
 * Has the plane flown through ring `ring`? True when the plane is inside the
 * hoop disc: within 85% of the ring radius of its centre. The torus tube sits
 * at the full radius, so this is strictly inside the gate.
 */
export function ringPassed(ring, px, py, pz) {
  const dx = px - ring.def.x;
  const dy = py - ring.def.y;
  const dz = pz - ring.def.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return dist < COURSE.ringRadius * 0.85;
}
