// Factory function tạo thiên thể với hệ phân cấp Pivot → Tilt → Mesh
import * as THREE from 'three';
import { BLOOM_LAYER } from './constants.js';
import { createAtmosphere, createAtmosphereLayers } from './atmosphere.js';
import { createRings } from './rings.js';
import { loadPlanetTextures } from './textureLoader.js';
import { createUnifiedCorona, createSunSurfaceMaterial, createChromosphere } from './sun.js';
import { createCometTail, createCometDustTail, createCometComa } from './comets.js';
import { createMagneticField } from './magneticField.js';
import { createAurora } from './aurora.js';
import { createVolumetricClouds } from './cloudsVolumetric.js';
import { createHeliumRain } from './heliumRain.js';
import { createDiamondRain } from './diamondRain.js';
import { createIronSnow } from './ironSnow.js';
import { createEnceladusPlume } from './enceladusPlume.js';
import { getDisplayOrbitRadius } from './orbitMath.js';

// Lấy fallback color từ data (đã normalize bởi dataLoader.js)
function getFallbackColor(data) {
  return data.fallbackColor ?? 0xaaaaaa;
}

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
 * Tạo Sun Glow Sprite — radial gradient phát sáng quanh Mặt Trời
 * Luôn nhìn thấy ở mọi khoảng cách, giúp user nhận diện nguồn sáng trung tâm
 */
function createSunGlowSprite(radius) {
  const canvas = document.createElement('canvas');
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Radial gradient: rất mềm, fade đều ra ngoài, không viền cứng
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 230, 150, 0.35)');
  gradient.addColorStop(0.1, 'rgba(255, 220, 120, 0.25)');
  gradient.addColorStop(0.3, 'rgba(255, 200, 80, 0.12)');
  gradient.addColorStop(0.6, 'rgba(255, 170, 50, 0.04)');
  gradient.addColorStop(1, 'rgba(255, 140, 30, 0.0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      color: 0xffdd88,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    })
  );
  sprite.name = 'sun_glow';
  // Scale lớn, mềm — blend với corona
  const glowSize = radius * 16;
  sprite.scale.set(glowSize, glowSize, 1);

  return sprite;
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
  // 1. Geometry — Quả cầu chuẩn hóa (Áp dụng LOD để tối ưu hiệu năng)
  const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);
  const segmentScale = isMobile ? 0.6 : 1.0; // Giảm segments trên mobile

  let segments = Math.round(64 * segmentScale); // Mặc định cao cho Mặt Trời và Khí Khổng Lồ
  if (data.type === 'comet' || data.radius < 0.1) {
    segments = Math.round(16 * segmentScale); // Nhỏ nhất (Sao chổi, tiểu hành tinh)
  } else if (data.isMoon) {
    segments = Math.round(24 * segmentScale); // Vệ tinh vừa và nhỏ
  } else if (data.radius <= 2.0) {
    segments = Math.round(48 * segmentScale);  // 1. Tạo Geometries theo cấp độ (LOD)
  }

  // High: 64 segments (Dành cho góc nhìn gần)
  // Medium: 32 segments
  // Low: 16 segments (Dành cho góc nhìn xa/Overview)
  const geometries = {
    high: new THREE.SphereGeometry(1, 64, 64),
    med: new THREE.SphereGeometry(1, 32, 32),
    low: new THREE.SphereGeometry(1, 16, 16)
  };

  // 2. Vật liệu (Material) - Dùng chung cho các cấp độ LOD
  const textures = loadPlanetTextures(data);
  let material;
  
  if (data.type === 'star') {
    material = createSunSurfaceMaterial(textures.albedo, getFallbackColor(data));
  } else {
    // Hành tinh: MeshStandardMaterial hỗ trợ PBR
    let pbrRoughness = 0.8;
    let pbrMetalness = 0.0;
    
    // Tùy chỉnh thông số bề mặt theo thiên thể
    if (['mercury', 'mars', 'pluto', 'moon', 'callisto', 'phobos', 'deimos', 'miranda', 'ariel', 'umbriel', 'titania', 'oberon', 'puck', 'caliban', 'sycorax', 'nereid', 'naiad', 'thalassa', 'despina', 'galatea', 'larissa', 'proteus', 'halimede', 'psamathe', 'neso', 'metis', 'adrastea', 'amalthea', 'thebe', 'himalia', 'elara', 'pasiphae', 'carme', 'ananke', 'sinope'].includes(data.id)) {
      pbrRoughness = 0.95; // Bề mặt đá khô, nhám
    } else if (data.id === 'earth') {
      pbrRoughness = 0.6;
      pbrMetalness = 0.1;
    } else if (data.id === 'venus' || data.id === 'io') {
      pbrRoughness = 0.7; // Bề mặt mây hoặc lưu huỳnh
    } else if (data.id === 'europa' || data.id === 'triton') {
      pbrRoughness = 0.25; // Bề mặt băng phản quang tốt
      pbrMetalness = 0.05;
    } else if (data.id === 'ganymede') {
      pbrRoughness = 0.6; // Pha trộn giữa băng và đá
    } else if (['uranus', 'neptune', 'titan'].includes(data.id)) {
      pbrRoughness = 0.5; // Bề mặt băng/khí/khí quyển láng hơn
    } else if (data.type === 'comet') {
      pbrRoughness = 0.95; // Lõi sao chổi carbon tối màu
    }

    // Phase 3.2: Planet Material Brightness — hành tinh xa nhận ít ánh sáng
    // nên giảm roughness + emissive nhẹ để "bắt sáng" tốt hơn
    const orbitDist = data.displayOrbitRadius ?? 0;
    if (orbitDist > 2000) {
      pbrRoughness = Math.max(0.3, pbrRoughness * 0.7);
    }

    // 3. Thi?t l?p Emissive (Ph?t s?ng t? th?n)
    // T?ng c??ng ?? nh?n r? b? m?t k? c? ? m?t t?i (Phase 9 UX Optimization)
    let emissiveColor = new THREE.Color(0x000000);
    let emissiveInt = 1.0;
    let finalEmissiveMap = textures.night || null;

    if (textures.night) {
      emissiveColor = new THREE.Color(0xffffee);
      emissiveInt = 6.0; // Tăng độ sáng đèn thành phố
    } else if (data.id === 'io') {
      emissiveColor = new THREE.Color(0x442211);
      emissiveInt = 2.0;
    } else if (data.id === 'saturn') {
      emissiveColor = new THREE.Color(0x221105);
      emissiveInt = 1.5;
    } else if (data.id === 'neptune') {
      emissiveColor = new THREE.Color(0x112244);
      emissiveInt = 2.5;
    } else if (data.type === 'comet') {
      emissiveColor = new THREE.Color(0x445566);
      emissiveInt = 0.8;
    } else if (data.saturnMoon?.lodTier === 'hero') {
      emissiveColor = new THREE.Color(data.render?.fallbackColor || 0xffffff);
      emissiveInt = 0.35; 
    } else if (textures.albedo) {
      // Fallback: Dùng chính albedo làm emissive mờ để nhìn rõ chi tiết ở mặt tối
      finalEmissiveMap = textures.albedo;
      emissiveColor = new THREE.Color(0x555555); // Màu xám trung tính sáng hơn
      emissiveInt = 0.45; // Tăng mạnh độ sáng để texture hiện rõ mồn một
    }

    // Phase 3.2: Hành tinh xa → emissive ấm nhẹ bù đắp vùng tối
    if (orbitDist > 2000 && emissiveColor.getHex() === 0x000000) {
      emissiveColor = new THREE.Color(0x332200);
      emissiveInt = 0.15;
    }

    // Tùy chỉnh bump / normal scale (đặc biệt cho Mimas - Herschel crater, và các vệ tinh chính của Uranus)
    let bScale = 0.05;
    let nScale = new THREE.Vector2(1, 1);
    if (data.id === 'mimas') {
      bScale = 0.5;
      nScale.set(3.0, 3.0);
    } else if (data.id === 'miranda') {
      bScale = 0.25; // Hẻm vực và đứt gãy cực kỳ sâu
    } else if (data.id === 'ariel') {
      bScale = 0.18; // Hệ thống graben thung lũng sâu
    } else if (['titania', 'oberon'].includes(data.id)) {
      bScale = 0.15; // Hố va chạm và vách đá đứt gãy gồ ghề
    }

    let baseColor = textures.albedo ? 0xffffff : getFallbackColor(data);
    if (data.type === 'comet') {
      baseColor = 0x2a3040;
    }
    material = new THREE.MeshStandardMaterial({
      color: baseColor,
      map: textures.albedo || null,
      normalMap: textures.normal || null,
      normalScale: nScale,
      bumpMap: textures.bump || null,
      bumpScale: bScale,
      roughnessMap: textures.specular || null,
      roughness: pbrRoughness,
      metalness: pbrMetalness,
      emissiveMap: finalEmissiveMap,
      emissive: emissiveColor,
      emissiveIntensity: emissiveInt,
    });
  }

  // 3. Mesh & LOD
  const lod = new THREE.LOD();
  lod.name = data.id;

  // Cấp độ Cao (Rất gần)
  const meshHigh = new THREE.Mesh(geometries.high, material);
  meshHigh.castShadow = true;
  meshHigh.receiveShadow = true;
  lod.addLevel(meshHigh, 0);

  // Cấp độ Trung bình (Gần)
  const meshMed = new THREE.Mesh(geometries.med, material);
  meshMed.castShadow = true;
  meshMed.receiveShadow = true;
  lod.addLevel(meshMed, data.radius * 30);

  // Cấp độ Thấp (Xa)
  const meshLow = new THREE.Mesh(geometries.low, data.radius * 100);
  lod.addLevel(meshLow, data.radius * 100);

  // Áp dụng kích thước (radius) và độ dẹt (oblateness)
  const r = data.radius;
  const ob = data.oblateness || 0;
  lod.scale.set(r, r * (1 - ob), r);

  // 4. TiltGroup — xoay theo độ nghiêng trục (axialTilt)
  const tiltGroup = new THREE.Group();
  tiltGroup.name = `${data.id}_tilt`;
  tiltGroup.rotation.z = THREE.MathUtils.degToRad(data.axialTilt || 0);
  tiltGroup.add(lod);

  // Lưu tham chiếu mesh chính (thường là bản High để shader logic hoạt động)
  const mesh = meshHigh; 
  // Gán id cho lod để search
  lod.userData.planetId = data.id;

  // 4b. Corona và Chromosphere riêng cho Mặt Trời
  let coronaMesh = null;
  let chromosphereMesh = null;
  let sunGlowSprite = null;
  if (data.type === 'star') {
    // Gán Mặt Trời vào BLOOM_LAYER để selective bloom
    lod.layers.enable(BLOOM_LAYER);

    // Unified Corona — single sphere, single alpha curve, zero onion rings
    coronaMesh = createUnifiedCorona(r, ob);
    coronaMesh.layers.enable(BLOOM_LAYER);
    tiltGroup.add(coronaMesh);

    // Lớp sắc quyển (chromosphere) — H-alpha đỏ-hồng giữa bề mặt và corona
    chromosphereMesh = createChromosphere(r, ob);
    chromosphereMesh.layers.enable(BLOOM_LAYER);
    tiltGroup.add(chromosphereMesh);

    // Sun Glow Sprite — luôn nhìn thấy dù ở khoảng cách nào
    sunGlowSprite = createSunGlowSprite(r);
    tiltGroup.add(sunGlowSprite);
  }

  // 4c. Lớp mây dày của Sao Kim che gần toàn bộ surface texture.
  let atmosphereTextureMesh = null;
  if (data.id === 'venus' && textures.atmosphere) {
    atmosphereTextureMesh = createVenusAtmosphereShell(r, ob, textures.atmosphere, segments);
    tiltGroup.add(atmosphereTextureMesh);
  }

  // 4d. Khí quyển Fresnel (nếu hành tinh có atmosphere config)
  let atmosphereMeshes = [];
  if (data.atmosphere) {
    if (data.atmosphere.layers) {
      atmosphereMeshes = createAtmosphereLayers(data.radius, data.atmosphere.layers);
    } else {
      const mesh = createAtmosphere(data.radius, data.atmosphere);
      mesh.name = `${data.id}_atmosphere`;
      atmosphereMeshes = [mesh];
    }
    for (const mesh of atmosphereMeshes) {
      mesh.name = mesh.name || `${data.id}_atmosphere`;
      tiltGroup.add(mesh);
    }
  }

  // Khí quyển đục đặc biệt của Titan (Haze layer)
  if (data.id === 'titan') {
    const titanHazeGeo = new THREE.SphereGeometry(1.015, segments, segments);
    const titanHazeMat = new THREE.MeshStandardMaterial({
      color: 0xCC8833,
      transparent: true,
      opacity: 0.7,           // Che ~70% bề mặt
      depthWrite: false,
      roughness: 1.0,
      metalness: 0.0,
      emissive: new THREE.Color(0x221100),
      emissiveIntensity: 0.08,
    });
    const titanHaze = new THREE.Mesh(titanHazeGeo, titanHazeMat);
    titanHaze.scale.set(r, r * (1 - ob), r);
    titanHaze.name = 'titan_haze';
    tiltGroup.add(titanHaze);
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

  // 4g. Từ trường (Magnetic Field)
  let magneticFieldGroup = null;
  const magneticSystem = createMagneticField(r, data.id);
  if (magneticSystem) {
    magneticFieldGroup = magneticSystem;
    tiltGroup.add(magneticFieldGroup);
  }

  // 4h. Cực quang (Aurora) — Earth only
  let auroraGroup = null;
  const auroraSystem = createAurora(r, data.id);
  if (auroraSystem) {
    auroraGroup = auroraSystem;
    tiltGroup.add(auroraGroup);
  }

  // 4i. Mây thể tích (Volumetric Clouds) — Earth only
  let volumetricCloudMesh = null;
  if (data.id === 'earth') {
    volumetricCloudMesh = createVolumetricClouds(r, { opacity: 0.35 });
    tiltGroup.add(volumetricCloudMesh);
  }

  // 4j. Mưa Heli (Jupiter, Saturn)
  let heliumRainMesh = null;
  if (data.id === 'jupiter' || data.id === 'saturn') {
    const startRadius = data.id === 'jupiter' ? 0.8 : 0.7;
    heliumRainMesh = createHeliumRain(r, startRadius, 3000);
    tiltGroup.add(heliumRainMesh);
  }

  // 4k. Mưa Kim Cương (Uranus, Neptune)
  let diamondRainMesh = null;
  if (data.id === 'uranus' || data.id === 'neptune') {
    const startRadius = data.id === 'uranus' ? 0.70 : 0.75;
    diamondRainMesh = createDiamondRain(r, startRadius, 1500);
    tiltGroup.add(diamondRainMesh);
  }

  // 4l. Tuyết Sắt (Mercury)
  let ironSnowMesh = null;
  if (data.id === 'mercury') {
    ironSnowMesh = createIronSnow(r, 0.75, 1500);
    tiltGroup.add(ironSnowMesh);
  }

  // 4m. Mạch phun Enceladus (Plume)
  let enceladusPlume = null;
  if (data.id === 'enceladus') {
    enceladusPlume = createEnceladusPlume(r);
    tiltGroup.add(enceladusPlume.mesh);
  }

  // 5. Pivot — vị trí trên quỹ đạo (sẽ được cập nhật bởi Kepler engine)
  const pivot = new THREE.Object3D();
  pivot.name = `${data.id}_pivot`;
  pivot.add(tiltGroup);

  // Đặt vị trí ban đầu trên trục X theo bán kính
  const orbitRadius = getDisplayOrbitRadius(data);
  if (orbitRadius > 0) {
    pivot.position.x = orbitRadius;
  }

  // 4g. Đuôi sao chổi
  let tailMesh = null;
  let dustTailMesh = null;
  let comaMesh = null;
  if (data.type === 'comet') {
    tailMesh = createCometTail();
    pivot.add(tailMesh);

    dustTailMesh = createCometDustTail();
    dustTailMesh.rotation.z = 0.15;
    pivot.add(dustTailMesh);

    comaMesh = createCometComa(data.physical.radius);
    tiltGroup.add(comaMesh);
  }

  return {
    pivot,
    tiltGroup,
    lod,
    mesh,
    atmosphereMeshes,
    atmosphereTextureMesh,
    ringMesh,
    cloudMesh,
    coronaMesh,
    chromosphereMesh,
    sunGlowSprite,
    tailMesh,
    dustTailMesh,
    comaMesh,
    magneticFieldGroup,
    auroraGroup,
    volumetricCloudMesh,
    heliumRainMesh,
    diamondRainMesh,
    ironSnowMesh,
    enceladusPlume,
    data
  };
}
