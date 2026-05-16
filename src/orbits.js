// T?o ???ng qu? ??o elip cho c?c thi?n th? (h?nh tinh + v? tinh)
import * as THREE from 'three';
import { AU } from './constants.js';

/**
 * T?o ???ng cong qu? ??o elip 3D
 * H? tr? c? h?nh tinh (quanh Sun) v? v? tinh (quanh parent planet).
 * V? tinh d?ng orbitScale ?? ph?ng to qu? ??o cho d? nh?n.
 *
 * @param {Object} data - D? li?u thi?n th? (?? normalize)
 * @returns {THREE.Line|null}
 */
export function createOrbitLine(data) {
  const orbitScale = data.orbitScale || 1;
  const a = data.displayOrbitRadius ?? (data.semiMajorAxis * AU * orbitScale);

  if (a <= 0) return null;
  const e = data.eccentricity;
  const b = a * Math.sqrt(1 - e * e);  // B?n tr?c nh?
  const incRad = (data.inclination || 0) * Math.PI / 180;

  // T?o c?c ?i?m tr?n elip
  const segments = data.isMoon ? 128 : 256; // ?t segment h?n cho moons
  const points = [];

  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const xLocal = a * Math.cos(theta) - a * e; // Offset ti?u ?i?m
    const zLocal = b * Math.sin(theta);

    // ?p d?ng inclination
    const x = xLocal;
    const y = zLocal * Math.sin(incRad);
    const z = zLocal * Math.cos(incRad);

    points.push(new THREE.Vector3(x, y, z));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);

  // V? tinh d?ng m?u kh?c, m? h?n
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
          // Tạo hiệu ứng mờ dần (dotted/dashed) và chuyển động
          float dash = step(0.5, sin(vIndex * 0.1 - uTime * 2.0) * 0.5 + 0.5);
          float alpha = uOpacity * dash * (0.5 + 0.5 * sin(vIndex * 0.05));
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    // Cần thêm attribute 'index' cho shader
    const indices = new Float32Array(points.length);
    for (let i = 0; i < points.length; i++) indices[i] = i;
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
  line.visible = false; // Mặc định ẩn, bật bằng toggle

  return line;
}
