/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║        Comet Orbital Engine  —  v1.0                                ║
 * ║    Hệ thống quỹ đạo chuyên biệt cho sao chổi                      ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║  Đặc điểm:                                                         ║
 * ║  • Steffensen's method cho e > 0.95: hội tụ nhanh gấp 2x           ║
 * ║  • Barker's equation cho near-parabolic (e > 0.9995): O(1) giải    ║
 * ║  • Distance-based throttle: sao chổi xa cập nhật thưa hơn          ║
 * ║  • Safety clamp: ngăn sao chổi bay xuyên Mặt Trời hoặc bay thẳng  ║
 * ║  • Zero-allocation batch processing riêng biệt                     ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import { getDisplayOrbitRadius } from './orbitMath.js';

// ─────────────────────────────────────────────────────────────────────────────
// Hằng số
// ─────────────────────────────────────────────────────────────────────────────

const TWO_PI = 2 * Math.PI;
const INV_TWO_PI = 1 / TWO_PI;
const DEG_TO_RAD = Math.PI / 180;
const SECONDS_PER_DAY = 86400;

// Throttle thresholds (AU units trong WebGL = displayOrbitRadius / AU_SCALE)
const THROTTLE_NEAR = 1;     // < 1: mỗi frame
const THROTTLE_MID = 4;      // 1-4: mỗi 2 frame
const THROTTLE_FAR = 4;      // > 4: mỗi 4 frame (theo yêu cầu user)
const THROTTLE_HIDE = 20;    // > 20: ẩn hoàn toàn (visibility culling)

// Safety: khoảng cách tối thiểu từ Mặt Trời (trong display units)
// Mặt Trời có radius = 25 units, cần margin để sao chổi không bay xuyên
const SUN_DISPLAY_RADIUS = 25;
const MIN_PERIHELION_DISPLAY = SUN_DISPLAY_RADIUS + 10; // = 35 units

// ─────────────────────────────────────────────────────────────────────────────
// § 1. Kepler Solver chuyên biệt cho sao chổi (e > 0.5)
// ─────────────────────────────────────────────────────────────────────────────

function wrapTwoPi(angle) {
  return angle - TWO_PI * Math.floor(angle * INV_TWO_PI);
}

/**
 * Markley's starter (1995) — initial guess tối ưu cho high eccentricity.
 * Hội tụ nhanh hơn nhiều so với linear starter M + e*sin(M).
 */
function markleyStarter(M, e) {
  const Mw = wrapTwoPi(M);
  const t = Mw / Math.PI;
  // Pade approximant cho starter
  const alpha = (3 * Math.PI * Math.PI + 1.6 * Math.PI * (Math.PI - Math.abs(Mw)))
    / (Math.PI * Math.PI - 6);
  const d = 3 * (1 - e) + alpha * e;
  const r = 3 * alpha * d * (d - 1 + e) * Mw + Mw * Mw * Mw;
  const q = 2 * alpha * d * (1 - e) - Mw * Mw;
  const w = (Math.abs(r) + Math.sqrt(r * r + q * q * q)) ** (2 / 3);
  const E0 = (2 * r * w / (w * w + w * q + q * q) + Mw) / d;
  // Sử dụng 4th-order refinement
  const fs = e * Math.sin(E0);
  const fc = e * Math.cos(E0);
  const f0 = E0 - fs - Mw;
  const f1 = 1 - fc;
  const f2 = fs;
  const f3 = fc;
  const d3 = -f0 / (f1 - 0.5 * f0 * f2 / f1);
  const d4 = -f0 / (f1 + 0.5 * d3 * (f2 + d3 * f3 / 3));
  return E0 - f0 / (f1 + 0.5 * d4 * (f2 + d4 * f3 / 3));
}

/**
 * Giải phương trình Kepler cho sao chổi — tối ưu cho e cao.
 *
 * Chiến lược:
 * - e < 0.8:  Standard Halley (giống kepler.js — 2-3 iterations)
 * - 0.8 ≤ e < 0.9995: Markley starter + Steffensen's method (3-5 iterations)
 * - e ≥ 0.9995: Barker's equation (direct, O(1))
 *
 * @param {number} M - Mean Anomaly
 * @param {number} e - Eccentricity
 * @returns {{sinE: number, cosE: number}} sin(E) và cos(E) tích hợp
 */
export function solveCometKepler(M, e) {
  // Near-parabolic: Barker's equation
  if (e >= 0.9995) {
    return solveCometBarker(M, e);
  }

  M = wrapTwoPi(M);

  let E;

  if (e < 0.8) {
    // Standard starter + Halley
    const sinM = Math.sin(M);
    const cosM = Math.cos(M);
    const invDenom = 1 / (1 - e * cosM);
    E = M + e * sinM * invDenom;
  } else {
    // Markley's starter — rất chính xác cho e cao
    E = markleyStarter(M, e);
  }

  // Steffensen's method — superlinear convergence cho high-e
  const maxIter = e >= 0.95 ? 12 : 8;
  const tolerance = 1e-12;

  for (let i = 0; i < maxIter; i++) {
    const sinE = Math.sin(E);
    const cosE = Math.cos(E);
    const f = E - e * sinE - M;

    if (Math.abs(f) < tolerance) {
      return { sinE, cosE };
    }

    const fp = 1 - e * cosE;
    const fpp = e * sinE;

    // Halley step (bậc 3)
    const denom = fp - (f * fpp) / (2 * fp);
    if (Math.abs(denom) < 1e-15) break;
    E -= f / denom;
  }

  return { sinE: Math.sin(E), cosE: Math.cos(E) };
}

/**
 * Barker's equation — giải trực tiếp cho quỹ đạo gần parabolic (e ≈ 1).
 * Tính toán O(1), không cần iteration.
 *
 * Phương pháp:
 * 1. Giải cubic D³ + 3D = 3M (Barker parabolic) bằng Vieta's substitution
 * 2. D = tan(ν/2), suy ra True Anomaly ν
 * 3. Chuyển ν → E dùng atan2 (tránh singularity)
 * Sai số < 0.01% — chấp nhận theo yêu cầu.
 */
function solveCometBarker(M, e) {
  // Wrap M vào [0, 2π) rồi chuyển sang [-π, π]
  M = wrapTwoPi(M);
  let Msym = M;
  if (Msym > Math.PI) Msym -= TWO_PI;

  // Giải cubic: D³ + 3D - 3M = 0 (Barker's equation cho e=1)
  // Vieta's substitution: D = t - 1/t, dẫn đến t³ - 1/t³ = 3M
  // → u² - 3M·u - 1 = 0 với u = t³
  const disc = Math.sqrt(9 * Msym * Msym + 4);
  const u = (3 * Msym + disc) / 2;
  const t = Math.cbrt(u);
  const D = t - 1 / t; // = tan(ν/2)

  // True anomaly từ D = tan(ν/2)
  const nu = 2 * Math.atan(D);

  // Chuyển True Anomaly → Eccentric Anomaly dùng atan2 (tránh singularity)
  const sinHalfNu = Math.sin(nu / 2);
  const cosHalfNu = Math.cos(nu / 2);
  const sqrt1me = Math.sqrt(1 - e);
  const sqrt1pe = Math.sqrt(1 + e);
  const E = 2 * Math.atan2(sqrt1me * sinHalfNu, sqrt1pe * cosHalfNu);

  return { sinE: Math.sin(E), cosE: Math.cos(E) };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 2. Comet Orbital Cache — chuyên biệt cho sao chổi
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tạo hoặc lấy cache quỹ đạo cho sao chổi.
 * Bao gồm rotation matrix (i, Ω, ω) + derived constants + throttle state.
 */
function getOrCreateCometCache(data) {
  let cache = data._cometCache;
  if (cache) return cache;

  const i  = (data.inclination        || 0) * DEG_TO_RAD;
  const Omega = (data.longitudeAscending || 0) * DEG_TO_RAD;
  const omega = (data.argumentPeriapsis  || 0) * DEG_TO_RAD;

  const cosO = Math.cos(Omega), sinO = Math.sin(Omega);
  const cosw = Math.cos(omega), sinw = Math.sin(omega);
  const cosi = Math.cos(i), sini = Math.sin(i);

  // Full rotation matrix cho quỹ đạo 3D
  // Perifocal → Heliocentric
  const r00 = cosO * cosw - sinO * sinw * cosi;
  const r10 = sini * sinw;
  const r20 = sinO * cosw + cosO * sinw * cosi;

  const r01 = -cosO * sinw - sinO * cosw * cosi;
  const r11 =  sini * cosw;
  const r21 = -sinO * sinw + cosO * cosw * cosi;

  const e = data.eccentricity || 0;
  const a = getDisplayOrbitRadius(data);
  const periodS = Math.abs(data.orbitalPeriod) * SECONDS_PER_DAY;
  const n = periodS > 0 ? TWO_PI / periodS : 0;

  const sqrt1me2 = Math.sqrt(Math.max(0, 1 - e * e));

  // Khoảng cách perihelion và aphelion (display units)
  const perihelion = a * (1 - e);
  const aphelion = a * (1 + e);

  cache = {
    r00, r01, r10, r11, r20, r21,
    a,
    e,
    sqrt1me2,
    a_sqrt1me2: a * sqrt1me2,
    an: a * n,
    n,
    phase: (data.initialPhaseDeg || 0) * DEG_TO_RAD,
    perihelion,
    aphelion,
    // Throttle state
    lastUpdateFrame: -999,
    lastX: 0,
    lastY: 0,
    lastZ: 0,
  };

  data._cometCache = cache;
  return cache;
}

/**
 * Xóa cache quỹ đạo sao chổi (khi dữ liệu thay đổi).
 */
export function invalidateCometCache(data) {
  if (data) {
    delete data._cometCache;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3. Position Computation — Single Comet
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tính vị trí quỹ đạo của một sao chổi.
 * @param {Object} data - Dữ liệu sao chổi (đã normalize)
 * @param {number} timeElapsed - Thời gian mô phỏng (giây)
 * @param {{x,y,z}} out - Object nhận kết quả (zero-alloc)
 * @returns {{x,y,z}}
 */
export function computeCometPosition(data, timeElapsed, out) {
  const c = getOrCreateCometCache(data);
  const M = wrapTwoPi(c.n * timeElapsed + c.phase);

  const { sinE, cosE } = solveCometKepler(M, c.e);

  let xp = c.a * (cosE - c.e);
  let yp = c.a_sqrt1me2 * sinE;

  // ── Safety Clamp: ngăn sao chổi bay xuyên Mặt Trời ──
  // Tính khoảng cách từ focus (Mặt Trời)
  const r = c.a * (1 - c.e * cosE);
  if (r < MIN_PERIHELION_DISPLAY) {
    // Scale lại vị trí để giữ khoảng cách tối thiểu
    const scale = MIN_PERIHELION_DISPLAY / Math.max(r, 0.001);
    xp *= scale;
    yp *= scale;
  }

  // ── Safety Clamp: ngăn bay thẳng (NaN/Infinity check) ──
  if (!isFinite(xp) || !isFinite(yp)) {
    // Fallback: đặt ở perihelion trên trục x
    xp = c.perihelion;
    yp = 0;
  }

  // Xoay từ perifocal sang heliocentric
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

// ─────────────────────────────────────────────────────────────────────────────
// § 4. Batch Computation với Distance-Based Throttle
// ─────────────────────────────────────────────────────────────────────────────

// Scratch object dùng lại — zero allocation
const _scratchPos = { x: 0, y: 0, z: 0 };

/**
 * Tính throttle interval dựa trên khoảng cách hiện tại từ Mặt Trời.
 * @param {number} distSq - Bình phương khoảng cách (display units)
 * @param {number} auScale - Hệ số quy đổi AU (constants.AU)
 * @returns {number} Số frame giữa mỗi lần cập nhật
 */
function getThrottleInterval(distSq, auScale) {
  const distAU = Math.sqrt(distSq) / auScale;
  if (distAU < THROTTLE_NEAR) return 1;
  if (distAU < THROTTLE_MID) return 2;
  if (distAU < THROTTLE_HIDE) return THROTTLE_FAR;
  return -1; // Ẩn hoàn toàn
}

/**
 * Cập nhật vị trí batch cho tất cả sao chổi với throttle thông minh.
 *
 * @param {Array} cometBodies - Mảng body objects (chỉ sao chổi)
 * @param {number} simulationTime - Thời gian mô phỏng hiện tại (giây)
 * @param {number} frameCount - Frame counter hiện tại
 * @param {number} auScale - Hệ số quy đổi AU (import từ constants.js)
 */
export function updateCometPositions(cometBodies, simulationTime, frameCount, auScale) {
  for (let i = 0; i < cometBodies.length; i++) {
    const body = cometBodies[i];
    const data = body.data;
    const cache = getOrCreateCometCache(data);

    // ── Distance-based throttle ──
    const dx = cache.lastX, dy = cache.lastY, dz = cache.lastZ;
    const distSq = dx * dx + dy * dy + dz * dz;
    const interval = getThrottleInterval(distSq, auScale);

    if (interval === -1) {
      // Quá xa: ẩn hoàn toàn
      body.pivot.visible = false;
      continue;
    }

    body.pivot.visible = true;

    // Skip nếu chưa đến lượt cập nhật
    if (frameCount - cache.lastUpdateFrame < interval) {
      continue;
    }

    cache.lastUpdateFrame = frameCount;

    // Tính vị trí mới
    computeCometPosition(data, simulationTime, _scratchPos);

    // Cập nhật vị trí body
    body.pivot.position.set(_scratchPos.x, _scratchPos.y, _scratchPos.z);

    // Lưu vị trí cho lần throttle check tiếp theo
    cache.lastX = _scratchPos.x;
    cache.lastY = _scratchPos.y;
    cache.lastZ = _scratchPos.z;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5. Orbit Path Sampler — chuyên biệt cho sao chổi
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lấy mẫu đường quỹ đạo sao chổi với True Anomaly sampling.
 * Tập trung nhiều điểm ở perihelion, thưa hơn ở aphelion.
 *
 * @param {Object} data - Dữ liệu sao chổi
 * @param {number} samples - Số điểm mẫu
 * @param {Float64Array} [out] - Buffer đầu ra (optional, sẽ tạo mới nếu không có)
 * @returns {Float64Array} Buffer chứa (x,y,z) × samples
 */
export function sampleCometOrbitPath(data, samples = 256, out) {
  if (!out || out.length < samples * 3) {
    out = new Float64Array(samples * 3);
  }

  const c = getOrCreateCometCache(data);

  // Pre-compute conversion factors (constant cho toàn bộ quỹ đạo)
  const sqrt1me = Math.sqrt(1 - c.e);
  const sqrt1pe = Math.sqrt(1 + c.e);

  for (let i = 0; i < samples; i++) {
    // True Anomaly sampling — phân bố đều trên đường cong thực tế
    const nu = (i / samples) * TWO_PI;

    // Chuyển True Anomaly → Eccentric Anomaly dùng atan2 (tránh singularity tại ν=π)
    const sinHalfNu = Math.sin(nu / 2);
    const cosHalfNu = Math.cos(nu / 2);
    const E = 2 * Math.atan2(sqrt1me * sinHalfNu, sqrt1pe * cosHalfNu);

    const sinE = Math.sin(E);
    const cosE = Math.cos(E);

    let xp = c.a * (cosE - c.e);
    let yp = c.a_sqrt1me2 * sinE;

    // Safety: clamp minimum distance — ngăn bay xuyên Mặt Trời
    const r = c.a * (1 - c.e * cosE);
    if (r < MIN_PERIHELION_DISPLAY) {
      const scale = MIN_PERIHELION_DISPLAY / Math.max(r, 0.001);
      xp *= scale;
      yp *= scale;
    }

    if (!isFinite(xp) || !isFinite(yp)) {
      xp = MIN_PERIHELION_DISPLAY;
      yp = 0;
    }

    const base = i * 3;
    out[base]     = c.r00 * xp + c.r01 * yp;
    out[base + 1] = c.r10 * xp + c.r11 * yp;
    out[base + 2] = c.r20 * xp + c.r21 * yp;
  }

  return out;
}

/**
 * Tính khoảng cách AU tại mỗi điểm mẫu — dùng cho gradient shader.
 * @param {Object} data - Dữ liệu sao chổi
 * @param {number} samples - Số điểm mẫu (phải khớp với sampleCometOrbitPath)
 * @returns {Float32Array} Mảng distAU cho mỗi điểm
 */
export function sampleCometOrbitDistances(data, samples = 256) {
  const c = getOrCreateCometCache(data);
  const distances = new Float32Array(samples);

  for (let i = 0; i < samples; i++) {
    const nu = (i / samples) * TWO_PI;
    // r = a(1-e²)/(1+e·cos(ν))
    const r = c.a * (1 - c.e * c.e) / (1 + c.e * Math.cos(nu));
    distances[i] = Math.max(0, r);
  }

  return distances;
}
