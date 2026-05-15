// Tạo đường quỹ đạo elip cho các hành tinh
import * as THREE from 'three';
import { AU } from './constants.js';

/**
 * Tạo đường cong quỹ đạo elip 3D
 * @param {Object} data - Dữ liệu hành tinh
 * @returns {THREE.Line}
 */
export function createOrbitLine(data) {
  if (data.semiMajorAxis <= 0) return null;

  const a = data.semiMajorAxis * AU; // Bán trục lớn
  const e = data.eccentricity;
  const b = a * Math.sqrt(1 - e * e);  // Bán trục nhỏ
  const incRad = (data.inclination || 0) * Math.PI / 180;

  // Tạo các điểm trên elip
  const segments = 256;
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
  const material = new THREE.LineBasicMaterial({
    color: 0x334466,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });

  const line = new THREE.Line(geometry, material);
  line.name = `${data.id}_orbit`;
  line.visible = false; // Mặc định ẩn, bật bằng toggle

  return line;
}
