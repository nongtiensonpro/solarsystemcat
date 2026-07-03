import * as THREE from 'three';
import { initScene } from './scene.js';
import { loadSolarSystemData, loadSaturnGhostConfig } from './dataLoader.js';
import { setPlanetData, planetData } from './planetData.js';
import { createPlanet } from './createPlanet.js';
import { computeAllPositions } from './kepler.js';
import { initPostProcessing } from './postprocessing.js';
import { initUI, updateLayerTooltip, showNotification, updateSpeedDisplay, updateCurrentPlanetName, updateBenchmarkProgress, hideBenchmarkOverlay, showBenchmarkReport, syncUIToggles } from './ui.js';
import { createOrbitLine, createCometOrbitLine, createNbodyOrbitLine, updateOrbitLineGeometry, getSegmentCount } from './orbits.js';
import { createLabel, updateLabels, toggleLabels, toggleCometLabels, areLabelsVisible } from './labels.js';
import { getCurrentPreset, onPresetChange, getCurrentPresetKey, applyPreset, QUALITY_PRESETS } from './renderConfig.js';
import { updateAutoCrossSection, toggleCrossSection, clipPlane } from './crossSection.js';
import { createAsteroidBelt } from './asteroidBelt.js';
import { initNewtonGravity, updateNewtonGravity, disableNewtonGravity, setFocusedBodyId, getFocusedBodyIds, predictTrajectory, predictTrajectories, syncGravityBodyState } from './gravity.js';
import { initSpacetimeGrid, setSpacetimeGridEnabled, updateSpacetimeGrid } from './spacetimeGrid.js';
import { AU } from './constants.js';
import { selfRegulatingFactor } from './sunInterior.js';
import { createCinematicCameraController } from './cinematicCamera.js';
import { GhostMoonSystem } from './ghostMoonSystem.js';
import { applyOrbitSafety } from './orbitSafety.js';
import { updateCometPositions } from './cometOrbit.js';
import { updateCometVisuals } from './comets.js';

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

  // Benchmark State Variables
  let benchmarkActive = false;
  let benchmarkFrameSamples = [];
  let lastBenchmarkFrameTime = 0;

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
        if (!orbit.userData?.isCometOrbit) {
          orbit.visible = show;
        }
      }
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
    onToggleCometOrbits: (show) => {
      for (const orbit of orbits) {
        if (orbit.userData?.isCometOrbit) {
          orbit.visible = show;
        }
      }
    },
    onToggleCometLabels: (show) => {
      toggleCometLabels(show);
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
        const cometVisualsBtn = document.getElementById('toggle-comet-visuals');
        const visualsActive = visualsBtn && visualsBtn.classList.contains('active');
        const cometVisualsActive = cometVisualsBtn && cometVisualsBtn.classList.contains('active');
        for (const orbit of orbits) {
          orbit.visible = orbit.userData?.isCometOrbit
            ? !!cometVisualsActive
            : !!visualsActive;
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
    },
    onRunBenchmark: (includeNbody) => {
      runBenchmark(includeNbody);
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

      toggleLabels(false);
      toggleCometLabels(false);
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

      const visualsBtn = document.getElementById('toggle-visuals');
      const cometVisualsBtn = document.getElementById('toggle-comet-visuals');
      const visualsActive = visualsBtn && visualsBtn.classList.contains('active');
      const cometVisualsActive = cometVisualsBtn && cometVisualsBtn.classList.contains('active');
      toggleLabels(!!visualsActive);
      toggleCometLabels(!!cometVisualsActive);
      for (const orbit of orbits) {
        orbit.visible = orbit.userData?.isCometOrbit
          ? !!cometVisualsActive
          : !!visualsActive;
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
      // H?nh tinh, sao chổi ho?c M?t Tr?i: g?n tr?c ti?p v?o scene
      scene.add(body.pivot);
      // Mặt Trời: luôn ở trung tâm, không cần quỹ đạo
      if (data.type !== 'star') {
        // Orbit line: sao chổi dùng hệ thống riêng, hành tinh dùng chung
        const orbitLine = data.type === 'comet'
          ? createCometOrbitLine(data, AU)
          : createOrbitLine(data);
        if (orbitLine) {
          if (data.type === 'comet') {
            orbitLine.userData.isCometOrbit = true;
          }
          scene.add(orbitLine);
          orbits.push(orbitLine);
        }
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

  // Khởi tạo: hành tinh/vệ tinh hiện quỹ đạo & nhãn; sao chổi ẩn (toggle riêng tắt mặc định)
  for (const orbit of orbits) {
    orbit.visible = !orbit.userData?.isCometOrbit;
  }
  toggleLabels(true);
  toggleCometLabels(false);

  const keplerBodies = bodies.filter(body => (
    body.data.type !== 'star' &&
    body.data.type !== 'comet' &&  // Sao chổi dùng engine riêng
    (body.data.semiMajorAxis > 0 || body.data.displayOrbitRadius > 0)
  ));
  const keplerBodyData = keplerBodies.map(body => body.data);
  let keplerPositionBuffer = new Float64Array(keplerBodies.length * 3);

  // ── Sao chổi: mảng riêng, engine riêng ──
  const cometBodies = bodies.filter(body => body.data.type === 'comet');
  const COMET_THROTTLE_INTERVAL = 4; // Cập nhật mỗi 4 frame (theo yêu cầu)

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
  // Vector3 pool cho việc vẽ quỹ đạo N-body
  const _nbodyVectorPool = [];
  let _nbodyVectorPoolIdx = 0;

  function getNbodyVectorFromPool(x, y, z) {
    if (_nbodyVectorPoolIdx >= _nbodyVectorPool.length) {
      _nbodyVectorPool.push(new THREE.Vector3());
    }
    const v = _nbodyVectorPool[_nbodyVectorPoolIdx++];
    v.set(x, y, z);
    return v;
  }

  function updateNbodyPredictions() {
    if (!newtonGravityActive) return;

    const visualsBtn = document.getElementById('toggle-visuals');
    const visualsActive = visualsBtn && visualsBtn.classList.contains('active');
    if (!visualsActive) return;

    // Xác ??nh danh sách thiên th? c?n d? ?oán (focus ho?c chỉ hành tinh chính ở Overview)
    const focusedIds = getFocusedBodyIds();
    const targetBodyIds = focusedIds
      ? Array.from(focusedIds)
      : bodies.filter(b => b.data.type !== 'star' && !b.data.isMoon).map(b => b.data.id);
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

    const configs = [];
    for (const bodyId of targetBodyIds) {
      const body = bodyById.get(bodyId);
      if (!body) continue;

      const qualityMultiplier = getCurrentPreset().orbitQuality ?? 1;
      const numPoints = getSegmentCount(body.data.eccentricity || 0, body.data.isMoon, qualityMultiplier);
      configs.push({ bodyId, numPoints });
    }

    // Chạy mô phỏng tích phân song song chỉ trong một lượt duy nhất
    const trajectoriesMap = predictTrajectories(configs);

    _nbodyVectorPoolIdx = 0; // Reset pool index

    for (const [bodyId, trajectory] of trajectoriesMap) {
      const body = bodyById.get(bodyId);
      if (!body || trajectory.length < 3) continue;

      const points = [];
      for (let i = 0; i < trajectory.length; i++) {
        const p = trajectory[i];
        points.push(getNbodyVectorFromPool(p.x, p.y, p.z));
      }

      let orbitLine = nbodyOrbitLines.get(bodyId);
      if (orbitLine) {
        updateOrbitLineGeometry(orbitLine, points);
        orbitLine.visible = true;
      } else {
        orbitLine = createNbodyOrbitLine(body.data, points.length);
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
  let _lastTooltipVisible = false;

  function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();

    if (benchmarkActive) {
      const now = performance.now();
      if (lastBenchmarkFrameTime !== 0) {
        benchmarkFrameSamples.push(now - lastBenchmarkFrameTime);
      }
      lastBenchmarkFrameTime = now;
    }
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

    // ── Sao chổi: engine quỹ đạo riêng với distance-based throttle ──
    if (!newtonGravityActive && !isPaused && cometBodies.length) {
      updateCometPositions(cometBodies, simulationTime, frameCount, AU);
    }
    // Cập nhật visual sao chổi (đuôi, quầng, độ sáng) — throttle mỗi 2 frame
    if (!isPaused && cometBodies.length && frameCount % 2 === 0) {
      updateCometVisuals(cometBodies, AU);
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
      if (!body.mesh.visible && body.data.type !== 'star') continue;

      // A. C?p nh?t v? tr? qu? ??o (Kepler ho?c Gravity) - B? qua M?t Tr?i
      if (body.data.type !== 'star') {
        const hasOrbit = body.data.semiMajorAxis > 0 || body.data.displayOrbitRadius > 0;
        if (hasOrbit && !isPaused) {
          // Sao chổi: visual đã được cập nhật bởi updateCometVisuals() riêng
          // Không cần xử lý gì thêm ở đây
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
        if (camera.fov !== 45) {
          camera.fov = 45;
          camera.updateProjectionMatrix();
        }
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
    let tooltipVisible = _lastTooltipVisible;

    if (frameCount % 3 === 0) {
      tooltipVisible = false;

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

      _lastTooltipVisible = tooltipVisible;
    }

    if (!tooltipVisible) {
      updateLayerTooltip(false);
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

    // Cập nhật Ghost Moon System
    if (saturnGhostSystem && trackedBody?.data?.id === 'saturn') {
      trackedBody.pivot.getWorldPosition(_v2);
      const ghostDist = camera.position.distanceTo(_v2);
      saturnGhostSystem.update(deltaTime, timeScale, ghostDist);
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

  // ==========================================
  // BENCHMARK ENGINE SYSTEM
  // ==========================================

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  // --- Phase 1: Baseline Load Setup ---
  const setupPhase1 = () => {
    newtonGravityActive = false;
    disableNewtonGravity(bodies, scene);
    restoreAllMeshesVisibility();
    applyPreset('balanced');
    
    isMagneticFieldEnabled = false;
    isAuroraEnabled = false;
    isCloudsEnabled = false;
    for (const body of bodies) {
      if (body.magneticFieldGroup) body.magneticFieldGroup.visible = false;
      if (body.auroraGroup) body.auroraGroup.visible = false;
      if (body.volumetricCloudMesh) body.volumetricCloudMesh.visible = false;
    }
    toggleSunlightPaths(false);
    setSpacetimeGridEnabled(scene, false, bodies);
    
    cameraMode = 'overview';
    trackedBody = null;
    cinematicCamera.disable();
    setCinematicMode(true);
    
    camera.position.set(200, 100, 200);
    controls.target.set(0, 0, 0);
    camera.fov = 45;
    camera.updateProjectionMatrix();
    
    timeScale = 86400; // 1 Day/s
    isPaused = false;
  };

  const logPhase1 = (elapsed) => {
    return `Đang đo tải cơ sở với mô phỏng Keplerian...\n` +
           `- Thiết lập đồ họa: Balanced (Cân bằng)\n` +
           `- Số lượng thiên thể mô phỏng: ${bodies.length}\n` +
           `- Tiến trình: ${(elapsed / 1000).toFixed(1)}s / 5.0s`;
  };

  // --- Phase 2: N-body Physics Setup (Optional) ---
  const setupPhase2 = () => {
    newtonGravityActive = true;
    initNewtonGravity(bodies, scene, simulationTime, bodyById);
    applyPreset('balanced');
    setSpacetimeGridEnabled(scene, true, bodies);
    
    isMagneticFieldEnabled = false;
    isAuroraEnabled = false;
    isCloudsEnabled = false;
    for (const body of bodies) {
      if (body.magneticFieldGroup) body.magneticFieldGroup.visible = false;
      if (body.auroraGroup) body.auroraGroup.visible = false;
      if (body.volumetricCloudMesh) body.volumetricCloudMesh.visible = false;
    }
    toggleSunlightPaths(false);
    
    cameraMode = 'overview';
    trackedBody = null;
    cinematicCamera.disable();
    setCinematicMode(true);
    
    camera.position.set(220, 110, 220);
    controls.target.set(0, 0, 0);
    camera.fov = 45;
    camera.updateProjectionMatrix();
    
    timeScale = 86400;
    isPaused = false;
  };

  const logPhase2 = (elapsed) => {
    return `Đang đo tải xử lý vật lý hấp dẫn Newton N-body...\n` +
           `- Đang giải tương tác đa vật thể trực tiếp...\n` +
           `- Lưới không-thời gian: Kích hoạt\n` +
           `- Tiến trình: ${(elapsed / 1000).toFixed(1)}s / 5.0s`;
  };

  // --- Phase 3: Particle & GPU Stress Setup ---
  const setupPhase3 = () => {
    newtonGravityActive = false;
    disableNewtonGravity(bodies, scene);
    restoreAllMeshesVisibility();
    applyPreset('cinematicUltra'); // Loads 10,000 asteroids
    toggleSunlightPaths(true);
    setSpacetimeGridEnabled(scene, false, bodies);
    
    isMagneticFieldEnabled = false;
    isAuroraEnabled = false;
    isCloudsEnabled = false;
    for (const body of bodies) {
      if (body.magneticFieldGroup) body.magneticFieldGroup.visible = false;
      if (body.auroraGroup) body.auroraGroup.visible = false;
      if (body.volumetricCloudMesh) body.volumetricCloudMesh.visible = false;
    }
    
    cameraMode = 'overview';
    trackedBody = null;
    cinematicCamera.disable();
    setCinematicMode(true);
    
    camera.position.set(250, 130, 250);
    controls.target.set(0, 0, 0);
    camera.fov = 45;
    camera.updateProjectionMatrix();
    
    timeScale = 86400;
    isPaused = false;
  };

  const logPhase3 = (elapsed) => {
    return `Đang áp tải nặng hạt và tính toán đổ bóng GPU...\n` +
           `- Vẽ và cập nhật quỹ đạo: 10,000 tiểu hành tinh\n` +
           `- Đường truyền ánh sáng Mặt Trời: Kích hoạt\n` +
           `- Tiến trình: ${(elapsed / 1000).toFixed(1)}s / 5.0s`;
  };

  // --- Phase 4: Cinematic Ultra Setup ---
  const setupPhase4 = () => {
    newtonGravityActive = false;
    disableNewtonGravity(bodies, scene);
    restoreAllMeshesVisibility();
    applyPreset('cinematicUltra');
    
    isMagneticFieldEnabled = true;
    for (const body of bodies) {
      if (body.magneticFieldGroup) body.magneticFieldGroup.visible = true;
    }
    
    isAuroraEnabled = true;
    for (const body of bodies) {
      if (body.auroraGroup) body.auroraGroup.visible = true;
    }
    
    isCloudsEnabled = true;
    for (const body of bodies) {
      if (body.volumetricCloudMesh) body.volumetricCloudMesh.visible = true;
    }
    
    toggleSunlightPaths(false);
    setSpacetimeGridEnabled(scene, false, bodies);
    
    isAutoDirectorActive = true;
    autoDirectorTimer = 0;
    
    cameraMode = 'follow';
    trackedBody = bodyById.get('earth');
    cinematicCamera.setTarget(trackedBody);
    cinematicCamera.enable('targetLock');
    setCinematicMode(true);
    
    timeScale = 86400;
    isPaused = false;
  };

  const logPhase4 = (elapsed) => {
    const trackingName = trackedBody ? (trackedBody.data.name.vi || trackedBody.data.name) : "Trái Đất";
    return `Đang đo tải đồ họa cực hạn Cinematic Ultra...\n` +
           `- Máy ảnh đạo diễn tự động: Đang bám sát ${trackingName}\n` +
           `- Hiệu ứng khí quyển, Cực quang, Từ trường & Mây thể tích: BẬT\n` +
           `- Tiến trình: ${(elapsed / 1000).toFixed(1)}s / 5.0s`;
  };

  // --- Phase Execution Engine ---
  async function runPhase(phaseNum, totalPhases, phaseName, phaseTag, setupFn, logGenerator) {
    setupFn();
    
    // Warm-up for 300ms without recording
    benchmarkActive = false;
    lastBenchmarkFrameTime = 0;
    benchmarkFrameSamples = [];
    
    const phaseStartTime = performance.now();
    const phaseDuration = 5000; // 5 seconds
    const warmUpDuration = 300;
    
    await sleep(warmUpDuration);
    
    // Start recording
    benchmarkActive = true;
    lastBenchmarkFrameTime = performance.now();
    
    const sampleInterval = 100;
    
    while (true) {
      const elapsed = performance.now() - phaseStartTime;
      if (elapsed >= phaseDuration) break;
      
      const progressPct = ((phaseNum - 1) / totalPhases * 100) + (elapsed / phaseDuration * (100 / totalPhases));
      
      let liveFps = 60;
      if (benchmarkFrameSamples.length > 0) {
        const lastSamples = benchmarkFrameSamples.slice(-10);
        const avgFrameTime = lastSamples.reduce((a, b) => a + b, 0) / lastSamples.length;
        liveFps = avgFrameTime > 0 ? 1000 / avgFrameTime : 60;
      }
      
      const logText = logGenerator(elapsed);
      updateBenchmarkProgress(phaseName, phaseTag, progressPct, liveFps, logText);
      
      await sleep(sampleInterval);
    }
    
    benchmarkActive = false;
    return [...benchmarkFrameSamples];
  }

  // --- Generate Markdown Report ---
  function generateMarkdownReport(data) {
    const dateStr = new Date().toLocaleString('vi-VN');
    const nbodyStatus = data.includeNbody ? "Có kích hoạt (Tùy chọn phụ)" : "Không kích hoạt";
    
    let phaseTable = `
| Giai đoạn | Tải áp dụng | FPS Trung bình |
| :--- | :--- | :---: |
| 1. Baseline Load | Đồ họa Cân bằng (Keplerian) | ${data.phaseFps[0].toFixed(1)} FPS |
`;

    let idx = 1;
    if (data.includeNbody) {
      phaseTable += `| 2. Physics Stress | Mô phỏng vật lý N-body | ${data.phaseFps[1].toFixed(1)} FPS |\n`;
      idx = 2;
    }
    
    phaseTable += `| ${idx + 1}. Particle Stress | 10,000 Tiểu hành tinh & Đường ánh sáng | ${data.phaseFps[idx].toFixed(1)} FPS |\n`;
    phaseTable += `| ${idx + 2}. Cinematic Ultra | Máy ảnh đạo diễn & Volumetric Effects | ${data.phaseFps[idx + 1].toFixed(1)} FPS |`;

    return `# BÁO CÁO HIỆU NĂNG THIẾT BỊ
**Trình mô phỏng Hệ Mặt Trời 3D (3D Solar System)**

---

## 📊 THÔNG TIN TỔNG QUAN
- **Thời gian đánh giá:** ${dateStr}
- **Độ phân giải hiển thị:** ${data.resolution}
- **Tỷ lệ điểm ảnh (DPR):** ${data.pixelRatio}x
- **Tổng điểm hiệu năng:** **${Math.round(data.score)}**
- **Phân hạng thiết bị:** **${data.tierLabel}**

---

## ⚡ CHỈ SỐ HIỆU NĂNG CHI TIẾT
| Chỉ số | Giá trị | Ý nghĩa thực tế |
| :--- | :--- | :--- |
| **FPS Trung bình (Average)** | **${data.avgFps.toFixed(1)} FPS** | Số khung hình hiển thị trung bình mỗi giây. |
| **1% Low FPS** | **${data.low1pcFps.toFixed(1)} FPS** | Độ mượt mà thực tế (khử hiện tượng giật khung hình). |
| **FPS Thấp nhất (Min)** | **${data.minFps.toFixed(1)} FPS** | Tốc độ khung hình chậm nhất ghi nhận được. |
| **Độ ổn định Frame Pacing** | **${data.standardDeviation.toFixed(1)} ms** | Độ lệch chuẩn thời gian vẽ khung hình (Càng thấp càng tốt). |
| **Vật lý N-body Gravity** | **${nbodyStatus}** | Trạng thái của mô phỏng hấp dẫn Newton đa vật thể. |

---

## 📈 KẾT QUẢ THEO GIAI ĐOẠN (STRESS-TEST PHASES)
${phaseTable}

---

## 💡 KHUYẾN NGHỊ CẤU HÌNH TỐI ƯU
**Phân tích từ hệ thống:**
> ${data.recommendation}

---
*Báo cáo được tạo tự động bởi Hệ Thống Benchmark Tích Hợp của 3D Solar System Simulator.*`;
  }

  // --- Main runBenchmark Function ---
  async function runBenchmark(includeNbody) {
    showNotification("Chuẩn bị bắt đầu đánh giá hiệu năng thiết bị...", 2000);
    await sleep(1500);
    
    // Save original states
    const originalPresetKey = getCurrentPresetKey();
    const originalNewtonActive = newtonGravityActive;
    const originalGridActive = document.getElementById('toggle-spacetime')?.classList.contains('active') || false;
    const originalMagneticActive = isMagneticFieldEnabled;
    const originalAuroraActive = isAuroraEnabled;
    const originalCloudsActive = isCloudsEnabled;
    const originalSunlightActive = document.getElementById('toggle-sunlight')?.classList.contains('active') || false;
    const originalVisualsActive = document.getElementById('toggle-visuals')?.classList.contains('active') || false;
    const originalCometVisualsActive = document.getElementById('toggle-comet-visuals')?.classList.contains('active') || false;
    const originalSliceActive = isAutoSliceEnabled;
    const originalHudActive = document.getElementById('toggle-hud')?.classList.contains('active') || false;
    const originalFpsActive = document.getElementById('toggle-fps')?.classList.contains('active') || false;
    const originalPerfActive = isPerfStatsEnabled;

    const originalCameraMode = cameraMode;
    const originalTrackedBody = trackedBody;
    const originalTimeScale = timeScale;
    const originalPaused = isPaused;
    const originalAutoDirector = isAutoDirectorActive;
    const originalControlsEnabled = controls.enabled;
    const originalCameraPos = camera.position.clone();
    const originalControlsTarget = controls.target.clone();
    const originalCameraFov = camera.fov;

    // Lock UI controls
    controls.enabled = false;
    
    let allSamples = [];
    let phaseResults = []; // average FPS per phase
    
    const totalPhases = includeNbody ? 4 : 3;
    
    // Restore helper function
    function restoreOriginalStates() {
      timeScale = originalTimeScale;
      isPaused = originalPaused;
      isPerfStatsEnabled = originalPerfActive;
      isAutoSliceEnabled = originalSliceActive;

      newtonGravityActive = originalNewtonActive;
      if (newtonGravityActive) {
        initNewtonGravity(bodies, scene, simulationTime, bodyById);
      } else {
        disableNewtonGravity(bodies, scene);
        restoreAllMeshesVisibility();
      }
      setSpacetimeGridEnabled(scene, originalGridActive, bodies);

      applyPreset(originalPresetKey);
      
      isMagneticFieldEnabled = originalMagneticActive;
      for (const body of bodies) {
        if (body.magneticFieldGroup) body.magneticFieldGroup.visible = originalMagneticActive;
      }

      isAuroraEnabled = originalAuroraActive;
      for (const body of bodies) {
        if (body.auroraGroup) body.auroraGroup.visible = originalAuroraActive;
      }

      isCloudsEnabled = originalCloudsActive;
      for (const body of bodies) {
        if (body.volumetricCloudMesh) body.volumetricCloudMesh.visible = originalCloudsActive;
      }

      toggleSunlightPaths(originalSunlightActive);

      toggleLabels(originalVisualsActive);
      toggleCometLabels(originalCometVisualsActive);
      for (const orbit of orbits) {
        orbit.visible = orbit.userData?.isCometOrbit
          ? originalCometVisualsActive
          : originalVisualsActive;
      }

      controls.enabled = originalControlsEnabled;
      cameraMode = originalCameraMode;
      trackedBody = originalTrackedBody;
      
      isAutoDirectorActive = originalAutoDirector;
      if (originalAutoDirector) {
        cinematicCamera.setTarget(trackedBody);
        cinematicCamera.enable(trackedBody ? 'targetLock' : 'free');
        setCinematicMode(true);
      } else {
        cinematicCamera.disable();
        setCinematicMode(false);
      }

      camera.position.copy(originalCameraPos);
      controls.target.copy(originalControlsTarget);
      camera.fov = originalCameraFov;
      camera.updateProjectionMatrix();

      // Visual UI sync
      syncUIToggles({
        visuals: originalVisualsActive,
        cometVisuals: originalCometVisualsActive,
        magnet: originalMagneticActive,
        aurora: originalAuroraActive,
        clouds: originalCloudsActive,
        sunlight: originalSunlightActive,
        slice: originalSliceActive,
        hud: originalHudActive,
        fps: originalFpsActive,
        perfStats: originalPerfActive,
        newton: originalNewtonActive,
        spacetime: originalGridActive
      });

      const minimap = document.getElementById('minimap-container');
      if (minimap) minimap.style.display = originalHudActive ? 'block' : 'none';
      const zoom = document.getElementById('zoom-indicator');
      if (zoom) zoom.style.display = originalHudActive ? 'flex' : 'none';
      const fpsEl = document.getElementById('fps-counter');
      if (fpsEl) fpsEl.style.display = originalFpsActive ? 'block' : 'none';
      const perfEl = document.getElementById('perf-stats');
      if (perfEl) perfEl.style.display = originalPerfActive ? 'flex' : 'none';
      
      const timeSelect = document.getElementById('time-select');
      if (timeSelect) timeSelect.value = String(originalTimeScale);
      
      const btnPause = document.getElementById('btn-pause');
      if (btnPause) {
        btnPause.textContent = originalPaused ? '▶' : '⏸';
        btnPause.classList.toggle('active', originalPaused);
      }
    }
    
    try {
      // Phase 1: Baseline Load
      let p1Samples = await runPhase(
        1,
        totalPhases,
        "Đo tải cơ sở",
        `Giai đoạn 1/${totalPhases}`,
        setupPhase1,
        logPhase1
      );
      allSamples.push(...p1Samples);
      phaseResults.push(p1Samples.length > 0 ? (1000 * p1Samples.length / p1Samples.reduce((a, b) => a + b, 0)) : 60);
      
      // Phase 2 (Optional): N-body Physics Stress
      if (includeNbody) {
        let p2Samples = await runPhase(
          2,
          totalPhases,
          "Tải nặng CPU (Vật lý N-body)",
          `Giai đoạn 2/${totalPhases}`,
          setupPhase2,
          logPhase2
        );
        allSamples.push(...p2Samples);
        phaseResults.push(p2Samples.length > 0 ? (1000 * p2Samples.length / p2Samples.reduce((a, b) => a + b, 0)) : 60);
      }
      
      // Phase 3: Particle & GPU Stress
      const p3PhaseNum = includeNbody ? 3 : 2;
      let p3Samples = await runPhase(
        p3PhaseNum,
        totalPhases,
        "Tải nặng GPU & Hạt",
        `Giai đoạn ${p3PhaseNum}/${totalPhases}`,
        setupPhase3,
        logPhase3
      );
      allSamples.push(...p3Samples);
      phaseResults.push(p3Samples.length > 0 ? (1000 * p3Samples.length / p3Samples.reduce((a, b) => a + b, 0)) : 60);
      
      // Phase 4: Cinematic Ultra Stress
      const p4PhaseNum = includeNbody ? 4 : 3;
      let p4Samples = await runPhase(
        p4PhaseNum,
        totalPhases,
        "Đồ họa Đạo diễn (Cinematic Ultra)",
        `Giai đoạn ${p4PhaseNum}/${totalPhases}`,
        setupPhase4,
        logPhase4
      );
      allSamples.push(...p4Samples);
      phaseResults.push(p4Samples.length > 0 ? (1000 * p4Samples.length / p4Samples.reduce((a, b) => a + b, 0)) : 60);
      
      hideBenchmarkOverlay();
      
      if (allSamples.length === 0) {
        throw new Error("Không thu thập được mẫu khung hình nào!");
      }
      
      // Calculate statistics
      const totalFrames = allSamples.length;
      const totalDurationMs = allSamples.reduce((a, b) => a + b, 0);
      const avgFps = 1000 * totalFrames / totalDurationMs;
      
      const sortedSamples = [...allSamples].sort((a, b) => a - b);
      const low1pcIndex = Math.floor(sortedSamples.length * 0.99);
      const low1pcFrameTime = sortedSamples[low1pcIndex];
      const low1pcFps = 1000 / low1pcFrameTime;
      
      const maxFrameTime = sortedSamples[sortedSamples.length - 1];
      const minFps = 1000 / maxFrameTime;
      
      const meanFrameTime = totalDurationMs / totalFrames;
      const variance = allSamples.reduce((acc, ft) => acc + Math.pow(ft - meanFrameTime, 2), 0) / totalFrames;
      const stdDev = Math.sqrt(variance);
      
      const renderedPixels = window.innerWidth * window.innerHeight * window.devicePixelRatio * window.devicePixelRatio;
      const FHD_Pixels = 1920 * 1080;
      const resolutionScale = Math.sqrt(renderedPixels / FHD_Pixels);
      const score = (avgFps * 0.7 + low1pcFps * 0.3) * resolutionScale * 100;
      
      let tierLabel = "Mid-Range";
      let tierClass = "tier-mid";
      let recommendation = "";
      
      if (score >= 9000 || avgFps >= 100) {
        tierLabel = "Ultra High-End";
        tierClass = "tier-ultra";
        recommendation = "Thiết bị của bạn cực kỳ mạnh mẽ! Bạn có thể kích hoạt cấu hình Cinematic Ultra cùng với tất cả các hiệu ứng nâng cao (Từ trường, Cực quang, Mây thể tích) mà vẫn giữ được độ mượt mà tuyệt đối ở tần số quét cao.";
      } else if (score >= 6000 || avgFps >= 75) {
        tierLabel = "High-End";
        tierClass = "tier-high";
        recommendation = "Cấu hình mạnh mẽ. Khuyên dùng thiết lập Cinematic hoặc Cinematic Ultra. Có thể bật Mây thể tích và các hiệu ứng từ trường một cách mượt mà ở mức 60-90 FPS.";
      } else if (score >= 3000 || avgFps >= 40) {
        tierLabel = "Mid-Range";
        tierClass = "tier-mid";
        recommendation = "Hiệu năng khá ổn. Khuyên dùng thiết lập Balanced (Cân bằng) hoặc Cinematic với một số hiệu ứng phụ được tắt bớt để duy trì mức FPS ổn định trên 60.";
      } else {
        tierLabel = "Low-End / Mobile";
        tierClass = "tier-low";
        recommendation = "Thiết bị thuộc nhóm phổ thông hoặc thiết bị di động tiết kiệm năng lượng. Khuyên dùng thiết lập Performance (Tối ưu hiệu năng) hoặc Balanced, tắt các hiệu ứng nặng như Mây thể tích và Từ trường để tránh giật lag.";
      }
      
      const reportData = {
        score,
        tierLabel,
        tierClass,
        resolution: `${window.innerWidth}x${window.innerHeight}`,
        pixelRatio: window.devicePixelRatio.toFixed(2),
        includeNbody,
        phaseFps: phaseResults,
        avgFps,
        low1pcFps,
        minFps,
        standardDeviation: stdDev,
        recommendation
      };
      
      showBenchmarkReport(
        reportData,
        () => {
          const markdownText = generateMarkdownReport(reportData);
          const blob = new Blob([markdownText], { type: 'text/markdown;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `SolarSystem_Benchmark_${Date.now()}.md`;
          link.click();
          URL.revokeObjectURL(url);
          showNotification("Đã tải xuống báo cáo Markdown thành công!", 3000);
        },
        () => {
          restoreOriginalStates();
          showNotification("Đã phục hồi cấu hình mô phỏng ban đầu.", 3000);
        }
      );
      
    } catch (error) {
      console.error("Benchmark failed:", error);
      hideBenchmarkOverlay();
      showNotification("Đánh giá hiệu năng thất bại: " + error.message, 4000);
      restoreOriginalStates();
    }
  }

  // Bắt đầu vòng lập
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
