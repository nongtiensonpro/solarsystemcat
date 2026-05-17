import * as THREE from 'three';

const atmosphereVertexShader = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vViewDir = normalize(cameraPosition - worldPosition.xyz);
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmosphereFragmentShader = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uPower;
  uniform vec3 uSunDirection;
  uniform float uTime;
  uniform float uScatterStrength;

  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    float fresnel = 1.0 - max(dot(vViewDir, vNormal), 0.0);
    float intensity = pow(fresnel, uPower);

    vec3 sunDir = normalize(uSunDirection);

    float scatterAngle = dot(vViewDir, sunDir);
    float scatterBacklight = max(0.0, -scatterAngle);
    float scatterIntensity = pow(scatterBacklight, 2.0);

    vec3 scatterColor = mix(
      vec3(0.3, 0.6, 1.0),
      vec3(1.0, 0.6, 0.3),
      scatterIntensity * 0.3
    ) * scatterIntensity * uScatterStrength;

    vec3 finalColor = mix(uColor, scatterColor, smoothstep(0.0, 0.5, scatterIntensity));
    float pulse = 0.97 + 0.03 * sin(uTime * 0.3 + fresnel * 2.0);
    float alpha = intensity * uOpacity * pulse;

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

export function createAtmosphere(planetRadius, config) {
  const { color, opacity, power } = config;

  const geometry = new THREE.SphereGeometry(1, 64, 64);
  const material = new THREE.ShaderMaterial({
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uPower: { value: power },
      uSunDirection: { value: new THREE.Vector3(0, 0, 1) },
      uTime: { value: 0 },
      uScatterStrength: { value: 0.4 },
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'atmosphere';
  const scale = planetRadius * 1.05;
  mesh.scale.set(scale, scale, scale);
  mesh.userData.baseOpacity = opacity;
  mesh.userData.isAtmosphere = true;

  return mesh;
}

export function createAtmosphereLayers(planetRadius, layers) {
  const meshes = [];

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const geometry = new THREE.SphereGeometry(1, 64, 64);
    const material = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      uniforms: {
        uColor: { value: new THREE.Color(layer.color) },
        uOpacity: { value: layer.opacity },
        uPower: { value: layer.power },
        uSunDirection: { value: new THREE.Vector3(0, 0, 1) },
        uTime: { value: 0 },
        uScatterStrength: { value: layer.scatterStrength ?? 0.4 },
      },
      side: layer.side === 'front' ? THREE.FrontSide : THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `atmosphere_layer_${i}`;
    const s = planetRadius * layer.scale;
    mesh.scale.set(s, s, s);
    mesh.userData.baseOpacity = layer.opacity;
    mesh.userData.isAtmosphere = true;
    mesh.userData.layerIndex = i;

    meshes.push(mesh);
  }

  return meshes;
}
