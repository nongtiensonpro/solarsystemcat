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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 4. Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxDistance = 50000;
  controls.minDistance = 0.2;

  // 5. Lighting
  // Ánh sáng môi trường - Tăng mạnh lên 0.45 để làm sáng toàn bộ hệ thống
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambientLight);

  // Ánh sáng điểm từ Mặt Trời - Tăng lên 80000 để chiếu sáng cực mạnh
  const sunLight = new THREE.PointLight(0xfff5e0, 80000, 0); 
  sunLight.position.set(0, 0, 0);
  
  // Shadow config cho Sun
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 100000;
  sunLight.shadow.bias = -0.0001; // Giảm shadow acne

  scene.add(sunLight);

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

    // Tạo lại starfield với số sao mới
    scene.remove(starMesh);
    starMesh.geometry.dispose();
    starMesh.material.dispose();
    starMesh = createStarfield(scene, newPreset.starCount);
  });

  return { scene, camera, renderer, controls };
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
