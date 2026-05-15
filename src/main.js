import * as THREE from 'three';
import { initScene } from './scene.js';
import { loadSolarSystemData } from './dataLoader.js';
import { setPlanetData, planetData } from './planetData.js';
import { createPlanet } from './createPlanet.js';
import { computeOrbitalPosition } from './kepler.js';
import { initPostProcessing } from './postprocessing.js';
import { initUI } from './ui.js';
import { createOrbitLine } from './orbits.js';
import { createLabel, updateLabels, toggleLabels, areLabelsVisible } from './labels.js';
import { getCurrentPreset, onPresetChange } from './renderConfig.js';
import { updateCrossSectionPlane, toggleCrossSection } from './crossSection.js';
import { createAsteroidBelt } from './asteroidBelt.js';
import { AU } from './constants.js';
import { selfRegulatingFactor } from './sunInterior.js';

// ═══ Bootstrap — Tải dữ liệu trước khi khởi tạo ═══
async function bootstrap() {
  // 0. Tải dữ liệu từ JSON
  const solarData = await loadSolarSystemData();
  setPlanetData(solarData);

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
  const bodyById = new Map();  // Tra cứu body theo id
  const orbits = [];

  // 3. Thiết lập thời gian mô phỏng
  const clock = new THREE.Clock();
  let simulationTime = 0;
  let timeScale = 1000; // Giá trị mặc định, sẽ được UI slider ghi đè
  let isPaused = false;
  let isCrossSectionOn = false;

  // 3b. Camera Modes
  let cameraMode = 'overview'; // 'overview', 'follow'
  let trackedBody = null;
  let isFlying = false;
  let flyProgress = 0;
  let flyStartPos = new THREE.Vector3();
  let flyStartTarget = new THREE.Vector3();
  let flyEndPos = new THREE.Vector3();
  let flyEndTarget = new THREE.Vector3();

  function startFlyTo(targetPos, targetLookAt) {
    isFlying = true;
    flyProgress = 0;
    flyStartPos.copy(camera.position);
    flyStartTarget.copy(controls.target);
    flyEndPos.copy(targetPos);
    flyEndTarget.copy(targetLookAt);
  }

  // 4. Khởi tạo UI với callbacks (planetData đã được populate)
  // Hàm dùng chung để chọn hành tinh từ cả UI lẫn double-tap mobile
  function selectPlanet(planetId) {
    if (isCrossSectionOn && trackedBody) {
      toggleCrossSection(trackedBody, false);
      isCrossSectionOn = false;
    }
    cameraMode = 'follow';
    trackedBody = bodyById.get(planetId);
    if (trackedBody) {
      const target = new THREE.Vector3();
      trackedBody.pivot.getWorldPosition(target);
      const zoomDist = Math.max(trackedBody.data.radius * 5, 10);
      const camTarget = target.clone().add(new THREE.Vector3(zoomDist, zoomDist * 0.5, zoomDist));
      startFlyTo(camTarget, target);
    }
  }

  initUI({
    onTimeScaleChange: (scale) => { timeScale = scale; },
    onPauseToggle: (paused) => { isPaused = paused; },
    onPlanetSelect: (planetId) => { selectPlanet(planetId); },
    onOverview: () => {
      if (isCrossSectionOn && trackedBody) {
        toggleCrossSection(trackedBody, false);
        isCrossSectionOn = false;
      }
      cameraMode = 'overview';
      trackedBody = null;
      // Fly back to overview (Sun focused)
      startFlyTo(new THREE.Vector3(200, 100, 200), new THREE.Vector3(0, 0, 0));
    },
    onFollow: (planetId) => {
      cameraMode = 'follow';
      trackedBody = bodyById.get(planetId);
    },
    onToggleOrbits: (show) => {
      for (const orbit of orbits) {
        orbit.visible = show;
      }
    },
    onToggleLabels: (show) => {
      toggleLabels(show);
    },
    onToggleCrossSection: (on) => {
      isCrossSectionOn = on;
      if (trackedBody) {
        toggleCrossSection(trackedBody, on);
      }
    }
  });

  // 5. Tạo tất cả thiên thể theo hierarchy
  // ─── Bước 1: Tạo tất cả body objects trước ───
  for (const data of planetData) {
    const body = createPlanet(data);
    bodies.push(body);
    bodyById.set(data.id, body);
  }

  // ─── Bước 2: Gắn vào scene hoặc parent theo parentId ───
  for (const body of bodies) {
    const data = body.data;

    if (data.isMoon && data.parentId) {
      // Vệ tinh: gắn pivot vào pivot của hành tinh mẹ
      const parentBody = bodyById.get(data.parentId);
      if (parentBody) {
        parentBody.pivot.add(body.pivot);
        // Moon orbit line nằm trong coordinate space của parent
        const orbitLine = createOrbitLine(data);
        if (orbitLine) {
          parentBody.pivot.add(orbitLine);
          orbits.push(orbitLine);
        }
      } else {
        console.warn(`[Hierarchy] Parent "${data.parentId}" not found for "${data.id}", adding to scene root`);
        scene.add(body.pivot);
      }
    } else if (data.parentId === 'sun' || data.parentId === null) {
      // Hành tinh hoặc Mặt Trời: gắn trực tiếp vào scene
      scene.add(body.pivot);
      // Orbit line cho hành tinh quanh Mặt Trời
      const orbitLine = createOrbitLine(data);
      if (orbitLine) {
        scene.add(orbitLine);
        orbits.push(orbitLine);
      }
    } else {
      // Trường hợp khác (parentId không phải sun, không phải moon)
      // Fallback: gắn vào scene
      scene.add(body.pivot);
      const orbitLine = createOrbitLine(data);
      if (orbitLine) {
        scene.add(orbitLine);
        orbits.push(orbitLine);
      }
    }

    createLabel(data, body.pivot);
  }

  // 5a. Tạo Vành đai tiểu hành tinh (Asteroid Belt)
  const asteroidBelt = createAsteroidBelt(5000);
  scene.add(asteroidBelt.mesh);

  // 5b. Áp dụng preset hiện tại cho atmosphere/cloud/corona visibility
  function applyPresetToEffects(preset) {
    // Cập nhật số lượng tiểu hành tinh
    if (preset.asteroidCount) {
      asteroidBelt.setCount(preset.asteroidCount);
    }

    for (const body of bodies) {
      // Atmosphere opacity scale
      if (body.atmosphereMesh && body.data.atmosphere) {
        const baseOpacity = body.data.atmosphere.opacity;
        body.atmosphereMesh.material.uniforms.uOpacity.value = 
          baseOpacity * preset.atmosphereOpacityScale;
        body.atmosphereMesh.visible = preset.atmosphereEnabled;
      }

      // Cloud opacity scale
      if (body.cloudMesh) {
        body.cloudMesh.material.opacity = preset.cloudOpacityScale;
        body.cloudMesh.visible = preset.cloudsEnabled;
      }

      // Venus atmosphere texture
      if (body.atmosphereTextureMesh) {
        body.atmosphereTextureMesh.visible = preset.atmosphereEnabled;
      }

      // Corona visibility
      if (body.coronaMesh) {
        body.coronaMesh.visible = preset.coronaEnabled;
      }

      // Ring visibility
      if (body.ringMesh) {
        body.ringMesh.visible = preset.ringsEnabled;
      }
    }
  }

  // Áp dụng preset ban đầu
  applyPresetToEffects(getCurrentPreset());

  // Lắng nghe thay đổi preset
  onPresetChange((newPreset) => {
    applyPresetToEffects(newPreset);
  });

  // 5c. Mobile: Double-tap để chọn hành tinh 3D
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    const tapRaycaster = new THREE.Raycaster();
    const tapPointer = new THREE.Vector2();
    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;

    renderer.domElement.addEventListener('touchend', (e) => {
      const now = Date.now();
      const touch = e.changedTouches[0];
      const dx = touch.clientX - lastTapX;
      const dy = touch.clientY - lastTapY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Double-tap: 2 lần chạm trong 300ms, cách nhau < 30px
      if (now - lastTapTime < 300 && dist < 30) {
        tapPointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
        tapPointer.y = -(touch.clientY / window.innerHeight) * 2 + 1;
        tapRaycaster.setFromCamera(tapPointer, camera);

        // Lấy tất cả mesh của các thiên thể (bỏ qua Mặt Trời — quá to, dễ tap nhầm)
        const meshes = bodies
          .filter(b => b.data.type !== 'star')
          .map(b => b.mesh);
        const intersects = tapRaycaster.intersectObjects(meshes);

        if (intersects.length > 0) {
          const hitBody = bodies.find(b => b.mesh === intersects[0].object);
          if (hitBody) {
            selectPlanet(hitBody.data.id);
          }
        }
        lastTapTime = 0; // Reset để tránh triple-tap trigger
      } else {
        lastTapTime = now;
        lastTapX = touch.clientX;
        lastTapY = touch.clientY;
      }
    }, { passive: true });
  }


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
          
          // E. Cập nhật đuôi sao chổi
          if (body.tailMesh) {
            // Mũi nhọn ở 0,0,0 của pivot. Hướng +Z của mesh hướng về target.
            // Để đuôi (+Z) chỉ ra xa Mặt Trời, ta lookAt điểm ra xa tiếp từ vị trí hiện tại.
            const awayPos = body.pivot.position.clone().multiplyScalar(2);
            body.tailMesh.lookAt(awayPos);
            
            // Làm mờ đuôi khi ở xa Mặt Trời
            const distAU = body.pivot.position.length() / AU;
            const maxTailDist = 10.0; // Đuôi mờ dần và biến mất khi > 10 AU
            let tailOpacity = 1.0 - (distAU / maxTailDist);
            tailOpacity = Math.max(0, Math.min(1, tailOpacity));
            
            body.tailMesh.material.uniforms.uOpacity.value = tailOpacity;
            body.tailMesh.visible = tailOpacity > 0.05;

            if (body.comaMesh) {
              body.comaMesh.material.uniforms.uOpacity.value = tailOpacity * 0.8;
              body.comaMesh.visible = tailOpacity > 0.05;
            }
          }
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
        // Cơ chế tự cân bằng nhiệt hạch từ sunInterior.js
        body.mesh.material.uniforms.uSelfRegFactor.value = selfRegulatingFactor(
          body.mesh.material.uniforms.uTime.value
        );
      }

      if (body.coronaMesh?.material.userData?.isSunCoronaShader) {
        body.coronaMesh.material.uniforms.uTime.value += deltaTime;
        body.coronaMesh.rotation.y += deltaTime * 0.03;
      }

      // D2. Cập nhật sắc quyển (chromosphere)
      if (body.chromosphereMesh?.material.userData?.isSunChromosphereShader) {
        body.chromosphereMesh.material.uniforms.uTime.value += deltaTime;
      }

      // D3. Cập nhật từ trường
      if (body.magneticFieldMesh?.material.userData?.isMagneticFieldShader) {
        body.magneticFieldMesh.material.uniforms.uTime.value += deltaTime;
      }

      // D4. Cập nhật mưa Heli
      if (body.heliumRainMesh?.material.userData?.isHeliumRainShader) {
        body.heliumRainMesh.material.uniforms.uTime.value += deltaTime;
      }

      // D5. Cập nhật mưa Kim Cương
      if (body.diamondRainMesh?.material.userData?.isDiamondRainShader) {
        body.diamondRainMesh.material.uniforms.uTime.value += deltaTime;
      }
    }

    // Cập nhật controls và Camera Tracking
    if (isFlying) {
      flyProgress += 0.02;
      if (flyProgress >= 1) {
        flyProgress = 1;
        isFlying = false;
      }
      const ease = 1 - Math.pow(1 - flyProgress, 3);
      camera.position.lerpVectors(flyStartPos, flyEndPos, ease);
      controls.target.lerpVectors(flyStartTarget, flyEndTarget, ease);
    } else {
      if (cameraMode === 'follow' && trackedBody) {
        const targetPos = new THREE.Vector3();
        trackedBody.pivot.getWorldPosition(targetPos);
        
        // Tính vector khoảng cách hiện tại từ camera đến target cũ
        const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
        
        // Di chuyển cả target và camera theo targetPos mới
        controls.target.copy(targetPos);
        camera.position.copy(targetPos).add(offset);
        
        // Cập nhật vị trí mặt cắt (luôn đi qua tâm)
        if (isCrossSectionOn) {
          updateCrossSectionPlane(trackedBody.pivot);
        }
      }
    }
    controls.update();

    // Cập nhật nhãn (nếu đang hiển thị) - Throttled để tối ưu hiệu năng
    const labelThrottle = /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 6 : 3;
    if (areLabelsVisible() && frameCount % labelThrottle === 0) {
      updateLabels(camera, renderer);
    }
    frameCount++;

    // Cập nhật vành đai tiểu hành tinh
    asteroidBelt.update(simulationTime, deltaTime);

    // Kết xuất qua post-processing pipeline (bloom)
    composer.render();
  }

  // Bắt đầu vòng lặp
  let frameCount = 0;
  animate();

  const moonCount = bodies.filter(b => b.data.isMoon).length;
  console.log(`Kepler Engine: ${bodies.length} thiên thể (${moonCount} vệ tinh) đang quay trên quỹ đạo elip`);
}

// Khởi động ứng dụng
bootstrap().catch(err => {
  console.error('[SolarSystem] Lỗi khởi tạo:', err);
  // Hiển thị lỗi trên loading screen nếu có
  const loadingPercent = document.getElementById('loading-percent');
  if (loadingPercent) {
    loadingPercent.textContent = `Lỗi: ${err.message}`;
    loadingPercent.style.color = '#ff6666';
  }
});
