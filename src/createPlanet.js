// Factory function tạo thiên thể với hệ phân cấp Pivot → Tilt → Mesh
import * as THREE from 'three';
import { AU } from './constants.js';
import { createAtmosphere } from './atmosphere.js';
import { createRings } from './rings.js';
import { loadPlanetTextures } from './textureLoader.js';
import { createSunCorona, createSunSurfaceMaterial } from './sun.js';

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

function createVenusAtmosphereShell(radius, oblateness, atmosphereTexture, segments) {
  const geometry = new THREE.SphereGeometry(1.012, segments, segments);
  const material = new THREE.MeshStandardMaterial({
    map: atmosphereTexture,
    color: 0xfff0c8,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
    roughness: 1.0,
    metalness: 0.0,
    emissive: new THREE.Color(0x221000),
    emissiveIntensity: 0.08,
  });

  const shell = new THREE.Mesh(geometry, material);
  shell.name = 'venus_atmosphere_texture';
  shell.scale.set(radius, radius * (1 - oblateness), radius);
  return shell;
}

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
  const textures = loadPlanetTextures(data);
  let material;
  
  if (data.type === 'star') {
    material = createSunSurfaceMaterial(textures.albedo, FALLBACK_COLORS[data.id]);
  } else {
    // Hành tinh: MeshStandardMaterial hỗ trợ PBR
    let pbrRoughness = 0.8;
    let pbrMetalness = 0.0;
    
    // Tùy chỉnh thông số bề mặt theo hành tinh
    if (['mercury', 'mars', 'pluto'].includes(data.id)) {
      pbrRoughness = 0.95; // Bề mặt đá khô, nhám
    } else if (data.id === 'earth') {
      pbrRoughness = 0.6;
      pbrMetalness = 0.1;
    } else if (data.id === 'venus') {
      pbrRoughness = 0.7;
    } else if (['uranus', 'neptune'].includes(data.id)) {
      pbrRoughness = 0.5; // Bề mặt băng/khí láng hơn
    }

    material = new THREE.MeshStandardMaterial({
      color: textures.albedo ? 0xffffff : (FALLBACK_COLORS[data.id] || 0xaaaaaa),
      map: textures.albedo || null,
      normalMap: textures.normal || null,
      bumpMap: textures.bump || null,
      bumpScale: 0.05,
      // Roughness map cho các vùng phản chiếu khác nhau
      roughnessMap: textures.specular || null,
      roughness: pbrRoughness,
      metalness: pbrMetalness,
      // Night map cho đèn thành phố (sẽ sáng ở phần tối)
      emissiveMap: textures.night || null,
      emissive: textures.night ? new THREE.Color(0xffffee) : new THREE.Color(0x000000),
      emissiveIntensity: 0.6,
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

  // 4b. Corona riêng cho Mặt Trời
  let coronaMesh = null;
  if (data.type === 'star') {
    coronaMesh = createSunCorona(r, ob);
    tiltGroup.add(coronaMesh);
  }

  // 4c. Lớp mây dày của Sao Kim che gần toàn bộ surface texture.
  let atmosphereTextureMesh = null;
  if (data.id === 'venus' && textures.atmosphere) {
    atmosphereTextureMesh = createVenusAtmosphereShell(r, ob, textures.atmosphere, segments);
    tiltGroup.add(atmosphereTextureMesh);
  }

  // 4d. Khí quyển Fresnel (nếu hành tinh có atmosphere config)
  let atmosphereMesh = null;
  if (data.atmosphere) {
    atmosphereMesh = createAtmosphere(data.radius, data.atmosphere);
    atmosphereMesh.name = `${data.id}_atmosphere`;
    tiltGroup.add(atmosphereMesh);
  }

  // 4e. Lớp mây (Cloud Shell) cho Trái Đất
  let cloudMesh = null;
  if (textures.clouds) {
    // Sphere geometry lớn hơn bề mặt 0.6%
    const cloudGeo = new THREE.SphereGeometry(1.006, segments, segments);
    const cloudMat = new THREE.MeshStandardMaterial({
      map: textures.clouds,
      alphaMap: textures.clouds, // Dùng ảnh cloud map (trắng đen) làm kênh alpha
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // Màu đen sẽ trở thành trong suốt
      color: 0xffffff,
      roughness: 1.0,
      metalness: 0.0,
    });
    cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    cloudMesh.name = `${data.id}_clouds`;
    cloudMesh.scale.set(r, r * (1 - ob), r);
    tiltGroup.add(cloudMesh);
  }

  // 4f. Vành đai (Saturn, Uranus)
  let ringMesh = null;
  if (data.rings && data.rings.hasRings) {
    ringMesh = createRings(data, textures.ring);
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

  return {
    pivot,
    tiltGroup,
    mesh,
    atmosphereMesh,
    atmosphereTextureMesh,
    ringMesh,
    cloudMesh,
    coronaMesh,
    data
  };
}
