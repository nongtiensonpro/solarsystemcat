/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║              Kepler Orbital Engine  —  v2.1                        ║
 * ║      Động lực học quỹ đạo thiên thể (Keplerian Two-Body)           ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║  Nâng cấp so với v2.0:                                             ║
 * ║  • FIX: hyperbolic yp dùng sqrt(e²-1) thay sqrt(1-e²)=0            ║
 * ║  • FIX: hyperbolic M không wrapTwoPi (sai nghiệm)                  ║
 * ║  • LUT linear interpolation (giảm sai số initial guess 50×)       ║
 * ║  • LUT cos riêng thay sin(M+π/2) xấp xỉ (chính xác hơn)          ║
 * ║  • Fast-path circular (e=0): E=M ngay, không cần Halley           ║
 * ║  • computeTrueAnomaly dispatch elliptic/hyperbolic tự động         ║
 * ║  • sampleOrbitPath hỗ trợ hyperbolic + uniformAngle               ║
 * ║  • Pre-computed a·√(1-e²), a·√(e²-1), a·n trong cache            ║
 * ║  • Giảm số lần gọi Math.sin/cos trong hot path                     ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import { getDisplayOrbitRadius } from './orbitMath.js';

// ─────────────────────────────────────────────────────────────────────────────
// Hằng số nội bộ
// ─────────────────────────────────────────────────────────────────────────────

const TWO_PI      = 2 * Math.PI;
const INV_TWO_PI  = 1 / TWO_PI;
const DEG_TO_RAD  = Math.PI / 180;
const SECONDS_PER_DAY = 86400;

// ─────────────────────────────────────────────────────────────────────────────
// § 1. LUT cho initial guess — linear interpolation, cả sin lẫn cos
//
// Dùng bảng tra 256 điểm (power-of-two cho bitwise mask). Linear interpolation
// giảm sai số từ ±0.7% (nearest) xuống ±0.005%, đưa initial guess sát nghiệm
// hơn, giảm số vòng lặp Halley xuống còn 1-2 cho e < 0.99.
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

/**
 * Giải phương trình Kepler elliptic: M = E − e·sin(E)
 * Dùng Halley's method (bậc 3) — hội tụ cubic:
 *
 *   δ = f / [fp − f·fpp / (2·fp)]
 *   f  = E − e·sinE − M
 *   fp = 1 − e·cosE
 *   fpp = e·sinE
 *
 * @param {number} M   - Mean Anomaly (radian)
 * @param {number} e   - Eccentricity, 0 ≤ e < 1
 * @param {number} [tolerance=1e-12]
 * @param {number} [maxIter=15]
 * @returns {number} E - Eccentric Anomaly (radian)
 */
export function solveKepler(M, e, tolerance = 1e-12, maxIter = 15) {
  // Fast-path: circular orbit
  if (e === 0) return wrapTwoPi(M);

  M = wrapTwoPi(M);

  // ── Initial guess ────────────────────────────────────────────────────
  // Dùng LUT sin/cos linear-interpolated + xấp xỉ bậc nhất
  // E₀ ≈ M + e·sin(M) / (1 − e·cos(M))
  const sinM = lutSin(M);
  const cosM = lutCos(M);
  const invDenom = 1 / (1 - e * cosM);

  let E;
  if (e < 0.8) {
    // Xấp xỉ bậc nhất — đủ chính xác cho e vừa phải
    E = M + e * sinM * invDenom;
  } else {
    // e cao: damping để tránh overshoot tại periapsis
    const delta = e * sinM * invDenom;
    E = M + delta / (1 + 0.15 * delta * delta * invDenom);
  }

  // ── Halley iteration ─────────────────────────────────────────────────
  for (let i = 0; i < maxIter; i++) {
    const sinE = Math.sin(E);
    const cosE = Math.cos(E);
    const f    = E - e * sinE - M;
    const fp   = 1 - e * cosE;
    const fpp  = e * sinE;

    const denom = fp - (f * fpp) / (2 * fp);
    if (Math.abs(denom) < 1e-15) break;

    const delta = f / denom;
    E -= delta;

    if (Math.abs(delta) < tolerance) break;
  }

  return E;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3. Kepler Equation Solver — Hyperbolic (e > 1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Giải phương trình Kepler hyperbolic: M = e·sinh(H) − H
 *
 * @param {number} M  - Hyperbolic Mean Anomaly (KHÔNG wrap — grows unbounded)
 * @param {number} e  - Eccentricity, e > 1
 * @param {number} [tolerance=1e-12]
 * @param {number} [maxIter=50]
 * @returns {number} H - Hyperbolic Eccentric Anomaly
 */
export function solveKeplerHyperbolic(M, e, tolerance = 1e-12, maxIter = 50) {
  // Battin's initial guess — cải thiện với hệ số điều chỉnh
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

/**
 * Tính True Anomaly ν từ Eccentric Anomaly và eccentricity.
 * Tự động chọn công thức elliptic (e<1) hoặc hyperbolic (e>1).
 *
 * @param {number} E  - Eccentric Anomaly (E hoặc H)
 * @param {number} e  - Eccentricity (bất kỳ)
 * @returns {number} ν - True Anomaly (radian, [-π, π] cho elliptic)
 */
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

/**
 * Tính True Anomaly hyperbolic — giữ để tương thích ngược.
 * @param {number} H
 * @param {number} e
 * @returns {number} ν
 */
export function computeTrueAnomalyHyperbolic(H, e) {
  const sqrtFactor = Math.sqrt((e + 1) / (e - 1));
  return 2 * Math.atan(sqrtFactor * Math.tanh(H / 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5. Orbital Parameter Cache
//
// WeakMap để tự động GC. Pre-compute rotation matrix, sqrt factors, và a·n
// để giảm phép tính trong hot path (render loop 60fps).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} RotationCache
 * @property {number} r00 @property {number} r01
 * @property {number} r10 @property {number} r11
 * @property {number} r20 @property {number} r21
 * @property {number} a         - semi-major axis (scene units)
 * @property {number} e         - eccentricity
 * @property {number} sqrt1me2  - √(1-e²) (elliptic, =0 nếu hyperbolic)
 * @property {number} sqrtE2m1  - √(e²-1) (hyperbolic, =0 nếu elliptic)
 * @property {number} a_sqrt1me2 - a·√(1-e²) (pre-computed cho elliptic yp)
 * @property {number} a_sqrtE2m1 - a·√(e²-1) (pre-computed cho hyperbolic yp)
 * @property {number} an        - a·n (pre-computed cho velocity xp)
 * @property {number} n   - mean motion (rad/s)
 * @property {number} phase     - initial phase (rad)
 * @property {number} isHyperbolic
 */

const rotationCache = new WeakMap();

/**
 * Lấy (hoặc tạo mới) rotation cache cho một planet data object.
 * Ma trận xoay 3D đầy đủ Ω × ω × i theo quy ước thiên văn học:
 *
 *   R = Rz(−Ω) · Rx(−i) · Rz(−ω)
 *
 * Chỉ lưu 6 phần tử cần thiết (cột 1 và 2 của R, vì z_local = 0).
 *
 * @param {Object} data
 * @returns {RotationCache}
 */
function getOrCreateCache(data) {
  let cache = rotationCache.get(data);
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

  rotationCache.set(data, cache);
  return cache;
}

export function invalidateCache(data) {
  rotationCache.delete(data);
}

// ─────────────────────────────────────────────────────────────────────────────
// § 6. Core: Position & Velocity (single body)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper: tính Mean Anomaly, KHÔNG wrap nếu hyperbolic (M grows unbounded).
 */
function computeMeanAnomaly(c, t) {
  const M = c.n * t + c.phase;
  return c.isHyperbolic ? M : wrapTwoPi(M);
}

/**
 * Tính vị trí 3D (world frame) tại thời điểm t.
 *
 * @param {Object} data
 * @param {number} timeElapsed - giây
 * @returns {{ x, y, z }}
 */
export function computeOrbitalPosition(data, timeElapsed) {
  const c  = getOrCreateCache(data);
  const M  = computeMeanAnomaly(c, timeElapsed);
  const E  = c.isHyperbolic
    ? solveKeplerHyperbolic(M, c.e)
    : solveKepler(M, c.e);

  let xp, yp;
  if (c.isHyperbolic) {
    const coshE = Math.cosh(E);
    xp = c.a * (c.e - coshE);
    yp = c.a_sqrtE2m1 * Math.sinh(E);
  } else {
    const cosE = Math.cos(E);
    xp = c.a * (cosE - c.e);
    yp = c.a_sqrt1me2 * Math.sin(E);
  }

  return {
    x: c.r00 * xp + c.r01 * yp,
    y: c.r10 * xp + c.r11 * yp,
    z: c.r20 * xp + c.r21 * yp,
  };
}

/**
 * Tính vận tốc 3D (world frame) — đạo hàm giải tích, chính xác hơn finite diff.
 *
 * @param {Object} data
 * @param {number} timeElapsed
 * @returns {{ vx, vy, vz }}
 */
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
    const E     = solveKepler(M, c.e);
    const sinE  = Math.sin(E);
    const cosE  = Math.cos(E);
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

/**
 * Tính đồng thời vị trí + vận tốc — chỉ solve Kepler một lần.
 *
 * @param {Object} data
 * @param {number} timeElapsed
 * @returns {{ x, y, z, vx, vy, vz }}
 */
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
    const E     = solveKepler(M, c.e);
    const sinE  = Math.sin(E);
    const cosE  = Math.cos(E);
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
//
// Ghi thẳng vào TypedArray pre-allocated → không trigger GC, cache-friendly.
// Layout: stride 3 cho position, stride 6 cho position+velocity.
// ─────────────────────────────────────────────────────────────────────────────

function batchMeanAnomaly(c, t) {
  const M = c.n * t + c.phase;
  return c.isHyperbolic ? M : wrapTwoPi(M);
}

/**
 * Tính vị trí nhiều thiên thể, ghi vào Float64Array (stride=3).
 *
 * @param {Object[]}    planets
 * @param {number}      timeElapsed
 * @param {Float64Array} [out]
 * @returns {Float64Array}
 */
export function computeAllPositions(planets, timeElapsed, out) {
  const n = planets.length;
  if (!out || out.length < n * 3) {
    out = new Float64Array(n * 3);
  }

  for (let i = 0; i < n; i++) {
    const c = getOrCreateCache(planets[i]);
    const M = batchMeanAnomaly(c, timeElapsed);
    const E = c.isHyperbolic
      ? solveKeplerHyperbolic(M, c.e)
      : solveKepler(M, c.e);

    let xp, yp;
    if (c.isHyperbolic) {
      xp = c.a * (c.e - Math.cosh(E));
      yp = c.a_sqrtE2m1 * Math.sinh(E);
    } else {
      xp = c.a * (Math.cos(E) - c.e);
      yp = c.a_sqrt1me2 * Math.sin(E);
    }

    const base = i * 3;
    out[base]     = c.r00 * xp + c.r01 * yp;
    out[base + 1] = c.r10 * xp + c.r11 * yp;
    out[base + 2] = c.r20 * xp + c.r21 * yp;
  }

  return out;
}

/**
 * Tính vị trí + vận tốc nhiều thiên thể (stride=6).
 *
 * @param {Object[]}    planets
 * @param {number}      timeElapsed
 * @param {Float64Array} [out]
 * @returns {Float64Array}
 */
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
      const E     = solveKepler(M, c.e);
      const sinE  = Math.sin(E);
      const cosE  = Math.cos(E);
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
// § 8. Orbit Path Sampler (cho rendering ellipse preview)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lấy mẫu N điểm dọc theo quỹ đạo — hỗ trợ elliptic và hyperbolic.
 *
 * Layout output: [x0, y0, z0, x1, y1, z1, …] (stride=3)
 *
 * @param {Object}      data
 * @param {number}      [samples=128]
 * @param {boolean}     [uniformAngle=false] - sample đều theo ν thay vì M
 * @param {Float64Array} [out]
 * @returns {Float64Array}
 */
export function sampleOrbitPath(data, samples = 128, uniformAngle = false, out) {
  if (!out || out.length < samples * 3) {
    out = new Float64Array(samples * 3);
  }

  const c = getOrCreateCache(data);

  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * TWO_PI;
    let E;

    if (uniformAngle) {
      // Sample đều theo True Anomaly ν → chuyển về E/H
      const nu    = t;
      const cosNu = Math.cos(nu);
      if (c.isHyperbolic) {
        // ν → H: tanh(H/2) = tan(ν/2) / sqrt((e+1)/(e-1))
        const sqrtFactor = Math.sqrt((c.e + 1) / (c.e - 1));
        E = 2 * Math.atanh(Math.tan(nu / 2) / sqrtFactor);
      } else {
        E = Math.atan2(
          Math.sqrt(1 - c.e * c.e) * Math.sin(nu),
          c.e + cosNu
        );
      }
    } else {
      E = c.isHyperbolic
        ? solveKeplerHyperbolic(t, c.e)
        : solveKepler(t, c.e);
    }

    let xp, yp;
    if (c.isHyperbolic) {
      xp = c.a * (c.e - Math.cosh(E));
      yp = c.a_sqrtE2m1 * Math.sinh(E);
    } else {
      xp = c.a * (Math.cos(E) - c.e);
      yp = c.a_sqrt1me2 * Math.sin(E);
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
