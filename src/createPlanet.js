// Factory function tạo thiên thể với hệ phân cấp Pivot → Tilt → Mesh
import * as THREE from 'three';
import { AU } from './constants.js';
import { createAtmosphere } from './atmosphere.js';
import { createRings } from './rings.js';
import { loadPlanetTextures } from './textureLoader.js';

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
  const textures = loadPlanetTextures(data);
  let material;
  
  if (data.type === 'star') {
    if (textures.albedo) {
      // Mặt Trời: Custom Shader để tạo hiệu ứng plasma chuyển động
      material = new THREE.ShaderMaterial({
        uniforms: {
          uAlbedo: { value: textures.albedo },
          uTime: { value: 0 }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D uAlbedo;
          uniform float uTime;
          varying vec2 vUv;
          
          void main() {
            vec2 uv = vUv;
            // Bóp méo UV theo thời gian để tạo cảm giác bề mặt đang sôi
            uv.x += sin(uv.y * 20.0 + uTime * 0.2) * 0.003;
            uv.y += cos(uv.x * 20.0 + uTime * 0.15) * 0.003;
            
            vec4 texColor = texture2D(uAlbedo, uv);
            // Kích sáng thêm 50% để tạo glow mạnh hơn, phù hợp với Bloom
            gl_FragColor = vec4(texColor.rgb * 1.5, 1.0);
          }
        `
      });
      // Lưu reference để main.js có thể cập nhật uTime
      material.userData = { isSunShader: true, uniforms: material.uniforms };
    } else {
      material = new THREE.MeshBasicMaterial({ color: FALLBACK_COLORS[data.id] || 0xffffff });
    }
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

  // 4b. Khí quyển Fresnel (nếu hành tinh có atmosphere config)
  let atmosphereMesh = null;
  if (data.atmosphere) {
    atmosphereMesh = createAtmosphere(data.radius, data.atmosphere);
    atmosphereMesh.name = `${data.id}_atmosphere`;
    tiltGroup.add(atmosphereMesh);
  }

  // 4c. Lớp mây (Cloud Shell) cho Trái Đất
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

  // 4d. Vành đai (Saturn, Uranus)
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

  return { pivot, tiltGroup, mesh, atmosphereMesh, ringMesh, cloudMesh, data };
}
