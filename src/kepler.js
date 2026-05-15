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

  // Giá trị khởi tạo: E₀ = M (đủ tốt cho e thấp)
  let E = M;

  for (let i = 0; i < maxIter; i++) {
    // f(E) = E - e·sin(E) - M
    // f'(E) = 1 - e·cos(E)
    const f = E - e * Math.sin(E) - M;
    const df = 1 - e * Math.cos(E);
    const delta = f / df;

    E -= delta;

    if (Math.abs(delta) < tolerance) {
      return E;
    }
  }

  return E; // Trả về giá trị gần đúng nhất
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
  const a = data.semiMajorAxis * AU;
  const e = data.eccentricity;
  const inclinationRad = (data.inclination || 0) * Math.PI / 180;

  // Chu kỳ quỹ đạo (ngày → giây)
  const periodSeconds = data.orbitalPeriod * 86400;

  // 1. Dị thường trung bình: M = (2π / T) * t
  const M = (2 * Math.PI / periodSeconds) * timeElapsed;

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
