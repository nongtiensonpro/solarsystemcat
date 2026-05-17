import * as THREE from 'three';

const atmosphereVertexShader = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xyz;
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

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  float rayleighPhase(float cosTheta) {
    return 0.75 * (1.0 + cosTheta * cosTheta);
  }

  float miePhase(float cosTheta, float g) {
    float gg = g * g;
    return (1.0 - gg) / pow(1.0 + gg - 2.0 * g * cosTheta, 1.5);
  }

  void main() {
    float fresnel = 1.0 - max(dot(vViewDir, vNormal), 0.0);
    float intensity = pow(fresnel, uPower);

    vec3 sunDir = normalize(uSunDirection);

    float cosTheta = dot(vViewDir, sunDir);

    float rayleighIntensity = rayleighPhase(cosTheta) * 0.6;
    float mieIntensity = miePhase(cosTheta, 0.85) * 0.3;

    vec3 rayleighColor = vec3(0.25, 0.55, 1.0);
    vec3 mieColor = vec3(1.0, 0.85, 0.6);

    float backLight = max(0.0, -cosTheta);
    float sunAltitude = sunDir.y;
    float sunsetFactor = smoothstep(0.0, 0.3, 1.0 - abs(sunAltitude));
    vec3 sunsetTint = mix(vec3(1.0, 1.0, 1.0), vec3(1.0, 0.4, 0.15), sunsetFactor * 0.6);

    float scatterBacklight = pow(backLight, 2.0);
    float scatterFade = smoothstep(0.0, 1.0, scatterBacklight);

    vec3 finalRayleigh = rayleighColor * rayleighIntensity * scatterFade * 0.5;
    vec3 finalMie = mieColor * mieIntensity * (0.3 + 0.7 * scatterBacklight);

    vec3 scatterColor = finalRayleigh + finalMie;
    scatterColor *= sunsetTint;

    vec3 rimColor = scatterFade > 0.05
      ? mix(uColor, scatterColor, smoothstep(0.0, 0.6, scatterFade))
      : uColor;

    vec3 finalColor = mix(uColor, rimColor, intensity);

    float cloudEdge = 0.0;
    float nightSide = smoothstep(-0.3, 0.2, dot(vNormal, sunDir));
    float pulse = 0.97 + 0.03 * sin(uTime * 0.3 + fresnel * 2.0);

    float alpha = intensity * uOpacity * pulse * nightSide;

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
