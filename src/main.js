import * as THREE from 'three';
import { initScene } from './scene.js';
import { planetData } from './planetData.js';
import { createPlanet } from './createPlanet.js';
import { computeOrbitalPosition } from './kepler.js';
import { initPostProcessing } from './postprocessing.js';
import { initUI } from './ui.js';
import { createOrbitLine } from './orbits.js';
import { createLabel, updateLabels, toggleLabels, areLabelsVisible } from './labels.js';

// 1. Khởi tạo canvas và scene
const canvas = document.querySelector('canvas.webgl');
const { scene, camera, renderer, controls } = initScene(canvas);

// 1b. Khởi tạo post-processing (Sun Bloom)
const { composer, bloomPass } = initPostProcessing(renderer, scene, camera);

// Cập nhật composer khi resize
window.addEventListener('resize', () => {
  composer.setSize(window.innerWidth, window.innerHeight);
});

// 2. Containers cho scene objects
const bodies = [];
const orbits = [];

// 3. Thiết lập thời gian mô phỏng
const clock = new THREE.Clock();
let simulationTime = 0;
let timeScale = 1000; // Giá trị mặc định, sẽ được UI slider ghi đè
let isPaused = false;

// 4. Khởi tạo UI với callbacks
initUI({
  onTimeScaleChange: (scale) => { timeScale = scale; },
  onPauseToggle: (paused) => { isPaused = paused; },
  onPlanetSelect: (planetId) => {
    // Camera fly-to hành tinh được chọn
    const body = bodies.find(b => b.data.id === planetId);
    if (body) {
      const target = new THREE.Vector3();
      body.pivot.getWorldPosition(target);
      // Khoảng cách zoom phụ thuộc kích thước hành tinh
      const zoomDist = Math.max(body.data.radius * 5, 10);
      const camTarget = target.clone().add(new THREE.Vector3(zoomDist, zoomDist * 0.5, zoomDist));
      
      // Animate camera (lerp đơn giản)
      const startPos = camera.position.clone();
      const startTarget = controls.target.clone();
      let progress = 0;
      function flyTo() {
        progress += 0.02;
        if (progress >= 1) progress = 1;
        const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        camera.position.lerpVectors(startPos, camTarget, ease);
        controls.target.lerpVectors(startTarget, target, ease);
        controls.update();
        if (progress < 1) requestAnimationFrame(flyTo);
      }
      flyTo();
    }
  },
  onToggleOrbits: (show) => {
    for (const orbit of orbits) {
      orbit.visible = show;
    }
  },
  onToggleLabels: (show) => {
    toggleLabels(show);
  },
});

// 5. Tạo tất cả thiên thể sau khi loading UI đã sẵn sàng nhận progress events.
for (const data of planetData) {
  const body = createPlanet(data);
  scene.add(body.pivot);
  bodies.push(body);

  const orbitLine = createOrbitLine(data);
  if (orbitLine) {
    scene.add(orbitLine);
    orbits.push(orbitLine);
  }

  createLabel(data, body.pivot);
}

// 6. Animation Loop
function animate() {
  requestAnimationFrame(animate);

  const deltaTime = clock.getDelta();
  if (!isPaused) {
    simulationTime += deltaTime * timeScale;
  }

  for (const body of bodies) {
    // A. Cập nhật vị trí quỹ đạo (Kepler) - Bỏ qua Mặt Trời
    if (body.data.type !== 'star') {
      if (body.data.semiMajorAxis > 0 && !isPaused) {
        const pos = computeOrbitalPosition(body.data, simulationTime);
        body.pivot.position.set(pos.x, pos.y, pos.z);
      }
    }

    // B. Tự quay quanh trục (cả Mặt Trời và Hành tinh)
    if (body.data.rotationPeriod !== 0 && !isPaused) {
      const rotSpeed = (2 * Math.PI) / (Math.abs(body.data.rotationPeriod) * 3600);
      const direction = body.data.rotationPeriod > 0 ? 1 : -1;
      body.mesh.rotation.y += direction * rotSpeed * deltaTime * timeScale;

      // C. Lớp mây quay độc lập (nhanh hơn bề mặt 20% để tạo hiệu ứng gió)
      if (body.cloudMesh) {
        body.cloudMesh.rotation.y += direction * rotSpeed * 1.2 * deltaTime * timeScale;
      }

      if (body.atmosphereTextureMesh) {
        const venusCloudDrift = body.data.id === 'venus'
          ? -0.015
          : direction * rotSpeed * 1.1 * timeScale;
        body.atmosphereTextureMesh.rotation.y += venusCloudDrift * deltaTime;
      }
      
    }

    // D. Cập nhật shader Mặt Trời độc lập với tốc độ mô phỏng.
    if (body.mesh.material.userData?.isSunSurfaceShader) {
      body.mesh.material.uniforms.uTime.value += deltaTime;
    }

    if (body.coronaMesh?.material.userData?.isSunCoronaShader) {
      body.coronaMesh.material.uniforms.uTime.value += deltaTime;
      body.coronaMesh.rotation.y += deltaTime * 0.03;
    }
  }

  // Cập nhật controls
  controls.update();

  // Cập nhật nhãn (nếu đang hiển thị)
  if (areLabelsVisible()) {
    updateLabels(camera, renderer);
  }

  // Kết xuất qua post-processing pipeline (bloom)
  composer.render();
}

// Bắt đầu vòng lặp
animate();

console.log(`Kepler Engine: ${bodies.length} thiên thể đang quay trên quỹ đạo elip`);
