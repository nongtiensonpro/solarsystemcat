import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function initScene(canvas) {
  // 1. Scene
  const scene = new THREE.Scene();
  
  // Base background (black space)
  scene.background = new THREE.Color(0x000000);

  // Simple Starfield Skybox (Particles)
  const starsGeometry = new THREE.BufferGeometry();
  const starsCount = 5000;
  const posArray = new Float32Array(starsCount * 3);
  
  for(let i = 0; i < starsCount * 3; i++) {
    // Phân bổ ngẫu nhiên trong bán kính từ 1000 đến 50000
    posArray[i] = (Math.random() - 0.5) * 100000;
  }
  
  starsGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  const starsMaterial = new THREE.PointsMaterial({
    size: 5,
    color: 0xffffff,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true
  });
  
  const starMesh = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(starMesh);

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
    antialias: true, 
    logarithmicDepthBuffer: true // CRITICAL: Chống Z-fighting
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // 4. Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxDistance = 50000;

  // 5. Lighting
  // Ánh sáng môi trường cường độ rất thấp để phần khuất không bị đen đặc
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.05);
  scene.add(ambientLight);

  // Ánh sáng điểm từ Mặt Trời tại tâm
  // PointLight(color, intensity, distance, decay)
  const sunLight = new THREE.PointLight(0xffffee, 5.0, 0, 0);
  sunLight.position.set(0, 0, 0);
  scene.add(sunLight);

  // 6. Xử lý Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, controls };
}
