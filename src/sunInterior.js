// ═══ Sun Interior Data Module ═══
// Dữ liệu cấu trúc phân lớp nội hàm Mặt Trời theo tài liệu khoa học
// Nguồn: Mục 2 — Báo cáo "Cấu trúc Nội hàm Thiên thể"

/**
 * Cấu trúc 4 vùng phân lớp của Mặt Trời
 * Tất cả giá trị bán kính tính theo phần trăm tổng bán kính Mặt Trời (R☉)
 */
export const SUN_LAYERS = [
  {
    id: 'core',
    name: 'Lõi (Core)',
    nameEn: 'Core',
    radiusMin: 0.0,
    radiusMax: 0.25,   // 0 → 25% R☉
    color: [1.0, 0.98, 0.85],      // Trắng-vàng rực (plasma siêu đặc)
    colorHex: '#fff8d9',
    temperatureCenter: 15700000,     // 15.7 triệu K tại tâm
    temperatureEdge: 7000000,        // ~7 triệu K tại ranh giới ngoài
    densityCenter: 150,              // 150 g/cm³ tại tâm
    densityEdge: 20,                 // ~20 g/cm³ tại ranh giới
    pressureCenter: 2.5e16,          // ~250 tỷ atm (Pa)
    composition: '~34% H, ~64% He tại tâm',
    compositionVi: 'Plasma siêu đặc: ~34% Hydro, ~64% Heli, ~2% kim loại nặng',
    mechanism: 'Phản ứng chuỗi proton-proton (p-p chain)',
    mechanismVi: 'Tổng hợp hạt nhân: 600 triệu tấn H → He mỗi giây',
    powerDensity: 276.5,             // W/m³ tại tâm (cực kỳ thấp!)
    description: 'Vùng duy nhất xảy ra phản ứng nhiệt hạch. Mật độ gấp 150 lần nước.',
  },
  {
    id: 'radiative',
    name: 'Vùng Bức xạ',
    nameEn: 'Radiative Zone',
    radiusMin: 0.25,
    radiusMax: 0.70,   // 25% → 70% R☉
    color: [1.0, 0.85, 0.45],       // Vàng-cam
    colorHex: '#ffd972',
    temperatureInner: 7000000,
    temperatureOuter: 2000000,
    densityInner: 20,
    densityOuter: 0.2,
    composition: '~73% H, ~25% He',
    compositionVi: 'Plasma: ~73% Hydro, ~25% Heli',
    mechanism: 'Photon truyền qua hấp thụ/tái phát xạ',
    mechanismVi: 'Photon mất ~170,000 năm để xuyên qua vùng này',
    description: 'Năng lượng truyền qua bức xạ photon. Opacity cực cao.',
  },
  {
    id: 'convective',
    name: 'Vùng Đối lưu',
    nameEn: 'Convective Zone',
    radiusMin: 0.70,
    radiusMax: 1.00,   // 70% → 100% R☉ (chiếm 15% ngoài cùng theo tài liệu)
    color: [1.0, 0.55, 0.15],       // Cam-đỏ
    colorHex: '#ff8c26',
    temperatureInner: 2000000,
    temperatureOuter: 5778,          // Bề mặt quang quyển
    densityInner: 0.2,
    densityOuter: 0.0000002,         // 2×10⁻⁷ g/cm³
    composition: '~73.5% H, ~24.9% He',
    compositionVi: 'Dòng plasma đối lưu sôi sục',
    mechanism: 'Đối lưu Rayleigh-Bénard',
    mechanismVi: 'Các ô đối lưu (granules) mang plasma nóng lên bề mặt',
    description: 'Dòng plasma đối lưu tạo ra granulation trên bề mặt.',
  },
  {
    id: 'photosphere',
    name: 'Quang quyển',
    nameEn: 'Photosphere',
    radiusMin: 0.997,
    radiusMax: 1.00,   // Lớp ngoài cùng rất mỏng (~500 km)
    color: [1.0, 0.92, 0.65],       // Vàng sáng
    colorHex: '#ffebab',
    temperature: 5778,               // K
    description: 'Bề mặt phát sáng nhìn thấy được. Chứa granules và vết đen.',
  }
];

/**
 * Nội suy nhiệt độ theo bán kính chuẩn hóa (0 = tâm, 1 = bề mặt)
 * Dùng cho hiển thị gradient trong UI và cross-section
 * @param {number} r - Bán kính chuẩn hóa [0, 1]
 * @returns {number} Nhiệt độ (Kelvin)
 */
export function interpolateTemperature(r) {
  const rClamped = Math.max(0, Math.min(1, r));
  // Hàm nội suy phi tuyến dựa trên mô hình Mặt Trời tiêu chuẩn
  // T(r) ≈ T_center × (1 - r)^α với α điều chỉnh theo vùng
  if (rClamped <= 0.25) {
    // Lõi: giảm nhanh từ 15.7M → 7M K
    const t = rClamped / 0.25;
    return 15700000 * (1 - t * 0.554); // 15.7M → ~7M
  } else if (rClamped <= 0.70) {
    // Vùng bức xạ: giảm từ 7M → 2M K
    const t = (rClamped - 0.25) / 0.45;
    return 7000000 * Math.pow(1 - t * 0.714, 1.5);
  } else {
    // Vùng đối lưu: giảm nhanh từ 2M → 5778 K
    const t = (rClamped - 0.70) / 0.30;
    return 2000000 * Math.pow(1 - t, 3) + 5778;
  }
}

/**
 * Nội suy mật độ theo bán kính
 * @param {number} r - Bán kính chuẩn hóa [0, 1]
 * @returns {number} Mật độ (g/cm³)
 */
export function interpolateDensity(r) {
  const rClamped = Math.max(0, Math.min(1, r));
  if (rClamped <= 0.25) {
    const t = rClamped / 0.25;
    return 150 * Math.pow(1 - t, 2) + 20 * t;
  } else if (rClamped <= 0.70) {
    const t = (rClamped - 0.25) / 0.45;
    return 20 * Math.pow(1 - t, 2.5);
  } else {
    const t = (rClamped - 0.70) / 0.30;
    return 0.2 * Math.pow(1 - t, 4);
  }
}

/**
 * Nội suy áp suất theo bán kính (Pa)
 * @param {number} r - Bán kính chuẩn hóa [0, 1]
 * @returns {number} Áp suất (Pa)
 */
export function interpolatePressure(r) {
  const rClamped = Math.max(0, Math.min(1, r));
  // Áp suất giảm theo luỹ thừa từ tâm ra ngoài
  const P_center = 2.5e16; // Pa (~250 tỷ atm)
  return P_center * Math.pow(1 - rClamped, 5.5);
}

/**
 * Tính mật độ công suất nhiệt hạch tại bán kính cho trước
 * Tài liệu: 276.5 W/m³ tại tâm, giảm gần như triệt tiêu ở 30% R☉
 * @param {number} r - Bán kính chuẩn hóa [0, 1]
 * @returns {number} W/m³
 */
export function fusionPowerDensity(r) {
  if (r > 0.25) return 0; // Không có phản ứng ngoài lõi
  const rNorm = r / 0.25;
  // Giảm theo hàm mũ cực mạnh
  return 276.5 * Math.exp(-10 * rNorm * rNorm);
}

/**
 * Cơ chế tự cân bằng nhiệt hạch (self-correcting equilibrium)
 * Mô phỏng dao động tự nhiên: tăng nhiệt → giãn nở → giảm mật độ → giảm phản ứng → ổn định
 * @param {number} time - Thời gian shader (giây)
 * @returns {number} Hệ số công suất [0.95, 1.05] — dao động ±5%
 */
export function selfRegulatingFactor(time) {
  // Dao động chậm, biên độ nhỏ mô phỏng quá trình tự điều chỉnh
  const cycle1 = Math.sin(time * 0.13) * 0.025;
  const cycle2 = Math.sin(time * 0.31 + 1.7) * 0.015;
  const cycle3 = Math.sin(time * 0.07 + 3.2) * 0.01;
  return 1.0 + cycle1 + cycle2 + cycle3;
}

/**
 * Lấy thông tin vùng (layer) theo bán kính
 * @param {number} r - Bán kính chuẩn hóa [0, 1]
 * @returns {Object} Layer object
 */
export function getLayerAtRadius(r) {
  for (const layer of SUN_LAYERS) {
    if (r >= layer.radiusMin && r <= layer.radiusMax) {
      return layer;
    }
  }
  return SUN_LAYERS[SUN_LAYERS.length - 1];
}
