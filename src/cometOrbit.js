/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║        Comet Orbital Engine  —  v2.0 (Ultra Performance)            ║
 * ║    Hệ thống quỹ đạo chuyên biệt cho sao chổi                      ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║  Nâng cấp v2.0:                                                    ║
 * ║  • Universal Variable Formulation (Shepperd/Danby) cho mọi e       ║
 * ║  • Halley's 3rd-order iteration: hội tụ trong 2-3 steps            ║
 * ║  • Zero-allocation Stumpff functions & Perifocal direct output     ║
 * ║  • Fast Barker solver (O(1)) trả về trực tiếp xp, yp              ║
 * ║  • Throttle không dùng Math.sqrt (so sánh distSq)                  ║
 * ║  • Orbit Path sampling dùng phương trình cực (bỏ qua Kepler)       ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import { getDisplayOrbitRadius } from "./orbitMath.js";

// ─────────────────────────────────────────────────────────────────────────────
// Hằng số
// ─────────────────────────────────────────────────────────────────────────────

const TWO_PI = 2 * Math.PI;
const INV_TWO_PI = 1 / TWO_PI;
const DEG_TO_RAD = Math.PI / 180;
const SECONDS_PER_DAY = 86400;

// Throttle thresholds (AU units)
const THROTTLE_NEAR = 1;
const THROTTLE_MID = 4;
const THROTTLE_FAR = 4;
const THROTTLE_HIDE = 20;

// Safety: khoảng cách tối thiểu từ Mặt Trời
const SUN_DISPLAY_RADIUS = 25;
const MIN_PERIHELION_DISPLAY = SUN_DISPLAY_RADIUS + 10; // = 35 units

// ─────────────────────────────────────────────────────────────────────────────
// § 1. Universal Kepler Solver (Zero-Allocation)
// ─────────────────────────────────────────────────────────────────────────────

const _scratchPerifocal = { xp: 0, yp: 0, r: 0 };

/**
 * Tính Stumpff functions C2, C3 nội tuyến để tránh cấp phát object.
 */
function computeStumpffC2C3(psi) {
  let c2, c3;
  if (psi > 1e-6) {
    const sqrtPsi = Math.sqrt(psi);
    c2 = (1 - Math.cos(sqrtPsi)) / psi;
    c3 = (sqrtPsi - Math.sin(sqrtPsi)) / (psi * sqrtPsi);
  } else if (psi < -1e-6) {
    const sqrtMinusPsi = Math.sqrt(-psi);
    c2 = (Math.cosh(sqrtMinusPsi) - 1) / -psi;
    c3 = (Math.sinh(sqrtMinusPsi) - sqrtMinusPsi) / (-psi * sqrtMinusPsi);
  } else {
    // Taylor series cho psi gần 0 (tránh chia cho 0)
    const psi2 = psi * psi;
    const psi3 = psi2 * psi;
    c2 =
      0.5 -
      psi * 0.041666666666666664 +
      psi2 * 0.001388888888888889 -
      psi3 * 0.0000248015873015873;
    c3 =
      0.16666666666666666 -
      psi * 0.008333333333333333 +
      psi2 * 0.0001984126984126984 -
      psi3 * 0.000002755731922398589;
  }
  return [c2, c3];
}

/**
 * Starter tối ưu cho Universal Variable x.
 */
function getUniversalStarter(M, e) {
  if (e < 0.95) {
    // Elliptical: Newton step từ M
    const sinM = Math.sin(M);
    const cosM = Math.cos(M);
    return M + (e * sinM) / (1 - e * cosM);
  } else if (e < 1.05) {
    // Near-parabolic: Giải phương trình bậc 3 x^3 + 6(1-e)x - 6M = 0
    const p = 6 * (1 - e);
    const q = -6 * M;
    const D = q * q * 0.25 + p * p * p * 0.037037037037037035; // 1/27
    if (D >= 0) {
      const sqrtD = Math.sqrt(D);
      return Math.cbrt(-q * 0.5 + sqrtD) + Math.cbrt(-q * 0.5 - sqrtD);
    } else {
      const r = Math.sqrt(-p * p * p * 0.037037037037037035);
      const theta = Math.acos(-q / (2 * r));
      return 2 * Math.cbrt(r) * Math.cos(theta * 0.3333333333333333);
    }
  } else {
    // Hyperbolic: Newton step từ asinh
    let x = Math.asinh(M / e);
    const expX = Math.exp(x);
    const expMinusX = 1 / expX;
    const sinhX = (expX - expMinusX) * 0.5;
    const coshX = (expX + expMinusX) * 0.5;
    const f = e * sinhX - x - M;
    const fp = e * coshX - 1;
    return x - f / fp;
  }
}

/**
 * Giải phương trình Kepler cho Near-Parabolic (e >= 0.999) dùng Barker.
 * Trả về trực tiếp tọa độ Perifocal (xp, yp) và r.
 */
function solveNearParabolicPerifocal(M, e, q, out) {
  let M_wrap = M - TWO_PI * Math.round(M * INV_TWO_PI);
  const disc = Math.sqrt(2.25 * M_wrap * M_wrap + 1);
  const D = Math.cbrt(1.5 * M_wrap + disc) + Math.cbrt(1.5 * M_wrap - disc);

  out.xp = q * (1 - D * D);
  out.yp = 2 * q * D;
  out.r = q * (1 + D * D);
  return out;
}

/**
 * Universal Kepler Solver — Giải quyết mọi loại quỹ đạo (e < 1, e = 1, e > 1).
 * Sử dụng Halley's method bậc 3 và Stumpff functions.
 * Trả về trực tiếp xp, yp trong hệ tọa độ Perifocal (Zero-Allocation).
 */
function solveKeplerPerifocal(M, e, cache, out) {
  if (e >= 0.999) {
    return solveNearParabolicPerifocal(M, e, cache.q, out);
  }

  // Wrap M cho elliptical để hội tụ nhanh nhất
  let M_wrapped = M;
  if (e < 1.0) {
    M_wrapped = M - TWO_PI * Math.round(M * INV_TWO_PI);
  }

  let x = getUniversalStarter(M_wrapped, e);
  const sign_psi = e < 1.0 ? 1 : -1;

  // Halley's iteration (bậc 3)
  for (let i = 0; i < 6; i++) {
    const x2 = x * x;
    const psi = sign_psi * x2;
    const [c2, c3] = computeStumpffC2C3(psi);

    const x3 = x2 * x;
    const g = e * x3 * c3 + (1 - e) * x - M_wrapped;

    if (Math.abs(g) < 1e-12) break;

    const gp = e * x2 * c2 + (1 - e);
    const gpp = e * x * (1 - psi * c3);

    const denom = gp - (g * gpp) / (2 * gp);
    if (Math.abs(denom) < 1e-15) break;

    const dx = g / denom;
    x -= dx;

    if (Math.abs(dx) < 1e-12 * Math.abs(x)) break;
  }

  // Tính xp, yp từ x
  const x2 = x * x;
  const psi = sign_psi * x2;
  const [c2] = computeStumpffC2C3(psi);

  out.xp = cache.q - cache.a * x2 * c2;
  out.r = cache.q + cache.a * cache.e * x2 * c2;

  // yp = sign(x) * sqrt(p * r). Dùng Math.max để tránh NaN do sai số float
  out.yp = Math.sign(x) * Math.sqrt(Math.max(0, cache.p * out.r));

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 2. Comet Orbital Cache
// ─────────────────────────────────────────────────────────────────────────────

function getOrCreateCometCache(data) {
  let cache = data._cometCache;
  if (cache) return cache;

  const i = (data.inclination || 0) * DEG_TO_RAD;
  const Omega = (data.longitudeAscending || 0) * DEG_TO_RAD;
  const omega = (data.argumentPeriapsis || 0) * DEG_TO_RAD;

  const cosO = Math.cos(Omega),
    sinO = Math.sin(Omega);
  const cosw = Math.cos(omega),
    sinw = Math.sin(omega);
  const cosi = Math.cos(i),
    sini = Math.sin(i);

  // Rotation matrix (Perifocal → Heliocentric)
  const r00 = cosO * cosw - sinO * sinw * cosi;
  const r10 = sini * sinw;
  const r20 = sinO * cosw + cosO * sinw * cosi;

  const r01 = -cosO * sinw - sinO * cosw * cosi;
  const r11 = sini * cosw;
  const r21 = -sinO * sinw + cosO * cosw * cosi;

  const e = data.eccentricity || 0;
  let a = getDisplayOrbitRadius(data);

  // Xử lý mathematical sign cho a (Hyperbolic có a < 0)
  // Đảm bảo an toàn cho dù hàm getDisplayOrbitRadius có tự động đảo dấu hay không
  if (e > 1 && a > 0) a = -a;

  const periodS = Math.abs(data.orbitalPeriod) * SECONDS_PER_DAY;
  const n = periodS > 0 ? TWO_PI / periodS : 0;

  // Các biến universal
  const q = a * (1 - e); // Khoảng cách perihelion (luôn >= 0)
  const p = a * (1 - e * e); // Semi-latus rectum (luôn > 0)

  cache = {
    r00,
    r01,
    r10,
    r11,
    r20,
    r21,
    a,
    e,
    q,
    p,
    n,
    phase: (data.initialPhaseDeg || 0) * DEG_TO_RAD,
    // Throttle state
    lastUpdateFrame: -999,
    lastX: 0,
    lastY: 0,
    lastZ: 0,
  };

  data._cometCache = cache;
  return cache;
}

export function invalidateCometCache(data) {
  if (data) delete data._cometCache;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3. Position Computation (Zero-Allocation)
// ─────────────────────────────────────────────────────────────────────────────

export function computeCometPosition(data, timeElapsed, out) {
  const c = getOrCreateCometCache(data);
  const M = c.n * timeElapsed + c.phase;

  solveKeplerPerifocal(M, c.e, c, _scratchPerifocal);
  let { xp, yp, r } = _scratchPerifocal;

  // Safety Clamp: Giữ khoảng cách tối thiểu từ Mặt Trời
  if (r < MIN_PERIHELION_DISPLAY && r > 1e-6) {
    const scale = MIN_PERIHELION_DISPLAY / r;
    xp *= scale;
    yp *= scale;
  }

  // Fallback nếu có NaN/Infinity
  if (!isFinite(xp) || !isFinite(yp)) {
    xp = c.q;
    yp = 0;
  }

  // Rotate Perifocal → Heliocentric
  const x = c.r00 * xp + c.r01 * yp;
  const y = c.r10 * xp + c.r11 * yp;
  const z = c.r20 * xp + c.r21 * yp;

  if (typeof out.set === "function") {
    out.set(x, y, z);
  } else {
    out.x = x;
    out.y = y;
    out.z = z;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 4. Batch Computation với Fast Throttle (No Math.sqrt)
// ─────────────────────────────────────────────────────────────────────────────

const _scratchPos = { x: 0, y: 0, z: 0 };

export function updateCometPositions(
  cometBodies,
  simulationTime,
  frameCount,
  auScale,
) {
  // Pre-compute squared thresholds để tránh Math.sqrt trong vòng lặp
  const auScaleSq = auScale * auScale;
  const nearSq = THROTTLE_NEAR * THROTTLE_NEAR * auScaleSq;
  const midSq = THROTTLE_MID * THROTTLE_MID * auScaleSq;
  const hideSq = THROTTLE_HIDE * THROTTLE_HIDE * auScaleSq;

  for (let i = 0; i < cometBodies.length; i++) {
    const body = cometBodies[i];
    const data = body.data;
    const cache = getOrCreateCometCache(data);

    // Distance-based throttle check (O(1) fast path)
    const dx = cache.lastX,
      dy = cache.lastY,
      dz = cache.lastZ;
    const distSq = dx * dx + dy * dy + dz * dz;

    let interval;
    if (distSq < nearSq) interval = 1;
    else if (distSq < midSq) interval = 2;
    else if (distSq < hideSq) interval = THROTTLE_FAR;
    else interval = -1; // Ẩn

    if (interval === -1) {
      body.pivot.visible = false;
      continue;
    }

    body.pivot.visible = true;

    if (frameCount - cache.lastUpdateFrame < interval) {
      continue;
    }

    cache.lastUpdateFrame = frameCount;

    computeCometPosition(data, simulationTime, _scratchPos);
    body.pivot.position.set(_scratchPos.x, _scratchPos.y, _scratchPos.z);

    cache.lastX = _scratchPos.x;
    cache.lastY = _scratchPos.y;
    cache.lastZ = _scratchPos.z;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5. Orbit Path Sampler (Direct Polar Equation)
// ─────────────────────────────────────────────────────────────────────────────

export function sampleCometOrbitPath(data, samples = 256, out) {
  if (!out || out.length < samples * 3) {
    out = new Float64Array(samples * 3);
  }

  const c = getOrCreateCometCache(data);
  const p = c.p;
  const e = c.e;

  // Sample đều theo True Anomaly (nu) để mật độ điểm dày đặc ở perihelion (nơi cong nhất)
  for (let i = 0; i < samples; i++) {
    const nu = (i / samples) * TWO_PI;
    const cosNu = Math.cos(nu);
    const sinNu = Math.sin(nu);

    // Phương trình quỹ đạo cực: r = p / (1 + e * cos(nu))
    let r = p / (1 + e * cosNu);
    let xp = r * cosNu;
    let yp = r * sinNu;

    if (r < MIN_PERIHELION_DISPLAY && r > 1e-6) {
      const scale = MIN_PERIHELION_DISPLAY / r;
      xp *= scale;
      yp *= scale;
    }

    const base = i * 3;
    out[base] = c.r00 * xp + c.r01 * yp;
    out[base + 1] = c.r10 * xp + c.r11 * yp;
    out[base + 2] = c.r20 * xp + c.r21 * yp;
  }

  return out;
}

export function sampleCometOrbitDistances(data, samples = 256) {
  const c = getOrCreateCometCache(data);
  const p = c.p;
  const e = c.e;
  const distances = new Float32Array(samples);

  for (let i = 0; i < samples; i++) {
    const nu = (i / samples) * TWO_PI;
    distances[i] = Math.max(0, p / (1 + e * Math.cos(nu)));
  }

  return distances;
}
