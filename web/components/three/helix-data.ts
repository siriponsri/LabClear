/*
 * Geometry for the hero DNA helix: two strands, dotted base pairs (rungs) and a dust field.
 * Everything is built once into typed arrays; the vertex shader moves each particle from its
 * scattered start to its place on the helix, so no buffer is rewritten per frame.
 */

export const HELIX = {
  length: 22,
  radius: 2.1,
  turns: 3.2,
  perStrand: 240,
  rungs: 40,
  dotsPerRung: 9,
  dust: 900,
} as const;

/** Every fourth rung can carry a test label when the pointer comes near it. */
export const LABEL_EVERY = 4;
export const RUNG_LABELS = ["HbA1c", "LDL", "eGFR", "ALT", "TSH"] as const;

/** Small deterministic PRNG so the scatter looks the same on every visit (and in screenshots). */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type ParticleSet = {
  count: number;
  position: Float32Array;
  scatter: Float32Array;
  size: Float32Array;
  alpha: Float32Array;
  delay: Float32Array;
  kind: Float32Array;
  rung: Float32Array;
};

function alloc(count: number): ParticleSet {
  return {
    count,
    position: new Float32Array(count * 3),
    scatter: new Float32Array(count * 3),
    size: new Float32Array(count),
    alpha: new Float32Array(count),
    delay: new Float32Array(count),
    kind: new Float32Array(count),
    rung: new Float32Array(count).fill(-1),
  };
}

/** Point on strand s (0 or 1) at t in [0, 1]; the helix runs along x. */
function strandPoint(t: number, s: number, out: [number, number, number]) {
  const angle = t * HELIX.turns * Math.PI * 2 + s * Math.PI;
  out[0] = (t - 0.5) * HELIX.length;
  out[1] = Math.cos(angle) * HELIX.radius;
  out[2] = Math.sin(angle) * HELIX.radius;
  return out;
}

/** Strands and rungs share one material and one draw call. */
export function buildHelix(seed = 7): ParticleSet {
  const rand = mulberry32(seed);
  const strandCount = HELIX.perStrand * 2;
  const rungCount = HELIX.rungs * HELIX.dotsPerRung;
  const set = alloc(strandCount + rungCount);
  const p: [number, number, number] = [0, 0, 0];
  const q: [number, number, number] = [0, 0, 0];
  let i = 0;
  const scatter = (k: number) => {
    set.scatter[k * 3] = (rand() - 0.5) * 34;
    set.scatter[k * 3 + 1] = (rand() - 0.5) * 18;
    set.scatter[k * 3 + 2] = (rand() - 0.5) * 14;
  };

  for (let n = 0; n < HELIX.perStrand; n++) {
    const t = n / (HELIX.perStrand - 1);
    const fade = smooth(0, 0.07, t) * smooth(1, 0.93, t);
    for (let s = 0; s < 2; s++) {
      strandPoint(t, s, p);
      const jitter = 1 + (rand() - 0.5) * 0.05;
      set.position[i * 3] = p[0];
      set.position[i * 3 + 1] = p[1] * jitter;
      set.position[i * 3 + 2] = p[2] * jitter;
      scatter(i);
      set.size[i] = 0.85 + rand() * 0.45;
      set.alpha[i] = 0.95 * fade;
      set.delay[i] = rand() * 0.28;
      set.kind[i] = 0;
      i++;
    }
  }

  for (let r = 0; r < HELIX.rungs; r++) {
    const t = (r + 0.5) / HELIX.rungs;
    const fade = smooth(0, 0.07, t) * smooth(1, 0.93, t);
    strandPoint(t, 0, p);
    strandPoint(t, 1, q);
    for (let d = 0; d < HELIX.dotsPerRung; d++) {
      const k = (d + 1) / (HELIX.dotsPerRung + 1);
      set.position[i * 3] = p[0] + (q[0] - p[0]) * k;
      set.position[i * 3 + 1] = p[1] + (q[1] - p[1]) * k;
      set.position[i * 3 + 2] = p[2] + (q[2] - p[2]) * k;
      scatter(i);
      set.size[i] = 0.62 + rand() * 0.14;
      set.alpha[i] = 0.95 * fade;
      // Base pairs zip in from left to right after the strands have mostly arrived.
      set.delay[i] = 0.3 + t * 0.26 + rand() * 0.04;
      set.kind[i] = 1;
      set.rung[i] = r;
      i++;
    }
  }
  return set;
}

/** A slow field of fine dust around the helix (kind 2). */
export function buildDust(seed = 11): ParticleSet {
  const rand = mulberry32(seed);
  const set = alloc(HELIX.dust);
  for (let i = 0; i < HELIX.dust; i++) {
    const x = (rand() - 0.5) * 40;
    const y = (rand() - 0.5) * 20;
    const z = (rand() - 0.5) * 12 - 2;
    set.position.set([x, y, z], i * 3);
    set.scatter.set([x, y, z], i * 3);
    set.size[i] = 0.28 + rand() * 0.34;
    set.alpha[i] = 0.25 + rand() * 0.4;
    set.delay[i] = rand();
    set.kind[i] = 2;
  }
  return set;
}

/** Rung midpoints lie on the axis; labels anchor there. Returns x for each labelled rung. */
export function labelledRungs() {
  const out: { rung: number; x: number; label: string }[] = [];
  for (let r = 0, n = 0; r < HELIX.rungs; r++) {
    if (r % LABEL_EVERY !== 2) continue;
    const t = (r + 0.5) / HELIX.rungs;
    out.push({ rung: r, x: (t - 0.5) * HELIX.length, label: RUNG_LABELS[n++ % RUNG_LABELS.length] });
  }
  return out;
}

function smooth(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Static 2D projection of the same helix, for the server-rendered fallback (no JS, no WebGL). */
export function helixSvgPaths(width: number, height: number, tilt = -0.12) {
  const cx = width / 2;
  const cy = height / 2;
  const scale = width / (HELIX.length * 1.05);
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const pt = (x: number, y: number) => {
    const sx = x * scale;
    const sy = y * scale;
    return [cx + sx * cos - sy * sin, cy + sx * sin + sy * cos] as const;
  };
  const front: string[] = [];
  const back: string[] = [];
  const steps = 96;
  const p: [number, number, number] = [0, 0, 0];
  for (let n = 0; n <= steps; n++) {
    const t = n / steps;
    for (let s = 0; s < 2; s++) {
      strandPoint(t, s, p);
      // A fixed viewing angle: tip the helix so the strands cross visibly.
      const y = p[1] * 0.82 + p[2] * 0.2;
      const [x0, y0] = pt(p[0], y);
      (p[2] >= 0 ? front : back).push(`M${x0.toFixed(1)} ${y0.toFixed(1)}h0`);
    }
  }
  const rungs: string[] = [];
  const q: [number, number, number] = [0, 0, 0];
  for (let r = 0; r < HELIX.rungs; r++) {
    const t = (r + 0.5) / HELIX.rungs;
    strandPoint(t, 0, p);
    strandPoint(t, 1, q);
    const [ax, ay] = pt(p[0], p[1] * 0.82 + p[2] * 0.2);
    const [bx, by] = pt(q[0], q[1] * 0.82 + q[2] * 0.2);
    rungs.push(`M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}`);
  }
  return { front: front.join(""), back: back.join(""), rungs: rungs.join("") };
}
