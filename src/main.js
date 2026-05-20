import * as THREE from 'three';
import { initScene } from './scene.js';
import { loadSolarSystemData, loadSaturnGhostConfig } from './dataLoader.js';
import { setPlanetData, planetData } from './planetData.js';
import { createPlanet } from './createPlanet.js';
import { computeAllPositions } from './kepler.js';
import { initPostProcessing } from './postprocessing.js';
import { initUI, updateLayerTooltip, showNotification, updateSpeedDisplay, updateCurrentPlanetName } from './ui.js';
import { createOrbitLine, createNbodyOrbitLine, updateOrbitLineGeometry, getSegmentCount } from './orbits.js';
import { createLabel, updateLabels, toggleLabels, areLabelsVisible } from './labels.js';
import { getCurrentPreset, onPresetChange } from './renderConfig.js';
import { updateAutoCrossSection, toggleCrossSection, clipPlane } from './crossSection.js';
import { createAsteroidBelt } from './asteroidBelt.js';
import { initNewtonGravity, updateNewtonGravity, disableNewtonGravity, setFocusedBodyId, getFocusedBodyIds, predictTrajectory, syncGravityBodyState } from './gravity.js';
import { initSpacetimeGrid, setSpacetimeGridEnabled, updateSpacetimeGrid } from './spacetimeGrid.js';
import { AU } from './constants.js';
import { selfRegulatingFactor } from './sunInterior.js';
import { createCinematicCameraController } from './cinematicCamera.js';
import { GhostMoonSystem } from './ghostMoonSystem.js';
import { applyOrbitSafety } from './orbitSafety.js';

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
  let isPerfStatsEnabled = false;
  let isAutoSliceEnabled = false;
  let isMagneticFieldEnabled = false;
  let isAuroraEnabled = false;
  let isCloudsEnabled = false;
  let newtonGravityActive = false;
  let orbitSafetyInterval = getCurrentPreset().orbitSafetyInterval ?? 12;
  const nbodyOrbitLines = new Map();
  const NBODY_PREDICTION_INTERVAL = 45;

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

  // 3e. Auto Director Logic — only planets with high-quality surface visuals
  const PLANET_HEROES = ['earth', 'saturn', 'jupiter', 'mars', 'venus'];
  const PLANET_TYPES = new Set(['terrestrial', 'gas-giant', 'ice-giant']);

  function getCinematicPlanets() {
    return Array.from(bodyById.values()).filter(b => {
      if (b.data.type === 'star' || b.data.isMoon) return false;
      if (b.data.type === 'comet') {
        const distAU = b.pivot.position.length() / AU;
        return distAU < 5;
      }
      return true;
    });
  }

  function triggerRandomCinematicCut() {
    if (!cinematicCamera.isActive()) return;

    const planets = getCinematicPlanets();
    if (planets.length === 0) return;

    // 70% chance to pick a hero planet, 30% for any planet
    let nextBody;
    if (Math.random() < 0.7) {
      const heroId = PLANET_HEROES[Math.floor(Math.random() * PLANET_HEROES.length)];
      nextBody = bodyById.get(heroId);
      if (!nextBody || nextBody.data.isMoon || nextBody.data.type === 'star') {
        nextBody = planets[Math.floor(Math.random() * planets.length)];
      }
    } else {
      nextBody = planets[Math.floor(Math.random() * planets.length)];
    }

    trackedBody = nextBody;
    cinematicCamera.setTarget(trackedBody);

    // Teleport camera to the sun-lit side of the planet
    const targetWorldPos = trackedBody.pivot.getWorldPosition(new THREE.Vector3());
    const sunDir = new THREE.Vector3(0, 0, 0).sub(targetWorldPos).normalize();
    const startDist = trackedBody.data.radius * (Math.random() * 4 + 3);

    // Generate random offset but guarantee it faces the sun
    const randomDir = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2
    ).normalize().multiplyScalar(startDist);
    if (randomDir.dot(sunDir) < 0) randomDir.reflect(sunDir);
    camera.position.copy(targetWorldPos).add(randomDir);

    // Pick a shot tailored to planet type — sunOrbit always looks at the lit side
    const isGasGiant = trackedBody.data.type === 'gas-giant' || trackedBody.data.type === 'ice-giant';
    const shots = isGasGiant
      ? ['sunOrbit', 'sunOrbit', 'orbit', 'flyBy', 'dollyZoom']
      : ['sunOrbit', 'sunOrbit', 'orbit', 'flyBy', 'chase', 'dollyZoom'];
    const weights = isGasGiant
      ? [0.3, 0.2, 0.25, 0.15, 0.1]
      : [0.25, 0.2, 0.2, 0.15, 0.1, 0.1];
    let randomVal = Math.random();
    let selectedShot = shots[0];
    for (let i = 0; i < shots.length; i++) {
      if (randomVal < weights[i]) {
        selectedShot = shots[i];
        break;
      }
      randomVal -= weights[i];
    }

    // Pick lens based on planet type and distance
    const useDramaticLens = Math.random() < 0.35;
    const lenses = isGasGiant
      ? (useDramaticLens ? [20, 24, 28] : [35, 50, 70])
      : (useDramaticLens ? [24, 28, 35] : [50, 85, 135]);
    const selectedLens = lenses[Math.floor(Math.random() * lenses.length)];

    // Base configuration
    const shotParams = {
      handheld: Math.random() < 0.25,
      dutchAngle: 0,
      sunDir: sunDir
    };

    // Slow dutch drift for cinematic feel (40% chance)
    if (Math.random() < 0.4) {
      shotParams.dutchAngle = (Math.random() - 0.5) * 0.08;
    }

    // Rule of Thirds framing (50% chance — increased for better quality)
    if (Math.random() < 0.5) {
      shotParams.framingOffset = {
        x: (Math.random() > 0.5 ? 1 : -1) * (0.2 + Math.random() * 0.3),
        y: (Math.random() > 0.5 ? 1 : -1) * (0.15 + Math.random() * 0.25)
      };
    }

    // Shot specific params — all biased toward the sun-lit side
    if (selectedShot === 'flyBy') {
      shotParams.duration = 8 + Math.random() * 6;
      shotParams.dutchAngle = (Math.random() - 0.5) * 0.3;
      if (Math.random() < 0.3) shotParams.handheld = true;
    }
    if (selectedShot === 'chase') {
      const chaseDist = trackedBody.data.radius * (3 + Math.random() * 3);
      const chaseHeight = (Math.random() - 0.5) * trackedBody.data.radius * 0.5;
      shotParams.offset = new THREE.Vector3(
        sunDir.x * chaseDist * 0.3,
        sunDir.y * chaseDist * 0.2 + chaseHeight,
        sunDir.z * chaseDist * 0.3
      );
    }
    if (selectedShot === 'orbit') {
      const orbitRadius = isGasGiant
        ? trackedBody.data.radius * (5 + Math.random() * 8)
        : trackedBody.data.radius * (3 + Math.random() * 5);
      shotParams.radius = orbitRadius;
      shotParams.speed = 0.04 + Math.random() * 0.06;
      shotParams.height = (Math.random() - 0.5) * orbitRadius * 0.4;
      shotParams.orbitCenterOffset = sunDir.clone().multiplyScalar(orbitRadius * 0.35);
    }
    if (selectedShot === 'sunOrbit') {
      const useCloseUp = Math.random() < 0.35;
      shotParams.radius = isGasGiant
        ? trackedBody.data.radius * (6 + Math.random() * 10)
        : useCloseUp
          ? trackedBody.data.radius * (3 + Math.random() * 2.5)
          : trackedBody.data.radius * (4 + Math.random() * 6);
      // Orbit period: thời gian quay hết 1 vòng (giây) — nhất quán cho mọi hành tinh
      shotParams.orbitPeriod = 35 + Math.random() * 25; // 35-60s/vòng
      // Dao động theta/thay đổi độ cao nhẹ tạo sự đa dạng
      shotParams.thetaFreq = 1.5 + Math.random() * 1.0; // 1.5-2.5
      shotParams.distFreq = 1.0 + Math.random() * 1.0;  // 1.0-2.0
      shotParams.heightFreq = 0.7 + Math.random() * 0.8; // 0.7-1.5
      // Vertical drift cho một số shot
      if (Math.random() < 0.3) {
        shotParams.vertOscAmplitude = (0.1 + Math.random() * 0.15) * trackedBody.data.radius;
      }
    }
    if (selectedShot === 'dollyZoom') {
      shotParams.duration = 12 + Math.random() * 6;
      const useDramaticDolly = Math.random() < 0.5;
      shotParams.startFov = useDramaticDolly ? 100 : 50;
      shotParams.endFov = useDramaticDolly ? 20 : 90;
      shotParams.startDist = trackedBody.data.radius * 5;
      shotParams.startDir = sunDir.clone().negate();
    }

    cinematicCamera.setShotPreset(selectedShot, shotParams);
    cinematicCamera.setLens(selectedLens);

    // Reset timer — varied shot duration for pacing
    autoDirectorTimer = 12 + Math.random() * 10; // 12-22 seconds
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
    if (!trackedBody) return;
    cinematicCamera.setTarget(trackedBody);

    // ── Ch? ?? Ng?m h?nh tinh: mode riêng, kh?ng b? auto-director hay flyTo ghi ?è ──
    if (cinematicCamera.isActive() && cinematicCamera.getMode() === 'planetFocus') {
      cinematicCamera.setShotPreset('planetFocus');
      showNotification(`🪐 Ngắm: ${trackedBody.data.name.vi || trackedBody.data.name}`);
      updateCurrentPlanetName(trackedBody.data.name.vi || trackedBody.data.name);
      return;
    }

    // ── Ch? ?? th??ng (kh?ng ph?i planetFocus) ──
    // N?u cinematic ?ang active ? mode kh?c, disable n? tr??c khi flyTo
    if (cinematicCamera.isActive()) {
      cinematicCamera.disable();
    }

    const target = new THREE.Vector3();
    trackedBody.pivot.getWorldPosition(target);
    
    if (planetId === 'saturn') {
      const preset = SATURN_PRESETS['default'];
      const isFirstTime = !hasVisitedSaturn;
      hasVisitedSaturn = true;
      
      const inclRad = THREE.MathUtils.degToRad(preset.inclination);
      const azimRad = THREE.MathUtils.degToRad(preset.azimuth);
      const offset = new THREE.Vector3(
        preset.distance * Math.sin(inclRad) * Math.cos(azimRad),
        preset.distance * Math.cos(inclRad),
        preset.distance * Math.sin(inclRad) * Math.sin(azimRad)
      );
      const camTarget = target.clone().add(offset);
      startFlyTo(camTarget, target, isFirstTime ? 2.2 : 1.5);
    } else {
      const zoomDist = Math.max(trackedBody.data.radius * 5, 0.25);
      const camTarget = target.clone().add(new THREE.Vector3(zoomDist, zoomDist * 0.5, zoomDist));
      startFlyTo(camTarget, target, 1.1);
    }
    if (!visitedBodies.has(planetId)) {
      visitedBodies.add(planetId);
      showNotification(`Khám phá mới: ${trackedBody.data.name.vi || trackedBody.data.name}`);
    }

    // Focused Gravity: ch? mô ph?ng c?m thiên th? liên quan
    if (newtonGravityActive) {
      applyGravityFocus(planetId);
    }
  }

  function applyGravityFocus(bodyId) {
    setFocusedBodyId(bodyId);
    const groupIds = getFocusedBodyIds();
    if (!groupIds) return;

    for (const body of bodies) {
      const inGroup = groupIds.has(body.data.id);
      body.mesh.visible = inGroup;
      if (body.ringMesh) body.ringMesh.visible = inGroup;
      if (body.atmosphereMeshes) {
        body.atmosphereMeshes.forEach(m => m.visible = inGroup);
      }
      if (body.volumetricCloudMesh) {
        body.volumetricCloudMesh.visible = inGroup && isCloudsEnabled;
      }
    }
  }

  function restoreAllMeshesVisibility() {
    for (const body of bodies) {
      body.mesh.visible = true;
      if (body.ringMesh) body.ringMesh.visible = true;
      if (body.atmosphereMeshes) {
        body.atmosphereMeshes.forEach(m => m.visible = true);
      }
      if (body.volumetricCloudMesh) {
        body.volumetricCloudMesh.visible = isCloudsEnabled;
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
      // Focused Gravity: quay l?i mô ph?ng toàn h?
      if (newtonGravityActive) {
        setFocusedBodyId(null);
        restoreAllMeshesVisibility();
      }
    },
    onFollow: (planetId) => {
      cameraMode = 'follow';
      trackedBody = bodyById.get(planetId);
      cinematicCamera.setTarget(trackedBody);
      if (cinematicCamera.isActive() && trackedBody) cinematicCamera.setMode('targetLock');
      if (newtonGravityActive) {
        applyGravityFocus(planetId);
      }
    },
    onToggleOrbits: (show) => {
      for (const orbit of orbits) {
        orbit.visible = show;
      }
      // ??ng b? N-body orbit lines v?i visuals toggle
      if (newtonGravityActive) {
        for (const [, line] of nbodyOrbitLines) {
          line.visible = show;
        }
        if (show) {
          updateNbodyPredictions();
        }
      }
    },
    onToggleLabels: (show) => {
      toggleLabels(show);
    },
    onScreenshot: () => {
      takeScreenshot();
    },
    onHighResScreenshot: () => {
      takeHighResScreenshot();
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
    onToggleMagneticField: (enabled) => {
      isMagneticFieldEnabled = enabled;
      for (const body of bodies) {
        if (body.magneticFieldGroup) {
          body.magneticFieldGroup.visible = enabled;
        }
      }
    },
    onToggleAurora: (enabled) => {
      isAuroraEnabled = enabled;
      for (const body of bodies) {
        if (body.auroraGroup) {
          body.auroraGroup.visible = enabled;
        }
      }
    },
    onToggleClouds: (enabled) => {
      isCloudsEnabled = enabled;
      for (const body of bodies) {
        if (body.volumetricCloudMesh) {
          body.volumetricCloudMesh.visible = enabled;
        }
      }
    },
    onToggleNewtonGravity: (enabled) => {
      if (enabled) {
        initNewtonGravity(bodies, scene, simulationTime, bodyById);
        for (const orbit of orbits) {
          orbit.visible = false;
        }
        if (trackedBody) {
          applyGravityFocus(trackedBody.data.id);
        }
        // D? ?oán qu? ??o N-body ngay l?p t?c
        updateNbodyPredictions();
      } else {
        disableNewtonGravity(bodies, scene);
        restoreAllMeshesVisibility();
        const visualsBtn = document.getElementById('toggle-visuals');
        const visualsActive = visualsBtn && visualsBtn.classList.contains('active');
        for (const orbit of orbits) {
          orbit.visible = !!visualsActive;
        }
        // D?n d?p N-body orbit lines
        for (const [, line] of nbodyOrbitLines) {
          scene.remove(line);
          if (line.geometry) line.geometry.dispose();
          if (line.material) line.material.dispose();
        }
        nbodyOrbitLines.clear();
      }
      newtonGravityActive = enabled;
    },
    onToggleSpacetimeGrid: (enabled) => {
      setSpacetimeGridEnabled(scene, enabled, bodies);
    },
    onToggleCinematic: (enabled) => {
      if (enabled) {
        cinematicCamera.setTarget(trackedBody);
        cinematicCamera.enable(trackedBody ? 'targetLock' : 'free');
        setCinematicMode(true);
      } else {
        cinematicCamera.disable();
        setCinematicMode(false);
      }
    },
    onCinematicShotChange: (shot) => {
      if (shot === 'free' || shot === 'targetLock') {
        cinematicCamera.setMode(shot);
      } else if (shot === 'planetFocus') {
        if (!trackedBody) {
          const planets = getCinematicPlanets();
          if (planets.length > 0) {
            trackedBody = planets[0];
            cinematicCamera.setTarget(trackedBody);
          }
        }
        cinematicCamera.setShotPreset('planetFocus');
        if (trackedBody) {
          updateCurrentPlanetName(trackedBody.data.name.vi || trackedBody.data.name);
        }
        // Luôn hiển thị planet selector khi ở chế độ này
        const ps = document.getElementById('planet-selector');
        if (ps) ps.style.display = '';
      } else {
        cinematicCamera.setShotPreset(shot);
      }
    },
    onCinematicLensChange: (lens) => {
      cinematicCamera.setLens(lens);
    },
    onCinematicCleanUIToggle: (isClean) => {
      setCinematicMode(isClean);
    },
    onCinematicAutoDirectorToggle: (active) => {
      isAutoDirectorActive = active;
      if (active) {
        autoDirectorTimer = 0; // Trigger immediately
        setCinematicMode(true);
      } else {
        setCinematicMode(false);
      }
    },
    onToggleFps: (enabled) => {
      const fpsEl = document.getElementById('fps-counter');
      if (fpsEl) fpsEl.style.display = enabled ? 'block' : 'none';
    },
    onTogglePerfStats: (enabled) => {
      const perfEl = document.getElementById('perf-stats');
      if (perfEl) perfEl.style.display = enabled ? 'flex' : 'none';
      isPerfStatsEnabled = enabled;
    },
    onSpeedChange: (factor) => {
      cinematicCamera.adjustShotSpeed(factor);
      const newSpeed = cinematicCamera.getShotSpeed();
      updateSpeedDisplay(newSpeed);
    }
  });

  // Kh?i t?o tr?ng th?i ?n m?c ??nh cho c?c c?ng c? m?i (Phase 5 Optimization)
  // ── Cinematic Mode: Complete UI hiding + FPS optimization ──
  let isCinematicModeActive = false;
  let savedUIStates = {};
  let savedEffectStates = {};

  function setCinematicMode(active) {
    if (active === isCinematicModeActive) return;
    isCinematicModeActive = active;

    if (active) {
      // Save and hide ALL UI elements (except the restore button)
      const uiIds = [
        'top-bar', 'planet-selector', 'info-panel',
        'minimap-container', 'zoom-indicator', 'settings-panel',
        'search-panel', 'cinematic-panel', 'saturn-camera-panel',
        'discovery-notification', 'fps-counter', 'perf-stats',
        'layer-tooltip', 'attribution'
      ];
      savedUIStates = {};
      for (const id of uiIds) {
        const el = document.getElementById(id);
        if (el) {
          savedUIStates[id] = el.style.display;
          el.style.display = 'none';
        }
      }

      // Save effect toggle states
      savedEffectStates = {
        magnetic: isMagneticFieldEnabled,
        aurora: isAuroraEnabled,
        clouds: isCloudsEnabled
      };

      // Disable expensive shader effects immediately
      if (isMagneticFieldEnabled) {
        for (const body of bodies) {
          if (body.magneticFieldGroup) body.magneticFieldGroup.visible = false;
        }
      }
      if (isAuroraEnabled) {
        for (const body of bodies) {
          if (body.auroraGroup) body.auroraGroup.visible = false;
        }
      }
      if (isCloudsEnabled) {
        for (const body of bodies) {
          if (body.volumetricCloudMesh) body.volumetricCloudMesh.visible = false;
        }
      }

      // Hide labels (DOM-intensive) and orbits (shader updates)
      toggleLabels(false);
      for (const orbit of orbits) {
        orbit.visible = false;
      }

      // Close info panel tooltip
      updateLayerTooltip(false);

      // Show restore button so user can always exit
      const restoreBtn = document.getElementById('btn-restore-ui');
      if (restoreBtn) restoreBtn.style.display = 'block';
    } else {
      // Restore ALL UI elements
      for (const [id, display] of Object.entries(savedUIStates)) {
        const el = document.getElementById(id);
        if (el) el.style.display = display || '';
      }

      // Restore expensive effects to previous state
      if (savedEffectStates.magnetic) {
        for (const body of bodies) {
          if (body.magneticFieldGroup) body.magneticFieldGroup.visible = true;
        }
      }
      if (savedEffectStates.aurora) {
        for (const body of bodies) {
          if (body.auroraGroup) body.auroraGroup.visible = true;
        }
      }
      if (savedEffectStates.clouds) {
        for (const body of bodies) {
          if (body.volumetricCloudMesh) body.volumetricCloudMesh.visible = true;
        }
      }

      // Restore labels and orbits based on current toggle
      const visualsBtn = document.getElementById('toggle-visuals');
      const visualsActive = visualsBtn && visualsBtn.classList.contains('active');
      toggleLabels(!!visualsActive);
      for (const orbit of orbits) {
        orbit.visible = !!visualsActive;
      }
    }
  }

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

  // ??? Kh?i t?o tr?ng thái hi?n th? ?? kh?p v?i toggle "Qu? ?ạo & Nhãn tên"
  // (toggle m?c ?nh active, c?n ??ng b? v?i actual state)
  for (const orbit of orbits) {
    orbit.visible = true;
  }
  toggleLabels(true);

  const keplerBodies = bodies.filter(body => (
    body.data.type !== 'star' &&
    (body.data.semiMajorAxis > 0 || body.data.displayOrbitRadius > 0)
  ));
  const keplerBodyData = keplerBodies.map(body => body.data);
  let keplerPositionBuffer = new Float64Array(keplerBodies.length * 3);

  // 5a. T?o V?nh ?ai ti?u h?nh tinh (Asteroid Belt)
  const asteroidBelt = createAsteroidBelt(5000);
  scene.add(asteroidBelt.mesh);

  // 5ab. Kh?i t?o l??i Không-Th?i Gian (Spacetime Grid)
  initSpacetimeGrid(scene);

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
    asteroidBelt.setOrbitInterval(preset.asteroidOrbitInterval ?? 3);

    for (const body of bodies) {
      // Atmosphere opacity scale
      if (body.atmosphereMeshes?.length && body.data.atmosphere) {
        for (const atmMesh of body.atmosphereMeshes) {
          const baseOpacity = atmMesh.userData.baseOpacity ?? body.data.atmosphere?.opacity ?? 0.5;
          atmMesh.material.uniforms.uOpacity.value = baseOpacity * preset.atmosphereOpacityScale;
          atmMesh.visible = preset.atmosphereEnabled;
        }
      }

      // Cloud opacity scale
      if (body.cloudMesh) {
        body.cloudMesh.material.opacity = preset.cloudOpacityScale;
        body.cloudMesh.visible = preset.cloudsEnabled;
      }

      // Volumetric clouds (default OFF — controlled by toggle)
      if (body.volumetricCloudMesh) {
        body.volumetricCloudMesh.material.uniforms.uOpacity.value = preset.cloudOpacityScale * 0.35;
        body.volumetricCloudMesh.visible = false;
      }

      // Aurora visibility (default OFF — controlled by toggle)
      if (body.auroraGroup) {
        body.auroraGroup.visible = false;
      }

      // Venus atmosphere texture
      if (body.atmosphereTextureMesh) {
        body.atmosphereTextureMesh.visible = preset.atmosphereEnabled;
      }

      // Unified Corona visibility — luôn hiển thị
      if (body.coronaMesh) {
        body.coronaMesh.visible = preset.coronaEnabled !== false;
      }

      if (body.chromosphereMesh) {
        body.chromosphereMesh.visible = preset.coronaEnabled !== false;
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

  // M?c ??nh t?t c?c t?nh n?ng m?i (t? tr??ng, c?c quang, m?y th? tích)
  for (const body of bodies) {
    if (body.magneticFieldGroup) body.magneticFieldGroup.visible = false;
    if (body.auroraGroup) body.auroraGroup.visible = false;
    if (body.volumetricCloudMesh) body.volumetricCloudMesh.visible = false;
  }

  // L?ng nghe thay ??i preset
  onPresetChange((newPreset) => {
    orbitSafetyInterval = newPreset.orbitSafetyInterval ?? 12;
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

  // ── N-body Trajectory Prediction (c?p nh?t ???ng qu? ??o ??ng) ──
  function updateNbodyPredictions() {
    if (!newtonGravityActive) return;

    const visualsBtn = document.getElementById('toggle-visuals');
    const visualsActive = visualsBtn && visualsBtn.classList.contains('active');
    if (!visualsActive) return;

    // Xác ??nh danh sách thiên th? c?n d? ?oán (focus ho?c t?t c?)
    const focusedIds = getFocusedBodyIds();
    const targetBodyIds = focusedIds
      ? Array.from(focusedIds)
      : bodies.filter(b => b.data.type !== 'star').map(b => b.data.id);
    const targetSet = new Set(targetBodyIds);

    // D?n d?p lines c?a thiên th? không còn trong focus
    for (const [id, line] of nbodyOrbitLines) {
      if (!targetSet.has(id)) {
        scene.remove(line);
        if (line.geometry) line.geometry.dispose();
        if (line.material) line.material.dispose();
        nbodyOrbitLines.delete(id);
      }
    }

    for (const bodyId of targetBodyIds) {
      const body = bodyById.get(bodyId);
      if (!body) continue;

      const qualityMultiplier = getCurrentPreset().orbitQuality ?? 1;
      const numPoints = getSegmentCount(body.data.eccentricity || 0, body.data.isMoon, qualityMultiplier);

      const trajectory = predictTrajectory(bodyId, numPoints);
      if (trajectory.length < 3) continue;

      const points = trajectory.map(p => new THREE.Vector3(p.x, p.y, p.z));

      let orbitLine = nbodyOrbitLines.get(bodyId);
      if (orbitLine) {
        updateOrbitLineGeometry(orbitLine, points);
        orbitLine.visible = true;
      } else {
        orbitLine = createNbodyOrbitLine(body.data, numPoints);
        nbodyOrbitLines.set(bodyId, orbitLine);
        scene.add(orbitLine);
        orbitLine.visible = true;
      }
    }
  }

  // Vector pool — cấp phát một lần, tái sử dụng trong hot path, tránh GC pressure
  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _v3 = new THREE.Vector3();
  const _sunDir = new THREE.Vector3();
  let _cachedTime = 0;

  function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();
    if (!isPaused) {
      simulationTime += deltaTime * timeScale;
    }

    // Solar wind — throttle m?i 3 frame (giá tr? thay ??i ch?m, không ?nh h??ng th? giác)
    if (frameCount % 3 === 0) {
      _cachedTime = simulationTime;
    }
    const solarWindStrength = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(_cachedTime * 0.00003)) 
      * (0.6 + 0.4 * Math.sin(_cachedTime * 0.00008 + 1.3));

    // Newton Gravity N-body (thay thế Kepler)
    if (newtonGravityActive && !isPaused) {
      updateNewtonGravity(bodies, deltaTime * timeScale);
    }

    if (!newtonGravityActive && !isPaused && keplerBodies.length) {
      keplerPositionBuffer = computeAllPositions(keplerBodyData, simulationTime, keplerPositionBuffer);
      for (let i = 0; i < keplerBodies.length; i++) {
        const base = i * 3;
        keplerBodies[i].pivot.position.set(
          keplerPositionBuffer[base],
          keplerPositionBuffer[base + 1],
          keplerPositionBuffer[base + 2]
        );
      }
    }

    // D? ?oán qu? ??o N-body (throttle m?i NBODY_PREDICTION_INTERVAL frame)
    if (newtonGravityActive && frameCount % NBODY_PREDICTION_INTERVAL === 0) {
      updateNbodyPredictions();
    }

    // Cập nhật lưới Không-Thời Gian (throttle mỗi 2 frame)
    if (frameCount % 2 === 0) {
      updateSpacetimeGrid(bodies);
    }

    for (const body of bodies) {
      // A. C?p nh?t v? tr? qu? ??o (Kepler ho?c Gravity) - B? qua M?t Tr?i
      if (body.data.type !== 'star') {
        const hasOrbit = body.data.semiMajorAxis > 0 || body.data.displayOrbitRadius > 0;
        if (hasOrbit && !isPaused) {
          // E. C?p nh?t sao ch?i (??u?i, qu?ng, ?? s?ng)
          if (body.tailMesh) {
            const awayPos = _v2.copy(body.pivot.position).multiplyScalar(2);
            body.tailMesh.lookAt(awayPos);

            // ?? s?ng sao ch?i: I = 1/r^2.5 (brightness curve th?c t?)
            const distAU = body.pivot.position.length() / AU;
            const r = Math.max(distAU, 0.5);
            const brightnessFactor = Math.pow(r, -2.5);
            const maxTailDist = 10.0;
            let tailOpacity = 1.0 - (distAU / maxTailDist);
            tailOpacity = Math.max(0, Math.min(1, tailOpacity));
            const brightness = Math.min(1, brightnessFactor / 0.1);

            // C?p nh?t ??u?i ion
            body.tailMesh.material.uniforms.uOpacity.value = tailOpacity;
            body.tailMesh.material.uniforms.uBrightness.value = brightness;
            body.tailMesh.visible = tailOpacity > 0.05;

            // ?? d?i ??u?i ??ng: 5 ? 25 AU
            const tailScale = 5 + 20 * tailOpacity;
            body.tailMesh.scale.z = tailScale / 15;

            // C?p nh?t ??u?i b?i
            if (body.dustTailMesh) {
              body.dustTailMesh.lookAt(awayPos);
              body.dustTailMesh.material.uniforms.uOpacity.value = tailOpacity * 0.5;
              body.dustTailMesh.material.uniforms.uBrightness.value = brightness * 0.7;
              body.dustTailMesh.visible = tailOpacity > 0.05;
              const dustScale = 3 + 9 * tailOpacity;
              body.dustTailMesh.scale.z = dustScale / 12;
            }

            // C?p nh?t qu?ng (coma) ??ng
            if (body.comaMesh) {
              body.comaMesh.material.uniforms.uOpacity.value = tailOpacity * 0.8;
              body.comaMesh.material.uniforms.uBrightness.value = brightness;
              body.comaMesh.visible = tailOpacity > 0.05;
              const baseScale = body.data.physical.radius * 3.0;
              const comaFactor = 1 + 1.5 * tailOpacity;
              body.comaMesh.scale.setScalar(baseScale * comaFactor);
            }

            // C?p nh?t ?? s?ng l?i (outgassing)
            if (body.mesh && body.mesh.material) {
              body.mesh.material.emissiveIntensity = 0.3 + 2.0 * tailOpacity;
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

      // Unified Corona — single shader update, zero onion rings
      if (body.coronaMesh?.material?.userData?.isSunUnifiedCorona) {
        body.coronaMesh.material.uniforms.uTime.value += deltaTime;
      }

      // D2. C?p nh?t s?c quy?n (chromosphere)
      if (body.chromosphereMesh?.material.userData?.isSunChromosphereShader) {
        body.chromosphereMesh.material.uniforms.uTime.value += deltaTime;
      }

      // --- T?I ?U H?A (PHASE 5) — dùng vector pool, compute sunDir 1 l?n ---
      body.pivot.getWorldPosition(_v);
      _sunDir.copy(_v).negate().normalize();

      const distToCamera = camera.position.distanceTo(_v);
      const cullDist = body.data.radius * 50;

      // D3. C?p nh?t t? tr??ng (magnetosphere + field lines) — ch? khi ? g?n
      if (isMagneticFieldEnabled && body.magneticFieldGroup?.userData?.isMagneticSystem && distToCamera < cullDist) {
        body.magneticFieldGroup.traverse((child) => {
          if (child.material?.uniforms?.uTime) {
            child.material.uniforms.uTime.value += deltaTime;
          }
          if (child.material?.uniforms?.uSunDirection) {
            child.material.uniforms.uSunDirection.value.copy(_sunDir);
          }
          if (child.material?.uniforms?.uSolarWind) {
            child.material.uniforms.uSolarWind.value = solarWindStrength;
          }
        });

        body.magneticFieldGroup.lookAt(0, 0, 0);
      }

      // D4. C?p nh?t khí quy?n (atmosphere layers + scattering) — b? qua khi r?t xa
      if (body.atmosphereMeshes?.length && distToCamera < cullDist * 1.6) {
        for (const atmMesh of body.atmosphereMeshes) {
          if (atmMesh.material.uniforms?.uTime) {
            atmMesh.material.uniforms.uTime.value += deltaTime;
          }
          if (atmMesh.material.uniforms?.uSunDirection) {
            atmMesh.material.uniforms.uSunDirection.value.copy(_sunDir);
          }
          if (atmMesh.material.uniforms?.uSolarWind) {
            atmMesh.material.uniforms.uSolarWind.value = solarWindStrength;
          }
          if (atmMesh.material.uniforms?.uPlanetRadius) {
            atmMesh.material.uniforms.uPlanetRadius.value = body.data.radius;
          }
        }
      }

      // D5. C?p nh?t c?c quang (aurora)
      if (isAuroraEnabled && body.auroraGroup) {
        const isAuroraNear = distToCamera < body.data.radius * 8;
        body.auroraGroup.visible = isAuroraNear && cameraMode === 'follow' && isAuroraEnabled;
        if (isAuroraNear) {
          body.auroraGroup.traverse((child) => {
            if (child.material?.uniforms?.uTime) {
              child.material.uniforms.uTime.value += deltaTime;
            }
            if (child.material?.uniforms?.uSolarWind) {
              child.material.uniforms.uSolarWind.value = solarWindStrength;
            }
          });
        }
      }

      // D6. C?p nh?t mây th? tích (volumetric clouds) — ch? khi ? g?n
      if (isCloudsEnabled && body.volumetricCloudMesh && distToCamera < cullDist) {
        if (body.volumetricCloudMesh.material.uniforms?.uTime) {
          body.volumetricCloudMesh.material.uniforms.uTime.value += deltaTime;
        }
        if (body.volumetricCloudMesh.material.uniforms?.uSunDirection) {
          body.volumetricCloudMesh.material.uniforms.uSunDirection.value.copy(_sunDir);
        }
      }

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
      if (body.enceladusPlume) {
        const plumeVisible = distToCamera < Math.max(body.data.radius * 80, 15);
        body.enceladusPlume.mesh.visible = plumeVisible;
        if (plumeVisible && !isPaused) {
          body.enceladusPlume.update(deltaTime);
        }
      }

      // H. Update Ring Shadows (Saturn + Uranus)
      if ((body.data.id === 'saturn' || body.data.id === 'uranus') && body.ringMesh && body.ringMesh.material.uniforms) {
        body.ringMesh.material.uniforms.uPlanetPosition.value.copy(_v);
        body.ringMesh.material.uniforms.uSunPosition.value.set(0, 0, 0);
        body.ringMesh.material.uniforms.uCameraPosition.value.copy(camera.position);
      }
      
      // Phase 6: Pulse Hero Moons — dùng simulationTime thay Date.now()
      if (body.data.saturnMoon?.lodTier === 'hero' && body.mesh.levels) {
        const mat = body.mesh.levels[0].object.material;
        if (mat) {
          mat.emissiveIntensity = 0.1 + 0.2 * Math.sin(simulationTime * 0.003);
        }
      }
    } // Kết thúc vòng lặp bodies

    const shouldRunOrbitSafety = !isPaused && (
      newtonGravityActive ||
      orbitSafetyInterval <= 1 ||
      frameCount % orbitSafetyInterval === 0
    );
    if (shouldRunOrbitSafety) {
      applyOrbitSafety(bodies, bodyById, simulationTime, {
        scene,
        newtonGravityActive,
        syncGravityBodyState,
      });
    }

    // Throttle orbit shader uTime updates — m?i 2 frame (không ?nh h??ng th? giác)
    if (frameCount % 2 === 0) {
      const dt2 = deltaTime * 2;
      for (const orbit of orbits) {
        if (orbit.visible && orbit.material.uniforms?.uTime) {
          orbit.material.uniforms.uTime.value += dt2;
        }
      }
      for (const [, line] of nbodyOrbitLines) {
        if (line.visible && line.material.uniforms?.uTime) {
          line.material.uniforms.uTime.value += dt2;
        }
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

      // Only override FOV when cinematic camera is NOT active
      if (!cinematicCamera.isActive()) {
        const fovEffect = Math.sin(ease * Math.PI) * 10;
        camera.fov = 45 + fovEffect;
        camera.updateProjectionMatrix();
      }
    } else {
      if (!cinematicCamera.isActive()) {
        camera.fov = 45;
        camera.updateProjectionMatrix();
      }

      if (cameraMode === 'follow' && trackedBody) {
        trackedBody.pivot.getWorldPosition(_v2);
        _v3.subVectors(camera.position, controls.target);
        
        controls.target.copy(_v2);
        camera.position.copy(_v2).add(_v3);
        
        if (isAutoSliceEnabled) {
          const distance = camera.position.distanceTo(_v2);
          updateAutoCrossSection(trackedBody, distance, _v2);
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
        trackedBody.pivot.getWorldPosition(_v2);
        const distUnits = hitPoint.distanceTo(_v2);
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

    // -- Uranus Ring Tooltip --
    if (trackedBody?.data?.id === 'uranus' && trackedBody.ringMesh) {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(trackedBody.ringMesh);
      if (intersects.length > 0) {
        const hitPoint = intersects[0].point;
        trackedBody.pivot.getWorldPosition(_v2);
        const distUnits = hitPoint.distanceTo(_v2);

        let ringName = '';
        let ringDesc = '';

        if (distUnits < 6.40) { ringName = 'Vành ζ (1986U2R)'; ringDesc = 'Vành bụi trong cùng, rất mờ, được phát hiện năm 1986.'; }
        else if (distUnits < 6.65) { ringName = 'Vành 6'; ringDesc = 'Vành hẹp nhất trong hệ thống vành đai Uranus.'; }
        else if (distUnits < 6.72) { ringName = 'Vành 5'; ringDesc = 'Vành hẹp, tối, cấu tạo từ băng nước và bụi.'; }
        else if (distUnits < 6.96) { ringName = 'Vành 4'; ringDesc = 'Vành hẹp tương tự vành 5 và 6.'; }
        else if (distUnits < 7.28) { ringName = 'Vành α (Alpha)'; ringDesc = 'Vành sáng nhất trong nhóm vành chính, rộng 7-12 km.'; }
        else if (distUnits < 7.54) { ringName = 'Vành β (Beta)'; ringDesc = 'Vành sáng thứ hai, rộng 7-12 km.'; }
        else if (distUnits < 7.75) { ringName = 'Vành η (Eta)'; ringDesc = 'Vành rất hẹp, chứa nhiều bụi, chỉ rộng 0-2 km.'; }
        else if (distUnits < 7.88) { ringName = 'Vành γ (Gamma)'; ringDesc = 'Vành hẹp sắc nét, rộng 1-4 km.'; }
        else if (distUnits < 8.15) { ringName = 'Vành δ (Delta)'; ringDesc = 'Vành hẹp, rộng 3-7 km.'; }
        else if (distUnits < 8.48) { ringName = 'Vành λ (Lambda)'; ringDesc = 'Vành bụi mờ, cấu tạo từ hạt micrometre.'; }
        else { ringName = 'Vành ε (Epsilon)'; ringDesc = 'Vành sáng nhất và rộng nhất (20-100 km), hơi elip.'; }

        if (ringName) {
          tooltipVisible = true;
          updateLayerTooltip(true, mouseClientX, mouseClientY, ringName, ringDesc);
        }
      }
    }

    // Cập nhật Cinematic Camera nếu đang active
    if (cinematicCamera.isActive()) {
      // Không chạy auto-director khi đang ở planetFocus — mode này do user kiểm soát
      if (isAutoDirectorActive && cinematicCamera.getMode() !== 'planetFocus') {
        autoDirectorTimer -= deltaTime;
        if (autoDirectorTimer <= 0) {
          triggerRandomCinematicCut();
        }
      }
      // Reset auto-director timer nếu vào planetFocus để tránh trigger ngay khi thoát
      if (cinematicCamera.getMode() === 'planetFocus') {
        autoDirectorTimer = 999;
      }
      cinematicCamera.update(deltaTime);
    } else {
      controls.update();
    }

    // C?p nh?t Ghost Moon System
    if (saturnGhostSystem && trackedBody?.data?.id === 'saturn') {
      trackedBody.pivot.getWorldPosition(_v2);
      const ghostDist = camera.position.distanceTo(_v2);
      saturnGhostSystem.update(deltaTime, timeScale, ghostDist);
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
    const labelThrottle = /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 8 : 4;
    if (areLabelsVisible() && frameCount % labelThrottle === 0) {
      updateLabels(camera, renderer);
    }
    frameCount++;

    // Phase 4.2: Update sunlight path positions
    if (frameCount % 3 === 0) {
      for (const sp of sunlightPaths) {
        if (!sp.line.visible) continue;
        sp.body.pivot.getWorldPosition(_v2);
        const positions = sp.line.geometry.attributes.position.array;
        positions[0] = _v2.x;
        positions[1] = _v2.y;
        positions[2] = _v2.z;
        positions[3] = 0;
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
    if (frameCount % 3 === 0) {
      updateSunlightExposure();
    }

    // FPS Counter & Detailed Performance Panel
    frameCount2++;
    const nowTime = Date.now();
    const duration = nowTime - fpsLastTime;
    if (duration >= 500) {
      const fps = Math.round((frameCount2 * 1000) / duration);
      const fpsEl = document.getElementById('fps-counter');
      if (fpsEl && fpsEl.style.display !== 'none') {
        fpsEl.textContent = fps + ' FPS';
      }
      if (isPerfStatsEnabled) {
        updateDetailedPerformanceStats(fps, duration / frameCount2);
      }
      frameCount2 = 0;
      fpsLastTime = nowTime;
    }

    // K?t xu?t qua post-processing pipeline (bloom)
    composer.render();
  }

  let frameCount2 = 0;
  let fpsLastTime = Date.now();

  function updateDetailedPerformanceStats(fps, avgFrameTime) {
    const fpsVal = document.getElementById('perf-fps');
    const timeVal = document.getElementById('perf-frametime');
    const solverVal = document.getElementById('perf-solver');
    const bodiesVal = document.getElementById('perf-bodies');
    const asteroidVal = document.getElementById('perf-asteroids');
    const resolutionVal = document.getElementById('perf-resolution');
    
    if (fpsVal) fpsVal.textContent = fps + ' FPS';
    if (timeVal) timeVal.textContent = avgFrameTime.toFixed(1) + ' ms';
    
    let totalBodies = 0;
    let fastPathCount = 0;
    let halleyCount = 0;
    
    if (newtonGravityActive) {
      if (solverVal) solverVal.innerHTML = '<span style="color:#a78bfa;">N-body Gravity</span>';
      totalBodies = bodies.length;
    } else {
      for (const body of bodies) {
        totalBodies++;
        if (body.data) {
          const e = body.data.eccentricity || 0;
          if (e < 0.15) fastPathCount++;
          else halleyCount++;
        }
      }
      if (solverVal) {
        if (fastPathCount + halleyCount > 0) {
          const percent = Math.round((fastPathCount / (fastPathCount + halleyCount)) * 100);
          solverVal.innerHTML = `Keplerian (<span style="color:#6ec6ff;">Fast: ${percent}%</span>)`;
        } else {
          solverVal.textContent = 'Keplerian';
        }
      }
    }
    
    if (bodiesVal) bodiesVal.textContent = totalBodies;
    
    const currentPreset = getCurrentPreset();
    if (asteroidVal) {
      asteroidVal.textContent = currentPreset ? currentPreset.asteroidCount : '0';
    }
    
    if (resolutionVal) {
      resolutionVal.textContent = `${window.innerWidth}x${window.innerHeight} (@${window.devicePixelRatio.toFixed(2)}x)`;
    }
  }

  function updateMinimap() {
    const minimapContainer = document.getElementById('minimap-container');
    if (!minimapContainer || minimapContainer.style.display === 'none') return;

    const minimapCanvas = document.getElementById('minimap-canvas');
    const minimapCtx = minimapCanvas.getContext('2d');
    if (!minimapCtx) return;

    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    const center = w / 2;
    
    minimapCtx.clearRect(0, 0, w, h);
    const scale = center / (40 * AU); 

    // Draw Sun
    minimapCtx.fillStyle = '#ffcc00';
    minimapCtx.beginPath();
    minimapCtx.arc(center, center, 3, 0, Math.PI * 2);
    minimapCtx.fill();

    for (const body of bodies) {
      if (body.data.isMoon || body.data.id === 'sun') continue;
      
      body.pivot.getWorldPosition(_v);
      const mx = center + _v.x * scale;
      const my = center + _v.z * scale;
      
      minimapCtx.fillStyle = body === trackedBody ? '#ffffff' : 'rgba(110, 198, 255, 0.5)';
      minimapCtx.beginPath();
      minimapCtx.arc(mx, my, 1.5, 0, Math.PI * 2);
      minimapCtx.fill();
    }

    // Draw Camera
    const cx = center + camera.position.x * scale;
    const cz = center + camera.position.z * scale;
    minimapCtx.fillStyle = '#ff3333';
    minimapCtx.beginPath();
    minimapCtx.arc(cx, cz, 2, 0, Math.PI * 2);
    minimapCtx.fill();
  }

  function updateZoomIndicator() {
    const zoomIndicator = document.getElementById('zoom-indicator');
    if (!zoomIndicator || zoomIndicator.style.display === 'none') return;

    const zoomLevels = document.querySelectorAll('.zoom-level');
    const zoomPointer = document.getElementById('zoom-pointer');
    if (!zoomPointer) return;

    if (!trackedBody) {
      zoomLevels.forEach(el => el.classList.remove('active'));
      zoomLevels[0].classList.add('active');
      zoomPointer.style.top = '20px';
      return;
    }

    trackedBody.pivot.getWorldPosition(_v2);
    const dist = camera.position.distanceTo(_v2);
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
    try {
      composer.render();
      const dataURL = renderer.domElement.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `SolarSystem_${trackedBody?.data.name || 'System'}_${Date.now()}.png`;
      link.href = dataURL;
      link.click();
    } catch (error) {
      console.error("Screenshot failed:", error);
      showNotification("Lỗi khi chụp ảnh màn hình: " + error.message, 4000);
    }
  }

  function takeHighResScreenshot() {
    const scale = 3.0; // 3x current resolution
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    const originalPixelRatio = renderer.getPixelRatio();
    const originalAspect = camera.aspect;

    const highResWidth = originalWidth * scale;
    const highResHeight = originalHeight * scale;

    showNotification("Đang chuẩn bị chụp ảnh độ phân giải cực cao...", 3000);

    // Yield main thread so the browser renders the notification first
    setTimeout(() => {
      try {
        // Temporarily resize renderer (updateStyle = false to avoid DOM canvas layout shifting)
        renderer.setSize(highResWidth, highResHeight, false);
        renderer.setPixelRatio(1);

        camera.aspect = highResWidth / highResHeight;
        camera.updateProjectionMatrix();

        // Update post-processing composer size
        composer.setSize(highResWidth, highResHeight);

        // Render high-res frame
        composer.render();

        // Export data
        const dataURL = renderer.domElement.toDataURL('image/png');

        // Trigger download
        const link = document.createElement('a');
        link.download = `SolarSystem_HighRes_${trackedBody?.data.name || 'System'}_${Date.now()}.png`;
        link.href = dataURL;
        link.click();

        showNotification("Đã tải xuống ảnh độ phân giải cực cao thành công!", 3000);
      } catch (error) {
        console.error("High-res screenshot failed:", error);
        showNotification("Lỗi khi chụp ảnh độ phân giải cao: " + error.message, 4000);
      } finally {
        // Restore original dimensions and ratio
        renderer.setPixelRatio(originalPixelRatio);
        renderer.setSize(originalWidth, originalHeight);

        camera.aspect = originalAspect;
        camera.updateProjectionMatrix();

        composer.setSize(originalWidth, originalHeight);

        // Restore screen view render
        composer.render();
      }
    }, 100);
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
