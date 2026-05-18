// Kepler Orbital Engine — Động lực học quỹ đạo thiên thể
import { AU } from './constants.js';

/**
 * Giải phương trình Kepler: M = E - e·sin(E)
 * Sử dụng phương pháp Newton-Raphson để tìm Dị thường lệch tâm (E)
 *
 * @param {number} M - Dị thường trung bình (Mean Anomaly) - radian
 * @param {number} e - Độ lệch tâm (Eccentricity) 0 ≤ e < 1
 * @param {number} tolerance - Ngưỡng hội tụ
 * @param {number} maxIter - Số vòng lặp tối đa
 * @returns {number} E - Dị thường lệch tâm (Eccentric Anomaly) - radian
 */
export function solveKepler(M, e, tolerance = 1e-10, maxIter = 100) {
  // Chuẩn hóa M về khoảng [0, 2π)
  M = M % (2 * Math.PI);
  if (M < 0) M += 2 * Math.PI;

  // Giá trị khởi tạo tốt hơn cho độ lệch tâm cao
  // Dùng xấp xỉ bậc nhất E₀ ≈ M + e·sin(M) / (1 - e·cos(M))
  // để tránh divergence khi e → 1
  let E;
  if (e > 0.8) {
    if (M < Math.PI) {
      E = M + 0.85 * e;
    } else {
      E = M - 0.85 * e;
    }
    E = Math.max(0, Math.min(2 * Math.PI, E));
  } else {
    E = M;
  }

  for (let i = 0; i < maxIter; i++) {
    const f = E - e * Math.sin(E) - M;
    const df = 1 - e * Math.cos(E);
    const delta = f / df;

    E -= delta;

    if (Math.abs(delta) < tolerance) {
      return E;
    }

    // Ổn định: giữ E trong [0, 2π] để tránh trôi
    if (E < 0 || E > 2 * Math.PI) {
      E = Math.max(0, Math.min(2 * Math.PI, E));
    }
  }

  return E;
}

/**
 * Tính vị trí 3D của thiên thể trên quỹ đạo tại thời điểm t
 *
 * Pipeline:
 *   1. t → Mean Anomaly (M)
 *   2. M → Eccentric Anomaly (E) via Newton-Raphson
 *   3. E → Tọa độ (x, z) trên mặt phẳng quỹ đạo
 *   4. Áp dụng ma trận xoay cho Inclination → (x, y, z) trong World Space
 *
 * @param {Object} data - Dữ liệu hành tinh từ planetData.js
 * @param {number} timeElapsed - Thời gian đã trôi qua (giây mô phỏng)
 * @returns {{ x: number, y: number, z: number }}
 */
export function computeOrbitalPosition(data, timeElapsed) {
  // Bán trục lớn (AU → units)
  // Ưu tiên displayOrbitRadius nếu có (layout tùy chỉnh), nếu không dùng logic orbitScale
  const orbitScale = data.orbitScale || 1;
  const a = data.displayOrbitRadius ?? (data.semiMajorAxis * AU * orbitScale);
  const e = data.eccentricity;
  const inclinationRad = (data.inclination || 0) * Math.PI / 180;

  // Chu kỳ quỹ đạo (ngày → giây)
  const periodSeconds = data.orbitalPeriod * 86400;

  // 1. Dị thường trung bình: M = (2π / T) * t + phase
  const phase = (data.initialPhaseDeg || 0) * Math.PI / 180;
  const M = (2 * Math.PI / periodSeconds) * timeElapsed + phase;

  // 2. Giải phương trình Kepler → E
  const E = solveKepler(M, e);

  // 3. Tọa độ trên mặt phẳng quỹ đạo cục bộ
  //    x' = a * (cos(E) - e)
  //    z' = a * sqrt(1 - e²) * sin(E)
  const xLocal = a * (Math.cos(E) - e);
  const zLocal = a * Math.sqrt(1 - e * e) * Math.sin(E);

  // 4. Xoay theo Inclination (nghiêng mặt phẳng quỹ đạo)
  //    Xoay quanh trục X → y = z' * sin(i), z = z' * cos(i)
  const x = xLocal;
  const y = zLocal * Math.sin(inclinationRad);
  const z = zLocal * Math.cos(inclinationRad);

  return { x, y, z };
}

/**
 * Tính vận tốc 3D của thiên thể trên quỹ đạo Kepler tại thời điểm t
 * Sử dụng đạo hàm giải tích của phương trình Kepler (chính xác hơn sai phân hữu hạn)
 *
 * Pipeline:
 *   1. t → Mean Anomaly (M)
 *   2. M → Eccentric Anomaly (E) via Newton-Raphson
 *   3. E → Vận tốc (vx, vz) trên mặt phẳng quỹ đạo
 *   4. Áp dụng ma trận xoay cho Inclination → (vx, vy, vz) trong World Space
 *
 * @param {Object} data - Dữ liệu hành tinh từ planetData.js
 * @param {number} timeElapsed - Thời gian đã trôi qua (giây mô phỏng)
 * @returns {{ vx: number, vy: number, vz: number }}
 */
export function computeOrbitalVelocity(data, timeElapsed) {
  const orbitScale = data.orbitScale || 1;
  const a = data.displayOrbitRadius ?? (data.semiMajorAxis * AU * orbitScale);
  const e = data.eccentricity;
  const inclinationRad = (data.inclination || 0) * Math.PI / 180;
  const periodSeconds = data.orbitalPeriod * 86400;
  const phase = (data.initialPhaseDeg || 0) * Math.PI / 180;

  if (periodSeconds === 0 || a <= 0) return { vx: 0, vy: 0, vz: 0 };

  const M = (2 * Math.PI / periodSeconds) * timeElapsed + phase;
  const E = solveKepler(M, e);
  const n = 2 * Math.PI / periodSeconds;
  const denom = 1 - e * Math.cos(E);

  const vxLocal = -a * n * Math.sin(E) / denom;
  const vzLocal = a * n * Math.sqrt(1 - e * e) * Math.cos(E) / denom;

  return {
    vx: vxLocal,
    vy: vzLocal * Math.sin(inclinationRad),
    vz: vzLocal * Math.cos(inclinationRad)
  };
}
