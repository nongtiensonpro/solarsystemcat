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
  uniform float uSolarWind;

  varying vec2 vUv;

  void main() {
    float flow = fract(vUv.x * 8.0 - uTime * 0.4);
    float line = 1.0 - smoothstep(0.0, 0.3, abs(flow - 0.5) * 2.0 - 0.3);
    float fade = sin(vUv.x * 3.14159);
    float windPulse = 0.8 + 0.2 * uSolarWind;
    float alpha = line * fade * uOpacity * windPulse;
    alpha *= 0.7 + 0.3 * sin(uTime * 1.5 + vUv.x * 10.0);
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const magnetosphereVertexShader = /* glsl */`
  uniform vec3 uSunDirection;
  uniform float uTime;
  uniform float uSolarWind;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vDeform;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    vNormal = normalize(normalMatrix * normal);

    vec3 dir = normalize(position);
    float sunDot = dot(dir, uSunDirection);

    float windFactor = 0.6 + 0.4 * uSolarWind;
    float daysideCompress = 0.75 - 0.15 * windFactor;
    float nightsideStretch = 1.5 + 0.4 * windFactor;
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
  uniform float uSolarWind;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vDeform;

  void main() {
    float fresnel = 1.0 - max(dot(vViewDir, vNormal), 0.0);
    float intensity = pow(fresnel, 2.5);

    float windBright = 0.7 + 0.3 * uSolarWind;
    float stripes = sin(vDeform * 4.0 + uTime * 0.2 + uSolarWind * 2.0) * 0.5 + 0.5;
    stripes = smoothstep(0.3, 0.8, stripes);

    float alpha = intensity * uOpacity * (0.5 + 0.5 * stripes) * windBright;
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

function createFieldLineSet(radius, L, azimuths, color, opacity) {
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
        uOpacity: { value: opacity ?? 0.6 },
        uSolarWind: { value: 0.5 },
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

function createMagnetosphereShell(radius, config) {
  const baseRadius = radius * (config.shellSize ?? 4.0);
  const geometry = new THREE.SphereGeometry(baseRadius, 48, 48);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(0, 0, 1) },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(config.color) },
      uOpacity: { value: config.shellOpacity ?? 0.15 },
      uSolarWind: { value: 0.5 },
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
  const configs = {
    mercury: {
      strength: 0.15,
      color: 0xffaa66,
      fieldLineColor: '#ffaa66',
      LOuter: 1.8,
      LInner: 1.3,
      shellOpacity: 0.06,
      shellSize: 1.8,
      lineOpacity: 0.3,
    },
    earth: {
      strength: 1.0,
      color: 0x4488ff,
      fieldLineColor: '#4488ff',
      LOuter: 2.5,
      LInner: 1.5,
      shellOpacity: 0.15,
      shellSize: 4.0,
      lineOpacity: 0.6,
    },
    mars: {
      isCrustal: true,
      strength: 0.6,
      color: 0xff4422,
      fieldLineColor: '#ff4422',
      LOuter: 1.3,
      LInner: 1.1,
      shellOpacity: 0.05,
      shellSize: 1.3,
      lineOpacity: 0.3,
    },
    jupiter: {
      strength: 2.0,
      color: 0x88bbff,
      fieldLineColor: '#88bbff',
      LOuter: 3.0,
      LInner: 2.0,
      shellOpacity: 0.12,
      shellSize: 6.0,
      lineOpacity: 0.5,
    },
    saturn: {
      strength: 0.8,
      color: 0xffcc66,
      fieldLineColor: '#ffcc66',
      LOuter: 2.8,
      LInner: 1.8,
      shellOpacity: 0.10,
      shellSize: 5.0,
      lineOpacity: 0.4,
    },
    uranus: {
      strength: 0.4,
      color: 0x66ddcc,
      fieldLineColor: '#66ddcc',
      LOuter: 2.2,
      LInner: 1.5,
      shellOpacity: 0.08,
      shellSize: 3.0,
      lineOpacity: 0.35,
    },
    neptune: {
      strength: 0.3,
      color: 0x4488ff,
      fieldLineColor: '#4488ff',
      LOuter: 2.2,
      LInner: 1.5,
      shellOpacity: 0.08,
      shellSize: 3.0,
      lineOpacity: 0.35,
    },
  };

  const config = configs[planetId];
  if (!config) return null;

  const group = new THREE.Group();
  group.name = `${planetId}_magnetic_system`;

  if (!config.isCrustal) {
    const shell = createMagnetosphereShell(radius, config);
    group.add(shell);
    group.userData.magnetosphereShell = shell;

    const outerAzimuths = [];
    const innerAzimuths = [];
    for (let i = 0; i < 8; i++) {
      outerAzimuths.push((i / 8) * Math.PI * 2);
      innerAzimuths.push((i / 8 + 0.0625) * Math.PI * 2);
    }

    const outerLines = createFieldLineSet(radius, config.LOuter, outerAzimuths, config.fieldLineColor, config.lineOpacity);
    const innerLines = createFieldLineSet(radius, config.LInner, innerAzimuths, config.fieldLineColor, config.lineOpacity);
    group.add(outerLines);
    group.add(innerLines);
    group.userData.fieldLines = [outerLines, innerLines];
  }

  group.userData.isMagneticSystem = true;
  group.userData.planetId = planetId;

  return group;
}
