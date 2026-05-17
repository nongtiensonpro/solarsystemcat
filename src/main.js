import * as THREE from 'three';
import { initScene } from './scene.js';
import { loadSolarSystemData, loadSaturnGhostConfig } from './dataLoader.js';
import { setPlanetData, planetData } from './planetData.js';
import { createPlanet } from './createPlanet.js';
import { computeOrbitalPosition } from './kepler.js';
import { initPostProcessing } from './postprocessing.js';
import { initUI, updateLayerTooltip, showNotification } from './ui.js';
import { createOrbitLine } from './orbits.js';
import { createLabel, updateLabels, toggleLabels, areLabelsVisible } from './labels.js';
import { getCurrentPreset, onPresetChange } from './renderConfig.js';
import { updateAutoCrossSection, toggleCrossSection, clipPlane } from './crossSection.js';
import { createAsteroidBelt } from './asteroidBelt.js';
import { AU } from './constants.js';
import { selfRegulatingFactor } from './sunInterior.js';
import { createCinematicCameraController } from './cinematicCamera.js';
import { GhostMoonSystem } from './ghostMoonSystem.js';

// ??? Bootstrap ? T?i d? li?u tr??c khi kh?i t?o ???
async function bootstrap() {
  const visitedBodies = new Set();
  
  // 0. T?i d? li?u t? JSON
  const solarData = await loadSolarSystemData();
  setPlanetData(solarData);
  const saturnGhostConfig = await loadSaturnGhostConfig();

  // 1. Kh?i t?o canvas v? scene
  const canvas = document.querySelector('canvas.webgl');
  const { scene, camera, renderer, controls, sunLightPrimary, sunLightFill, hemiLight } = initScene(canvas);

  // 1b. Kh?i t?o post-processing (Sun Bloom)
  const { composer, bloomPass } = initPostProcessing(renderer, scene, camera);

  // 1c. Kh?i t?o Cinematic Camera
  const cinematicCamera = createCinematicCameraController(camera, controls, renderer.domElement);

  // C?p nh?t composer khi resize
  window.addEventListener('resize', () => {
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  // 2. Containers cho scene objects
  const bodies = [];
  const bodyById = new Map();  // Tra c?u body theo id
  const orbits = [];

  // 3. Thi?t l?p th?i gian m? ph?ng
  const clock = new THREE.Clock();
  let simulationTime = 0;
  let timeScale = 1000; // Gi? tr? m?c ??nh, s? ???c UI slider ghi ??
  let isPaused = false;
  let isAutoSliceEnabled = false;

  // 3b. Camera Modes
  let cameraMode = 'overview'; // 'overview', 'follow'
  let trackedBody = null;
  let isFlying = false;
  let flyProgress = 0;
  
  // 3c. Cinematic Director Mode
  let isAutoDirectorActive = false;
  let autoDirectorTimer = 0;
  
  // 3d. Raycaster cho Tooltip
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2(-100, -100);
  let mouseClientX = 0;
  let mouseClientY = 0;

  window.addEventListener('mousemove', (event) => {
    mouseClientX = event.clientX;
    mouseClientY = event.clientY;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  });
  let flyStartPos = new THREE.Vector3();
  let flyStartTarget = new THREE.Vector3();
  let flyEndPos = new THREE.Vector3();
  let flyEndTarget = new THREE.Vector3();
  let flyDuration = 1.1; // seconds

  function startFlyTo(targetPos, targetLookAt, durationSec = 1.1) {
    isFlying = true;
    flyProgress = 0;
    flyStartPos.copy(camera.position);
    flyStartTarget.copy(controls.target);
    flyEndPos.copy(targetPos);
    flyEndTarget.copy(targetLookAt);
    flyDuration = durationSec;
  }

  // 3e. Auto Director Logic
  function triggerRandomCinematicCut() {
    if (!cinematicCamera.isActive()) return;
    
    const allBodies = Array.from(bodyById.values());
    if (allBodies.length === 0) return;
    
    // Pick a random body
    let nextBody = allBodies[Math.floor(Math.random() * allBodies.length)];
    
    // 40% chance to pick a "hero" body
    if (Math.random() < 0.4) {
      const heroes = ['sun', 'earth', 'saturn', 'jupiter', 'mars', 'moon', 'europa'];
      const heroId = heroes[Math.floor(Math.random() * heroes.length)];
      if (bodyById.has(heroId)) nextBody = bodyById.get(heroId);
    }
    
    trackedBody = nextBody;
    cinematicCamera.setTarget(trackedBody);
    
    // Teleport camera close to the new body to prevent dark screen flying
    const targetWorldPos = trackedBody.pivot.getWorldPosition(new THREE.Vector3());
    const startDist = trackedBody.data.radius * (Math.random() * 4 + 3); // 3x to 7x radius
    // Random angle for teleportation
    const angle = Math.random() * Math.PI * 2;
    const height = (Math.random() - 0.5) * startDist;
    const offset = new THREE.Vector3(
      Math.cos(angle) * startDist,
      height,
      Math.sin(angle) * startDist
    );
    camera.position.copy(targetWorldPos).add(offset);
    
    // Notify UI
    const allBtns = document.querySelectorAll('.planet-btn');
    allBtns.forEach(b => b.classList.toggle('active', b.dataset.id === trackedBody.id));
    
    // Pick a random shot (including new Dolly Zoom)
    const shots = ['orbit', 'flyBy', 'chase', 'dollyZoom'];
    const weights = [0.35, 0.3, 0.2, 0.15];
    let randomVal = Math.random();
    let selectedShot = 'orbit';
    for (let i = 0; i < shots.length; i++) {
      if (randomVal < weights[i]) {
        selectedShot = shots[i];
        break;
      }
      randomVal -= weights[i];
    }
    
    // Pick a random lens
    const lenses = [24, 35, 50, 85, 135];
    const selectedLens = lenses[Math.floor(Math.random() * lenses.length)];
    
    // Base configuration for all shots
    const shotParams = {
      handheld: Math.random() > 0.5, // 50% chance for subtle handheld shake
      dutchAngle: (Math.random() - 0.5) * 0.2 // Slight roll offset (-11 to +11 degrees)
    };
    
    // Rule of Thirds framing (20% chance to off-center the planet)
    if (Math.random() < 0.2) {
      shotParams.framingOffset = {
        x: (Math.random() > 0.5 ? 1 : -1) * (0.5 + Math.random()), 
        y: (Math.random() > 0.5 ? 1 : -1) * (0.2 + Math.random() * 0.5)
      };
    }

    // Shot specific logic
    if (selectedShot === 'flyBy') {
      shotParams.duration = 10 + Math.random() * 8;
      // Fly-bys look epic with stronger Dutch Angles
      shotParams.dutchAngle = (Math.random() - 0.5) * 0.5; 
    }
    if (selectedShot === 'chase') {
      const chaseOffset = trackedBody.data.radius * (2 + Math.random() * 3);
      shotParams.offset = new THREE.Vector3(chaseOffset * 0.3, chaseOffset * 0.2, chaseOffset);
    }
    if (selectedShot === 'orbit') {
      shotParams.radius = trackedBody.data.radius * (3 + Math.random() * 5);
      shotParams.speed = 0.05 + Math.random() * 0.1;
      shotParams.height = (Math.random() - 0.5) * trackedBody.data.radius * 2;
    }
    if (selectedShot === 'dollyZoom') {
      shotParams.duration = 12 + Math.random() * 6;
      shotParams.startFov = Math.random() > 0.5 ? 135 : 24; // Either zoom in or zoom out
      shotParams.endFov = shotParams.startFov === 135 ? 24 : 135;
      shotParams.startDist = trackedBody.data.radius * 5;
    }
    
    cinematicCamera.setShotPreset(selectedShot, shotParams);
    cinematicCamera.setLens(selectedLens);
    
    // Update UI
    document.querySelectorAll('#cine-shot-group .cine-btn').forEach(b => 
      b.classList.toggle('active', b.dataset.shot === selectedShot)
    );
    document.querySelectorAll('#cine-lens-group .cine-btn').forEach(b => 
      b.classList.toggle('active', parseFloat(b.dataset.lens) === selectedLens)
    );
    
    // Reset timer
    autoDirectorTimer = 8 + Math.random() * 8; // 8-16 seconds
  }

  // 4. Kh?i t?o UI v?i callbacks (planetData ?? ???c populate)
  let hasVisitedSaturn = false;
  
  // C?c preset camera cho Sao Th?
  const SATURN_PRESETS = {
    'default': { distance: 180, inclination: 28, azimuth: 30, duration: 2.2 },
    'edge': { distance: 220, inclination: 3, azimuth: 30, duration: 1.5 },
    'pole': { distance: 280, inclination: 82, azimuth: 0, duration: 2.0 },
    'close': { distance: 55, inclination: 35, azimuth: 45, duration: 1.5 }
  };

  function applySaturnCameraPreset(presetKey) {
    if (!trackedBody || trackedBody.data.id !== 'saturn') return;
    const preset = SATURN_PRESETS[presetKey];
    if (!preset) return;
    
    const target = new THREE.Vector3();
    trackedBody.pivot.getWorldPosition(target);
    
    // T?nh to?n v? tr? camera theo t?a ?? c?u
    const inclRad = THREE.MathUtils.degToRad(preset.inclination);
    const azimRad = THREE.MathUtils.degToRad(preset.azimuth);
    
    const offset = new THREE.Vector3(
      preset.distance * Math.sin(inclRad) * Math.cos(azimRad),
      preset.distance * Math.cos(inclRad),
      preset.distance * Math.sin(inclRad) * Math.sin(azimRad)
    );
    
    startFlyTo(target.clone().add(offset), target, preset.duration);
  }

  // H?m d?ng chung ?? ch?n h?nh tinh t? c? UI l?n double-tap mobile
  function selectPlanet(planetId) {
    // Reset manual cross section if pending
    if (trackedBody && trackedBody.isCrossSectionActive) {
      toggleCrossSection(trackedBody, false);
      trackedBody.isCrossSectionActive = false;
    }
    cameraMode = 'follow';
    trackedBody = bodyById.get(planetId);
    if (trackedBody) {
      cinematicCamera.setTarget(trackedBody);
      const target = new THREE.Vector3();
      trackedBody.pivot.getWorldPosition(target);
      
      if (planetId === 'saturn') {
        const preset = SATURN_PRESETS['default'];
        const isFirstTime = !hasVisitedSaturn;
        hasVisitedSaturn = true;
        
        // T?nh to?n v? tr? camera default
        const inclRad = THREE.MathUtils.degToRad(preset.inclination);
        const azimRad = THREE.MathUtils.degToRad(preset.azimuth);
        const offset = new THREE.Vector3(
          preset.distance * Math.sin(inclRad) * Math.cos(azimRad),
          preset.distance * Math.cos(inclRad),
          preset.distance * Math.sin(inclRad) * Math.sin(azimRad)
        );
        const camTarget = target.clone().add(offset);
        
        // Intro animation 2200ms cho l?n ??u, sau ?? m??t h?n
        startFlyTo(camTarget, target, isFirstTime ? 2.2 : 1.5);
      } else {
        const zoomDist = Math.max(trackedBody.data.radius * 5, 0.25);
        const camTarget = target.clone().add(new THREE.Vector3(zoomDist, zoomDist * 0.5, zoomDist));
        startFlyTo(camTarget, target, 1.1);
      }
      // Discovery Notification (Phase 6)
      if (!visitedBodies.has(planetId)) {
        visitedBodies.add(planetId);
        showNotification(`Khám phá mới: ${trackedBody.data.name.vi || trackedBody.data.name}`);
      }
    }
  }

  initUI({
    onTimeScaleChange: (scale) => { timeScale = scale; },
    onPauseToggle: (paused) => { isPaused = paused; },
    onPlanetSelect: (planetId) => { selectPlanet(planetId); },
    onSaturnCameraPreset: (presetKey) => { applySaturnCameraPreset(presetKey); },
    onOverview: () => {
      if (trackedBody && trackedBody.isCrossSectionActive) {
        toggleCrossSection(trackedBody, false);
        trackedBody.isCrossSectionActive = false;
      }
      cameraMode = 'overview';
      trackedBody = null;
      cinematicCamera.setTarget(null);
      if (cinematicCamera.isActive()) cinematicCamera.setMode('free');
      // Fly back to overview (Sun focused)
      startFlyTo(new THREE.Vector3(200, 100, 200), new THREE.Vector3(0, 0, 0));
    },
    onFollow: (planetId) => {
      cameraMode = 'follow';
      trackedBody = bodyById.get(planetId);
      cinematicCamera.setTarget(trackedBody);
      if (cinematicCamera.isActive() && trackedBody) cinematicCamera.setMode('targetLock');
    },
    onToggleOrbits: (show) => {
      for (const orbit of orbits) {
        orbit.visible = show;
        // B?t shadow logic cho ring n?u orbit ???c b?t? Kh?ng, ring shadow n?n lu?n ch?y.
      }
    },
    onToggleLabels: (show) => {
      toggleLabels(show);
    },
    onScreenshot: () => {
      takeScreenshot();
    },
    onToggleSlice: (enabled) => {
      isAutoSliceEnabled = enabled;
      // N?u t?t khi ?ang c?t, h?y ??ng m?t c?t ngay l?p t?c
      if (!enabled && trackedBody && trackedBody.isCrossSectionActive) {
        toggleCrossSection(trackedBody, false);
        trackedBody.isCrossSectionActive = false;
      }
    },
    onToggleMinimap: (enabled) => {
      const minimap = document.getElementById('minimap-container');
      if (minimap) minimap.style.display = enabled ? 'block' : 'none';
    },
    onToggleZoomIndicator: (enabled) => {
      const zoom = document.getElementById('zoom-indicator');
      if (zoom) zoom.style.display = enabled ? 'flex' : 'none';
    },
    onToggleSunlightPaths: (enabled) => {
      toggleSunlightPaths(enabled);
    },
    onToggleCinematic: (enabled) => {
      if (enabled) {
        cinematicCamera.setTarget(trackedBody);
        cinematicCamera.enable(trackedBody ? 'targetLock' : 'free');
      } else {
        cinematicCamera.disable();
      }
    },
    onCinematicShotChange: (shot) => {
      if (shot === 'free' || shot === 'targetLock') {
        cinematicCamera.setMode(shot);
      } else {
        cinematicCamera.setShotPreset(shot);
      }
    },
    onCinematicLensChange: (lens) => {
      cinematicCamera.setLens(lens);
    },
    onCinematicCleanUIToggle: (isClean) => {
      const topBar = document.getElementById('top-bar');
      const planetSelector = document.getElementById('planet-selector');
      const infoPanel = document.getElementById('info-panel');
      const minimap = document.getElementById('minimap-container');
      const zoomInd = document.getElementById('zoom-indicator');
      
      const displayStyle = isClean ? 'none' : '';
      if (topBar) topBar.style.display = displayStyle;
      if (planetSelector) planetSelector.style.display = displayStyle;
      if (infoPanel && infoPanel.classList.contains('visible')) infoPanel.style.display = displayStyle;
      if (minimap && !isClean && document.getElementById('btn-hud-toggle').classList.contains('active')) minimap.style.display = 'block';
      else if (minimap) minimap.style.display = 'none';
      
      if (zoomInd && !isClean && document.getElementById('btn-hud-toggle').classList.contains('active')) zoomInd.style.display = 'flex';
      else if (zoomInd) zoomInd.style.display = 'none';
      
      // Also hide labels and orbits
      toggleLabels(!isClean && document.getElementById('btn-visuals-toggle').classList.contains('active'));
      for (const orbit of orbits) {
        orbit.visible = !isClean && document.getElementById('btn-visuals-toggle').classList.contains('active');
      }
    },
    onCinematicAutoDirectorToggle: (active) => {
      isAutoDirectorActive = active;
      if (active) {
        autoDirectorTimer = 0; // Trigger immediately
      }
    }
  });

  // Kh?i t?o tr?ng th?i ?n m?c ??nh cho c?c c?ng c? m?i (Phase 5 Optimization)
  document.getElementById('minimap-container').style.display = 'none';
  document.getElementById('zoom-indicator').style.display = 'none';

  // 5. T?o t?t c? thi?n th? theo hierarchy
  // ??? B??c 1: T?o t?t c? body objects tr??c ???
  for (const data of planetData) {
    const body = createPlanet(data);
    bodies.push(body);
    bodyById.set(data.id, body);
  }

  // ??? B??c 2: G?n v?o scene ho?c parent theo parentId ???
  for (const body of bodies) {
    const data = body.data;

    if (data.isMoon && data.parentId) {
      // V? tinh: g?n pivot v?o pivot ho?c tiltGroup c?a h?nh tinh m?
      const parentBody = bodyById.get(data.parentId);
      if (parentBody) {
        // N?u y?u c?u m?t ph?ng x?ch ??o, g?n v?o tiltGroup (n?i ?? c? axialTilt)
        // N?u kh?ng, g?n v?o pivot (m?t ph?ng qu? ??o c?a h?nh tinh m?)
        const container = data.orbitPlane === 'parentEquator' ? parentBody.tiltGroup : parentBody.pivot;
        
        container.add(body.pivot);

        // Moon orbit line n?m trong coordinate space c?a container
        const orbitLine = createOrbitLine(data);
        if (orbitLine) {
          container.add(orbitLine);
          orbits.push(orbitLine);
        }
      } else {
        console.warn(`[Hierarchy] Parent "${data.parentId}" not found for "${data.id}", adding to scene root`);
        scene.add(body.pivot);
      }
    } else if (data.parentId === 'sun' || data.parentId === null) {
      // H?nh tinh ho?c M?t Tr?i: g?n tr?c ti?p v?o scene
      scene.add(body.pivot);
      // Orbit line cho h?nh tinh quanh M?t Tr?i
      const orbitLine = createOrbitLine(data);
      if (orbitLine) {
        scene.add(orbitLine);
        orbits.push(orbitLine);
      }
    } else {
      // Tr??ng h?p kh?c (parentId kh?ng ph?i sun, kh?ng ph?i moon)
      // Fallback: g?n v?o scene
      scene.add(body.pivot);
      const orbitLine = createOrbitLine(data);
      if (orbitLine) {
        scene.add(orbitLine);
        orbits.push(orbitLine);
      }
    }

    createLabel(data, body.pivot);
  }

  // 5a. T?o V?nh ?ai ti?u h?nh tinh (Asteroid Belt)
  const asteroidBelt = createAsteroidBelt(5000);
  scene.add(asteroidBelt.mesh);

  // Phase 4.2: Light Direction Indicators — đường mờ từ hành tinh về Mặt Trời
  const sunlightPaths = [];
  function createSunlightPaths() {
    for (const body of bodies) {
      if (body.data.type === 'star') continue;
      const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: 0xffdd88,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
      });
      const line = new THREE.Line(geometry, material);
      line.visible = false; // Ẩn mặc định
      scene.add(line);
      sunlightPaths.push({ line, body });
    }
  }
  createSunlightPaths();

  // Toggle function cho sunlight paths
  function toggleSunlightPaths(visible) {
    for (const sp of sunlightPaths) {
      sp.line.visible = visible;
    }
  }

  // 5b. ?p d?ng preset hi?n t?i cho atmosphere/cloud/corona visibility
  function applyPresetToEffects(preset) {
    // C?p nh?t s? l??ng ti?u h?nh tinh
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

      // Corona visibility — Mặt Trời luôn ở chất lượng thấp, không phụ thuộc preset
      if (body.coronaMesh) {
        body.coronaMesh.visible = true;
      }

      // Phase 5.2: Outer Glow visibility — luôn hiển thị
      if (body.outerGlowMesh) {
        body.outerGlowMesh.visible = true;
      }

      // Sun Glow Sprite — luôn hiển thị
      if (body.sunGlowSprite) {
        body.sunGlowSprite.visible = true;
      }

      // Ring visibility
      if (body.ringMesh) {
        body.ringMesh.visible = preset.ringsEnabled;
      }
    }
  }

  // ?p d?ng preset ban ??u
  applyPresetToEffects(getCurrentPreset());

  // L?ng nghe thay ??i preset
  onPresetChange((newPreset) => {
    applyPresetToEffects(newPreset);
  });

  // 5c. Mobile: Double-tap ?? ch?n h?nh tinh 3D
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

      // Double-tap: 2 l?n ch?m trong 300ms, c?ch nhau < 30px
      if (now - lastTapTime < 300 && dist < 30) {
        tapPointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
        tapPointer.y = -(touch.clientY / window.innerHeight) * 2 + 1;
        tapRaycaster.setFromCamera(tapPointer, camera);

        // L?y t?t c? mesh c?a c?c thi?n th? (b? qua M?t Tr?i ? qu? to, d? tap nh?m)
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
        lastTapTime = 0; // Reset ?? tr?nh triple-tap trigger
      } else {
        lastTapTime = now;
        lastTapX = touch.clientX;
        lastTapY = touch.clientY;
      }
    }, { passive: true });
  }

  // Kh?i t?o Ghost Moon System n?u c?
  let saturnGhostSystem = null;
  if (saturnGhostConfig) {
    const saturnBody = bodyById.get('saturn');
    if (saturnBody) {
      saturnGhostSystem = new GhostMoonSystem(saturnGhostConfig);
      saturnBody.tiltGroup.add(saturnGhostSystem.group);
    }
  }

  // Ghost Moon System interaction removed as per user request (moved to Info Panel)

  // ── Phase 3.1: Adaptive Exposure (Logarithmic Compensation)
  // Tự động tăng phơi sáng khi camera zoom xa — bù đắp inverse-square light decay
  function updateSunlightExposure() {
    const dist = camera.position.length();
    const normalized = dist / 4500; // Neptune ≈ 1.0
    // log1p(0) = 0 → exposure = 1.0 (gần Mặt Trời)
    // log1p(1) ≈ 0.693 → exposure ≈ 1.55 (Neptune)
    const exposure = THREE.MathUtils.clamp(
      1.0 + Math.log1p(normalized) * 0.8,
      1.0,
      2.5
    );
    renderer.toneMappingExposure = exposure;
  }

  function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();
    if (!isPaused) {
      simulationTime += deltaTime * timeScale;
    }

    for (const body of bodies) {
      // A. C?p nh?t v? tr? qu? ??o (Kepler) - B? qua M?t Tr?i
      if (body.data.type !== 'star') {
        const hasOrbit = body.data.semiMajorAxis > 0 || body.data.displayOrbitRadius > 0;
        if (hasOrbit && !isPaused) {
          const pos = computeOrbitalPosition(body.data, simulationTime);
          body.pivot.position.set(pos.x, pos.y, pos.z);
          
          // E. C?p nh?t ?u?i sao ch?i
          if (body.tailMesh) {
            // M?i nh?n ? 0,0,0 c?a pivot. H??ng +Z c?a mesh h??ng v? target.
            // ?? ?u?i (+Z) ch? ra xa M?t Tr?i, ta lookAt ?i?m ra xa ti?p t? v? tr? hi?n t?i.
            const awayPos = body.pivot.position.clone().multiplyScalar(2);
            body.tailMesh.lookAt(awayPos);
            
            // L?m m? ?u?i khi ? xa M?t Tr?i
            const distAU = body.pivot.position.length() / AU;
            const maxTailDist = 10.0; // ?u?i m? d?n v? bi?n m?t khi > 10 AU
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

      // B. T? quay quanh tr?c (c? M?t Tr?i v? H?nh tinh)
      if (body.data.rotationPeriod !== 0 && !isPaused) {
        const rotSpeed = (2 * Math.PI) / (Math.abs(body.data.rotationPeriod) * 3600);
        const direction = body.data.rotationPeriod > 0 ? 1 : -1;
        body.mesh.rotation.y += direction * rotSpeed * deltaTime * timeScale;

        // C. L?p m?y quay ??c l?p (nhanh h?n b? m?t 20% ?? t?o hi?u ?ng gi?)
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

      // D. C?p nh?t shader M?t Tr?i ??c l?p v?i t?c ?? m? ph?ng.
      if (body.mesh.material.userData?.isSunSurfaceShader) {
        body.mesh.material.uniforms.uTime.value += deltaTime;
        // C? ch? t? c?n b?ng nhi?t h?ch t? sunInterior.js
        body.mesh.material.uniforms.uSelfRegFactor.value = selfRegulatingFactor(
          body.mesh.material.uniforms.uTime.value
        );
      }

      // Phase 6: Multi-layer corona — animate mỗi layer với tốc độ khác nhau
      if (body.coronaMesh && body.coronaMesh.isGroup) {
        body.coronaMesh.children.forEach((layer, i) => {
          if (layer.material?.userData?.isSunCoronaShader) {
            layer.material.uniforms.uTime.value += deltaTime * (0.3 + i * 0.1);
          }
        });
        body.coronaMesh.rotation.y += deltaTime * 0.02;
      }

      // D2. C?p nh?t s?c quy?n (chromosphere)
      if (body.chromosphereMesh?.material.userData?.isSunChromosphereShader) {
        body.chromosphereMesh.material.uniforms.uTime.value += deltaTime;
      }

      // Phase 5.2: C?p nh?t outer glow
      if (body.outerGlowMesh?.material.userData?.isSunOuterGlowShader) {
        body.outerGlowMesh.material.uniforms.uTime.value += deltaTime;
      }

      // D3. C?p nh?t t? tr??ng
      if (body.magneticFieldMesh?.material.userData?.isMagneticFieldShader) {
        body.magneticFieldMesh.material.uniforms.uTime.value += deltaTime;
      }

      // --- T?I ?U H?A (PHASE 5) ---
      const bodyWorldPos = new THREE.Vector3();
      body.pivot.getWorldPosition(bodyWorldPos);
      const distToCamera = camera.position.distanceTo(bodyWorldPos);
      const isClose = distToCamera < body.data.radius * 30;
      const isSlicing = body.isCrossSectionActive;

      // C?p nh?t LOD
      if (body.lod) {
        body.lod.update(camera);
      }

      // D4. C?p nh?t m?a Heli
      if (body.heliumRainMesh) {
        body.heliumRainMesh.visible = isClose && isSlicing;
        if (body.heliumRainMesh.visible && body.heliumRainMesh.material.userData?.isHeliumRainShader) {
          body.heliumRainMesh.material.uniforms.uTime.value += deltaTime;
        }
      }

      // D5. C?p nh?t m?a Kim C??ng
      if (body.diamondRainMesh) {
        body.diamondRainMesh.visible = isClose && isSlicing;
        if (body.diamondRainMesh.visible && body.diamondRainMesh.material.userData?.isDiamondRainShader) {
          body.diamondRainMesh.material.uniforms.uTime.value += deltaTime;
        }
      }

      // D6. C?p nh?t Tuy?t S?t (Iron Snow)
      if (body.ironSnowMesh) {
        body.ironSnowMesh.visible = isClose && isSlicing;
        if (body.ironSnowMesh.visible && body.ironSnowMesh.material.userData?.isIronSnowShader) {
          body.ironSnowMesh.material.uniforms.uTime.value += deltaTime;
        }
      }
      // G. Update Enceladus Plume
      if (body.enceladusPlume && !isPaused) {
        body.enceladusPlume.update(deltaTime);
      }

      // H. Update Saturn Ring Shadows (Phase 4)
      if (body.data.id === 'saturn' && body.ringMesh && body.ringMesh.material.uniforms) {
        const saturnPos = new THREE.Vector3();
        body.pivot.getWorldPosition(saturnPos);
        body.ringMesh.material.uniforms.uPlanetPosition.value.copy(saturnPos);
        // Sun is at (0,0,0)
        body.ringMesh.material.uniforms.uSunPosition.value.set(0, 0, 0);
        // Camera position for scattering (Phase 8)
        body.ringMesh.material.uniforms.uCameraPosition.value.copy(camera.position);
      }
      
      // Phase 6: Pulse Hero Moons
      if (body.data.saturnMoon?.lodTier === 'hero' && body.mesh.levels) {
        const mat = body.mesh.levels[0].object.material;
        if (mat) {
          mat.emissiveIntensity = 0.1 + 0.2 * Math.sin(Date.now() * 0.003);
        }
      }
    } // Kết thúc vòng lặp bodies

    for (const orbit of orbits) {
      if (orbit.visible && orbit.material.uniforms?.uTime) {
        orbit.material.uniforms.uTime.value += deltaTime;
      }
    }

    // Cập nhật controls và Camera Tracking
    if (isFlying) {
      flyProgress += deltaTime / flyDuration;
      if (flyProgress >= 1) {
        flyProgress = 1;
        isFlying = false;
      }
      // easeInOutCubic: t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
      const t = flyProgress;
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      
      camera.position.lerpVectors(flyStartPos, flyEndPos, ease);
      controls.target.lerpVectors(flyStartTarget, flyEndTarget, ease);

      // Phase 6: Cinematic FOV Pulse during fly
      const fovEffect = Math.sin(ease * Math.PI) * 10; 
      camera.fov = 45 + fovEffect; 
      camera.updateProjectionMatrix();
    } else {
      camera.fov = 45;
      camera.updateProjectionMatrix();

      if (cameraMode === 'follow' && trackedBody) {
        const targetPos = new THREE.Vector3();
        trackedBody.pivot.getWorldPosition(targetPos);
        
        // T?nh vector kho?ng c?ch hi?n t?i t? camera ??n target c?
        const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
        
        // Di chuy?n c? target v? camera theo targetPos m?i
        controls.target.copy(targetPos);
        camera.position.copy(targetPos).add(offset);
        
        // T? ??ng C?t d?a h?u d?a tr?n kho?ng c?ch camera (n?u b?t)
        if (isAutoSliceEnabled) {
          const distance = camera.position.distanceTo(targetPos);
          updateAutoCrossSection(trackedBody, distance, targetPos);
        }
      }
    }

    // -- Raycasting cho Tooltip --
    let tooltipVisible = false;

    // -- Ring Tooltip Logic (Phase 7) --
    if (trackedBody?.data?.id === 'saturn' && trackedBody.ringMesh) {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(trackedBody.ringMesh);
      if (intersects.length > 0) {
        const hitPoint = intersects[0].point;
        const planetPos = new THREE.Vector3();
        trackedBody.pivot.getWorldPosition(planetPos);
        const distUnits = hitPoint.distanceTo(planetPos);
        const scaleFactor = 9.45 / 58232;
        const distKm = distUnits / scaleFactor;

        let ringName = '';
        let ringDesc = '';

        if (distKm < 74500) { ringName = 'Vành D'; ringDesc = 'Vành đai mờ nhất, nằm gần sát bầu khí quyển.'; }
        else if (distKm < 92000) { ringName = 'Vành C'; ringDesc = 'Vành đai tối, chứa nhiều bụi đá và vật chất hữu cơ.'; }
        else if (distKm < 117580) { ringName = 'Vành B'; ringDesc = 'Vành đai lớn nhất, sáng nhất và dày đặc nhất.'; }
        else if (distKm < 122170) { ringName = 'Phân cách Cassini'; ringDesc = 'Khoảng trống rộng 4,800km do lực hấp dẫn của Mimas.'; }
        else if (distKm < 136775) { 
          if (distKm > 133400 && distKm < 133800) { ringName = 'Khoảng trống Encke'; ringDesc = 'Khe hở nhỏ nơi vệ tinh Pan đang chăn dắt.'; }
          else { ringName = 'Vành A'; ringDesc = 'Vành đai ngoài cùng trong nhóm chính.'; }
        }
        else if (distKm > 140000 && distKm < 140400) { ringName = 'Vành F'; ringDesc = 'Vành đai hẹp, bện xoắn kỳ lạ nằm ngoài cùng.'; }

        if (ringName) {
          tooltipVisible = true;
          updateLayerTooltip(true, mouseClientX, mouseClientY, ringName, ringDesc);
        }
      }
    }

    // Cập nhật Cinematic Camera nếu đang active
    if (cinematicCamera.isActive()) {
      if (isAutoDirectorActive) {
        autoDirectorTimer -= deltaTime;
        if (autoDirectorTimer <= 0) {
          triggerRandomCinematicCut();
        }
      }
      cinematicCamera.update(deltaTime);
    } else {
      controls.update();
    }

    // C?p nh?t Ghost Moon System
    if (saturnGhostSystem && trackedBody?.data?.id === 'saturn') {
      const saturnWorldPos = new THREE.Vector3();
      trackedBody.pivot.getWorldPosition(saturnWorldPos);
      const distToCamera = camera.position.distanceTo(saturnWorldPos);
      saturnGhostSystem.update(deltaTime, timeScale, distToCamera);
    }

    // -- Raycasting cho Interior Tooltip --
    if (trackedBody && trackedBody.isCrossSectionActive) {
      const interiorGroup = trackedBody.tiltGroup.getObjectByName('cross_section_layers');
      if (interiorGroup) {
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(interiorGroup.children, false);
        
        // T?m ?i?m giao c?t kh?ng b? clipping
        const validHit = intersects.find(hit => clipPlane.distanceToPoint(hit.point) >= 0);
        
        if (validHit && validHit.object.userData.layerData) {
          tooltipVisible = true;
          updateLayerTooltip(true, mouseClientX, mouseClientY, validHit.object.userData.layerData.name, validHit.object.userData.layerData.desc);
        }
      }
    }
    if (!tooltipVisible) {
      updateLayerTooltip(false);
    }

    // C?p nh?t nh?n (n?u ?ang hi?n th?) - Throttled ?? t?i ?u hi?u n?ng
    const labelThrottle = /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 6 : 3;
    if (areLabelsVisible() && frameCount % labelThrottle === 0) {
      updateLabels(camera, renderer);
    }
    frameCount++;

    // Phase 4.2: Update sunlight path positions
    if (frameCount % 3 === 0) { // Throttle: update mỗi 3 frame
      for (const sp of sunlightPaths) {
        if (!sp.line.visible) continue;
        const worldPos = new THREE.Vector3();
        sp.body.pivot.getWorldPosition(worldPos);
        const positions = sp.line.geometry.attributes.position.array;
        positions[0] = worldPos.x;
        positions[1] = worldPos.y;
        positions[2] = worldPos.z;
        positions[3] = 0; // Sun at origin
        positions[4] = 0;
        positions[5] = 0;
        sp.line.geometry.attributes.position.needsUpdate = true;
      }
    }

    // C?p nh?t v?nh ?ai ti?u h?nh tinh
    asteroidBelt.update(simulationTime, deltaTime);

    // C?p nh?t Minimap & Zoom Indicator
    updateMinimap();
    updateZoomIndicator();

    // Phase 3.1: Adaptive Exposure
    updateSunlightExposure();

    // K?t xu?t qua post-processing pipeline (bloom)
    composer.render();
  }

  function updateMinimap() {
    const minimapCanvas = document.getElementById('minimap-canvas');
    const minimapCtx = minimapCanvas.getContext('2d');
    if (!minimapCtx) return;

    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    const center = w / 2;
    
    minimapCtx.clearRect(0, 0, w, h);
    
    // Scale factor: AU is very large
    const scale = center / (40 * AU); 

    // Draw Sun
    minimapCtx.fillStyle = '#ffcc00';
    minimapCtx.beginPath();
    minimapCtx.arc(center, center, 3, 0, Math.PI * 2);
    minimapCtx.fill();

    bodies.forEach(body => {
      if (body.data.isMoon || body.data.id === 'sun') return;
      
      const pos = new THREE.Vector3();
      body.pivot.getWorldPosition(pos);
      
      const mx = center + pos.x * scale;
      const my = center + pos.z * scale;
      
      minimapCtx.fillStyle = body === trackedBody ? '#ffffff' : 'rgba(110, 198, 255, 0.5)';
      minimapCtx.beginPath();
      minimapCtx.arc(mx, my, 1.5, 0, Math.PI * 2);
      minimapCtx.fill();
    });

    // Draw Camera
    const cx = center + camera.position.x * scale;
    const cz = center + camera.position.z * scale;
    minimapCtx.fillStyle = '#ff3333';
    minimapCtx.beginPath();
    minimapCtx.arc(cx, cz, 2, 0, Math.PI * 2);
    minimapCtx.fill();
  }

  function updateZoomIndicator() {
    const zoomLevels = document.querySelectorAll('.zoom-level');
    const zoomPointer = document.getElementById('zoom-pointer');
    if (!zoomPointer) return;

    if (!trackedBody) {
      zoomLevels.forEach(el => el.classList.remove('active'));
      zoomLevels[0].classList.add('active');
      zoomPointer.style.top = '20px';
      return;
    }

    const targetPos = new THREE.Vector3();
    trackedBody.pivot.getWorldPosition(targetPos);
    const dist = camera.position.distanceTo(targetPos);
    const radius = trackedBody.mesh.scale.x;

    let activeLevel = 'overview';
    let pointerTop = '20px';

    if (dist < radius * 3.5) {
      activeLevel = 'slice';
      pointerTop = '120px';
    } else if (dist < radius * 18) {
      activeLevel = 'approach';
      pointerTop = '70px';
    }

    zoomLevels.forEach(el => {
      el.classList.toggle('active', el.dataset.level === activeLevel);
    });
    zoomPointer.style.top = pointerTop;
  }

  function takeScreenshot() {
    renderer.render(scene, camera);
    const dataURL = renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `SolarSystem_${trackedBody?.data.name || 'System'}_${Date.now()}.png`;
    link.href = dataURL;
    link.click();
  }

  // B?t ??u v?ng l?p
  let frameCount = 0;
  animate();

  const moonCount = bodies.filter(b => b.data.isMoon).length;
  console.log(`Kepler Engine: ${bodies.length} thi?n th? (${moonCount} v? tinh) ?ang quay tr?n qu? ??o elip`);
}

// Khởi động ứng dụng
bootstrap().catch(err => {
  console.error('[SolarSystem] Initialization error:', err);
  const loadingPercent = document.getElementById('loading-percent');
  if (loadingPercent) {
    loadingPercent.textContent = `Error: ${err.message}`;
    loadingPercent.style.color = '#ff6666';
  }
});
