// H? th?ng v?nh ?ai cho Sao Th? v? Sao Thi?n V??ng
import * as THREE from 'three';

/**
 * T?nh to?n t?a ?? UV (0.0 -> 1.0) t? b?n k?nh v?t l? (km)
 * Gi?i h?n render mesh: D ring inner (67,000km) ??n ngo?i F ring (142,000km)
 */
const SATURN_RING_INNER_KM = 67000;
const SATURN_RING_OUTER_KM = 142000;
const SATURN_RING_RANGE = SATURN_RING_OUTER_KM - SATURN_RING_INNER_KM;

function getU(radiusKm) {
  return (radiusKm - SATURN_RING_INNER_KM) / SATURN_RING_RANGE;
}

/**
 * T?o colormap v? alpha map 4096x1 cho v?nh ?ai Sao Th? 
 * D?a tr?n ??ng d? li?u v?t l? ?? Cassini Division v? Encke Gap ch?nh x?c
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

  // --- B ring (S?ng nh?t) ---
  addStop(92001, '#f2e8d8', 0.85);
  addStop(100000, '#fff6e6', 0.95);
  addStop(110000, '#f2e8d8', 0.90);
  addStop(117580, '#ebdcc8', 0.85);

  // --- Cassini Division (Xuy?n th?u) ---
  addStop(117581, '#111111', 0.02);
  addStop(119800, '#222222', 0.04);
  addStop(122170, '#111111', 0.02);

  // --- A ring ---
  addStop(122171, '#e6d8c3', 0.70);
  addStop(128000, '#f0e4d0', 0.80);
  addStop(133588, '#e6d8c3', 0.75);

  // --- Encke Gap (R?t nh? nh?ng quan tr?ng) ---
  addStop(133589, '#050505', 0.01);
  addStop(133680, '#050505', 0.02);
  addStop(133777, '#050505', 0.01);

  // --- Ti?p t?c A ring ---
  addStop(133778, '#e6d8c3', 0.75);
  addStop(136775, '#dccbb4', 0.70);

  // --- Gap before F ring ---
  addStop(136776, '#000000', 0.00);
  addStop(140000, '#000000', 0.00);

  // --- F ring (M?nh, s?ng) ---
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
 * Texture th? t?c c? cho c?c h?nh tinh kh?c (Uranus)
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
 * T?o mesh v?nh ?ai cho h?nh tinh
 */
export function createRings(data, ringTextureAsset = null) {
  const ringConfig = data.rings;
  
  if (data.id === 'saturn') {
    // Phase 0: Render v?ng ?ai Sao Th? chu?n x?c
    // 58232km l? b?n k?nh v?t l? c?a Sao Th? (t??ng ???ng 9.45 units)
    // Scale factor: 9.45 / 58232 = 0.0001622819
    const scaleFactor = 9.45 / 58232;
    const innerR = SATURN_RING_INNER_KM * scaleFactor;
    const outerR = SATURN_RING_OUTER_KM * scaleFactor;

    const geometry = new THREE.RingGeometry(innerR, outerR, 256, 4);

    // Custom UV theo h??ng t?m
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

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: colormap },
        uAlphaMap: { value: alphamap },
        uSunPosition: { value: new THREE.Vector3(0, 0, 0) }, // S? update ? loop
        uPlanetRadius: { value: data.radius },
        uPlanetPosition: { value: new THREE.Vector3(0, 0, 0) },
        uShadowColor: { value: new THREE.Color(0x050505) },
        uAmbientIntensity: { value: 0.15 },
        uCameraPosition: { value: new THREE.Vector3() }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform sampler2D uAlphaMap;
        uniform vec3 uSunPosition;
        uniform vec3 uPlanetPosition;
        uniform float uPlanetRadius;
        uniform vec3 uShadowColor;
        uniform float uAmbientIntensity;
        uniform vec3 uCameraPosition;

        varying vec2 vUv;
        varying vec3 vWorldPosition;

        void main() {
          vec4 color = texture2D(uMap, vUv);
          float alpha = texture2D(uAlphaMap, vUv).r;

          // 1. Planet Shadow Logic (Phase 8 - Soft Edge)
          vec3 L = normalize(uSunPosition - vWorldPosition);
          vec3 P = vWorldPosition - uPlanetPosition;
          
          float t = dot(-P, L);
          float d2 = dot(P, P) - t * t;
          float shadow = 1.0;
          
          if (t > 0.0) {
            // Soft shadow edge based on planet radius
            float r2 = uPlanetRadius * uPlanetRadius;
            float softEdge = smoothstep(r2, r2 * 0.98, d2);
            shadow = mix(1.0, uAmbientIntensity, softEdge);
          }

          // 2. Scattering & Phase Function (Phase 8)
          // V?nh ?ai t?o th?nh t? b?ng v? b?i, n?n c? hi?u ?ng t?n x? khi ng??c s?ng
          vec3 V = normalize(uCameraPosition - vWorldPosition);
          float dotLV = dot(L, V);
          
          // Forward scattering (Khi nh?n ng??c s?ng m?t tr?i)
          float forward = pow(max(0.0, -dotLV), 4.0) * 0.6 * (1.0 - alpha);
          // Back scattering (Khi thu?n s?ng)
          float back = pow(max(0.0, dotLV), 2.0) * 0.1;
          
          vec3 finalColor = color.rgb * (shadow + forward + back);

          gl_FragColor = vec4(finalColor, alpha);
          if (gl_FragColor.a < 0.01) discard;
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const ringMesh = new THREE.Mesh(geometry, material);
    ringMesh.name = `${data.id}_rings`;
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.renderOrder = 1;
    ringMesh.castShadow = true; 
    ringMesh.receiveShadow = true;

    // Custom depth material cho b?ng ?? chu?n (Phase 4)
    ringMesh.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      alphaMap: alphamap,
      alphaTest: 0.05,
      side: THREE.DoubleSide
    });

    return ringMesh;
  } else {
    // V?nh ?ai Uranus (ho?c h?nh tinh kh?c)
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

