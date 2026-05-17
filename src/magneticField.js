import * as THREE from 'three';

const fieldLineVertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fieldLineFragmentShader = /* glsl */`
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;

  varying vec2 vUv;

  void main() {
    float flow = fract(vUv.x * 8.0 - uTime * 0.4);
    float line = 1.0 - smoothstep(0.0, 0.3, abs(flow - 0.5) * 2.0 - 0.3);
    float fade = sin(vUv.x * 3.14159);
    float alpha = line * fade * uOpacity;
    alpha *= 0.7 + 0.3 * sin(uTime * 1.5 + vUv.x * 10.0);
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const magnetosphereVertexShader = /* glsl */`
  uniform vec3 uSunDirection;
  uniform float uTime;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vDeform;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    vNormal = normalize(normalMatrix * normal);

    vec3 dir = normalize(position);
    float sunDot = dot(dir, uSunDirection);

    float daysideCompress = 0.65;
    float nightsideStretch = 1.8;
    float smoothEdge = smoothstep(-0.3, 0.3, sunDot);

    float deform = mix(nightsideStretch, daysideCompress, smoothEdge);
    float pulse = 1.0 + 0.02 * sin(uTime * 0.3 + sunDot * 2.0);
    vDeform = deform * pulse;

    vec3 deformed = position * vDeform;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(deformed, 1.0);
  }
`;

const magnetosphereFragmentShader = /* glsl */`
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vDeform;

  void main() {
    float fresnel = 1.0 - max(dot(vViewDir, vNormal), 0.0);
    float intensity = pow(fresnel, 2.5);

    float stripes = sin(vDeform * 4.0 + uTime * 0.2) * 0.5 + 0.5;
    stripes = smoothstep(0.3, 0.8, stripes);

    float alpha = intensity * uOpacity * (0.5 + 0.5 * stripes);
    alpha *= 0.6 + 0.4 * sin(uTime * 0.5 + vDeform);

    gl_FragColor = vec4(uColor, alpha);
  }
`;

function createDipoleFieldLinePoints(L, azimuth, numPoints, radius) {
  const points = [];
  const phi = azimuth;
  const steps = numPoints;

  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    const r = L * sinT * sinT;

    const x = r * sinT * Math.cos(phi);
    const y = r * cosT;
    const z = r * sinT * Math.sin(phi);

    points.push(new THREE.Vector3(x * radius, y * radius, z * radius));
  }

  return points;
}

function createFieldLineSet(radius, L, azimuths, color) {
  const group = new THREE.Group();
  const numPoints = 48;

  for (const phi of azimuths) {
    const pts = createDipoleFieldLinePoints(L, phi, numPoints, radius);
    const geometry = new THREE.BufferGeometry().setFromPoints(pts);

    const positions = geometry.attributes.position.array;
    const uvs = new Float32Array((numPoints + 1) * 2);
    for (let i = 0; i <= numPoints; i++) {
      uvs[i * 2] = i / numPoints;
      uvs[i * 2 + 1] = 0.5;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uTime: { value: 0 },
        uOpacity: { value: 0.6 },
      },
      vertexShader: fieldLineVertexShader,
      fragmentShader: fieldLineFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const line = new THREE.Line(geometry, material);
    group.add(line);
  }

  return group;
}

function createMagnetosphereShell(radius, color) {
  const geometry = new THREE.SphereGeometry(radius * 4.0, 48, 48);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(0, 0, 1) },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0.15 },
    },
    vertexShader: magnetosphereVertexShader,
    fragmentShader: magnetosphereFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'magnetosphere_shell';
  return mesh;
}

export function createMagneticField(radius, planetId) {
  let config = null;

  if (planetId === 'earth') {
    config = {
      strength: 1.0,
      color: 0x4488ff,
      fieldLineColor: '#4488ff',
      shellColor: 0x4488ff,
      LOuter: 2.5,
      LInner: 1.5,
      shellOpacity: 0.15,
    };
  } else {
    return null;
  }

  const group = new THREE.Group();
  group.name = `${planetId}_magnetic_system`;

  const shell = createMagnetosphereShell(radius, config.shellColor);
  group.add(shell);

  const outerAzimuths = [];
  const innerAzimuths = [];
  for (let i = 0; i < 8; i++) {
    outerAzimuths.push((i / 8) * Math.PI * 2);
    innerAzimuths.push((i / 8 + 0.0625) * Math.PI * 2);
  }

  const outerLines = createFieldLineSet(radius, config.LOuter, outerAzimuths, config.fieldLineColor);
  const innerLines = createFieldLineSet(radius, config.LInner, innerAzimuths, config.fieldLineColor);
  group.add(outerLines);
  group.add(innerLines);

  group.userData.isMagneticSystem = true;
  group.userData.planetId = planetId;
  group.userData.magnetosphereShell = shell;
  group.userData.fieldLines = [outerLines, innerLines];

  return group;
}
