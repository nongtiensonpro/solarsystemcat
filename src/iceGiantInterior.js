// ═══ Ice Giants Interior Data Module ═══
// Dữ liệu cấu trúc phân lớp nội hàm Hành tinh băng khổng lồ
// Nguồn: Mục 5 — Báo cáo "Cấu trúc Nội hàm Thiên thể"

export const ICE_GIANT_INTERIORS = {
  uranus: {
    coreRadiusFraction: 0.20, // ~20%
    coreType: 'Lõi đá rắn',
    magneticField: 'Đa cực, lệch tâm 59° (Rất dị thường)',
    dynamoMechanism: 'Manti Nước Siêu Ion',
    specialFeature: 'Không có nhiệt nội dư (Tắt đối lưu)',
    layers: [
      { name: 'Lõi đá/sắt', min: 0, max: 0.20, colorHex: '#4a443e', desc: 'Lõi trung tâm lạnh dần' },
      { name: 'Manti phân tầng', min: 0.20, max: 0.70, colorHex: '#224d57', desc: 'Băng siêu ion (đen, dẫn điện), không đối lưu xuyên lớp' },
      { name: 'Mưa kim cương', min: 0.55, max: 0.70, colorHex: '#8fbccc', desc: 'C tinh thể chìm chậm xuống đáy manti' },
      { name: 'Khí quyển', min: 0.70, max: 1.0, colorHex: '#9cbacc', desc: 'H, He, CH4 lạnh nhất hệ Mặt Trời (-224°C)' }
    ]
  },
  neptune: {
    coreRadiusFraction: 0.25,
    coreType: 'Lõi đá (~1.2 M⊕)',
    magneticField: 'Đa cực, lệch tâm 47°',
    dynamoMechanism: 'Manti Nước Siêu Ion đang đối lưu mạnh',
    specialFeature: 'Nhiệt nội thặng dư ×2.6 lần (Đối lưu dữ dội)',
    layers: [
      { name: 'Lõi đá rắn', min: 0, max: 0.25, colorHex: '#524338', desc: 'Nhiệt độ tâm 5100-7000K, ~700 GPa' },
      { name: 'Đại dương Carbon lỏng', min: 0.25, max: 0.35, colorHex: '#1d1f2b', desc: 'Lớp C lỏng bảo vệ tảng kim cương nổi (giả thuyết)' },
      { name: 'Manti đối lưu', min: 0.35, max: 0.75, colorHex: '#1e436e', desc: 'Băng H2O/NH3/CH4 siêu ion sôi sục' },
      { name: 'Khí quyển', min: 0.75, max: 1.0, colorHex: '#5a8cb8', desc: 'Siêu bão tốc độ >2000 km/h' }
    ]
  }
};
