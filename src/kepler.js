/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║              Kepler Orbital Engine  —  v2.3                        ║
 * ║      Động lực học quỹ đạo thiên thể (Keplerian Two-Body)           ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║  Nâng cấp so với v2.1:                                             ║
 * ║  • FAST-PATH Low Eccentricity (e < 0.15): 1 bước Newton-Raphson    ║
 * ║  • Giải lượng giác tích hợp solveKeplerSinCos tránh gọi trùng lặp   ║
 * ║  • Cải tiến thuộc tính ẩn _keplerCache bypass cấu trúc WeakMap      ║
 * ║  • Zero Allocation với bộ đệm scratchSinCos cho hot path           ║
 * ║  Nâng cấp v2.3:                                                    ║
 * ║  • Fast-path e<0.15: 1 trig + cập nhật sin/cos tuyến tính        ║
 * ║  • sampleOrbitPath: điểm đóng + tham số revolutions              ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import { getDisplayOrbitRadius } from './orbitMath.js';

// ─────────────────────────────────────────────────────────────────────────────
// Hằng số nội bộ & Bộ đệm dùng lại
// ─────────────────────────────────────────────────────────────────────────────

const TWO_PI      = 2 * Math.PI;
const INV_TWO_PI  = 1 / TWO_PI;
const DEG_TO_RAD  = Math.PI / 180;
const SECONDS_PER_DAY = 86400;

// Bộ đệm dùng lại để trả về sin(E) và cos(E) mà không gây rác bộ nhớ (Zero Allocation)
export const scratchSinCos = { sinE: 0, cosE: 0 };

/** Ngưỡng fast-path: một bước NR + cập nhật sin/cos tuyến tính (đủ chính xác cho hành tinh). */
const LOW_ECC_THRESHOLD = 0.15;

// ─────────────────────────────────────────────────────────────────────────────
// § 1. LUT cho initial guess — linear interpolation, cả sin lẫn cos
// ─────────────────────────────────────────────────────────────────────────────

const LUT_SIZE  = 256;
const LUT_MASK  = LUT_SIZE - 1;
const LUT_SCALE = LUT_SIZE / TWO_PI;

const LUT_SIN = new Float64Array(LUT_SIZE);
const LUT_COS = new Float64Array(LUT_SIZE);

for (let k = 0; k < LUT_SIZE; k++) {
  const angle = (k / LUT_SIZE) * TWO_PI;
  LUT_SIN[k] = Math.sin(angle);
  LUT_COS[k] = Math.cos(angle);
}

function lutSin(x) {
  x = x - TWO_PI * Math.floor(x * INV_TWO_PI);
  const s = x * LUT_SCALE;
  const idx = s | 0;
  const frac = s - idx;
  const i0 = idx & LUT_MASK;
  const i1 = (i0 + 1) & LUT_MASK;
  return LUT_SIN[i0] + frac * (LUT_SIN[i1] - LUT_SIN[i0]);
}

function lutCos(x) {
  x = x - TWO_PI * Math.floor(x * INV_TWO_PI);
  const s = x * LUT_SCALE;
  const idx = s | 0;
  const frac = s - idx;
  const i0 = idx & LUT_MASK;
  const i1 = (i0 + 1) & LUT_MASK;
  return LUT_COS[i0] + frac * (LUT_COS[i1] - LUT_COS[i0]);
}

// ─────────────────────────────────────────────────────────────────────────────
// § 2. Kepler Equation Solver — Elliptic (0 ≤ e < 1)
// ─────────────────────────────────────────────────────────────────────────────

function wrapTwoPi(angle) {
  return angle - TWO_PI * Math.floor(angle * INV_TWO_PI);
}

/** Initial guess cho E từ M, e (dùng LUT sin/cos của M). */
function keplerInitialE(M, e) {
  const sinM = lutSin(M);
  const cosM = lutCos(M);
  const invDenom = 1 / (1 - e * cosM);
  if (e < 0.8) {
    return M + e * sinM * invDenom;
  }
  const delta = e * sinM * invDenom;
  return M + delta / (1 + 0.15 * delta * delta * invDenom);
}

/** Một bước Newton-Raphson trên phương trình Kepler. */
function keplerNewtonStep(E, e, M) {
  const sinE = Math.sin(E);
  const cosE = Math.cos(E);
  return E - (E - e * sinE - M) / (1 - e * cosE);
}

/**
 * Fast-path: 1× sin/cos rồi cập nhật sin(E), cos(E) tuyến tính sau bước NR.
 * Đủ chính xác cho e < LOW_ECC_THRESHOLD (sai số ~O(delta²), delta rất nhỏ).
 */
function keplerLowEccSinCos(E, e, M, out) {
  const sinE = Math.sin(E);
  const cosE = Math.cos(E);
  const fp = 1 - e * cosE;
  const delta = (E - e * sinE - M) / fp;
  out.sinE = sinE - delta * cosE;
  out.cosE = cosE + delta * sinE;
}

/** Halley iteration; trả về sinE, cosE tại E cuối. */
function keplerHalleySinCos(E, e, M, tolerance, maxIter) {
  let sinE = 0;
  let cosE = 0;
  for (let i = 0; i < maxIter; i++) {
    sinE = Math.sin(E);
    cosE = Math.cos(E);
    const f = E - e * sinE - M;
    const fp = 1 - e * cosE;
    const fpp = e * sinE;

    const denom = fp - (f * fpp) / (2 * fp);
    if (Math.abs(denom) < 1e-15) break;

    const delta = f / denom;
    E -= delta;

    if (Math.abs(delta) < tolerance) break;
  }
  sinE = Math.sin(E);
  cosE = Math.cos(E);
  return { E, sinE, cosE };
}

/**
 * Giải phương trình Kepler elliptic: M = E − e·sin(E)
 * Dùng Halley's method (bậc 3) — hội tụ cubic.
 */
export function solveKepler(M, e, tolerance = 1e-12, maxIter = 15) {
  if (e === 0) return wrapTwoPi(M);

  M = wrapTwoPi(M);
  let E = keplerInitialE(M, e);

  if (e < LOW_ECC_THRESHOLD) {
    return keplerNewtonStep(E, e, M);
  }

  const result = keplerHalleySinCos(E, e, M, tolerance, maxIter);
  return result.E;
}

/**
 * Giải phương trình Kepler elliptic và tính sẵn sin(E), cos(E) tích hợp.
 * Kết quả được lưu trực tiếp vào đối tượng scratchSinCos toàn cục để tái sử dụng.
 */
export function solveKeplerSinCos(M, e, tolerance = 1e-12, maxIter = 15) {
  if (e === 0) {
    const wrapped = wrapTwoPi(M);
    scratchSinCos.sinE = Math.sin(wrapped);
    scratchSinCos.cosE = Math.cos(wrapped);
    return;
  }

  M = wrapTwoPi(M);
  let E = keplerInitialE(M, e);

  if (e < LOW_ECC_THRESHOLD) {
    keplerLowEccSinCos(E, e, M, scratchSinCos);
    return;
  }

  const result = keplerHalleySinCos(E, e, M, tolerance, maxIter);
  scratchSinCos.sinE = result.sinE;
  scratchSinCos.cosE = result.cosE;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3. Kepler Equation Solver — Hyperbolic (e > 1)
// ─────────────────────────────────────────────────────────────────────────────

export function solveKeplerHyperbolic(M, e, tolerance = 1e-12, maxIter = 50) {
  const absM = Math.abs(M);
  let H = Math.sign(M) * Math.log(2 * absM / e + 1.8);

  for (let i = 0; i < maxIter; i++) {
    const sinhH = Math.sinh(H);
    const coshH = Math.cosh(H);
    const f     = e * sinhH - H - M;
    const fp    = e * coshH - 1;
    const fpp   = e * sinhH;

    const denom = fp - (f * fpp) / (2 * fp);
    if (Math.abs(denom) < 1e-15) break;

    const delta = f / denom;
    H -= delta;

    if (Math.abs(delta) < tolerance) break;
  }

  return H;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 4. True Anomaly — dispatch elliptic / hyperbolic tự động
// ─────────────────────────────────────────────────────────────────────────────

export function computeTrueAnomaly(E, e) {
  if (e > 1) {
    const sqrtFactor = Math.sqrt((e + 1) / (e - 1));
    return 2 * Math.atan(sqrtFactor * Math.tanh(E / 2));
  }
  const sinE = Math.sin(E);
  const cosE = Math.cos(E);
  const beta = e / (1 + Math.sqrt(1 - e * e));
  return E + 2 * Math.atan2(beta * sinE, 1 - beta * cosE);
}

export function computeTrueAnomalyHyperbolic(H, e) {
  const sqrtFactor = Math.sqrt((e + 1) / (e - 1));
  return 2 * Math.atan(sqrtFactor * Math.tanh(H / 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5. Orbital Parameter Cache
// ─────────────────────────────────────────────────────────────────────────────

const rotationCache = new WeakMap();

function getOrCreateCache(data) {
  // Bypass WeakMap truy xuất trực tiếp thuộc tính ẩn để tối ưu hiệu năng
  let cache = data._keplerCache;
  if (cache) return cache;

  const i  = (data.inclination        || 0) * DEG_TO_RAD;
  const Ω  = (data.longitudeAscending || 0) * DEG_TO_RAD;
  const ω  = (data.argumentPeriapsis  || 0) * DEG_TO_RAD;

  const cosΩ = Math.cos(Ω), sinΩ = Math.sin(Ω);
  const cosω = Math.cos(ω), sinω = Math.sin(ω);
  const cosi = Math.cos(i), sini = Math.sin(i);

  const r00 = cosΩ * cosω - sinΩ * sinω * cosi;
  const r10 = sini * sinω;
  const r20 = sinΩ * cosω + cosΩ * sinω * cosi;

  const r01 = -cosΩ * sinω - sinΩ * cosω * cosi;
  const r11 =  sini * cosω;
  const r21 = -sinΩ * sinω + cosΩ * cosω * cosi;

  const e    = data.eccentricity || 0;
  const a    = getDisplayOrbitRadius(data);
  const periodS = data.orbitalPeriod * SECONDS_PER_DAY;
  const n    = periodS > 0 ? TWO_PI / periodS : 0;

  const isHyperbolic = e >= 1;
  const sqrt1me2 = isHyperbolic ? 0 : Math.sqrt(1 - e * e);
  const sqrtE2m1 = isHyperbolic ? Math.sqrt(e * e - 1) : 0;

  cache = {
    r00, r01,
    r10, r11,
    r20, r21,
    a,
    e,
    sqrt1me2,
    sqrtE2m1,
    a_sqrt1me2: a * sqrt1me2,
    a_sqrtE2m1: a * sqrtE2m1,
    an: a * n,
    n,
    phase: (data.initialPhaseDeg || 0) * DEG_TO_RAD,
    isHyperbolic,
  };

  data._keplerCache = cache;
  rotationCache.set(data, cache);
  return cache;
}

export function invalidateCache(data) {
  if (data) {
    delete data._keplerCache;
  }
  rotationCache.delete(data);
}

// ─────────────────────────────────────────────────────────────────────────────
// § 6. Core: Position & Velocity (single body)
// ─────────────────────────────────────────────────────────────────────────────

function computeMeanAnomaly(c, t) {
  const M = c.n * t + c.phase;
  return c.isHyperbolic ? M : wrapTwoPi(M);
}

export function computeOrbitalPositionInto(data, timeElapsed, out) {
  const c  = getOrCreateCache(data);
  const M  = computeMeanAnomaly(c, timeElapsed);

  let xp, yp;
  if (c.isHyperbolic) {
    const E  = solveKeplerHyperbolic(M, c.e);
    const coshE = Math.cosh(E);
    xp = c.a * (c.e - coshE);
    yp = c.a_sqrtE2m1 * Math.sinh(E);
  } else {
    solveKeplerSinCos(M, c.e);
    xp = c.a * (scratchSinCos.cosE - c.e);
    yp = c.a_sqrt1me2 * scratchSinCos.sinE;
  }

  const x = c.r00 * xp + c.r01 * yp;
  const y = c.r10 * xp + c.r11 * yp;
  const z = c.r20 * xp + c.r21 * yp;
  
  if (typeof out.set === 'function') {
    out.set(x, y, z);
  } else {
    out.x = x;
    out.y = y;
    out.z = z;
  }
  return out;
}

export function computeOrbitalPosition(data, timeElapsed) {
  return computeOrbitalPositionInto(data, timeElapsed, { x: 0, y: 0, z: 0 });
}

export function computeOrbitalVelocity(data, timeElapsed) {
  const c = getOrCreateCache(data);
  if (c.n === 0 || c.a <= 0) return { vx: 0, vy: 0, vz: 0 };

  const M = computeMeanAnomaly(c, timeElapsed);

  let vxp, vyp;
  if (c.isHyperbolic) {
    const H     = solveKeplerHyperbolic(M, c.e);
    const sinhH = Math.sinh(H);
    const coshH = Math.cosh(H);
    const denom = c.e * coshH - 1;
    vxp = -c.an * sinhH / denom;
    vyp =  c.an * c.sqrtE2m1 * coshH / denom;
  } else {
    solveKeplerSinCos(M, c.e);
    const sinE  = scratchSinCos.sinE;
    const cosE  = scratchSinCos.cosE;
    const denom = 1 - c.e * cosE;
    vxp = -c.an * sinE / denom;
    vyp =  c.an * c.sqrt1me2 * cosE / denom;
  }

  return {
    vx: c.r00 * vxp + c.r01 * vyp,
    vy: c.r10 * vxp + c.r11 * vyp,
    vz: c.r20 * vxp + c.r21 * vyp,
  };
}

export function computeOrbitalState(data, timeElapsed) {
  const c = getOrCreateCache(data);
  const M = computeMeanAnomaly(c, timeElapsed);

  let xp, yp, vxp, vyp;

  if (c.isHyperbolic) {
    const H     = solveKeplerHyperbolic(M, c.e);
    const sinhH = Math.sinh(H);
    const coshH = Math.cosh(H);
    const denom = c.e * coshH - 1;
    xp  = c.a * (c.e - coshH);
    yp  = c.a_sqrtE2m1 * sinhH;
    vxp = -c.an * sinhH / denom;
    vyp =  c.an * c.sqrtE2m1 * coshH / denom;
  } else {
    solveKeplerSinCos(M, c.e);
    const sinE  = scratchSinCos.sinE;
    const cosE  = scratchSinCos.cosE;
    const denom = 1 - c.e * cosE;
    xp  = c.a * (cosE - c.e);
    yp  = c.a_sqrt1me2 * sinE;
    vxp = -c.an * sinE / denom;
    vyp =  c.an * c.sqrt1me2 * cosE / denom;
  }

  return {
    x:  c.r00 * xp + c.r01 * yp,
    y:  c.r10 * xp + c.r11 * yp,
    z:  c.r20 * xp + c.r21 * yp,
    vx: c.r00 * vxp + c.r01 * vyp,
    vy: c.r10 * vxp + c.r11 * vyp,
    vz: c.r20 * vxp + c.r21 * vyp,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 7. Batch API — zero-allocation, Float64Array output
// ─────────────────────────────────────────────────────────────────────────────

function batchMeanAnomaly(c, t) {
  const M = c.n * t + c.phase;
  return c.isHyperbolic ? M : wrapTwoPi(M);
}

export function computeAllPositions(planets, timeElapsed, out) {
  const n = planets.length;
  if (!out || out.length < n * 3) {
    out = new Float64Array(n * 3);
  }

  for (let i = 0; i < n; i++) {
    const c = getOrCreateCache(planets[i]);
    const M = batchMeanAnomaly(c, timeElapsed);

    let xp, yp;
    if (c.isHyperbolic) {
      const E = solveKeplerHyperbolic(M, c.e);
      xp = c.a * (c.e - Math.cosh(E));
      yp = c.a_sqrtE2m1 * Math.sinh(E);
    } else {
      solveKeplerSinCos(M, c.e);
      xp = c.a * (scratchSinCos.cosE - c.e);
      yp = c.a_sqrt1me2 * scratchSinCos.sinE;
    }

    const base = i * 3;
    out[base]     = c.r00 * xp + c.r01 * yp;
    out[base + 1] = c.r10 * xp + c.r11 * yp;
    out[base + 2] = c.r20 * xp + c.r21 * yp;
  }

  return out;
}

export function computeAllStates(planets, timeElapsed, out) {
  const n = planets.length;
  if (!out || out.length < n * 6) {
    out = new Float64Array(n * 6);
  }

  for (let i = 0; i < n; i++) {
    const c = getOrCreateCache(planets[i]);
    const M = batchMeanAnomaly(c, timeElapsed);
    let xp, yp, vxp, vyp;

    if (c.isHyperbolic) {
      const H     = solveKeplerHyperbolic(M, c.e);
      const sinhH = Math.sinh(H);
      const coshH = Math.cosh(H);
      const denom = c.e * coshH - 1;
      xp  = c.a * (c.e - coshH);
      yp  = c.a_sqrtE2m1 * sinhH;
      vxp = -c.an * sinhH / denom;
      vyp =  c.an * c.sqrtE2m1 * coshH / denom;
    } else {
      solveKeplerSinCos(M, c.e);
      const sinE  = scratchSinCos.sinE;
      const cosE  = scratchSinCos.cosE;
      const denom = 1 - c.e * cosE;
      xp  = c.a * (cosE - c.e);
      yp  = c.a_sqrt1me2 * sinE;
      vxp = -c.an * sinE / denom;
      vyp =  c.an * c.sqrt1me2 * cosE / denom;
    }

    const base = i * 6;
    out[base]     = c.r00 * xp + c.r01 * yp;
    out[base + 1] = c.r10 * xp + c.r11 * yp;
    out[base + 2] = c.r20 * xp + c.r21 * yp;
    out[base + 3] = c.r00 * vxp + c.r01 * vyp;
    out[base + 4] = c.r10 * vxp + c.r11 * vyp;
    out[base + 5] = c.r20 * vxp + c.r21 * vyp;
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 8. Orbit Path Sampler
// ─────────────────────────────────────────────────────────────────────────────

/** Ép segmentCount thành số nguyên ≥ 1. */
function normalizeSegmentCount(segmentCount) {
  const n = Math.floor(Number(segmentCount));
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

/** Ép revolutions thành số nguyên ≥ 1. */
function normalizeRevolutions(revolutions) {
  const n = Math.floor(Number(revolutions));
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

/**
 * Lấy mẫu đường quỹ đạo 3D (mean anomaly hoặc true anomaly đều).
 * @param {number} segmentCount - Số đoạn; sinh segmentCount+1 điểm (đường đóng).
 * @param {number} [revolutions=1] - Số vòng quỹ đạo (cho e cao, hiển thị multi-rev).
 */
export function sampleOrbitPath(data, segmentCount = 128, uniformAngle = false, out, revolutions = 1) {
  const segments = normalizeSegmentCount(segmentCount);
  const revs = normalizeRevolutions(revolutions);
  const pointCount = segments + 1;

  if (!out || out.length < pointCount * 3) {
    out = new Float64Array(pointCount * 3);
  }

  const c = getOrCreateCache(data);

  for (let i = 0; i < pointCount; i++) {
    const t = (i / segments) * TWO_PI * revs;
    let xp, yp;

    if (uniformAngle) {
      const nu    = t;
      const cosNu = Math.cos(nu);
      if (c.isHyperbolic) {
        const sqrtFactor = Math.sqrt((c.e + 1) / (c.e - 1));
        const E = 2 * Math.atanh(Math.tan(nu / 2) / sqrtFactor);
        xp = c.a * (c.e - Math.cosh(E));
        yp = c.a_sqrtE2m1 * Math.sinh(E);
      } else {
        const E = Math.atan2(
          Math.sqrt(1 - c.e * c.e) * Math.sin(nu),
          c.e + cosNu
        );
        xp = c.a * (Math.cos(E) - c.e);
        yp = c.a_sqrt1me2 * Math.sin(E);
      }
    } else {
      if (c.isHyperbolic) {
        const E = solveKeplerHyperbolic(t, c.e);
        xp = c.a * (c.e - Math.cosh(E));
        yp = c.a_sqrtE2m1 * Math.sinh(E);
      } else {
        solveKeplerSinCos(t, c.e);
        xp = c.a * (scratchSinCos.cosE - c.e);
        yp = c.a_sqrt1me2 * scratchSinCos.sinE;
      }
    }

    const base = i * 3;
    out[base]     = c.r00 * xp + c.r01 * yp;
    out[base + 1] = c.r10 * xp + c.r11 * yp;
    out[base + 2] = c.r20 * xp + c.r21 * yp;
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 9. Vis-viva & Orbital Mechanics Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function visVivaSpeed(r, a, GM) {
  return Math.sqrt(GM * (2 / r - 1 / a));
}

export function orbitalRadius(data, E) {
  const c = getOrCreateCache(data);
  return c.a * (1 - c.e * Math.cos(E));
}
