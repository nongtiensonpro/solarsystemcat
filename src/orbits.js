// T?o ???ng qu? ??o elip cho c?c thi?n th? (h?nh tinh + v? tinh)
import * as THREE from 'three';
import { AU } from './constants.js';
import { solveKepler } from './kepler.js';
import { getCurrentPreset } from './renderConfig.js';

/**
* Xác ??nh s? segment d?a trên ?? l?ch tâm (eccentricity) và preset ch?t l??ng.
* Qu? ??o càng méo càng c?n nhi?u ?i?m ?? gi? ?? chính xác th? giác.
*/
export function getSegmentCount(eccentricity, isMoon, qualityMultiplier = 1) {
  const base = isMoon ? 128 : 256;
  const e = Math.abs(eccentricity) || 0;
  let factor;
  if (e < 0.02) factor = 0.5;
  else if (e < 0.1) factor = 1.0;
  else if (e < 0.5) factor = 2.0;
  else if (e < 0.9) factor = 4.0;
  else factor = 8.0;
  const maxSeg = isMoon ? 1024 : 2048;
  return Math.min(maxSeg, Math.round(base * factor * qualityMultiplier));
}

/**
* T?o ???ng cong qu? ??o elip 3D v?i sampling theo Mean Anomaly
* (thay vì theta ??u) ?? t? phân b? nhi?u ?i?m ? vùng c?n ?i?m (periapsis)
* n?i ?? cong l?n nh?t, t?ng ?? chính xác cho qu? ??o l?ch tâm cao.
*
* H? tr? adaptive segments, CatmullRom n?i suy, và quality preset.
*
* @param {Object} data - D? li?u thi?n th? (?? normalize)
* @returns {THREE.Line|null}
*/
export function createOrbitLine(data) {
  const orbitScale = data.orbitScale || 1;
  const a = data.displayOrbitRadius ?? (data.semiMajorAxis * AU * orbitScale);

  if (a <= 0) return null;
  const e = data.eccentricity || 0;
  const incRad = (data.inclination || 0) * Math.PI / 180;

  // L?y c?u hình t? quality preset
  const preset = getCurrentPreset();
  const qualityMultiplier = preset.orbitQuality ?? 1;
  const useCatmullRom = preset.orbitCatmullRom ?? true;

  // Adaptive segment count theo ?? l?ch tâm
  let segments = getSegmentCount(e, data.isMoon, qualityMultiplier);

  // Multi-revolution cho qu? ??o ?? l?ch tâm cao (Halley e=0.967)
  // Hi?n th? 3 vòng ?? th?y hình d?ng qu? ??o dài
  const revolutions = (e >= 0.9 && !data.isMoon) ? 3 : 1;

  const rawPoints = [];

  // Sampling theo Mean Anomaly (M) — t? nhiên t?p trung ?i?m ? c?n ?i?m
  const totalSegs = segments * revolutions;
  for (let i = 0; i <= totalSegs; i++) {
    const M = (i / totalSegs) * Math.PI * 2 * revolutions;
    const E = solveKepler(M, e);
    const xLocal = a * (Math.cos(E) - e);
    const zLocal = a * Math.sqrt(1 - e * e) * Math.sin(E);

    const x = xLocal;
    const y = zLocal * Math.sin(incRad);
    const z = zLocal * Math.cos(incRad);

    rawPoints.push(new THREE.Vector3(x, y, z));
  }

  // CatmullRom n?i suy ?? ???ng cong m??t h?n, gi?m hi?n t??ng "g?p khúc"
  let finalPoints = rawPoints;
  if (useCatmullRom) {
    const curve = new THREE.CatmullRomCurve3(rawPoints, revolutions > 1);
    finalPoints = curve.getPoints(totalSegs * 2);
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(finalPoints);

  // V? tinh d?ng m?u khác, m? h?n
  const color = data.isMoon ? 0x445566 : 0x334466;
  let opacity = data.isMoon ? 0.25 : 0.3;

  // Phase 4: Shader "m? d?n" cho 9 H0 Hero Moons
  if (data.saturnMoon?.lodTier === 'hero') {
    const heroMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x6ec6ff) },
        uOpacity: { value: 0.4 },
        uTime: { value: 0 }
      },
      vertexShader: `
        varying float vIndex;
        attribute float index;
        void main() {
          vIndex = index;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uTime;
        varying float vIndex;
        void main() {
          float dash = step(0.5, sin(vIndex * 0.1 - uTime * 2.0) * 0.5 + 0.5);
          float alpha = uOpacity * dash * (0.5 + 0.5 * sin(vIndex * 0.05));
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const indices = new Float32Array(finalPoints.length);
    for (let i = 0; i < finalPoints.length; i++) indices[i] = i;
    geometry.setAttribute('index', new THREE.BufferAttribute(indices, 1));

    const line = new THREE.Line(geometry, heroMaterial);
    line.name = `${data.id}_orbit`;
    line.visible = false;
    return line;
  }

  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });

  const line = new THREE.Line(geometry, material);
  line.name = `${data.id}_orbit`;
  line.visible = false;

  return line;
}

// ── N-body Orbit Line Management ──

/**
* Màu s?c cho ???ng qu? ??o N-body (sáng h?n ?? phân bi?t v?i Kepler t?nh).
*/
const NBODY_ORBIT_COLOR = 0x44cc88;
const NBODY_ORBIT_OPACITY = 0.45;

/**
* T?o ???ng qu? ??o cho ch? ?? N-body gravity.
* Dùng màu khác bi?t ?? phân bi?t v?i ???ng Kepler t?nh.
*
* @param {Object} data - D? li?u thi?n th?
* @param {number} numPoints - S? ?i?m d? ?oán
* @returns {THREE.Line}
*/
export function createNbodyOrbitLine(data, numPoints = 256) {
  const dummyPoints = [];
  for (let i = 0; i < numPoints; i++) {
    dummyPoints.push(new THREE.Vector3(0, 0, 0));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(dummyPoints);

  // Hero moon: dùng shader dashed animated ?? gi? nh?t quán v?i Kepler mode
  if (data.saturnMoon?.lodTier === 'hero') {
    const heroMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x6ec6ff) },
        uOpacity: { value: 0.4 },
        uTime: { value: 0 }
      },
      vertexShader: `
        varying float vIndex;
        attribute float index;
        void main() {
          vIndex = index;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uTime;
        varying float vIndex;
        void main() {
          float dash = step(0.5, sin(vIndex * 0.1 - uTime * 2.0) * 0.5 + 0.5);
          float alpha = uOpacity * dash * (0.5 + 0.5 * sin(vIndex * 0.05));
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const indices = new Float32Array(dummyPoints.length);
    for (let i = 0; i < dummyPoints.length; i++) indices[i] = i;
    geometry.setAttribute('index', new THREE.BufferAttribute(indices, 1));

    const line = new THREE.Line(geometry, heroMaterial);
    line.name = `${data.id}_nbody_orbit`;
    line.visible = false;
    line.userData.isNbodyOrbit = true;
    line.userData.isHeroNbodyOrbit = true;
    return line;
  }

  const material = new THREE.LineBasicMaterial({
    color: NBODY_ORBIT_COLOR,
    transparent: true,
    opacity: NBODY_ORBIT_OPACITY,
    depthWrite: false,
    vertexColors: true,
  });

  const line = new THREE.Line(geometry, material);
  line.name = `${data.id}_nbody_orbit`;
  line.visible = false;
  line.userData.isNbodyOrbit = true;
  return line;
}

/**
* C?p nh?t geometry c?a ???ng qu? ??o v?i m?ng ?i?m m?i t? d? ?oán N-body.
* Dispose geometry c? ?? tránh rò r? b? nh?.
*
* @param {THREE.Line} line - ???ng qu? ??o c?n c?p nh?t
* @param {Array<THREE.Vector3>} points - M?ng ?i?m m?i
*/
export function updateOrbitLineGeometry(line, points) {
  if (!line || points.length < 2) return;
  const newGeometry = new THREE.BufferGeometry().setFromPoints(points);
  if (line.geometry) {
    line.geometry.dispose();
  }
  // Thêm vertex colors cho N-body lines: opacity gi?m d?n (gradient ?? tin c?y)
  if (line.userData.isNbodyOrbit && !line.userData.isHeroNbodyOrbit) {
    const colors = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      const t = i / (points.length - 1);
      const alpha = 1.0 - t * 0.65; // 1.0 ? 0.35 (??u sáng, cu?i m?)
      colors[i * 3] = alpha;
      colors[i * 3 + 1] = alpha;
      colors[i * 3 + 2] = alpha;
    }
    newGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  // Gi? l?i index attribute cho hero moon shader (c?n cho hi?u ?ng dashed)
  if (line.userData.isHeroNbodyOrbit) {
    const indices = new Float32Array(points.length);
    for (let i = 0; i < points.length; i++) indices[i] = i;
    newGeometry.setAttribute('index', new THREE.BufferAttribute(indices, 1));
  }
  line.geometry = newGeometry;
}
