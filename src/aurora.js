import * as THREE from 'three';

const auroraVertexShader = /* glsl */`
  uniform float uTime;

  varying vec3 vPosition;
  varying float vHeight;
  varying float vAngle;

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

  void main() {
    vHeight = uv.y;
    vAngle = uv.x;

    vec3 pos = position;

    float curtainNoise = noise(vec3(pos.x * 0.3, pos.y * 0.5, uTime * 0.08));
    float wave1 = sin(pos.y * 2.0 + pos.x * 0.5 + uTime * 0.4) * 0.3;
    float wave2 = sin(pos.y * 3.0 - pos.x * 0.3 + uTime * 0.25) * 0.2;
    float displacement = (curtainNoise * 2.0 - 1.0) * 0.4 + wave1 + wave2;

    vec3 displaced = pos + normal * displacement;

    vPosition = displaced;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const auroraFragmentShader = /* glsl */`
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uSolarWind;

  varying vec3 vPosition;
  varying float vHeight;
  varying float vAngle;

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

  void main() {
    float heightFade = 1.0 - vHeight;
    heightFade = heightFade * heightFade;

    float windSpeed = 1.0 + uSolarWind * 0.5;
    float windBright = 0.5 + 0.5 * uSolarWind;

    float bandNoise = noise(vec3(vAngle * 4.0, vHeight * 2.0, uTime * 0.05 * windSpeed));
    float band = smoothstep(0.2, 0.6, bandNoise);

    float streakNoise = noise(vec3(vAngle * 8.0, vHeight * 4.0 + uTime * 0.02 * windSpeed, uTime * 0.03 * windSpeed));
    float streaks = smoothstep(0.3, 0.7, streakNoise);

    float curtain = noise(vec3(vAngle * 3.0 + uTime * 0.04 * windSpeed, vHeight * 3.0, uTime * 0.06 * windSpeed));
    float curtainMask = smoothstep(0.25, 0.55, curtain);

    vec3 color = mix(uColor1, uColor2, band);
    color += vec3(0.2, 0.1, 0.3) * streaks * 0.3;

    float alpha = band * curtainMask * heightFade * uIntensity * windBright;
    alpha *= 0.5 + 0.5 * sin(vAngle * 5.0 + uTime * 0.1 * windSpeed + vHeight * 2.0);

    alpha = clamp(alpha, 0.0, 1.0);

    float pulse = 0.85 + 0.15 * sin(uTime * 0.2 * windSpeed + vAngle * 2.0);
    alpha *= pulse;

    gl_FragColor = vec4(color, alpha);
  }
`;

function createAuroraBand(radius, azimuthSteps, heightSteps, latitudeStart, latitudeEnd, side) {
  const sign = side === 'north' ? 1 : -1;
  const vertices = [];
  const uvs = [];
  const indices = [];

  for (let j = 0; j <= heightSteps; j++) {
    const t = j / heightSteps;
    const lat = latitudeStart + (latitudeEnd - latitudeStart) * t;
    const latRad = THREE.MathUtils.degToRad(lat);

    for (let i = 0; i <= azimuthSteps; i++) {
      const phi = (i / azimuthSteps) * Math.PI * 2;
      const r = radius * Math.cos(latRad);
      const y = radius * Math.sin(latRad) * sign;
      const x = r * Math.cos(phi);
      const z = r * Math.sin(phi);

      vertices.push(x, y, z);
      uvs.push(i / azimuthSteps, t);
    }
  }

  for (let j = 0; j < heightSteps; j++) {
    for (let i = 0; i < azimuthSteps; i++) {
      const a = j * (azimuthSteps + 1) + i;
      const b = a + azimuthSteps + 1;

      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

export function createAurora(radius, planetId) {
  if (planetId !== 'earth') return null;

  const group = new THREE.Group();
  group.name = 'aurora';

  const configs = [
    { color1: '#00ff66', color2: '#00ccff', intensity: 0.6 },
    { color1: '#ff3366', color2: '#6600ff', intensity: 0.4 },
  ];

  const azimuthSteps = 64;
  const heightSteps = 16;
  const auroraRadius = radius * 1.08;

  for (const side of ['north', 'south']) {
    const latStart = side === 'north' ? 65 : -75;
    const latEnd = side === 'north' ? 75 : -65;

    for (let ci = 0; ci < configs.length; ci++) {
      const cfg = configs[ci];
      const geo = createAuroraBand(
        auroraRadius, azimuthSteps, heightSteps,
        Math.min(latStart, latEnd), Math.max(latStart, latEnd), side
      );

      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uColor1: { value: new THREE.Color(cfg.color1) },
          uColor2: { value: new THREE.Color(cfg.color2) },
          uTime: { value: 0 },
          uIntensity: { value: cfg.intensity },
          uSolarWind: { value: 0.5 },
        },
        vertexShader: auroraVertexShader,
        fragmentShader: auroraFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `aurora_${side}_${ci}`;
      mesh.userData.isAurora = true;
      mesh.userData.side = side;

      if (side === 'south') {
        mesh.rotation.x = Math.PI;
      }

      group.add(mesh);
    }
  }

  return group;
}
