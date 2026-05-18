import * as THREE from 'three';

const TAIL_BASE_LENGTH = 15;
const TAIL_MAX_LENGTH = 25;
const TAIL_MIN_LENGTH = 5;

export function createCometTail() {
  const radius = 1.0;
  const geometry = new THREE.ConeGeometry(radius, TAIL_BASE_LENGTH, 16, 1, true);
  geometry.translate(0, -TAIL_BASE_LENGTH / 2, 0);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xaaccff) },
      uOpacity: { value: 0.8 },
      uLength: { value: TAIL_BASE_LENGTH },
      uBrightness: { value: 1.0 },
    },
    vertexShader: `
      varying float vDistance;
      uniform float uLength;
      void main() {
        vDistance = position.z / uLength;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uBrightness;
      varying float vDistance;
      void main() {
        float alpha = pow(1.0 - vDistance, 1.5) * uOpacity * uBrightness;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const tailMesh = new THREE.Mesh(geometry, material);
  tailMesh.name = 'comet_tail';
  return tailMesh;
}

export function createCometDustTail() {
  const length = 12;
  const radius = 2.0;
  const geometry = new THREE.ConeGeometry(radius, length, 16, 1, true);
  geometry.translate(0, -length / 2, 0);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffeedd) },
      uOpacity: { value: 0.4 },
      uLength: { value: length },
      uBrightness: { value: 1.0 },
    },
    vertexShader: `
      varying float vDistance;
      uniform float uLength;
      void main() {
        vDistance = position.z / uLength;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uBrightness;
      varying float vDistance;
      void main() {
        float alpha = pow(1.0 - vDistance, 2.0) * uOpacity * uBrightness;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'comet_dust_tail';
  return mesh;
}

export function createCometComa(nucleusRadius) {
  const comaGeo = new THREE.SphereGeometry(1, 16, 16);
  const comaMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xaaddff) },
      uOpacity: { value: 0.6 },
      uBrightness: { value: 1.0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vViewDir = normalize(cameraPosition - worldPosition.xyz);
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uBrightness;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float fresnel = pow(1.0 - max(dot(vViewDir, vNormal), 0.0), 2.0);
        gl_FragColor = vec4(uColor, fresnel * uOpacity * uBrightness);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });

  const comaMesh = new THREE.Mesh(comaGeo, comaMat);
  comaMesh.scale.setScalar(nucleusRadius * 3.0);
  comaMesh.name = 'comet_coma';
  return comaMesh;
}
