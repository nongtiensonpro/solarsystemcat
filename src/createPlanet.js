// Factory function tạo thiên thể với hệ phân cấp Pivot → Tilt → Mesh
import * as THREE from 'three';
import { AU } from './constants.js';
import { createAtmosphere } from './atmosphere.js';
import { createRings } from './rings.js';

// Màu fallback khi chưa có texture
const FALLBACK_COLORS = {
  sun:     0xFFDD33,
  mercury: 0x8C7E6D,
  venus:   0xE8CDA0,
  earth:   0x2266AA,
  mars:    0xC1440E,
  jupiter: 0xC8A77A,
  saturn:  0xD4BE8D,
  uranus:  0x7EC8C8,
  neptune: 0x3355AA,
  pluto:   0xC2B5A0,
};

/**
 * Tạo một thiên thể hoàn chỉnh với hệ phân cấp:
 *   Pivot (Object3D) — vị trí quỹ đạo
 *     └─ TiltGroup (Group) — nghiêng trục
 *          ├─ Mesh (SphereGeometry) — bề mặt hành tinh, tự quay trên Y
 *          └─ (sau này: CloudShell, AtmosphereShell, Rings...)
 *
 * @param {Object} data - Dữ liệu hành tinh từ planetData.js
 * @returns {{ pivot, tiltGroup, mesh, data }}
 */
export function createPlanet(data) {
  // 1. Geometry — quả cầu chuẩn hóa
  const segments = data.radius > 5 ? 64 : 32;
  const geometry = new THREE.SphereGeometry(1, segments, segments);

  // 2. Material — phân biệt Mặt Trời vs hành tinh
  let material;
  if (data.type === 'star') {
    // Mặt Trời: MeshBasicMaterial tự phát sáng, không phản ứng lighting
    material = new THREE.MeshBasicMaterial({
      color: FALLBACK_COLORS[data.id] || 0xffffff,
    });
  } else {
    // Hành tinh: MeshStandardMaterial hỗ trợ PBR
    material = new THREE.MeshStandardMaterial({
      color: FALLBACK_COLORS[data.id] || 0xaaaaaa,
      roughness: 0.8,
      metalness: 0.1,
    });
  }

  // 3. Mesh
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = data.id;

  // Áp dụng kích thước (radius) và độ dẹt (oblateness)
  const r = data.radius;
  const ob = data.oblateness || 0;
  mesh.scale.set(r, r * (1 - ob), r);

  // 4. TiltGroup — xoay theo độ nghiêng trục (axialTilt)
  const tiltGroup = new THREE.Group();
  tiltGroup.name = `${data.id}_tilt`;
  tiltGroup.rotation.z = THREE.MathUtils.degToRad(data.axialTilt || 0);
  tiltGroup.add(mesh);

  // 4b. Khí quyển Fresnel (nếu hành tinh có atmosphere config)
  let atmosphereMesh = null;
  if (data.atmosphere) {
    atmosphereMesh = createAtmosphere(data.radius, data.atmosphere);
    atmosphereMesh.name = `${data.id}_atmosphere`;
    tiltGroup.add(atmosphereMesh);
  }

  // 4c. Vành đai (Saturn, Uranus)
  let ringMesh = null;
  if (data.rings && data.rings.hasRings) {
    ringMesh = createRings(data);
    tiltGroup.add(ringMesh);
  }

  // 5. Pivot — vị trí trên quỹ đạo (sẽ được cập nhật bởi Kepler engine)
  const pivot = new THREE.Object3D();
  pivot.name = `${data.id}_pivot`;
  pivot.add(tiltGroup);

  // Đặt vị trí ban đầu trên trục X theo bán trục lớn
  if (data.semiMajorAxis > 0) {
    pivot.position.x = data.semiMajorAxis * AU;
  }

  return { pivot, tiltGroup, mesh, atmosphereMesh, ringMesh, data };
}
