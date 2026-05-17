import * as THREE from 'three';

/**
 * Cinematic Camera Controller
 * Provides freecam and cinematic shot modes.
 */
export function createCinematicCameraController(camera, controls, domElement) {
  let active = false;
  let mode = 'free'; // 'free', 'targetLock', 'orbit', etc.
  let targetBody = null;
  let currentFocalLength = 35; // default 35mm
  let targetFOV = camera.fov;

  // Movement state
  const velocity = new THREE.Vector3();
  const rotation = new THREE.Euler(0, 0, 0, 'YXZ');
  const quaternion = new THREE.Quaternion();
  
  let roll = 0;
  let pitch = 0;
  let yaw = 0;

  // Constants
  const acceleration = 12.0;
  const damping = 6.0;
  const rotationSmoothing = 12.0;
  const lookAtSmoothing = 8.0;
  const fovSmoothing = 5.0;
  const baseMoveSpeed = 50.0;
  const mouseSensitivity = 0.002;
  
  let speedMultiplier = 1.0;

  // Shot state
  let shotTime = 0;
  let shotParams = {};
  let shotStartCamPos = new THREE.Vector3();
  let shotStartQuat = new THREE.Quaternion();

  // Input tracking
  const keys = {};
  let isRightMouseDown = false;

  // Event Listeners
  const onKeyDown = (e) => { 
    keys[e.code] = true; 
    if (e.code === 'Escape') disable(); 
    
    // Toggle Lock mode
    if (e.code === 'KeyL' && targetBody) {
      mode = mode === 'targetLock' ? 'free' : 'targetLock';
      console.log(`[CinematicCamera] Mode changed to: ${mode}`);
    }

    // Test Shot Presets
    if (e.code === 'KeyO' && targetBody) setShotPreset('orbit');
    if (e.code === 'KeyF' && targetBody) setShotPreset('flyBy');
    if (e.code === 'KeyH' && targetBody) setShotPreset('chase');

    // Test Lens Presets
    if (e.code === 'Digit1') setLens(24);
    if (e.code === 'Digit2') setLens(35);
    if (e.code === 'Digit3') setLens(50);
    if (e.code === 'Digit4') setLens(85);
    if (e.code === 'Digit5') setLens(135);
  };
  const onKeyUp = (e) => { keys[e.code] = false; };
  const onMouseDown = (e) => { if (e.button === 2) isRightMouseDown = true; };
  const onMouseUp = (e) => { if (e.button === 2) isRightMouseDown = false; };
  function getMouseDistanceScale() {
    if (targetBody) {
      const targetPos = targetBody.pivot.getWorldPosition(new THREE.Vector3());
      const dist = camera.position.distanceTo(targetPos);
      return THREE.MathUtils.clamp(dist / (targetBody.data.radius * 10), 0.2, 4.0);
    }
    const dist = camera.position.length();
    return THREE.MathUtils.clamp(dist / 100, 0.2, 4.0);
  }

  const onMouseMove = (e) => {
    if (active && isRightMouseDown && (mode === 'free' || mode === 'orbit')) {
      const distScale = getMouseDistanceScale();
      yaw -= e.movementX * mouseSensitivity * distScale;
      pitch -= e.movementY * mouseSensitivity * distScale;
      pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
      
      if (mode === 'orbit') {
        const orbitDistScale = getMouseDistanceScale();
        shotParams.orbitAngleOffset = (shotParams.orbitAngleOffset || 0) - e.movementX * mouseSensitivity * orbitDistScale;
      }
    }
  };
  const onWheel = (e) => {
    if (active) {
      if (mode === 'orbit') {
        const factor = e.deltaY > 0 ? 1.1 : 0.9;
        shotParams.radius *= factor;
      } else {
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        speedMultiplier = THREE.MathUtils.clamp(speedMultiplier * factor, 0.01, 100);
      }
    }
  };

  function enable(newMode = 'free') {
    if (active) return;
    active = true;
    mode = newMode;
    controls.enabled = false;
    
    // Initialize rotation from current camera
    quaternion.copy(camera.quaternion);
    rotation.setFromQuaternion(quaternion);
    yaw = rotation.y;
    pitch = rotation.x;
    roll = rotation.z;

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('wheel', onWheel, { passive: false });

    // Prevent context menu on right click
    domElement.addEventListener('contextmenu', preventDefault);
    
    // Notify post-processing
    dispatchCinematicUpdate(true);
    
    console.log(`[CinematicCamera] Enabled in mode: ${mode}`);
  }

  function disable() {
    if (!active) return;
    active = false;
    controls.enabled = true;
    
    // Sync OrbitControls target back to what the camera is looking at
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    controls.target.copy(camera.position).add(dir.multiplyScalar(100));

    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('wheel', onWheel);
    domElement.removeEventListener('contextmenu', preventDefault);

    // Notify post-processing
    dispatchCinematicUpdate(false);

    // Trigger a custom event to update UI
    window.dispatchEvent(new CustomEvent('cinematic-disabled'));

    console.log('[CinematicCamera] Disabled');
  }

  function dispatchCinematicUpdate(isActive) {
    const targetPos = targetBody ? targetBody.pivot.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 0, 0);
    const focusDistance = camera.position.distanceTo(targetPos);
    
    window.dispatchEvent(new CustomEvent('cinematic-mode-changed', {
      detail: {
        active: isActive,
        config: {
          focusDistance: focusDistance,
          aperture: 0.00005 + (135 - currentFocalLength) * 0.000001 // Thử nghiệm aperture theo tiêu cự
        }
      }
    }));
  }

  function preventDefault(e) { e.preventDefault(); }

  function setShotPreset(presetName, params = {}) {
    if (!active) enable();
    mode = presetName;
    shotTime = 0;
    shotParams = { ...params };
    shotStartCamPos.copy(camera.position);
    shotStartQuat.copy(camera.quaternion);

    if (mode === 'orbit' && targetBody) {
      const targetPos = targetBody.pivot.getWorldPosition(new THREE.Vector3());
      const dist = camera.position.distanceTo(targetPos);
      shotParams.radius = shotParams.radius || dist;
      shotParams.speed = shotParams.speed || 0.2;
      shotParams.height = shotParams.height || (camera.position.y - targetPos.y);
      shotParams.orbitAngleOffset = 0;
    }

    if (mode === 'flyBy' && targetBody) {
      const targetPos = targetBody.pivot.getWorldPosition(new THREE.Vector3());
      const radius = targetBody.data.radius * 5;
      const sunDir = shotParams.sunDir || new THREE.Vector3(0, 0, -1);

      // Build basis aligned with sun direction for lit-side flyby
      const ref = Math.abs(sunDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
      const right = new THREE.Vector3().crossVectors(sunDir, ref).normalize();
      const up = new THREE.Vector3().crossVectors(right, sunDir).normalize();

      // Curve passes through the sun-lit side of the planet
      const p1 = targetPos.clone()
        .add(right.clone().multiplyScalar(-radius * 5))
        .add(up.clone().multiplyScalar(radius * 1.5))
        .add(sunDir.clone().multiplyScalar(radius * 4));
      const p2 = targetPos.clone()
        .add(sunDir.clone().multiplyScalar(radius * 2.5));
      const p3 = targetPos.clone()
        .add(right.clone().multiplyScalar(radius * 5))
        .add(up.clone().multiplyScalar(radius * 0.8))
        .add(sunDir.clone().multiplyScalar(-radius * 3));

      shotParams.curve = new THREE.CatmullRomCurve3([p1, p2, p3]);
      shotParams.duration = params.duration || 10;
    }

    if (mode === 'dollyZoom' && targetBody) {
      const targetPos = targetBody.pivot.getWorldPosition(new THREE.Vector3());
      const startDir = shotParams.startDir || new THREE.Vector3().subVectors(camera.position, targetPos).normalize();
      if (startDir.lengthSq() < 0.1) startDir.set(0, 0, 1);
      shotParams.startDir = startDir;
    }

    if (mode === 'planetFocus' && targetBody) {
      const targetPos = targetBody.pivot.getWorldPosition(new THREE.Vector3());
      const dist = camera.position.distanceTo(targetPos);
      shotParams.radius = shotParams.radius || Math.max(dist, targetBody.data.radius * 4);
      shotParams.speed = shotParams.speed || 0.12;
      shotParams.inclination = shotParams.inclination || 30;
    }

    dispatchCinematicUpdate(active);
    console.log(`[CinematicCamera] Shot Preset: ${presetName}`);
  }

  function setLens(focalLength) {
    currentFocalLength = focalLength;
    // FOV_v = 2 * Math.atan( (sensor_height / 2) / focalLength )
    // sensor_height for 35mm full frame is 24mm
    const fov = 2 * Math.atan(12 / focalLength) * (180 / Math.PI);
    targetFOV = THREE.MathUtils.clamp(fov, 5, 150);
    
    dispatchCinematicUpdate(active);
    console.log(`[CinematicCamera] Lens set to: ${focalLength}mm (FOV: ${targetFOV.toFixed(1)}°)`);
  }

  function update(deltaTime) {
    if (!active) return;
    shotTime += deltaTime;

    switch (mode) {
      case 'free':
      case 'targetLock':
        handleMovement(deltaTime);
        break;
      case 'orbit':
        handleOrbit(deltaTime);
        break;
      case 'flyBy':
        handleFlyBy(deltaTime);
        break;
      case 'chase':
        handleChase(deltaTime);
        break;
      case 'dollyZoom':
        handleDollyZoom(deltaTime);
        break;
      case 'sunOrbit':
        handleSunOrbit(deltaTime);
        break;
      case 'planetFocus':
        handlePlanetFocus(deltaTime);
        break;
    }

    // Safety: prevent camera from going inside the target body in any shot mode
    if (targetBody && (mode === 'orbit' || mode === 'sunOrbit' || mode === 'chase' || mode === 'flyBy' || mode === 'dollyZoom' || mode === 'planetFocus')) {
      const targetPos = targetBody.pivot.getWorldPosition(new THREE.Vector3());
      const toTarget = new THREE.Vector3().subVectors(camera.position, targetPos);
      const distToTarget = toTarget.length();
      const minSafeDist = targetBody.data.radius * 1.2;
      if (distToTarget < minSafeDist && distToTarget > 0.001) {
        toTarget.normalize().multiplyScalar(minSafeDist);
        camera.position.copy(targetPos).add(toTarget);
      }
    }

    applyTransform(deltaTime);
    
    // Smooth FOV transition — frame-rate independent
    const fovDiff = targetFOV - camera.fov;
    if (Math.abs(fovDiff) > 0.01) {
      camera.fov += fovDiff * Math.min(1, fovSmoothing * deltaTime);
      camera.updateProjectionMatrix();
    }

    // Update post-processing focus frequently during shots
    if (shotTime % 0.5 < 0.02) {
      dispatchCinematicUpdate(active);
    }
  }

  function handleMovement(deltaTime) {
    const inputVelocity = new THREE.Vector3();

    if (keys['KeyW']) inputVelocity.z -= 1;
    if (keys['KeyS']) inputVelocity.z += 1;
    if (keys['KeyA']) inputVelocity.x -= 1;
    if (keys['KeyD']) inputVelocity.x += 1;
    if (keys['KeyQ']) inputVelocity.y -= 1;
    if (keys['KeyE']) inputVelocity.y += 1;

    // Roll
    if (keys['KeyZ']) roll += deltaTime * 1.5;
    if (keys['KeyC']) roll -= deltaTime * 1.5;
    if (keys['KeyR']) roll *= 0.9; // Smooth reset

    inputVelocity.normalize();

    // Speed modifiers from keys
    let keyMultiplier = 1.0;
    if (keys['ShiftLeft'] || keys['ShiftRight']) keyMultiplier *= 5.0;
    if (keys['ControlLeft'] || keys['ControlRight']) keyMultiplier *= 0.2;

    // Scale speed by distance to origin (or target)
    const refPos = (mode === 'targetLock' && targetBody) 
      ? targetBody.pivot.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3(0, 0, 0);
    
    const dist = camera.position.distanceTo(refPos);
    const dynamicBaseSpeed = THREE.MathUtils.clamp(dist * 0.2, 5, 5000);
    
    const targetVelocity = inputVelocity
      .applyQuaternion(camera.quaternion)
      .multiplyScalar(dynamicBaseSpeed * speedMultiplier * keyMultiplier);

    // Frame-rate independent smooth movement
    const moveLerpFactor = Math.min(1, acceleration * deltaTime);
    velocity.lerp(targetVelocity, moveLerpFactor);
    camera.position.addScaledVector(velocity, deltaTime);
  }

  function handleOrbit(deltaTime) {
    if (!targetBody) return;
    const targetPos = targetBody.pivot.getWorldPosition(new THREE.Vector3());
    
    const orbitRadius = Math.max(shotParams.radius || 100, targetBody.data.radius * 2);
    // Clamp height to prevent extreme viewing angles
    const height = THREE.MathUtils.clamp(shotParams.height || 0, -orbitRadius * 0.6, orbitRadius * 0.6);
    // Dynamic speed: scale with distance so perceived visual speed is consistent
    const distRatio = orbitRadius / targetBody.data.radius;
    const speedScale = THREE.MathUtils.clamp(distRatio / 8, 0.3, 3.0);
    const effectiveSpeed = (shotParams.speed || 0.2) * speedScale;
    const angle = shotTime * effectiveSpeed + (shotParams.orbitAngleOffset || 0);
    const x = Math.cos(angle) * orbitRadius;
    const z = Math.sin(angle) * orbitRadius;
    
    let targetCamPos = targetPos.clone().add(new THREE.Vector3(x, height, z));
    // Shift orbit center toward the sun so camera stays on lit side
    if (shotParams.orbitCenterOffset) {
      targetCamPos.add(shotParams.orbitCenterOffset);
    }
    // Smooth blend for first second to avoid initial snap
    const blend = Math.min(1, shotTime * 3);
    camera.position.lerp(targetCamPos, blend);
  }

  function handleFlyBy(deltaTime) {
    if (!shotParams.curve) return;
    const rawT = THREE.MathUtils.clamp(shotTime / (shotParams.duration || 10), 0, 1);
    // Smoothstep easing for buttery smooth fly-by
    const t = rawT * rawT * (3 - 2 * rawT);
    const targetCamPos = shotParams.curve.getPoint(t);
    camera.position.copy(targetCamPos);
    
    if (rawT >= 1) {
      // Fallback to target lock when finished
      mode = 'targetLock';
      shotTime = 0;
    }
  }

  function handleChase(deltaTime) {
    if (!targetBody) return;
    const targetPos = targetBody.pivot.getWorldPosition(new THREE.Vector3());
    const fallbackOffset = new THREE.Vector3(0, targetBody.data.radius * 1.5, Math.max(targetBody.data.radius * 5, 0.5));
    const offset = shotParams.offset || fallbackOffset;
    let targetCamPos = targetPos.clone().add(offset.clone().applyQuaternion(targetBody.pivot.quaternion));
    // Safety: ensure minimum distance from planet center
    const toTarget = new THREE.Vector3().subVectors(targetCamPos, targetPos);
    const dist = toTarget.length();
    const minDist = targetBody.data.radius * 1.5;
    if (dist < minDist && dist > 0.001) {
      toTarget.normalize().multiplyScalar(minDist);
      targetCamPos.copy(targetPos).add(toTarget);
    }
    // Smooth follow with slight lag for natural feel
    camera.position.lerp(targetCamPos, 1 - Math.exp(-8 * deltaTime));
  }

  function handleDollyZoom(deltaTime) {
    if (!targetBody) return;
    const targetPos = targetBody.pivot.getWorldPosition(new THREE.Vector3());
    const rawProgress = THREE.MathUtils.clamp(shotTime / (shotParams.duration || 10), 0, 1);
    // Smoothstep for buttery dolly zoom transition
    const progress = rawProgress * rawProgress * (3 - 2 * rawProgress);
    
    // Dolly Zoom: Zoom in while pulling back, keeping the subject the same size on screen
    const startFov = THREE.MathUtils.clamp(shotParams.startFov || 135, 5, 150);
    const endFov = THREE.MathUtils.clamp(shotParams.endFov || 24, 5, 150);
    const currentFrameFov = THREE.MathUtils.lerp(startFov, endFov, progress);
    targetFOV = currentFrameFov;
    
    // Base scale calculation for constant subject size
    const startDist = Math.max(shotParams.startDist || targetBody.data.radius * 3, targetBody.data.radius * 2);
    const ratio = startDist * Math.tan(THREE.MathUtils.degToRad(startFov / 2));
    const currentDist = ratio / Math.tan(THREE.MathUtils.degToRad(currentFrameFov / 2));
    // Safety: ensure camera never gets too close to the planet
    const safeDist = Math.max(currentDist, targetBody.data.radius * 1.5);
    
    // Use stored initial direction for consistent movement
    const dir = shotParams.startDir || new THREE.Vector3(0, 0, 1);
    const targetCamPos = targetPos.clone().add(dir.clone().multiplyScalar(safeDist));
    camera.position.copy(targetCamPos);
    
    if (rawProgress >= 1) {
      mode = 'targetLock';
      shotTime = 0;
    }
  }

  function handleSunOrbit(deltaTime) {
    if (!targetBody) return;
    const targetPos = targetBody.pivot.getWorldPosition(new THREE.Vector3());
    const sunPos = new THREE.Vector3(0, 0, 0);
    const sunDir = new THREE.Vector3().subVectors(sunPos, targetPos);

    // Fix: khi target là Mặt Trời (tại gốc), sunDir = vector 0 → dùng fallback
    if (sunDir.lengthSq() < 0.001) {
      sunDir.set(0, 0, 1);
    } else {
      sunDir.normalize();
    }

    const minRadius = targetBody.data.radius * 3;
    const baseRadius = Math.max(shotParams.radius || targetBody.data.radius * 5, minRadius);

    // ── Tốc độ quay nhất quán cho mọi hành tinh ──
    // Dùng orbit period (giây/vòng) thay vì angular speed random
    // Mặc định 45s/vòng, có thể ghi đè qua shotParams
    const orbitPeriod = shotParams.orbitPeriod || 45;
    // Tốc độ góc cho phi rotation (quay quanh hành tinh dọc theo mặt sáng)
    const angularSpeed = (2 * Math.PI) / orbitPeriod;

    // Spherical cap on the lit hemisphere — oscillate theta, rotate phi
    // Các tần số dao động đều dựa trên angularSpeed để nhất quán
    const thetaBase = Math.PI * 0.3;
    const thetaOsc = 0.25;
    const thetaFreq = shotParams.thetaFreq || 2.0;
    const theta = thetaBase + Math.sin(shotTime * angularSpeed * thetaFreq) * thetaOsc;
    const phi = shotTime * angularSpeed;

    // Build local coordinate system aligned with sun direction
    const ref = Math.abs(sunDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3().crossVectors(sunDir, ref).normalize();
    const up = new THREE.Vector3().crossVectors(right, sunDir).normalize();

    // Gentle distance oscillation + height variation (clamped to safe minimum)
    const distFreq = shotParams.distFreq || 1.5;
    const distOsc = Math.sin(shotTime * angularSpeed * distFreq) * baseRadius * 0.08;
    const dist = Math.max(baseRadius + distOsc, targetBody.data.radius * 2);
    const heightFreq = shotParams.heightFreq || 1.0;
    const baseHeightOsc = Math.sin(shotTime * angularSpeed * heightFreq) * baseRadius * 0.15;
    const extraVertOsc = (shotParams.vertOscAmplitude || 0) * Math.sin(shotTime * angularSpeed * 0.5);
    const heightOffset = baseHeightOsc + extraVertOsc;

    const camPos = targetPos.clone()
      .addScaledVector(sunDir, Math.cos(theta) * dist)
      .addScaledVector(right, Math.sin(theta) * Math.cos(phi) * dist)
      .addScaledVector(up, Math.sin(theta) * Math.sin(phi) * dist + heightOffset);

    // Smooth blend for first second
    const blend = Math.min(1, shotTime * 3);
    camera.position.lerp(camPos, blend);
  }

  function handlePlanetFocus(deltaTime) {
    if (!targetBody) return;
    const targetPos = targetBody.pivot.getWorldPosition(new THREE.Vector3());

    // Safe distance: tối thiểu 2.5× bán kính để tránh xuyên hành tinh
    const radius = Math.max(shotParams.radius || targetBody.data.radius * 4, targetBody.data.radius * 2.5);
    // Inclination cố định ~25-35° cho góc nhìn 3/4 đẹp nhất
    const inclination = THREE.MathUtils.degToRad(shotParams.inclination || 30);
    // Tốc độ góc (rad/s) — có thể điều chỉnh qua UI
    const speed = shotParams.speed || 0.12;

    const angle = shotTime * speed;

    // Orbit trong mặt phẳng nghiêng — tạo góc 3/4 view hoàn hảo
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(inclination) * Math.sin(angle);
    const z = radius * Math.cos(inclination) * Math.sin(angle);

    const camPos = targetPos.clone().add(new THREE.Vector3(x, y, z));

    // Smooth blend for first second
    const blend = Math.min(1, shotTime * 3);
    camera.position.lerp(camPos, blend);
  }

  function setShotSpeed(speedValue) {
    shotParams.speed = THREE.MathUtils.clamp(speedValue, 0.01, 2.0);
  }

  function adjustShotSpeed(factor) {
    const current = shotParams.speed || 0.12;
    shotParams.speed = THREE.MathUtils.clamp(current * factor, 0.01, 2.0);
  }

  function applyTransform(deltaTime) {
    if ((mode === 'targetLock' || mode === 'orbit' || mode === 'flyBy' || mode === 'chase' || mode === 'dollyZoom' || mode === 'sunOrbit' || mode === 'planetFocus') && targetBody) {
      // Look at target body
      const targetPos = targetBody.pivot.getWorldPosition(new THREE.Vector3());
      
      // Rule of Thirds / Framing Offset (Off-center composition)
      if (shotParams.framingOffset) {
         const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
         const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
         targetPos.add(right.multiplyScalar(shotParams.framingOffset.x * targetBody.data.radius));
         targetPos.add(up.multiplyScalar(shotParams.framingOffset.y * targetBody.data.radius));
      }
      
      const m1 = new THREE.Matrix4();
      m1.lookAt(camera.position, targetPos, new THREE.Vector3(0, 1, 0));
      const targetQuat = new THREE.Quaternion().setFromRotationMatrix(m1);
      
      // Combine manual roll and Dutch Angle (clamped to prevent disorientation)
      const currentRoll = THREE.MathUtils.clamp(roll + (shotParams.dutchAngle || 0), -Math.PI / 6, Math.PI / 6);
      
      // Handheld camera micro-shake — very subtle to avoid nausea
      if (shotParams.handheld) {
         const time = shotTime;
         const shakeX = Math.sin(time * 1.5) * 0.0006 + Math.sin(time * 3.1) * 0.0003;
         const shakeY = Math.cos(time * 1.3) * 0.0006 + Math.sin(time * 2.7) * 0.0003;
         const shakeZ = Math.sin(time * 0.8) * 0.001;
         
         const shakeQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(shakeX, shakeY, shakeZ));
         targetQuat.multiply(shakeQuat);
      }
      
      if (currentRoll !== 0) {
        const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), currentRoll);
        targetQuat.multiply(rollQuat);
      }
      
      // Frame-rate independent look-at smoothing
      const lookLerpFactor = Math.min(1, lookAtSmoothing * deltaTime);
      camera.quaternion.slerp(targetQuat, lookLerpFactor);
      
      rotation.setFromQuaternion(camera.quaternion);
      yaw = rotation.y;
      pitch = rotation.x;
    } else {
      // Smooth rotation for free mode — frame-rate independent
      const rotLerpFactor = Math.min(1, rotationSmoothing * deltaTime);
      const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
      camera.quaternion.slerp(targetQuat, rotLerpFactor);
    }
  }

  return {
    enable,
    disable,
    setTarget: (body) => { targetBody = body; },
    setShotPreset,
    setLens,
    update,
    isActive: () => active,
    getMode: () => mode,
    setMode: (m) => { mode = m; },
    setShotSpeed,
    adjustShotSpeed,
    getShotSpeed: () => shotParams.speed || 0.12,
    getRadius: () => shotParams.radius || (targetBody ? targetBody.data.radius * 4 : 100)
  };
}
