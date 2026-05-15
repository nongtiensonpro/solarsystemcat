import * as THREE from 'three';
import { SUN_LAYERS } from './sunInterior.js';
import { TERRESTRIAL_INTERIORS } from './terrestrialInterior.js';
import { GAS_GIANT_INTERIORS } from './gasGiantInterior.js';
import { ICE_GIANT_INTERIORS } from './iceGiantInterior.js';

// Plane cố định cắt dọc theo trục Z (hoặc X)
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const planes = [clipPlane];

/**
 * Tạo nhóm các khối cầu đại diện cho các lớp nội hàm
 * Sẽ được thêm vào `tiltGroup` của thiên thể
 */
function createInteriorLayers(data, radius) {
  const group = new THREE.Group();
  group.name = 'cross_section_layers';

  let layers = [];
  if (data.type === 'star') {
    layers = SUN_LAYERS.map(l => ({
      name: l.name,
      min: l.radiusMin,
      max: l.radiusMax,
      color: new THREE.Color(l.colorHex)
    }));
  } else if (data.type === 'terrestrial' && TERRESTRIAL_INTERIORS[data.id]) {
    layers = TERRESTRIAL_INTERIORS[data.id].layers.map(l => ({
      ...l, color: new THREE.Color(l.colorHex)
    }));
  } else if (data.type === 'gas-giant' && GAS_GIANT_INTERIORS[data.id]) {
    layers = GAS_GIANT_INTERIORS[data.id].layers.map(l => ({
      ...l, color: new THREE.Color(l.colorHex)
    }));
  } else if (data.type === 'ice-giant' && ICE_GIANT_INTERIORS[data.id]) {
    layers = ICE_GIANT_INTERIORS[data.id].layers.map(l => ({
      ...l, color: new THREE.Color(l.colorHex)
    }));
  }

  // Tạo sphere cho mỗi layer (trừ layer ngoài cùng vì đã có vỏ mesh chính)
  for (let i = 0; i < layers.length - 1; i++) {
    const layer = layers[i];
    // Scale layer so với bán kính gốc
    const layerRadius = radius * layer.max;
    
    // Nếu là lõi Mộc/Thổ tinh (mờ), ta có thể làm nó hơi trong suốt, nhưng để đơn giản ta dùng MeshBasicMaterial
    const geo = new THREE.SphereGeometry(layerRadius, 64, 64);
    const mat = new THREE.MeshStandardMaterial({
      color: layer.color,
      roughness: 0.9,
      metalness: 0.1,
      side: THREE.DoubleSide, // Quan trọng: Thấy được mặt trong (tạo hình cái bát)
      clippingPlanes: planes,
      clipIntersection: false
    });

    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
  }

  return group;
}

/**
 * Cập nhật clipping plane để luôn cắt qua tâm của thiên thể đang bám sát
 * Đồng thời hướng mặt cắt về phía camera (hoặc giữ cố định)
 * @param {THREE.Object3D} targetPivot - Pivot của thiên thể đang bám sát
 */
export function updateCrossSectionPlane(targetPivot) {
  if (!targetPivot) return;
  
  // Lấy vị trí thế giới của thiên thể
  const targetWorldPos = new THREE.Vector3();
  targetPivot.getWorldPosition(targetWorldPos);

  // Đặt hằng số plane dựa trên vị trí (để cắt qua tâm)
  // Plane: Z = target.z
  clipPlane.normal.set(0, 0, 1);
  clipPlane.constant = -targetWorldPos.z;
}

/**
 * Bật/tắt chế độ cắt nửa cho một thiên thể
 * @param {Object} body - Body object (từ createPlanet)
 * @param {boolean} isActive 
 */
export function toggleCrossSection(body, isActive) {
  if (!body) return;

  // 1. Áp dụng clippingPlanes cho các vật liệu hiện tại
  const applyClipping = (mesh) => {
    if (mesh && mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.clippingPlanes = isActive ? planes : null);
      } else {
        mesh.material.clippingPlanes = isActive ? planes : null;
        // Đặt DoubleSide cho vỏ ngoài để thấy viền khi cắt
        if (mesh === body.mesh) {
          mesh.material.side = isActive ? THREE.DoubleSide : THREE.FrontSide;
          mesh.material.needsUpdate = true;
        }
      }
    }
  };

  applyClipping(body.mesh);
  applyClipping(body.atmosphereMesh);
  applyClipping(body.atmosphereTextureMesh);
  applyClipping(body.cloudMesh);
  applyClipping(body.coronaMesh);
  applyClipping(body.chromosphereMesh);
  
  // Không cắt ring để thấy ring đầy đủ bao quanh
  // applyClipping(body.ringMesh);

  // 2. Thêm hoặc xóa các lớp nội hàm (nested spheres)
  if (isActive) {
    // Chỉ tạo nếu chưa có
    let interiorGroup = body.tiltGroup.getObjectByName('cross_section_layers');
    if (!interiorGroup) {
      // Dùng radius hiện tại của mesh (xScale)
      const currentRadius = body.mesh.scale.x; 
      interiorGroup = createInteriorLayers(body.data, currentRadius);
      body.tiltGroup.add(interiorGroup);
    }
    interiorGroup.visible = true;
  } else {
    const interiorGroup = body.tiltGroup.getObjectByName('cross_section_layers');
    if (interiorGroup) {
      interiorGroup.visible = false;
    }
  }
}
