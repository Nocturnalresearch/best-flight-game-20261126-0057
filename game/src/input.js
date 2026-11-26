// Keyboard and mouse input. Arrows fly the plane (Up climbs, Down dives,
// Left/Right bank), W/S work the throttle, Space is the airbrake, C swaps
// the camera, P pauses, M mutes, R restarts, Enter confirms. Dragging with
// the mouse orbits the chase camera; the wheel zooms it.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CAMERA = 4;
export const ACTION_MUTE = 8;
export const ACTION_RESTART = 16;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let orbitX = 0;
  let orbitY = 0;
  let zoom = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function keyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'KeyC') actions |= ACTION_CAMERA;
    if (event.code === 'KeyM') actions |= ACTION_MUTE;
    if (event.code === 'KeyR') actions |= ACTION_RESTART;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  }
  function keyUp(event) {
    keys.delete(event.code);
  }
  function pointerDown(event) {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
  }
  function pointerMove(event) {
    if (!dragging) return;
    orbitX += (event.clientX - lastX) * 0.004;
    orbitY += (event.clientY - lastY) * 0.003;
    orbitX = Math.max(-0.9, Math.min(0.9, orbitX));
    orbitY = Math.max(-0.35, Math.min(0.5, orbitY));
    lastX = event.clientX;
    lastY = event.clientY;
  }
  function pointerUp() {
    dragging = false;
  }
  function wheel(event) {
    zoom = Math.max(-6, Math.min(10, zoom + Math.sign(event.deltaY)));
    event.preventDefault();
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  canvas.addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('wheel', wheel, { passive: false });

  return {
    /** Pitch -1..1 (negative climbs), roll -1..1, throttle delta, brake. */
    control() {
      const pitch = (keys.has('ArrowUp') ? -1 : 0) + (keys.has('ArrowDown') ? 1 : 0);
      const roll = (keys.has('ArrowRight') ? 1 : 0) + (keys.has('ArrowLeft') ? -1 : 0);
      const throttleDelta = (keys.has('KeyW') ? 1 : 0) * 0.55 + (keys.has('KeyS') ? -1 : 0) * 0.55;
      return {
        pitch, roll, throttleDelta, brake: keys.has('Space'),
      };
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    orbit() {
      return { x: orbitX, y: orbitY, zoom };
    },
    resetOrbit() {
      orbitX = 0;
      orbitY = 0;
      zoom = 0;
    },
  };
}
