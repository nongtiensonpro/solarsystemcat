// ═══ Terrestrial Planets Interior Data Module ═══
// Dữ liệu cấu trúc phân lớp nội hàm Hành tinh đá
// Nguồn: Mục 3 — Báo cáo "Cấu trúc Nội hàm Thiên thể"

export const TERRESTRIAL_INTERIORS = {
  mercury: {
    coreRadiusFraction: 0.75,
    coreType: 'Dị thường (Cực lớn)',
    magneticField: 'Yếu (~1% Trái Đất)',
    dynamoMechanism: 'Đối lưu nghịch đảo',
    crystallization: 'Top-down (Tuyết sắt rơi vào tâm)',
    layers: [
      { name: 'Lõi kim loại', min: 0, max: 0.75, colorHex: '#a0a4a8', desc: 'Fe, Si (>10%), S, C lỏng và rắn' },
      { name: 'Manti đá', min: 0.75, max: 1.0, colorHex: '#736559', desc: 'Silicate mỏng' }
    ]
  },
  venus: {
    coreRadiusFraction: 0.58, // ~3228km / 6051km (tổng bán kính ~53%)
    coreType: 'Lỏng hoàn toàn, không phân lớp',
    magneticField: 'Không có',
    dynamoMechanism: 'Đã tắt',
    crystallization: 'Khuếch tán nhiệt (Stagnant lid)',
    layers: [
      { name: 'Lõi lỏng', min: 0, max: 0.58, colorHex: '#d89b65', desc: 'Lỏng, không có lõi trong rắn' },
      { name: 'Manti', min: 0.58, max: 1.0, colorHex: '#a86a32', desc: 'Lớp vỏ cách nhiệt hoàn hảo' }
    ]
  },
  earth: {
    coreRadiusFraction: 0.55, // ~3485km / 6371km
    coreType: 'Tiêu chuẩn PREM (2 lớp)',
    magneticField: 'Mạnh nhất nhóm đá',
    dynamoMechanism: 'Geodynamo (Đối lưu lõi ngoài)',
    crystallization: 'Bottom-up (Kết tinh từ tâm)',
    layers: [
      { name: 'Lõi trong (rắn)', min: 0, max: 0.19, colorHex: '#ffefc2', desc: 'Fe-Ni rắn, 5000-6000K, 360 GPa' },
      { name: 'Lõi ngoài (lỏng)', min: 0.19, max: 0.55, colorHex: '#ff9833', desc: 'Fe-Ni lỏng đối lưu tạo từ trường' },
      { name: 'Manti & Vỏ', min: 0.55, max: 1.0, colorHex: '#698c42', desc: 'Silicate' }
    ]
  },
  mars: {
    coreRadiusFraction: 0.50, // Ước tính
    coreType: 'Nhẹ, nhiều Lưu huỳnh (Fe-S)',
    magneticField: 'Từ dư phân tán (Crustal)',
    dynamoMechanism: 'Đã tắt',
    crystallization: 'N/A (Lõi lạnh dần)',
    layers: [
      { name: 'Lõi Fe-S', min: 0, max: 0.50, colorHex: '#8f4f3e', desc: 'Lỏng một phần/rắn hoàn toàn' },
      { name: 'Manti', min: 0.50, max: 1.0, colorHex: '#a1532f', desc: 'Giàu sắt' }
    ]
  }
};
