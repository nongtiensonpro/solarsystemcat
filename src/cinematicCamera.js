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
  const onMouseMove = (e) => {
    if (active && isRightMouseDown && (mode === 'free' || mode === 'orbit')) {
      yaw -= e.movementX * mouseSensitivity;
      pitch -= e.movementY * mouseSensitivity;
      pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
      
      if (mode === 'orbit') {
        shotParams.orbitAngleOffset = (shotParams.orbitAngleOffset || 0) - e.movementX * mouseSensitivity;
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
      
      // Create a curve passing near the planet
      const p1 = targetPos.clone().add(new THREE.Vector3(-radius * 5, radius * 2, radius * 3));
      const p2 = targetPos.clone().add(new THREE.Vector3(0, radius, radius * 2));
      const p3 = targetPos.clone().add(new THREE.Vector3(radius * 5, radius * 0.5, -radius * 3));
      
      shotParams.curve = new THREE.CatmullRomCurve3([p1, p2, p3]);
      shotParams.duration = params.duration || 10;
    }

    dispatchCinematicUpdate(active);
    console.log(`[CinematicCamera] Shot Preset: ${presetName}`);
  }

  function setLens(focalLength) {
    currentFocalLength = focalLength;
    // FOV_v = 2 * Math.atan( (sensor_height / 2) / focalLength )
    // sensor_height for 35mm full frame is 24mm
    const fov = 2 * Math.atan(12 / focalLength) * (180 / Math.PI);
    targetFOV = fov;
    
    dispatchCinematicUpdate(active);
    console.log(`[CinematicCamera] Lens set to: ${focalLength}mm (FOV: ${fov.toFixed(1)}°)`);
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
    }

    applyTransform(deltaTime);
    
    // Smooth FOV
    if (Math.abs(camera.fov - targetFOV) > 0.01) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFOV, 1 - Math.exp(-fovSmoothing * deltaTime));
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

    // Smooth movement
    velocity.lerp(targetVelocity, 1 - Math.exp(-acceleration * deltaTime));
    camera.position.addScaledVector(velocity, deltaTime);
  }

  function handleOrbit(deltaTime) {
    if (!targetBody) return;
    const targetPos = targetBody.pivot.getWorldPosition(new THREE.Vector3());
    
    const angle = shotTime * (shotParams.speed || 0.2) + (shotParams.orbitAngleOffset || 0);
    const x = Math.cos(angle) * (shotParams.radius || 100);
    const z = Math.sin(angle) * (shotParams.radius || 100);
    
    const targetCamPos = targetPos.clone().add(new THREE.Vector3(x, shotParams.height || 0, z));
    camera.position.lerp(targetCamPos, 1 - Math.exp(-acceleration * deltaTime));
  }

  function handleFlyBy(deltaTime) {
    if (!shotParams.curve) return;
    const t = THREE.MathUtils.clamp(shotTime / (shotParams.duration || 10), 0, 1);
    const targetCamPos = shotParams.curve.getPoint(t);
    camera.position.lerp(targetCamPos, 1 - Math.exp(-acceleration * deltaTime));
    
    if (t >= 1) {
      // Fallback to target lock when finished
      mode = 'targetLock';
    }
  }

  function handleChase(deltaTime) {
    if (!targetBody) return;
    const targetPos = targetBody.pivot.getWorldPosition(new THREE.Vector3());
    const fallbackOffset = new THREE.Vector3(0, targetBody.data.radius * 1.5, Math.max(targetBody.data.radius * 5, 0.5));
    const offset = shotParams.offset || fallbackOffset;
    const targetCamPos = targetPos.clone().add(offset.clone().applyQuaternion(targetBody.pivot.quaternion));
    camera.position.lerp(targetCamPos, 1 - Math.exp(-acceleration * deltaTime));
  }

  function handleDollyZoom(deltaTime) {
    if (!targetBody) return;
    const targetPos = targetBody.pivot.getWorldPosition(new THREE.Vector3());
    const progress = THREE.MathUtils.clamp(shotTime / (shotParams.duration || 10), 0, 1);
    
    // Dolly Zoom: Zoom in while pulling back, keeping the subject the same size on screen
    const currentFrameFov = THREE.MathUtils.lerp(shotParams.startFov || 135, shotParams.endFov || 24, progress);
    targetFOV = currentFrameFov;
    
    // Base scale calculation for constant subject size
    const startDist = shotParams.startDist || targetBody.data.radius * 3;
    const ratio = startDist * Math.tan(THREE.MathUtils.degToRad((shotParams.startFov || 135) / 2));
    const currentDist = ratio / Math.tan(THREE.MathUtils.degToRad(currentFrameFov / 2));
    
    const dir = new THREE.Vector3().subVectors(camera.position, targetPos).normalize();
    // Prevent division by zero or weird angles
    if (dir.lengthSq() < 0.1) dir.set(0, 0, 1);
    
    const targetCamPos = targetPos.clone().add(dir.multiplyScalar(currentDist));
    camera.position.lerp(targetCamPos, 1 - Math.exp(-acceleration * deltaTime));
    
    if (progress >= 1) mode = 'targetLock';
  }

  function applyTransform(deltaTime) {
    if ((mode === 'targetLock' || mode === 'orbit' || mode === 'flyBy' || mode === 'chase' || mode === 'dollyZoom') && targetBody) {
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
      
      // Combine manual roll and Dutch Angle
      const currentRoll = roll + (shotParams.dutchAngle || 0);
      
      // Handheld / Zero-G floating camera shake
      if (shotParams.handheld) {
         // Subtle perlin-like noise using sine waves
         const time = shotTime;
         const shakeX = Math.sin(time * 1.5) * 0.002 + Math.sin(time * 3.1) * 0.001;
         const shakeY = Math.cos(time * 1.3) * 0.002 + Math.sin(time * 2.7) * 0.001;
         const shakeZ = Math.sin(time * 0.8) * 0.005;
         
         const shakeQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(shakeX, shakeY, shakeZ));
         targetQuat.multiply(shakeQuat);
      }
      
      if (currentRoll !== 0) {
        const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), currentRoll);
        targetQuat.multiply(rollQuat);
      }
      
      camera.quaternion.slerp(targetQuat, 1 - Math.exp(-lookAtSmoothing * deltaTime));
      
      rotation.setFromQuaternion(camera.quaternion);
      yaw = rotation.y;
      pitch = rotation.x;
    } else {
      // Smooth rotation for free mode
      const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
      camera.quaternion.slerp(targetQuat, 1 - Math.exp(-rotationSmoothing * deltaTime));
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
    setMode: (m) => { mode = m; }
  };
}
