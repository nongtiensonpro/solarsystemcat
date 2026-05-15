// planetData.js — Adapter tạm thời
// Giữ tương thích ngược cho các module chưa chuyển sang async data loading.
// Module này sẽ được loại bỏ dần khi tất cả consumer đã dùng dataLoader.js.
//
// ⚠ LƯU Ý: File này chỉ được dùng bởi các module cần import đồng bộ.
// Từ Phase 1, main.js tải dữ liệu qua loadSolarSystemData() (async).

/**
 * Biến lưu trữ dữ liệu đã tải — sẽ được gán bởi main.js sau khi fetch JSON.
 * @type {Object[]}
 */
export let planetData = [];

/**
 * Cập nhật dữ liệu hành tinh (gọi bởi main.js sau khi tải JSON).
 * @param {Object[]} data - Dữ liệu đã chuẩn hóa từ dataLoader.js
 */
export function setPlanetData(data) {
  planetData = data;
}
