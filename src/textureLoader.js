import * as THREE from 'three';

const loadingManager = new THREE.LoadingManager();
const textureLoader = new THREE.TextureLoader(loadingManager);

// Bắt sự kiện tải để cập nhật UI
loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
  const percent = Math.floor((itemsLoaded / itemsTotal) * 100);
  const loadingBar = document.getElementById('loading-bar');
  const loadingPercent = document.getElementById('loading-percent');
  
  if (loadingBar) loadingBar.style.width = `${percent}%`;
  if (loadingPercent) loadingPercent.textContent = `Đang tải tài nguyên... ${percent}%`;
};

loadingManager.onLoad = () => {
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    // Fade out
    loadingScreen.classList.add('hidden');
    // Có thể remove element sau khi fade out
    setTimeout(() => {
      loadingScreen.style.display = 'none';
    }, 800);
  }
};

loadingManager.onError = (url) => {
  console.error(`Lỗi tải texture: ${url}`);
};

/**
 * Tải texture và tự động thiết lập colorSpace nếu cần
 * @param {string} url - Đường dẫn texture
 * @param {boolean} isColorMap - Nếu true, sẽ set colorSpace = SRGBColorSpace (dành cho albedo/color maps)
 * @returns {THREE.Texture}
 */
export function loadTexture(url, isColorMap = false) {
  if (!url) return null;
  
  // Xử lý đường dẫn tương đối cho Vite / GitHub Pages
  const baseUrl = import.meta.env.BASE_URL || '/';
  let finalUrl = url;
  if (url.startsWith('/') && !url.startsWith(baseUrl)) {
    finalUrl = baseUrl + url.substring(1);
  }

  const texture = textureLoader.load(finalUrl);
  if (isColorMap) {
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  return texture;
}

/**
 * Tải tất cả textures của một hành tinh dựa trên config
 * @param {Object} data - Dữ liệu hành tinh từ planetData.js
 * @returns {Object} - Object chứa các THREE.Texture đã tải
 */
export function loadPlanetTextures(data) {
  const textures = {};
  if (!data.textures) return textures;

  if (data.textures.albedo) {
    textures.albedo = loadTexture(data.textures.albedo, true);
  }
  if (data.textures.normal) {
    textures.normal = loadTexture(data.textures.normal, false);
  }
  if (data.textures.bump) {
    textures.bump = loadTexture(data.textures.bump, false);
  }
  if (data.textures.specular) {
    textures.specular = loadTexture(data.textures.specular, false);
  }
  if (data.textures.night) {
    textures.night = loadTexture(data.textures.night, true);
  }
  if (data.textures.clouds) {
    textures.clouds = loadTexture(data.textures.clouds, false); // cloud alpha map
  }
  if (data.textures.atmosphere) {
    textures.atmosphere = loadTexture(data.textures.atmosphere, true);
  }
  if (data.textures.ring) {
    textures.ring = loadTexture(data.textures.ring, true);
  }

  return textures;
}
