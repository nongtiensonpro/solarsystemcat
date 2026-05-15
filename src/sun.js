import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════
// Sun Surface Shader — Nâng cấp Phase 1
// Mô phỏng: Granulation (ô đối lưu Rayleigh-Bénard), vết đen,
// dao động tự cân bằng nhiệt hạch, multi-band plasma flow
// ═══════════════════════════════════════════════════════════════

const sunSurfaceVertexShader = /* glsl */`
  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vPosition = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const sunSurfaceFragmentShader = /* glsl */`
  uniform sampler2D uAlbedo;
  uniform float uTime;
  uniform float uSelfRegFactor;  // Hệ số tự cân bằng nhiệt hạch [0.95-1.05]

  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  // ──── Simplex-style 3D noise (GPU-friendly) ────
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  // ──── Fractal Brownian Motion (FBM) cho granulation ────
  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 5; i++) {
      value += amplitude * snoise(p * frequency);
      amplitude *= 0.5;
      frequency *= 2.0;
    }
    return value;
  }

  // ──── Granulation: Ô đối lưu Rayleigh-Bénard ────
  float granulation(vec2 uv, float time) {
    vec3 p = vec3(uv * 38.0, time * 0.15);
    float cells = snoise(p) * 0.5 + 0.5;
    // Tạo viền tối giữa các ô (intergranular lanes)
    float edges = 1.0 - smoothstep(0.35, 0.55, cells);
    return mix(0.85, 1.15, cells) - edges * 0.12;
  }

  // ──── Sunspots: Vết đen mặt trời ────
  float sunspot(vec2 uv, float time) {
    // 2-3 vết đen di chuyển chậm
    float spot = 0.0;
    vec2 center1 = vec2(0.3 + sin(time * 0.02) * 0.1, 0.45 + cos(time * 0.015) * 0.05);
    vec2 center2 = vec2(0.7 + cos(time * 0.018) * 0.08, 0.55 + sin(time * 0.025) * 0.04);
    vec2 center3 = vec2(0.5 + sin(time * 0.012 + 2.0) * 0.12, 0.35 + cos(time * 0.02 + 1.5) * 0.06);

    float d1 = length(uv - center1);
    float d2 = length(uv - center2);
    float d3 = length(uv - center3);

    // Umbra (tâm tối) + Penumbra (vòng ngoài ít tối hơn)
    spot += (1.0 - smoothstep(0.008, 0.025, d1)) * 0.55;  // Umbra
    spot += (1.0 - smoothstep(0.025, 0.045, d1)) * 0.25;   // Penumbra
    spot += (1.0 - smoothstep(0.006, 0.020, d2)) * 0.50;
    spot += (1.0 - smoothstep(0.020, 0.035, d2)) * 0.20;
    spot += (1.0 - smoothstep(0.004, 0.015, d3)) * 0.45;
    spot += (1.0 - smoothstep(0.015, 0.028, d3)) * 0.18;

    return clamp(spot, 0.0, 0.7);
  }

  void main() {
    vec2 uv = vUv;

    // ──── Dòng plasma đa tần số (multi-band flow) ────
    float flow1 = sin(uv.y * 28.0 + uTime * 0.55) * 0.006;
    float flow2 = cos((uv.x + uv.y) * 18.0 - uTime * 0.38) * 0.004;
    float flow3 = sin(uv.x * 35.0 + uv.y * 12.0 + uTime * 0.25) * 0.003;
    uv.x += flow1 + flow3;
    uv.y += flow2;

    // ──── Texture cơ sở ────
    vec4 texColor = texture2D(uAlbedo, uv);

    // ──── Granulation (ô đối lưu sôi sục) ────
    float gran = granulation(vUv, uTime);

    // ──── Vết đen Mặt Trời ────
    float spots = sunspot(vUv, uTime);

    // ──── FBM turbulence cho dòng plasma ────
    vec3 noiseCoord = vec3(vUv * 6.0, uTime * 0.08);
    float turb = fbm(noiseCoord) * 0.12 + 1.0;

    // ──── Dao động tự cân bằng nhiệt hạch ────
    float pulse = uSelfRegFactor;
    // Thêm micro-pulse cho hiệu ứng sống động
    pulse *= 1.0 + sin(uTime * 1.7 + uv.y * 12.0) * 0.04;

    // ──── Tổng hợp màu ────
    vec3 hotTint = vec3(4.0, 3.2, 2.2); // Đủ vượt bloomThreshold (2.0-3.0) nhưng không bị chói
    vec3 baseColor = texColor.rgb * hotTint * pulse;

    // Áp dụng granulation
    baseColor *= gran * turb;

    // Áp dụng vết đen (làm tối vùng spot)
    baseColor *= (1.0 - spots);

    // Limb darkening (rìa tối hơn tâm — hiệu ứng vật lý thực)
    float limbFactor = max(dot(vViewDir, vNormal), 0.0);
    float limbDarkening = 0.55 + 0.45 * pow(limbFactor, 0.6);
    baseColor *= limbDarkening;

    gl_FragColor = vec4(baseColor, 1.0);
  }
`;

// ═══════════════════════════════════════════════════════════════
// Corona Shader — Cải tiến với prominences và chromosphere
// ═══════════════════════════════════════════════════════════════

const sunCoronaVertexShader = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xyz;
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const sunCoronaFragmentShader = /* glsl */`
  uniform vec3 uInnerColor;
  uniform vec3 uOuterColor;
  uniform vec3 uChromosphereColor;
  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  // Simplified noise for prominences
  float hash(float n) { return fract(sin(n) * 43758.5453123); }
  float noise(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n = p.x + p.y * 57.0 + 113.0 * p.z;
    return mix(mix(mix(hash(n), hash(n+1.0), f.x),
                   mix(hash(n+57.0), hash(n+58.0), f.x), f.y),
               mix(mix(hash(n+113.0), hash(n+114.0), f.x),
                   mix(hash(n+170.0), hash(n+171.0), f.x), f.y), f.z);
  }

  void main() {
    float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
    float corona = pow(rim, 1.55);

    // ──── Chromosphere (sắc quyển) — lớp mỏng sát bề mặt ────
    float chromosphere = pow(rim, 8.0) * 2.5;
    vec3 chromoColor = uChromosphereColor * chromosphere;

    // ──── Filaments (sợi từ trường) ────
    float filament = sin(vUv.y * 42.0 + uTime * 0.7) * 0.5 + 0.5;
    float filament2 = sin(vUv.x * 30.0 + vUv.y * 15.0 - uTime * 0.5) * 0.5 + 0.5;
    float filamentCombined = mix(filament, filament2, 0.3);

    // ──── Prominences (tia lửa phóng ra) ────
    vec3 noisePos = vec3(vUv * 8.0, uTime * 0.15);
    float prom = noise(noisePos);
    float prominenceStrength = pow(rim, 2.0) * smoothstep(0.55, 0.85, prom) * 1.8;

    // ──── Dao động tổng thể ────
    float flicker = 0.85 + 0.15 * sin(uTime * 2.3 + filamentCombined * 3.14159);

    // ──── Tổng hợp màu corona ────
    vec3 color = mix(uInnerColor, uOuterColor, smoothstep(0.25, 1.0, corona));

    // Thêm prominences (cam-đỏ sáng)
    vec3 promColor = vec3(1.0, 0.4, 0.1) * prominenceStrength;

    float alpha = corona * (0.46 + filamentCombined * 0.18) * flicker;
    alpha += prominenceStrength * 0.3;

    vec3 finalColor = (color * (1.4 + corona * 1.8) + chromoColor + promColor) * 3.0; // Giảm bớt chói

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// ═══════════════════════════════════════════════════════════════
// Chromosphere Layer — Lớp sắc quyển riêng biệt (đỏ-hồng)
// ═══════════════════════════════════════════════════════════════

const chromosphereVertexShader = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const chromosphereFragmentShader = /* glsl */`
  uniform float uTime;
  uniform vec3 uColor;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
    // Sắc quyển chỉ hiện ở rìa rất mỏng
    float intensity = pow(rim, 5.0) * (1.0 - pow(rim, 2.0));
    float flicker = 0.9 + 0.1 * sin(uTime * 3.0 + vUv.y * 20.0);
    intensity *= flicker * 3.0;

    gl_FragColor = vec4(uColor * intensity * 5.0, intensity * 0.7); // Điều chỉnh sáng vừa phải
  }
`;

// ═══════════════════════════════════════════════════════════════
// Export Functions
// ═══════════════════════════════════════════════════════════════

export function createSunSurfaceMaterial(albedoTexture, fallbackColor) {
  if (!albedoTexture) {
    return new THREE.MeshBasicMaterial({ color: fallbackColor || 0xffffff });
  }

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uAlbedo: { value: albedoTexture },
      uTime: { value: 0 },
      uSelfRegFactor: { value: 1.0 },
    },
    vertexShader: sunSurfaceVertexShader,
    fragmentShader: sunSurfaceFragmentShader,
  });

  material.userData.isSunSurfaceShader = true;
  return material;
}

export function createSunCorona(radius, oblateness = 0) {
  const geometry = new THREE.SphereGeometry(1.14, 96, 96);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uInnerColor: { value: new THREE.Color(0xffd36a) },
      uOuterColor: { value: new THREE.Color(0xff6a1a) },
      uChromosphereColor: { value: new THREE.Color(0xff2244) }, // Đỏ-hồng đặc trưng H-alpha
      uTime: { value: 0 },
    },
    vertexShader: sunCoronaVertexShader,
    fragmentShader: sunCoronaFragmentShader,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  material.userData.isSunCoronaShader = true;

  const coronaMesh = new THREE.Mesh(geometry, material);
  coronaMesh.name = 'sun_corona';
  coronaMesh.scale.set(radius, radius * (1 - oblateness), radius);
  return coronaMesh;
}

/**
 * Tạo lớp sắc quyển (chromosphere) — lớp mỏng đỏ-hồng sát bề mặt
 * Nằm giữa quang quyển và corona
 */
export function createChromosphere(radius, oblateness = 0) {
  const geometry = new THREE.SphereGeometry(1.005, 80, 80);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xff3355) }, // H-alpha emission color
    },
    vertexShader: chromosphereVertexShader,
    fragmentShader: chromosphereFragmentShader,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  material.userData.isSunChromosphereShader = true;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'sun_chromosphere';
  mesh.scale.set(radius, radius * (1 - oblateness), radius);
  return mesh;
}
