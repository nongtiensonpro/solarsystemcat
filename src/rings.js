// H? th?ng v?nh ?ai cho Sao Th?, Sao Thi?n V??ng v? c?c h?nh tinh kh?c
import * as THREE from 'three';

// ====================================================================
// Sao Th? (Saturn) — Constants & Helpers
// ====================================================================
const SATURN_RING_INNER_KM = 67000;
const SATURN_RING_OUTER_KM = 142000;
const SATURN_RING_RANGE = SATURN_RING_OUTER_KM - SATURN_RING_INNER_KM;

function getSaturnU(radiusKm) {
  return (radiusKm - SATURN_RING_INNER_KM) / SATURN_RING_RANGE;
}

// ====================================================================
// Sao Thi?n V??ng (Uranus) — Constants & Helpers
// ====================================================================
const URANUS_RING_INNER_KM = 38000;
const URANUS_RING_OUTER_KM = 51140;
const URANUS_RING_RANGE = URANUS_RING_OUTER_KM - URANUS_RING_INNER_KM;

function getUranusU(radiusKm) {
  return (radiusKm - URANUS_RING_INNER_KM) / URANUS_RING_RANGE;
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
    let u = getSaturnU(km);
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

// ====================================================================
// Procedural texture cho v?nh ?ai Uranus (4096x1) — 13 v?nh v?t l?
// ====================================================================
function generateUranusRingTextures() {
  const width = 4096;
  const canvasColor = document.createElement('canvas');
  const canvasAlpha = document.createElement('canvas');
  canvasColor.width = width; canvasColor.height = 1;
  canvasAlpha.width = width; canvasAlpha.height = 1;

  const ctxColor = canvasColor.getContext('2d');
  const ctxAlpha = canvasAlpha.getContext('2d');

  const imgColor = ctxColor.createImageData(width, 1);
  const imgAlpha = ctxAlpha.createImageData(width, 1);

  // N?n b?i li�n h?nh tinh r?t m?
  for (let x = 0; x < width; x++) {
    const i = x * 4;
    imgColor.data[i] = 28; imgColor.data[i+1] = 34; imgColor.data[i+2] = 48; imgColor.data[i+3] = 255;
    imgAlpha.data[i] = 6; imgAlpha.data[i+1] = 6; imgAlpha.data[i+2] = 6; imgAlpha.data[i+3] = 255;
  }

  // [uCenter, halfWidth, r, g, b, alphaPeak] — Gaussian peak cho m?i v?nh
  const rings = [
    [0.114,  0.114,  100, 118, 142, 30],    // ζ (1986U2R) — r?ng, m?
    [0.292,  0.008,  136, 152, 174, 125],   // 6
    [0.321,  0.008,  136, 152, 174, 115],   // 5
    [0.348,  0.008,  136, 152, 174, 115],   // 4
    [0.511,  0.020,  148, 166, 188, 165],   // α
    [0.584,  0.020,  146, 163, 184, 152],   // β
    [0.698,  0.006,  128, 146, 168, 85],    // η (h?p, b?i)
    [0.733,  0.010,  145, 163, 184, 138],   // γ
    [0.783,  0.015,  138, 156, 178, 128],   // δ
    [0.915,  0.008,  112, 136, 164, 60],    // λ (b?i)
    [1.000,  0.035,  170, 188, 210, 200],   // ε (r?ng nh?t, s?ng nh?t)
  ];

  for (const [uCenter, halfWidth, r, g, b, aPeak] of rings) {
    const cx = uCenter * width;
    const sigma = halfWidth * width;
    const sigmaSq2 = 2 * sigma * sigma;

    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const gauss = Math.exp(-(dx * dx) / sigmaSq2);
      if (gauss < 0.01) continue;

      const i = x * 4;
      imgColor.data[i]   = Math.min(255, Math.max(imgColor.data[i],   r * gauss));
      imgColor.data[i+1] = Math.min(255, Math.max(imgColor.data[i+1], g * gauss));
      imgColor.data[i+2] = Math.min(255, Math.max(imgColor.data[i+2], b * gauss));

      imgAlpha.data[i]   = Math.min(255, Math.max(imgAlpha.data[i],   aPeak * gauss));
      imgAlpha.data[i+1] = Math.min(255, Math.max(imgAlpha.data[i+1], aPeak * gauss));
      imgAlpha.data[i+2] = Math.min(255, Math.max(imgAlpha.data[i+2], aPeak * gauss));
    }
  }

  ctxColor.putImageData(imgColor, 0, 0);
  ctxAlpha.putImageData(imgAlpha, 0, 0);

  const texColor = new THREE.CanvasTexture(canvasColor);
  const texAlpha = new THREE.CanvasTexture(canvasAlpha);
  texColor.wrapS = THREE.ClampToEdgeWrapping; texColor.wrapT = THREE.ClampToEdgeWrapping;
  texAlpha.wrapS = THREE.ClampToEdgeWrapping; texAlpha.wrapT = THREE.ClampToEdgeWrapping;

  return { colormap: texColor, alphamap: texAlpha };
}

/**
 * Texture th? t?c cho c?c h?nh tinh kh?c (fallback)
 */
function generateFallbackRingTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0.0, 'rgba(120, 120, 120, 0.0)');
  gradient.addColorStop(0.3, 'rgba(140, 140, 140, 0.15)');
  gradient.addColorStop(0.7, 'rgba(160, 160, 160, 0.10)');
  gradient.addColorStop(1.0, 'rgba(120, 120, 120, 0.0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

// ====================================================================
// Shared ring shader strings
// ====================================================================
const RING_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  uniform float uOuterRingEccentricity;
  void main() {
    vUv = uv;
    float dist = length(position.xy);
    float outerMask = smoothstep(0.92, 0.96, vUv.x) * (1.0 - smoothstep(0.99, 1.0, vUv.x));
    float angle = atan(position.y, position.x);
    float radialScale = 1.0 + outerMask * uOuterRingEccentricity * sin(angle + 0.5);
    vec3 deformedPos = vec3(position.x * radialScale, position.y * radialScale, position.z);
    vec4 worldPosition = modelMatrix * vec4(deformedPos, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(deformedPos, 1.0);
  }
`;

/**
 * T?o custom UV mapping cho ring geometry
 */
function applyRadialUV(geometry, innerR, outerR) {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const dist = Math.sqrt(x * x + y * y);
    uv.setXY(i, (dist - innerR) / (outerR - innerR), 0.5);
  }
  uv.needsUpdate = true;
}

/**
 * T?o shader material cho v?nh ?ai
 */
function createRingShaderMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: RING_VERTEX_SHADER,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform sampler2D uAlphaMap;
      uniform vec3 uSunPosition;
      uniform vec3 uPlanetPosition;
      uniform float uPlanetRadius;
      uniform vec3 uShadowColor;
      uniform float uAmbientIntensity;
      uniform vec3 uCameraPosition;
      uniform float uForwardScatterStrength;
      uniform float uBackScatterStrength;
      uniform vec3 uEmissionColor;
      uniform float uEmissionIntensity;
      uniform float uUVGlowStrength;
      uniform float uDistBoostStart;
      uniform float uDistBoostEnd;

      varying vec2 vUv;
      varying vec3 vWorldPosition;

      void main() {
        vec4 color = texture2D(uMap, vUv);
        float alpha = texture2D(uAlphaMap, vUv).r;

        // 1. Planet Shadow (Soft Edge)
        vec3 L = normalize(uSunPosition - vWorldPosition);
        vec3 P = vWorldPosition - uPlanetPosition;

        float t = dot(-P, L);
        float d2 = dot(P, P) - t * t;
        float shadow = 1.0;

        if (t > 0.0) {
          float r2 = uPlanetRadius * uPlanetRadius;
          float softEdge = smoothstep(r2, r2 * 0.98, d2);
          shadow = mix(1.0, uAmbientIntensity, softEdge);
        }

        // 2. Scattering & Phase Function
        vec3 V = normalize(uCameraPosition - vWorldPosition);
        float dotLV = dot(L, V);

        // Forward scattering (ng??c s?ng)
        float forward = pow(max(0.0, -dotLV), 4.0) * uForwardScatterStrength * (1.0 - alpha);
        // Back scattering (thu?n s?ng)
        float back = pow(max(0.0, dotLV), 2.0) * uBackScatterStrength;

        // 3. Shadow color tint
        vec3 shadedColor = mix(color.rgb * uShadowColor, color.rgb, shadow);

        // 4. Emission glow (gi�p v?nh nh�n th?y trong b�ng t?i)
        vec3 emission = uEmissionColor * uEmissionIntensity * alpha;

        // 5. UV fluorescence — vành b?ng n??c phát quang tia c?c tím
        float sunExposure = max(0.0, dot(L, normalize(P)));
        vec3 uvGlow = vec3(0.25, 0.18, 0.50) * uUVGlowStrength * sunExposure * alpha;

        // 6. Distance-based visibility boost (LOD)
        float camDist = length(uCameraPosition - vWorldPosition);
        float distBoost = clamp((camDist - uDistBoostStart) / (uDistBoostEnd - uDistBoostStart), 0.0, 1.0);
        float boostedAlpha = alpha * (1.0 + distBoost);

        vec3 finalColor = shadedColor + (forward + back) * color.rgb + emission + uvGlow;

        gl_FragColor = vec4(finalColor, boostedAlpha);
        if (gl_FragColor.a < 0.01) discard;
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

/**
 * T?o mesh v?nh ?ai cho h?nh tinh
 */
export function createRings(data, ringTextureAsset = null) {
  const ringConfig = data.rings;

  if (data.id === 'saturn') {
    // Phase 0: Render v?nh ?ai Sao Th? chu?n x?c
    const scaleFactor = 9.45 / 58232;
    const innerR = SATURN_RING_INNER_KM * scaleFactor;
    const outerR = SATURN_RING_OUTER_KM * scaleFactor;

    const geometry = new THREE.RingGeometry(innerR, outerR, 256, 4);
    applyRadialUV(geometry, innerR, outerR);

    const { colormap, alphamap } = generateSaturnRingTextures();

    const material = createRingShaderMaterial({
      uMap: { value: colormap },
      uAlphaMap: { value: alphamap },
      uSunPosition: { value: new THREE.Vector3(0, 0, 0) },
      uPlanetRadius: { value: data.radius },
      uPlanetPosition: { value: new THREE.Vector3(0, 0, 0) },
      uShadowColor: { value: new THREE.Color(0x050505) },
      uAmbientIntensity: { value: 0.15 },
      uCameraPosition: { value: new THREE.Vector3() },
      uForwardScatterStrength: { value: 0.6 },
      uBackScatterStrength: { value: 0.1 },
      uEmissionColor: { value: new THREE.Color(0x000000) },
      uEmissionIntensity: { value: 0.0 },
      uOuterRingEccentricity: { value: 0.0 },
      uUVGlowStrength: { value: 0.0 },
      uDistBoostStart: { value: 1e5 },
      uDistBoostEnd: { value: 1e5 },
    });

    const ringMesh = new THREE.Mesh(geometry, material);
    ringMesh.name = `${data.id}_rings`;
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.renderOrder = 1;
    ringMesh.castShadow = true;
    ringMesh.receiveShadow = true;

    ringMesh.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      alphaMap: alphamap,
      alphaTest: 0.05,
      side: THREE.DoubleSide
    });

    return ringMesh;
  }

  if (data.id === 'uranus') {
    // V?nh ?ai Sao Thi?n V??ng — ShaderMaterial v?i 13 v?nh v?t l?
    const innerR = data.radius * ringConfig.innerRadius;
    const outerR = data.radius * ringConfig.outerRadius;

    const geometry = new THREE.RingGeometry(innerR, outerR, 256, 4);
    // Custom UV: logarithmic mapping — v?nh trong c?n nhi?u texel h?n
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    const innerLog = Math.log(innerR);
    const outerLog = Math.log(outerR);
    const logRange = outerLog - innerLog;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const dist = Math.sqrt(x * x + y * y);
      const u = (Math.log(dist) - innerLog) / logRange;
      uv.setXY(i, u, 0.5);
    }
    uv.needsUpdate = true;

    const { colormap, alphamap } = generateUranusRingTextures();

    const material = createRingShaderMaterial({
      uMap: { value: colormap },
      uAlphaMap: { value: alphamap },
      uSunPosition: { value: new THREE.Vector3(0, 0, 0) },
      uPlanetRadius: { value: data.radius },
      uPlanetPosition: { value: new THREE.Vector3(0, 0, 0) },
      uShadowColor: { value: new THREE.Color(0x08081a) },
      uAmbientIntensity: { value: 0.35 },
      uCameraPosition: { value: new THREE.Vector3() },
      uForwardScatterStrength: { value: 1.2 },
      uBackScatterStrength: { value: 0.15 },
      uEmissionColor: { value: new THREE.Color(0x4488cc) },
      uEmissionIntensity: { value: 0.18 },
      uOuterRingEccentricity: { value: 0.02 },
      uUVGlowStrength: { value: 0.25 },
      uDistBoostStart: { value: 80 },
      uDistBoostEnd: { value: 300 },
    });

    const ringMesh = new THREE.Mesh(geometry, material);
    ringMesh.name = `${data.id}_rings`;
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.renderOrder = 1;
    ringMesh.castShadow = true;
    ringMesh.receiveShadow = true;

    ringMesh.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      alphaMap: alphamap,
      alphaTest: 0.03,
      side: THREE.DoubleSide
    });

    return ringMesh;
  }

  // Fallback cho c?c h?nh tinh kh?c (n?u c?)
  {
    const innerR = data.radius * ringConfig.innerRadius;
    const outerR = data.radius * ringConfig.outerRadius;

    const geometry = new THREE.RingGeometry(innerR, outerR, 128);
    applyRadialUV(geometry, innerR, outerR);

    const ringTexture = ringTextureAsset || generateFallbackRingTexture();

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

