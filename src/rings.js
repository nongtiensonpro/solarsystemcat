// Hệ thống vành đai cho Sao Thổ và Sao Thiên Vương
import * as THREE from 'three';

/**
 * Tạo texture vành đai thủ tục bằng Canvas 2D
 * Gradient xuyên tâm mô phỏng các vành D, C, B, Cassini, A, F
 * @param {string} planetId - 'saturn' hoặc 'uranus'
 * @returns {THREE.CanvasTexture}
 */
function generateRingTexture(planetId) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  if (planetId === 'saturn') {
    // Gradient xuyên tâm từ trái (trong) sang phải (ngoài)
    // Mô phỏng các vành: D → C → B → Cassini → A → F
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);

    // Vành D (trong cùng) — gần invisible
    gradient.addColorStop(0.0, 'rgba(180, 160, 130, 0.02)');
    gradient.addColorStop(0.05, 'rgba(180, 160, 130, 0.05)');

    // Vành C — mờ nhạt
    gradient.addColorStop(0.06, 'rgba(190, 170, 140, 0.15)');
    gradient.addColorStop(0.20, 'rgba(200, 180, 150, 0.25)');

    // Vành B — sáng nhất, đục nhất
    gradient.addColorStop(0.22, 'rgba(220, 200, 170, 0.7)');
    gradient.addColorStop(0.30, 'rgba(235, 215, 185, 0.9)');
    gradient.addColorStop(0.42, 'rgba(240, 220, 190, 0.95)');
    gradient.addColorStop(0.48, 'rgba(230, 210, 180, 0.85)');

    // Khe Cassini — gần trong suốt
    gradient.addColorStop(0.49, 'rgba(100, 80, 60, 0.05)');
    gradient.addColorStop(0.53, 'rgba(100, 80, 60, 0.03)');

    // Vành A — sáng vừa
    gradient.addColorStop(0.54, 'rgba(210, 190, 160, 0.6)');
    gradient.addColorStop(0.60, 'rgba(220, 200, 170, 0.7)');
    gradient.addColorStop(0.72, 'rgba(200, 180, 150, 0.5)');

    // Khe Encke nhỏ trong vành A
    gradient.addColorStop(0.73, 'rgba(100, 80, 60, 0.05)');
    gradient.addColorStop(0.74, 'rgba(200, 180, 150, 0.45)');

    // Vành F — hẹp, sáng vừa
    gradient.addColorStop(0.82, 'rgba(190, 170, 140, 0.3)');
    gradient.addColorStop(0.84, 'rgba(210, 190, 160, 0.5)');
    gradient.addColorStop(0.86, 'rgba(190, 170, 140, 0.2)');

    // Vành G & E — cực mờ
    gradient.addColorStop(0.88, 'rgba(160, 150, 130, 0.03)');
    gradient.addColorStop(1.0, 'rgba(160, 150, 130, 0.0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

  } else if (planetId === 'uranus') {
    // Vành đai Thiên Vương: rất mờ, xám-lam
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);

    gradient.addColorStop(0.0, 'rgba(120, 140, 160, 0.0)');
    gradient.addColorStop(0.15, 'rgba(120, 140, 160, 0.06)');
    // Epsilon ring — sáng nhất của Uranus
    gradient.addColorStop(0.55, 'rgba(140, 160, 180, 0.12)');
    gradient.addColorStop(0.60, 'rgba(160, 180, 200, 0.18)');
    gradient.addColorStop(0.65, 'rgba(140, 160, 180, 0.10)');
    // Vành ngoài rất mờ
    gradient.addColorStop(0.80, 'rgba(100, 130, 180, 0.04)');
    gradient.addColorStop(1.0, 'rgba(100, 130, 180, 0.0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * Tạo mesh vành đai cho hành tinh
 * @param {Object} data - Dữ liệu hành tinh từ planetData.js
 * @returns {THREE.Mesh} - Ring mesh
 */
export function createRings(data) {
  const ringConfig = data.rings;
  const innerR = data.radius * ringConfig.innerRadius;
  const outerR = data.radius * ringConfig.outerRadius;

  // RingGeometry(innerRadius, outerRadius, thetaSegments)
  const geometry = new THREE.RingGeometry(innerR, outerR, 128);

  // Fix UV mapping cho RingGeometry — mặc định UV không phù hợp radial gradient
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const dist = Math.sqrt(x * x + y * y);
    // Map UV.x theo khoảng cách từ tâm (0 = trong, 1 = ngoài)
    uv.setXY(i, (dist - innerR) / (outerR - innerR), 0.5);
  }
  uv.needsUpdate = true;

  // Tạo texture thủ tục
  const ringTexture = generateRingTexture(data.id);

  const material = new THREE.MeshStandardMaterial({
    map: ringTexture,
    alphaMap: ringTexture,
    side: THREE.DoubleSide,    // Nhìn thấy từ cả 2 mặt
    transparent: true,
    depthWrite: false,
    roughness: 0.9,
    metalness: 0.0,
  });

  const ringMesh = new THREE.Mesh(geometry, material);
  ringMesh.name = `${data.id}_rings`;

  // Vành đai nằm trên mặt phẳng XZ → xoay -90° quanh X
  ringMesh.rotation.x = -Math.PI / 2;

  return ringMesh;
}
