import * as THREE from 'three';

const sunSurfaceVertexShader = /* glsl */`
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const sunSurfaceFragmentShader = /* glsl */`
  uniform sampler2D uAlbedo;
  uniform float uTime;

  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;

    float bandA = sin(uv.y * 28.0 + uTime * 0.55);
    float bandB = cos((uv.x + uv.y) * 18.0 - uTime * 0.38);
    uv.x += bandA * 0.006;
    uv.y += bandB * 0.004;

    vec4 texColor = texture2D(uAlbedo, uv);
    float pulse = 1.0 + sin(uTime * 1.7 + uv.y * 12.0) * 0.08;
    vec3 hotColor = texColor.rgb * vec3(1.7, 1.35, 0.95) * pulse;

    gl_FragColor = vec4(hotColor, 1.0);
  }
`;

const sunCoronaVertexShader = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const sunCoronaFragmentShader = /* glsl */`
  uniform vec3 uInnerColor;
  uniform vec3 uOuterColor;
  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
    float corona = pow(rim, 1.55);
    float filament = sin(vUv.y * 42.0 + uTime * 0.7) * 0.5 + 0.5;
    float flicker = 0.82 + 0.18 * sin(uTime * 2.3 + filament * 3.14159);

    vec3 color = mix(uInnerColor, uOuterColor, smoothstep(0.25, 1.0, corona));
    float alpha = corona * (0.46 + filament * 0.18) * flicker;

    gl_FragColor = vec4(color * (1.4 + corona * 1.8), alpha);
  }
`;

export function createSunSurfaceMaterial(albedoTexture, fallbackColor) {
  if (!albedoTexture) {
    return new THREE.MeshBasicMaterial({ color: fallbackColor || 0xffffff });
  }

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uAlbedo: { value: albedoTexture },
      uTime: { value: 0 },
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
