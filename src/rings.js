// Hệ thống vành đai cho Sao Thổ và Sao Thiên Vương
import * as THREE from 'three';

/**
 * Tính toán tọa độ UV (0.0 -> 1.0) từ bán kính vật lý (km)
 * Giới hạn render mesh: D ring inner (67,000km) đến ngoài F ring (142,000km)
 */
const SATURN_RING_INNER_KM = 67000;
const SATURN_RING_OUTER_KM = 142000;
const SATURN_RING_RANGE = SATURN_RING_OUTER_KM - SATURN_RING_INNER_KM;

function getU(radiusKm) {
  return (radiusKm - SATURN_RING_INNER_KM) / SATURN_RING_RANGE;
}

/**
 * Tạo colormap và alpha map 4096x1 cho vành đai Sao Thổ 
 * Dựa trên đúng dữ liệu vật lý để Cassini Division và Encke Gap chính xác
 * @returns {{ colormap: THREE.CanvasTexture, alphamap: THREE.CanvasTexture }}
 */
function generateSaturnRingTextures() {
  const canvasColor = document.createElement('canvas');
  const canvasAlpha = document.createElement('canvas');
  canvasColor.width = 4096; canvasColor.height = 1;
  canvasAlpha.width = 4096; canvasAlpha.height = 1;
  
  const ctxColor = canvasColor.getContext('2d');
  const ctxAlpha = canvasAlpha.getContext('2d');

  const colorGradient = ctxColor.createLinearGradient(0, 0, 4096, 0);
  const alphaGradient = ctxAlpha.createLinearGradient(0, 0, 4096, 0);

  const addStop = (km, colorHex, alphaVal) => {
    let u = getU(km);
    if (u < 0) u = 0;
    if (u > 1) u = 1;
    colorGradient.addColorStop(u, colorHex);
    alphaGradient.addColorStop(u, `rgba(255, 255, 255, ${alphaVal})`);
  };

  // --- D ring ---
  addStop(67000, '#e0d8cc', 0.00);
  addStop(70000, '#e0d8cc', 0.05);
  addStop(74500, '#e0d8cc', 0.08);

  // --- C ring ---
  addStop(74501, '#c8bdae', 0.20);
  addStop(80000, '#c8bdae', 0.25);
  addStop(92000, '#bbaaa0', 0.30);

  // --- B ring (Sáng nhất) ---
  addStop(92001, '#f2e8d8', 0.85);
  addStop(100000, '#fff6e6', 0.95);
  addStop(110000, '#f2e8d8', 0.90);
  addStop(117580, '#ebdcc8', 0.85);

  // --- Cassini Division (Xuyên thấu) ---
  addStop(117581, '#111111', 0.02);
  addStop(119800, '#222222', 0.04);
  addStop(122170, '#111111', 0.02);

  // --- A ring ---
  addStop(122171, '#e6d8c3', 0.70);
  addStop(128000, '#f0e4d0', 0.80);
  addStop(133588, '#e6d8c3', 0.75);

  // --- Encke Gap (Rất nhỏ nhưng quan trọng) ---
  addStop(133589, '#050505', 0.01);
  addStop(133680, '#050505', 0.02);
  addStop(133777, '#050505', 0.01);

  // --- Tiếp tục A ring ---
  addStop(133778, '#e6d8c3', 0.75);
  addStop(136775, '#dccbb4', 0.70);

  // --- Gap before F ring ---
  addStop(136776, '#000000', 0.00);
  addStop(140000, '#000000', 0.00);

  // --- F ring (Mảnh, sáng) ---
  addStop(140150, '#000000', 0.00);
  addStop(140180, '#ffffff', 0.40);
  addStop(140210, '#000000', 0.00);
  
  addStop(142000, '#000000', 0.00);

  ctxColor.fillStyle = colorGradient;
  ctxColor.fillRect(0, 0, 4096, 1);
  
  ctxAlpha.fillStyle = alphaGradient;
  ctxAlpha.fillRect(0, 0, 4096, 1);

  const texColor = new THREE.CanvasTexture(canvasColor);
  const texAlpha = new THREE.CanvasTexture(canvasAlpha);
  
  texColor.wrapS = THREE.ClampToEdgeWrapping; texColor.wrapT = THREE.ClampToEdgeWrapping;
  texAlpha.wrapS = THREE.ClampToEdgeWrapping; texAlpha.wrapT = THREE.ClampToEdgeWrapping;

  return { colormap: texColor, alphamap: texAlpha };
}

/**
 * Texture thủ tục cũ cho các hành tinh khác (Uranus)
 */
function generateRingTexture(planetId) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  if (planetId === 'uranus') {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0.0, 'rgba(120, 140, 160, 0.0)');
    gradient.addColorStop(0.15, 'rgba(120, 140, 160, 0.06)');
    gradient.addColorStop(0.55, 'rgba(140, 160, 180, 0.12)');
    gradient.addColorStop(0.60, 'rgba(160, 180, 200, 0.18)');
    gradient.addColorStop(0.65, 'rgba(140, 160, 180, 0.10)');
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
 */
export function createRings(data, ringTextureAsset = null) {
  const ringConfig = data.rings;
  
  if (data.id === 'saturn') {
    // Phase 0: Render vòng đai Sao Thổ chuẩn xác
    // 58232km là bán kính vật lý của Sao Thổ (tương đương 9.45 units)
    // Scale factor: 9.45 / 58232 = 0.0001622819
    const scaleFactor = 9.45 / 58232;
    const innerR = SATURN_RING_INNER_KM * scaleFactor;
    const outerR = SATURN_RING_OUTER_KM * scaleFactor;

    const geometry = new THREE.RingGeometry(innerR, outerR, 256, 4);

    // Custom UV theo hướng tâm
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const dist = Math.sqrt(x * x + y * y);
      const u = (dist - innerR) / (outerR - innerR);
      uv.setXY(i, u, 0.5);
    }
    uv.needsUpdate = true;

    const { colormap, alphamap } = generateSaturnRingTextures();

    const material = new THREE.MeshBasicMaterial({
      map: colormap,
      alphaMap: alphamap,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false, // Tránh z-fighting
    });

    const ringMesh = new THREE.Mesh(geometry, material);
    ringMesh.name = `${data.id}_rings`;
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.renderOrder = 1; // Phase 0: Tránh z-fighting
    return ringMesh;
  } else {
    // Vành đai Uranus (hoặc hành tinh khác)
    const innerR = data.radius * ringConfig.innerRadius;
    const outerR = data.radius * ringConfig.outerRadius;

    const geometry = new THREE.RingGeometry(innerR, outerR, 128);

    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const dist = Math.sqrt(x * x + y * y);
      uv.setXY(i, (dist - innerR) / (outerR - innerR), 0.5);
    }
    uv.needsUpdate = true;

    const ringTexture = ringTextureAsset || generateRingTexture(data.id);

    const material = new THREE.MeshStandardMaterial({
      map: ringTexture,
      alphaMap: ringTexture,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      roughness: 0.9,
      metalness: 0.0,
    });

    const ringMesh = new THREE.Mesh(geometry, material);
    ringMesh.name = `${data.id}_rings`;
    ringMesh.rotation.x = -Math.PI / 2;
    return ringMesh;
  }
}

