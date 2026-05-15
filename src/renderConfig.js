// Cấu hình render — Quality Preset System
// Quản lý tất cả thông số render phụ thuộc vào khả năng phần cứng

/**
 * Ba preset chất lượng:
 *  - High:     Dành cho desktop/GPU mạnh. Đầy đủ hiệu ứng.
 *  - Balanced: Dành cho laptop/tablet. Giảm nhẹ một số hiệu ứng.
 *  - Low:      Dành cho mobile/thiết bị yếu. Giảm tối đa để giữ FPS.
 */
export const QUALITY_PRESETS = {
  high: {
    label: 'Cao',
    maxPixelRatio: 2,
    starCount: 5000,
    asteroidCount: 3000,
    bloomStrength: 2.5,
    bloomRadius: 0.8,
    bloomThreshold: 0.15,
    atmosphereEnabled: true,
    atmosphereOpacityScale: 1.0,
    cloudsEnabled: true,
    cloudOpacityScale: 1.0,
    ringsEnabled: true,
    coronaEnabled: true,
    antialias: true,
  },
  balanced: {
    label: 'Cân bằng',
    maxPixelRatio: 1.5,
    starCount: 3000,
    asteroidCount: 1500,
    bloomStrength: 2.0,
    bloomRadius: 0.6,
    bloomThreshold: 0.2,
    atmosphereEnabled: true,
    atmosphereOpacityScale: 0.8,
    cloudsEnabled: true,
    cloudOpacityScale: 0.9,
    ringsEnabled: true,
    coronaEnabled: true,
    antialias: true,
  },
  low: {
    label: 'Thấp',
    maxPixelRatio: 1,
    starCount: 1500,
    asteroidCount: 500,
    bloomStrength: 1.2,
    bloomRadius: 0.4,
    bloomThreshold: 0.3,
    atmosphereEnabled: true,
    atmosphereOpacityScale: 0.5,
    cloudsEnabled: true,
    cloudOpacityScale: 0.6,
    ringsEnabled: true,
    coronaEnabled: false, // Tắt corona để tiết kiệm draw call
    antialias: false,
  },
};

const STORAGE_KEY = 'solar-system-quality-preset';

/**
 * Phát hiện thiết bị yếu/mobile để chọn preset mặc định phù hợp.
 * @returns {'high' | 'balanced' | 'low'}
 */
function detectDefaultPreset() {
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isSmallViewport = window.innerWidth < 768;
  const isHighDPR = window.devicePixelRatio > 2;

  if (isMobile || (isSmallViewport && isHighDPR)) {
    return 'low';
  }
  if (isSmallViewport || isHighDPR) {
    return 'balanced';
  }
  return 'high';
}

/**
 * Lấy preset hiện tại từ localStorage, nếu không có thì auto-detect.
 * @returns {'high' | 'balanced' | 'low'}
 */
export function getCurrentPresetKey() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && QUALITY_PRESETS[stored]) {
    return stored;
  }
  return detectDefaultPreset();
}

/**
 * Lấy object cấu hình preset hiện tại.
 * @returns {Object}
 */
export function getCurrentPreset() {
  return QUALITY_PRESETS[getCurrentPresetKey()];
}

/**
 * Lưu preset đã chọn vào localStorage.
 * @param {'high' | 'balanced' | 'low'} key
 */
export function savePresetKey(key) {
  if (QUALITY_PRESETS[key]) {
    localStorage.setItem(STORAGE_KEY, key);
  }
}

// ═══ Event system để thông báo khi preset thay đổi ═══
const listeners = [];

/**
 * Đăng ký callback khi preset thay đổi.
 * @param {(preset: Object, key: string) => void} callback
 * @returns {() => void} Hàm hủy đăng ký
 */
export function onPresetChange(callback) {
  listeners.push(callback);
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

/**
 * Áp dụng preset mới và thông báo tất cả listener.
 * @param {'high' | 'balanced' | 'low'} key
 */
export function applyPreset(key) {
  if (!QUALITY_PRESETS[key]) return;
  savePresetKey(key);
  const preset = QUALITY_PRESETS[key];
  for (const cb of listeners) {
    cb(preset, key);
  }
}
