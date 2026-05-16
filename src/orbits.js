// Tạo đường quỹ đạo elip cho các thiên thể (hành tinh + vệ tinh)
import * as THREE from 'three';
import { AU } from './constants.js';

/**
 * Tạo đường cong quỹ đạo elip 3D
 * Hỗ trợ cả hành tinh (quanh Sun) và vệ tinh (quanh parent planet).
 * Vệ tinh dùng orbitScale để phóng to quỹ đạo cho dễ nhìn.
 *
 * @param {Object} data - Dữ liệu thiên thể (đã normalize)
 * @returns {THREE.Line|null}
 */
export function createOrbitLine(data) {
  const orbitScale = data.orbitScale || 1;
  const a = data.displayOrbitRadius ?? (data.semiMajorAxis * AU * orbitScale);

  if (a <= 0) return null;
  const e = data.eccentricity;
  const b = a * Math.sqrt(1 - e * e);  // Bán trục nhỏ
  const incRad = (data.inclination || 0) * Math.PI / 180;

  // Tạo các điểm trên elip
  const segments = data.isMoon ? 128 : 256; // Ít segment hơn cho moons
  const points = [];

  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const xLocal = a * Math.cos(theta) - a * e; // Offset tiêu điểm
    const zLocal = b * Math.sin(theta);

    // Áp dụng inclination
    const x = xLocal;
    const y = zLocal * Math.sin(incRad);
    const z = zLocal * Math.cos(incRad);

    points.push(new THREE.Vector3(x, y, z));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);

  // Vệ tinh dùng màu khác, mờ hơn
  const color = data.isMoon ? 0x445566 : 0x334466;
  const opacity = data.isMoon ? 0.25 : 0.3;

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
