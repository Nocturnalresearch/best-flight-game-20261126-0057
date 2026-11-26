// Every tuning number and colour for Meridian Ridge Run, in one place.
// The world is a 2600 x 2600 m valley; the runway runs east-west through its
// centre and the ring course loops around the lake and the town.
export const STEP = 1 / 60;

export const WORLD = {
  size: 2600,
  half: 1300,
  waterLevel: 6,
  lake: { x: 520, z: 560, radius: 190 },
  town: { x: -480, z: 430, radius: 150 },
  runway: { x: 0, z: 0, length: 420, width: 26, headingDeg: 90 },
};

export const PLANE = {
  startX: -180,
  startZ: 0,
  startHeadingDeg: 90,
  minSpeed: 12,
  maxSpeed: 85,
  cruiseThrottle: 0.72,
  stallSpeed: 27,
  maxPitchDeg: 32,
  maxRollDeg: 65,
  throttleStep: 0.55,
  brake: 0.8,
};

export const COURSE = {
  ringRadius: 20,
  timeLimitSec: 240,
  ringPoints: 100,
  landingBonus: 250,
  timeBonusPerSec: 5,
  // Ring centres, in flying order: out east, around the lake, past the town,
  // back west and home to the runway.
  rings: [
    { x: 300, y: 62, z: 0 },
    { x: 640, y: 92, z: -170 },
    { x: 860, y: 125, z: 240 },
    { x: 480, y: 105, z: 560 },
    { x: 0, y: 135, z: 660 },
    { x: -460, y: 115, z: 360 },
    { x: -720, y: 95, z: -120 },
    { x: -360, y: 72, z: -380 },
  ],
};

export const PALETTE = {
  sky: 0x8ec1e8,
  fog: 0x9fc3e8,
  sun: 0xfff2d8,
  grassLow: 0x5d8a4a,
  grassHigh: 0x7fae5f,
  rock: 0x8a7f74,
  snow: 0xe8eef2,
  sand: 0xc9b078,
  water: 0x2f6fb2,
  asphalt: 0x33363c,
  marking: 0xf2f2e8,
  planeBody: 0xe8622c,
  planeCream: 0xf6ead2,
  planeDark: 0x2b2f36,
  ringNext: 0xffc93c,
  ringDone: 0x37d67a,
  ringLater: 0x4f8fd0,
  treeTrunk: 0x6b4a2f,
  treeTop: 0x2f6b35,
  hud: '#eaf6ff',
  hudDim: '#9fc3dd',
  hudWarn: '#ffb02e',
  hudBad: '#ff5a4e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const BEST_KEY = 'meridian-ridge-run.best';
export const MUTE_KEY = 'meridian-ridge-run.muted';
