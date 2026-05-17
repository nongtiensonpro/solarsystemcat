import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════
// Sun Surface Shader — Photosphere (Độ sáng đồng nhất & Không burn-out)
// ═══════════════════════════════════════════════════════════════

const sunSurfaceVertexShader = /* glsl */`
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const sunSurfaceFragmentShader = /* glsl */`
  uniform sampler2D uAlbedo;
  uniform float uTime;
  uniform float uSelfRegFactor;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

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

  void main() {
    vec2 uv = vUv;
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 normal = normalize(vWorldNormal);

    // ──── Limb Darkening ────
    float mu = max(dot(viewDir, normal), 0.0);
    float darkening = 0.4 + 0.6 * mu;

    // ──── Granulation (0.75 - 0.92 range) ────
    float rawNoise = snoise(vec3(vUv * 45.0, uTime * 0.12));
    float gran = mix(0.75, 0.92, rawNoise * 0.5 + 0.5);

    // ──── Photosphere Colors (Warm & Uniform) ────
    // Dùng tông màu vàng ấm đồng nhất hơn
    vec3 coreColor = vec3(0.95, 0.90, 0.70);
    vec3 edgeColor = vec3(0.85, 0.40, 0.05);
    vec3 sunBaseColor = mix(edgeColor, coreColor, pow(mu, 0.4));

    // ──── Texture Sampling & Clamping ────
    vec4 texColor = texture2D(uAlbedo, uv);
    vec3 clampedTex = min(texColor.rgb, vec3(0.92));
    
    float exposure = 1.0 + 0.4 * uSelfRegFactor;
    vec3 finalColor = sunBaseColor * clampedTex * gran * exposure * darkening;

    // ──── Final Cap: Giữ màu warm-yellow, tránh wash out ────
    finalColor = min(finalColor * 1.8, vec3(0.95, 0.90, 0.75));

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// ═══════════════════════════════════════════════════════════════
// Corona Billboard Shader — Zero geometry, pure screen-space
// Dùng PlaneGeometry billboard thay vì SphereGeometry → zero ring artifact
// ═══════════════════════════════════════════════════════════════

const coronaBillboardVertexShader = /* glsl */`
  uniform float uCoronaRadius;

  varying vec2 vCoronaUV;

  void main() {
    // Billboard: quad luôn quay mặt về camera
    vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 viewDir = normalize(cameraPosition - center);
    vec3 up = abs(viewDir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 right = normalize(cross(viewDir, up));
    up = normalize(cross(right, viewDir));

    float scale = uCoronaRadius;
    vec3 worldPos = center + (position.x * right + position.y * up) * scale;

    // Corona UV: (0,0) center, (1,1) corner
    vCoronaUV = uv;

    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
  }
`;

const coronaBillboardFragmentShader = /* glsl */`
  uniform vec3 uInnerColor;
  uniform vec3 uMidColor;
  uniform vec3 uOuterColor;
  uniform float uIntensity;
  uniform float uTime;

  varying vec2 vCoronaUV;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * valueNoise(p);
      p *= 2.1;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // UV: (0,0) = góc, center = 0.5, remap về [-1, 1]
    vec2 centered = vCoronaUV * 2.0 - 1.0;
    float dist = length(centered);

    // r = 0 tại tâm corona, 1 tại rìa
    float r = dist;
    if (r > 1.0) discard;

    // Mask vùng trung tâm (nơi bề mặt mặt trời che khuất)
    // Corona chỉ visible từ r > 0.08 (~bán kính photosphere trên billboard)
    float sunMask = 1.0 - smoothstep(0.0, 0.12, r);

    // Noise distortion — chỉ outer edge (r > 0.2)
    vec2 noiseUV = centered * 3.5 + uTime * 0.04;
    float n = fbm(noiseUV);
    float edgeMask = smoothstep(0.2, 0.8, r);
    r += (n - 0.5) * 0.18 * edgeMask;
    r = clamp(r, 0.0, 1.0);

    // Multi-Exponential Falloff — một curve liên tục, zero discontinuity
    float alpha = exp(-5.0 * r) * 0.7
                + exp(-2.0 * r) * 0.3
                + exp(-0.5 * r) * 0.05;
    // Mask out the sun center: corona không đè lên bề mặt mặt trời
    alpha *= (1.0 - sunMask);
    alpha *= uIntensity;

    if (alpha < 0.005) discard;

    // Color gradient
    vec3 color = mix(uOuterColor, uMidColor, smoothstep(0.0, 0.4, r));
    color = mix(color, uInnerColor, smoothstep(0.3, 0.8, r));

    // Streamers
    float streamer = fbm(noiseUV * 1.5 + 0.5) * 0.15;
    color += vec3(streamer * 0.9, streamer * 0.4, 0.0);

    gl_FragColor = vec4(color, alpha);
  }
`;

// ═══════════════════════════════════════════════════════════════
// Chromosphere & Exports
// ═══════════════════════════════════════════════════════════════

const chromosphereVertexShader = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const chromosphereFragmentShader = /* glsl */`
  uniform float uTime;
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float rim = 1.0 - abs(dot(vNormal, normalize(vViewDir)));
    // Mềm hơn: giảm exponent từ 15 → 8, fade mượt
    float intensity = pow(rim, 8.0) * (1.0 - pow(rim, 3.0));
    float pulse = 0.96 + 0.04 * sin(uTime * 0.4);
    gl_FragColor = vec4(uColor * intensity * 3.0 * pulse, intensity * 0.4 * pulse);
  }
`;

export function createSunSurfaceMaterial(albedoTexture, fallbackColor) {
  if (!albedoTexture) return new THREE.MeshBasicMaterial({ color: fallbackColor || 0xffffff });
  const material = new THREE.ShaderMaterial({
    uniforms: { uAlbedo: { value: albedoTexture }, uTime: { value: 0 }, uSelfRegFactor: { value: 1.0 } },
    vertexShader: sunSurfaceVertexShader,
    fragmentShader: sunSurfaceFragmentShader,
  });
  material.userData.isSunSurfaceShader = true;
  return material;
}

/**
 * Corona Billboard — Zero sphere geometry, pure screen-space billboard
 * PlaneGeometry + billboard shader → tuyệt đối không có ring artifact
 * @param {number} radius Sun radius in world units
 * @param {number} _oblateness Unused (billboard không bị ảnh hưởng bởi oblateness)
 * @returns {THREE.Mesh}
 */
export function createUnifiedCorona(radius, _oblateness = 0) {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uInnerColor:   { value: new THREE.Color(0xfff5cc) },
      uMidColor:     { value: new THREE.Color(0xff8c22) },
      uOuterColor:   { value: new THREE.Color(0xe64400) },
      uIntensity:    { value: 0.55 },
      uTime:         { value: 0 },
      uCoronaRadius: { value: radius * 3.0 },
    },
    vertexShader: coronaBillboardVertexShader,
    fragmentShader: coronaBillboardFragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  material.userData.isSunUnifiedCorona = true;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'sun_unified_corona';
  mesh.renderOrder = -1;
  return mesh;
}

export function createChromosphere(radius, oblateness = 0) {
  const geometry = new THREE.SphereGeometry(1.005, 80, 80);
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xffaa44) } }, 
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
