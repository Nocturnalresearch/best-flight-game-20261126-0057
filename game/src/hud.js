// The HUD: altitude, speed and heading tapes, a compass strip, an artificial
// horizon with a pitch ladder, a throttle bar, and a guide arrow to the next
// ring. All of it is DOM and canvas over the 3D view, lit in a warm cyan so
// it reads against sky and ground alike.
import { COURSE } from './config.js';

const DEG = Math.PI / 180;

function headingDeg(headingRad) {
  return ((headingRad / DEG) % 360 + 360) % 360;
}

function fmt(n, digits = 0) {
  return n.toFixed(digits);
}

export function createHud(doc) {
  const el = (id) => doc.getElementById(id);
  const refs = {
    hud: el('hud'),
    score: el('hud-score'),
    rings: el('hud-rings'),
    time: el('hud-time'),
    alt: el('hud-alt'),
    spd: el('hud-spd'),
    hdg: el('hud-hdg'),
    vsi: el('hud-vsi'),
    thr: el('hud-thr'),
    thrFill: el('hud-thr-fill'),
    ringGuide: el('hud-ring'),
    ringArrow: el('hud-ring-arrow'),
    ringText: el('hud-ring-text'),
    toast: el('hud-toast'),
    compass: el('hud-compass'),
    horizon: el('hud-horizon'),
    title: el('screen-title'),
    pause: el('screen-pause'),
    over: el('screen-over'),
    overTitle: el('over-title'),
    overScore: el('over-score'),
    overDetail: el('over-detail'),
    overBest: el('over-best'),
  };
  const compassCtx = refs.compass.getContext('2d');
  const horizonCtx = refs.horizon.getContext('2d');
  const cache = new Map();
  let toastTimer = 0;

  function setText(node, value) {
    if (!node) return;
    if (cache.get(node) !== value) {
      cache.set(node, value);
      node.textContent = value;
    }
  }

  function drawCompass(headingRad) {
    const ctx = compassCtx;
    const w = refs.compass.width;
    const h = refs.compass.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(8, 18, 30, 0.85)';
    ctx.fillRect(0, 0, w, h);
    const centre = headingDeg(headingRad);
    ctx.strokeStyle = '#eaf6ff';
    ctx.fillStyle = '#eaf6ff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // One degree is this many pixels across the strip. Walk absolute degrees
    // across the visible window so the 30-degree labels always land on the
    // strip, whatever the heading's fractional part is.
    const pxPerDeg = w / 120;
    const first = Math.ceil((centre - 60) / 5) * 5;
    for (let deg = first; deg <= centre + 60; deg += 5) {
      const norm = ((deg % 360) + 360) % 360;
      const x = w / 2 + (deg - centre) * pxPerDeg;
      const major = norm % 30 === 0;
      ctx.globalAlpha = major ? 1 : 0.55;
      ctx.beginPath();
      ctx.moveTo(x, major ? 6 : 12);
      ctx.lineTo(x, 20);
      ctx.stroke();
      if (major) {
        const label = norm === 0 ? 'N' : norm === 90 ? 'E' : norm === 180 ? 'S' : norm === 270 ? 'W' : String(norm);
        ctx.fillText(label, x, 32);
      }
    }
    ctx.globalAlpha = 1;
    // Centre caret and the current heading below it.
    ctx.fillStyle = '#ffc93c';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 7, 0);
    ctx.lineTo(w / 2 + 7, 0);
    ctx.lineTo(w / 2, 8);
    ctx.closePath();
    ctx.fill();
  }

  function drawHorizon(pitchRad, rollRad) {
    const ctx = horizonCtx;
    const w = refs.horizon.width;
    const h = refs.horizon.height;
    const cx = w / 2;
    const cy = h / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, w / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-rollRad);
    const pitchPx = (pitchRad / DEG) * 2.2;
    ctx.translate(0, pitchPx);
    // Sky above the line, ground below it.
    ctx.fillStyle = '#3f7fc4';
    ctx.fillRect(-w, -h, w * 2, h);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-w, 0, w * 2, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.lineTo(w, 0);
    ctx.stroke();
    // Pitch ladder every 10 degrees.
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    for (const deg of [-20, -10, 10, 20]) {
      const y = -deg * 2.2;
      const len = deg % 20 === 0 ? 34 : 20;
      ctx.beginPath();
      ctx.moveTo(-len, y);
      ctx.lineTo(len, y);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(Math.abs(deg)), len + 4, y + 4);
    }
    ctx.restore();
    // Fixed aircraft symbol: the wings stay level while the world rolls.
    ctx.strokeStyle = '#ffc93c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 34, cy);
    ctx.lineTo(cx - 10, cy);
    ctx.moveTo(cx + 10, cy);
    ctx.lineTo(cx + 34, cy);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + 6);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, w / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  return {
    refs,
    show(screen) {
      for (const name of ['title', 'pause', 'over']) {
        refs[name].classList.toggle('hidden', name !== screen);
      }
      refs.hud.classList.toggle('hidden', screen === 'title');
    },
    showToast(text, ms = 2200) {
      refs.toast.textContent = text;
      refs.toast.classList.remove('hidden');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => refs.toast.classList.add('hidden'), ms);
    },
    update(f, ringsPassed, timeLeft, score, nextRing) {
      const altFt = Math.max(0, (f.y - 0.5) * 3.28084);
      const kts = Math.max(0, f.speed * 1.94384);
      const vsiFpm = f.verticalSpeed * 196.85;
      setText(refs.score, `SCORE ${score}`);
      setText(refs.rings, `RINGS ${ringsPassed}/${COURSE.rings.length}`);
      const t = Math.max(0, Math.ceil(timeLeft));
      setText(refs.time, `TIME ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
      setText(refs.alt, `ALT ${fmt(altFt)} FT`);
      setText(refs.spd, `SPD ${fmt(kts)} KT`);
      setText(refs.hdg, `HDG ${String(Math.round(headingDeg(f.heading))).padStart(3, '0')}°`);
      const vsiSign = vsiFpm >= 0 ? '+' : '';
      setText(refs.vsi, `V/S ${vsiSign}${fmt(vsiFpm)} FPM`);
      setText(refs.thr, `THR ${Math.round(f.throttle * 100)}%`);
      refs.thrFill.style.height = `${Math.round(f.throttle * 100)}%`;
      refs.time.classList.toggle('warn', timeLeft < 30);
      if (nextRing) {
        const dx = nextRing.def.x - f.x;
        const dz = nextRing.def.z - f.z;
        const dist = Math.sqrt(dx * dx + dz * dz + (nextRing.def.y - f.y) ** 2);
        const desired = Math.atan2(dx, -dz);
        const rel = ((desired - f.heading) / DEG + 540) % 360 - 180;
        refs.ringArrow.style.transform = `rotate(${rel}deg)`;
        setText(refs.ringText, `RING ${nextRing.index + 1} · ${fmt(dist)} M`);
        refs.ringGuide.classList.remove('hidden');
      } else {
        refs.ringGuide.classList.add('hidden');
      }
      drawCompass(f.heading);
      drawHorizon(f.pitch, f.roll);
    },
    showOver(title, score, detail, best) {
      setText(refs.overTitle, title);
      setText(refs.overScore, `SCORE ${score}`);
      setText(refs.overDetail, detail);
      setText(refs.overBest, `BEST ${best}`);
      this.show('over');
    },
  };
}
