import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getCurrentPreset, onPresetChange } from './renderConfig.js';

export function initScene(canvas) {
  const preset = getCurrentPreset();

  // 1. Scene
  const scene = new THREE.Scene();
  
  // Base background (Deep space navy for contrast)
  scene.background = new THREE.Color(0x08070e);

  // Simple Starfield Skybox (Particles)
  // Star count phụ thuộc vào quality preset
  let starMesh = createStarfield(scene, preset.starCount);

  // 2. Camera
  const camera = new THREE.PerspectiveCamera(
    75, 
    window.innerWidth / window.innerHeight, 
    0.1, 
    100000 // Far plane cho môi trường vũ trụ rộng lớn
  );
  camera.position.set(0, 50, 200);

  // 3. Renderer
  const renderer = new THREE.WebGLRenderer({ 
    canvas,
    antialias: preset.antialias, 
    logarithmicDepthBuffer: true // CRITICAL: Chống Z-fighting
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.maxPixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3; // Tăng phơi sáng tổng thể
  renderer.localClippingEnabled = true; // Kích hoạt mặt cắt
  
  // Shadows (Phase 4)
  renderer.shadowMap.enabled = preset.shadowsEnabled !== false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 4. Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxDistance = 50000;
  controls.minDistance = 0.2;

  // 5. Lighting — Multi-Layer Sunlight System (Phase 1)

  // ── Hemisphere Light: ánh sáng tán xạ từ không gian
  // Sky = hướng Mặt Trời (ấm), ground = không gian sâu (tối)
  const hemiLight = new THREE.HemisphereLight(0xfff0cc, 0x080815, 0.25);
  scene.add(hemiLight);

  // ── Primary PointLight: inverse-square (decay=2), physically correct cho vùng gần
  // Cường độ 80000, decay mặc định 2 — chi tiết & shadow
  const sunLightPrimary = new THREE.PointLight(0xfff5e0, 80000, 0);
  sunLightPrimary.position.set(0, 0, 0);
  sunLightPrimary.decay = 2; // Mặc định Three.js (inverse-square)

  // Shadow config cho Sun
  const shadowMapSize = preset.shadowMapSize ?? 2048;
  sunLightPrimary.castShadow = preset.shadowsEnabled !== false;
  sunLightPrimary.shadow.mapSize.width = shadowMapSize;
  sunLightPrimary.shadow.mapSize.height = shadowMapSize;
  sunLightPrimary.shadow.camera.near = 0.5;
  sunLightPrimary.shadow.camera.far = 100000;
  sunLightPrimary.shadow.bias = -0.0001;

  scene.add(sunLightPrimary);

  // ── Secondary Fill Light: decay thấp (0.8) để vùng xa vẫn nhận ánh sáng
  // Cường độ thấp hơn nhưng giảm chậm hơn → bù đắp ở khoảng cách lớn
  const sunLightFill = new THREE.PointLight(0xffeedd, 8000, 0);
  sunLightFill.position.set(0, 0, 0);
  sunLightFill.decay = 0.8; // Custom decay: giảm chậm hơn inverse-square

  scene.add(sunLightFill);

  // 6. Xử lý Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, getCurrentPreset().maxPixelRatio));
  });

  // 7. Lắng nghe thay đổi preset để cập nhật starfield và pixel ratio
  onPresetChange((newPreset) => {
    // Cập nhật pixel ratio
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, newPreset.maxPixelRatio));
    renderer.shadowMap.enabled = newPreset.shadowsEnabled !== false;
    sunLightPrimary.castShadow = newPreset.shadowsEnabled !== false;
    const newShadowMapSize = newPreset.shadowMapSize ?? 1024;
    if (
      sunLightPrimary.shadow.mapSize.width !== newShadowMapSize ||
      sunLightPrimary.shadow.mapSize.height !== newShadowMapSize
    ) {
      sunLightPrimary.shadow.mapSize.set(newShadowMapSize, newShadowMapSize);
      if (sunLightPrimary.shadow.map) {
        sunLightPrimary.shadow.map.dispose();
        sunLightPrimary.shadow.map = null;
      }
    }

    // Tạo lại starfield với số sao mới
    scene.remove(starMesh);
    starMesh.geometry.dispose();
    starMesh.material.dispose();
    starMesh = createStarfield(scene, newPreset.starCount);
  });

  return { scene, camera, renderer, controls, sunLightPrimary, sunLightFill, hemiLight };
}

/**
 * Tạo starfield particles
 * @param {THREE.Scene} scene
 * @param {number} count - Số lượng sao
 * @returns {THREE.Points}
 */
function createStarfield(scene, count) {
  const starsGeometry = new THREE.BufferGeometry();
  const posArray = new Float32Array(count * 3);
  const colorArray = new Float32Array(count * 3);

  // Spectral types colors
  const colors = [
    new THREE.Color(0x9bb2ff), // O - Blue
    new THREE.Color(0xbbccff), // B - Blue-white
    new THREE.Color(0xfbf8ff), // A - White
    new THREE.Color(0xfff5f2), // F - Yellow-white
    new THREE.Color(0xfff2a1), // G - Yellow (Sun-like)
    new THREE.Color(0xffcc6f), // K - Orange
    new THREE.Color(0xff5a5a)  // M - Red
  ];

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    // Phân bổ ngẫu nhiên trong hình cầu bán kính từ 5000 đến 100000
    const dist = 5000 + Math.random() * 90000;
    const phi = Math.random() * Math.PI * 2;
    const theta = Math.acos(2 * Math.random() - 1);
    
    posArray[i3] = dist * Math.sin(theta) * Math.cos(phi);
    posArray[i3 + 1] = dist * Math.sin(theta) * Math.sin(phi);
    posArray[i3 + 2] = dist * Math.cos(theta);

    // Random spectral color
    const color = colors[Math.floor(Math.random() * colors.length)];
    const brightness = 0.6 + Math.random() * 0.4;
    colorArray[i3] = color.r * brightness;
    colorArray[i3 + 1] = color.g * brightness;
    colorArray[i3 + 2] = color.b * brightness;
  }

  starsGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  starsGeometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));

  const starsMaterial = new THREE.PointsMaterial({
    size: 5,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true
  });

  const starMesh = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(starMesh);
  return starMesh;
}
