// ═══ Gas Giants Interior Data Module ═══
// Dữ liệu cấu trúc phân lớp nội hàm Hành tinh khí khổng lồ
// Nguồn: Mục 4 — Báo cáo "Cấu trúc Nội hàm Thiên thể"

export const GAS_GIANT_INTERIORS = {
  jupiter: {
    coreRadiusFraction: 0.40, // Lõi mờ 30-50%, lấy trung bình 40%
    coreType: 'Lõi mờ (Fuzzy core)',
    magneticField: 'Mạnh nhất hệ, đa cực (20x Trái Đất)',
    dynamoMechanism: 'Hydro kim loại lỏng chuyển động',
    specialFeature: 'Mưa Heli phân tách',
    layers: [
      { name: 'Lõi mờ gradient', min: 0, max: 0.40, colorHex: '#4a5b6b', desc: 'Đá, băng hòa tan trong Hydro kim loại (~20,000K)' },
      { name: 'Hydro kim loại lỏng', min: 0.40, max: 0.80, colorHex: '#7b95a6', desc: 'Dẫn điện, áp suất >200 GPa' },
      { name: 'Mưa Heli', min: 0.60, max: 0.80, colorHex: '#c29b63', desc: 'Heli ngưng tụ rơi xuống (Chồng lấn)' },
      { name: 'Hydro phân tử', min: 0.80, max: 1.0, colorHex: '#d1b99b', desc: 'Lớp khí quyển ngoài cùng' }
    ]
  },
  saturn: {
    coreRadiusFraction: 0.30, // Nhỏ hơn Jupiter một chút
    coreType: 'Fuzzy core (rất phân tán)',
    magneticField: 'Mạnh, đồng trục hoàn hảo',
    dynamoMechanism: 'Hydro kim loại lỏng sâu bên trong',
    specialFeature: 'Mưa Heli mãnh liệt (Nhiệt thặng dư)',
    layers: [
      { name: 'Lõi mờ phân tán', min: 0, max: 0.30, colorHex: '#524e47', desc: 'Vật chất nặng hòa tan, rất thiếu ranh giới rõ' },
      { name: 'Hydro kim loại lỏng', min: 0.30, max: 0.60, colorHex: '#807764', desc: 'Vùng dynamo hẹp hơn Mộc tinh' },
      { name: 'Vùng Mưa Heli dày', min: 0.45, max: 0.70, colorHex: '#e0c082', desc: 'Heli cạn kiệt ở tầng ngoài, rơi xuống lõi sinh nhiệt' },
      { name: 'Hydro phân tử', min: 0.70, max: 1.0, colorHex: '#f2dcae', desc: 'Khí quyển siêu bão' }
    ]
  }
};
