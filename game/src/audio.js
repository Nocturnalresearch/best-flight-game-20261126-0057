// Synthesised sound, no audio files: a low engine drone that follows the
// throttle, wind noise that follows speed, a two-note chime for a ring and a
// low thud for a crash. Created on the first user gesture; M mutes it.
import { MUTE_KEY } from './config.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  try {
    muted = window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    muted = false;
  }

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);

    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 52;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'square';
    engineOsc2.frequency.value = 26;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineOsc2.start();

    // Wind: a looped noise buffer through a band-pass filter.
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    noise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    noise.start();
    return true;
  }

  function tone(freq, startAt, dur, type = 'sine', vol = 0.25) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ctx.currentTime + startAt);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + startAt);
    osc.stop(ctx.currentTime + startAt + dur + 0.05);
  }

  return {
    ensure,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      try {
        window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        // Storage off: the mute lasts this visit only.
      }
      if (ctx && master) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.05);
      return muted;
    },
    update(throttle, speed) {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(48 + throttle * 58, t, 0.1);
      engineOsc2.frequency.setTargetAtTime(24 + throttle * 29, t, 0.1);
      engineGain.gain.setTargetAtTime(0.05 + throttle * 0.11, t, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.16, speed * 0.0016), t, 0.15);
      windFilter.frequency.setTargetAtTime(350 + speed * 9, t, 0.15);
    },
    ring() {
      tone(880, 0, 0.28);
      tone(1318, 0.09, 0.4);
    },
    takeoff() {
      tone(392, 0, 0.2);
      tone(523, 0.08, 0.3);
    },
    crash() {
      if (!ctx || muted) return;
      tone(70, 0, 0.5, 'sine', 0.5);
      tone(48, 0.05, 0.6, 'triangle', 0.4);
    },
    land() {
      tone(523, 0, 0.2);
      tone(659, 0.1, 0.25);
      tone(784, 0.2, 0.4);
    },
  };
}
