import * as THREE from 'three';

const cloudVertexShader = /* glsl */`
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const cloudFragmentShader = /* glsl */`
  uniform vec3 uSunDirection;
  uniform float uTime;
  uniform float uOpacity;
  uniform vec2 uWindSpeed;

  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 1.0;
    float frequency = 1.0;
    float lacunarity = 2.0;
    float gain = 0.5;
    int octaves = 4;

    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p * frequency);
      frequency *= lacunarity;
      amplitude *= gain;
    }

    return value;
  }

  float cloudDensity(vec3 p) {
    vec3 drift = vec3(uWindSpeed * uTime, uTime * 0.01);
    vec3 q = p * 0.8 + drift;

    float base = fbm(q);
    float detail = noise(p * 2.0 + drift * 1.5) * 0.3;
    float density = base * 0.7 + detail;

    float latFade = 1.0 - abs(p.y / length(p));
    latFade = pow(latFade, 1.5);

    float coverage = smoothstep(0.3, 0.7, fbm(q * 0.5 + vec3(10.0, 5.0, 0.0)));
    density = density * coverage * latFade;

    float h = length(p);
    float heightFactor = 1.0 - smoothstep(0.99, 1.04, h);
    density *= heightFactor;

    return max(0.0, min(1.0, density));
  }

  void main() {
    vec3 dir = normalize(vPosition);
    vec3 sunDir = normalize(uSunDirection);

    float density = cloudDensity(vPosition);

    if (density < 0.02) discard;

    float fresnel = 1.0 - max(dot(vViewDir, vNormal), 0.0);
    float rimLight = pow(fresnel, 3.0);

    float sunAngle = max(dot(vNormal, sunDir), 0.0);
    float sunAngleBack = max(0.0, -dot(vViewDir, sunDir));

    float silverLining = pow(sunAngleBack, 2.0) * rimLight * 0.6;

    vec3 cloudColor = vec3(0.95, 0.95, 1.0);
    vec3 shadowColor = vec3(0.35, 0.38, 0.45);
    vec3 rimColor = vec3(1.0, 0.95, 0.8);

    float shadow = mix(0.5, 1.0, sunAngle);
    shadow = mix(shadow, 1.0, rimLight * 0.3);

    vec3 finalColor = mix(shadowColor, cloudColor, density);
    finalColor += rimColor * silverLining * 2.0;
    finalColor += vec3(0.9, 0.7, 0.3) * rimLight * sunAngleBack * 0.3;

    float alpha = density * uOpacity;
    alpha *= 0.7 + 0.3 * (1.0 - rimLight);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

export function createVolumetricClouds(planetRadius, config) {
  const geometry = new THREE.SphereGeometry(1, 64, 64);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(0, 0, 1) },
      uTime: { value: 0 },
      uOpacity: { value: config.opacity ?? 0.4 },
      uWindSpeed: { value: new THREE.Vector2(0.02, 0.005) },
    },
    vertexShader: cloudVertexShader,
    fragmentShader: cloudFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'volumetric_clouds';

  const scale = planetRadius * 1.01;
  mesh.scale.set(scale, scale, scale);
  mesh.userData.isVolumetricCloud = true;

  return mesh;
}
