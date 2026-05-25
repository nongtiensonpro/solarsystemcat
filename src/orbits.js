// T?o ???ng qu? ??o elip cho c?c thi?n th? (h?nh tinh + v? tinh)
import * as THREE from 'three';
import { sampleOrbitPath } from './kepler.js';
import { getCurrentPreset } from './renderConfig.js';
import { getDisplayOrbitRadius } from './orbitMath.js';
import { sampleCometOrbitPath, sampleCometOrbitDistances } from './cometOrbit.js';

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
  const a = getDisplayOrbitRadius(data);

  if (a <= 0) return null;
  const e = data.eccentricity || 0;

  // L?y c?u hình t? quality preset
  const preset = getCurrentPreset();
  const qualityMultiplier = preset.orbitQuality ?? 1;
  const useCatmullRom = preset.orbitCatmullRom ?? true;

  // Adaptive segment count theo ?? l?ch tâm
  let segments = getSegmentCount(e, data.isMoon, qualityMultiplier);

  // Multi-revolution cho qu? ??o ?? l?ch tâm cao (Halley e=0.967)
  // Hi?n th? 3 vòng ?? th?y hình d?ng qu? ??o dài
  // V?i e > 0.98 (Hale-Bopp, NEOWISE) ch? dùng 1 vòng ?? tránh nhi?u CatmullRom
  const revolutions = (e >= 0.9 && !data.isMoon) ? (e > 0.98 ? 1 : 3) : 1;

  const effectiveSegs = e > 0.95 ? Math.max(segments, 512) : segments;
  const totalSegs = effectiveSegs * revolutions;

  // Ma trận quay 3D đầy đủ từ kepler cache (Ω, ω, i) — tránh solveKepler + trig lặp
  const pathBuffer = sampleOrbitPath(data, totalSegs, false, null, revolutions);
  const rawPoints = [];
  for (let i = 0; i <= totalSegs; i++) {
    const base = i * 3;
    rawPoints.push(new THREE.Vector3(
      pathBuffer[base],
      pathBuffer[base + 1],
      pathBuffer[base + 2]
    ));
  }

  // CatmullRom n?i suy ?? ???ng cong m??t h?n, gi?m hi?n t??ng "g?p khúc"
  // V?i e > 0.98, b? qua CatmullRom vì qu? ??o quá d?t g?y nhi?u n?i suy
  let finalPoints = rawPoints;
  if (useCatmullRom && e <= 0.98) {
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

// ── Comet Orbit Line — Hệ thống quỹ đạo chuyên biệt cho sao chổi ──

/**
 * Tạo đường quỹ đạo sao chổi với:
 * - Full rotation matrix (i, Ω, ω) đồng bộ với cometOrbit.js
 * - True Anomaly sampling — phân bố đều trên đường cong thực
 * - Gradient shader: sáng ở perihelion, mờ ở aphelion
 * - Không dùng CatmullRom (tránh artifact cho e cao)
 *
 * @param {Object} data - Dữ liệu sao chổi (đã normalize)
 * @param {number} auScale - Hệ số AU (constants.AU)
 * @returns {THREE.Line|null}
 */
export function createCometOrbitLine(data, auScale = 400) {
  const a = getDisplayOrbitRadius(data);
  if (a <= 0) return null;

  const e = data.eccentricity || 0;

  // Số điểm sampling: nhiều hơn cho e cao
  const samples = e > 0.95 ? 512 : (e > 0.8 ? 384 : 256);

  // Lấy mẫu đường quỹ đạo từ cometOrbit.js (đã bao gồm full rotation matrix)
  const pathBuffer = sampleCometOrbitPath(data, samples);
  const distBuffer = sampleCometOrbitDistances(data, samples);

  // Tạo geometry từ sampled points
  const positions = new Float32Array(samples * 3);
  const colors = new Float32Array(samples * 3);

  // Tìm perihelion distance để normalize gradient
  let minDist = Infinity;
  let maxDist = 0;
  for (let i = 0; i < samples; i++) {
    const d = distBuffer[i];
    if (d < minDist) minDist = d;
    if (d > maxDist) maxDist = d;
  }
  const distRange = maxDist - minDist || 1;

  // Comet orbit color palette
  const periColor = new THREE.Color(0x66ccff);  // Xanh sáng ở perihelion
  const apoColor = new THREE.Color(0x1a2a3a);   // Tối ở aphelion
  const activeColor = new THREE.Color(0x44aaff); // Vùng hoạt động (< 5 AU)

  for (let i = 0; i < samples; i++) {
    const base = i * 3;
    positions[base]     = pathBuffer[base];
    positions[base + 1] = pathBuffer[base + 1];
    positions[base + 2] = pathBuffer[base + 2];

    // Gradient: t = 0 (perihelion) → 1 (aphelion)
    const t = (distBuffer[i] - minDist) / distRange;
    const distAU = distBuffer[i] / auScale;

    // Sáng hơn nếu nằm trong vùng hoạt động sao chổi (< 5 AU)
    if (distAU < 5) {
      const activeFactor = 1 - (distAU / 5);
      const blended = periColor.clone().lerp(activeColor, activeFactor * 0.5);
      colors[base]     = blended.r;
      colors[base + 1] = blended.g;
      colors[base + 2] = blended.b;
    } else {
      const blended = periColor.clone().lerp(apoColor, Math.min(t, 1));
      colors[base]     = blended.r;
      colors[base + 1] = blended.g;
      colors[base + 2] = blended.b;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const line = new THREE.Line(geometry, material);
  line.name = `${data.id}_comet_orbit`;
  line.userData.isCometOrbit = true;
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
