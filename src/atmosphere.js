// Fresnel shader tạo hiệu ứng hào quang khí quyển bao quanh hành tinh
import * as THREE from 'three';

// Vertex Shader — truyền pháp tuyến và hướng nhìn sang fragment
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

// Fragment Shader — tính Fresnel intensity tại mỗi pixel
const atmosphereFragmentShader = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uPower;

  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    // Fresnel: intensity tăng khi góc nhìn song song bề mặt (rìa hành tinh)
    float fresnel = 1.0 - max(dot(vViewDir, vNormal), 0.0);
    float intensity = pow(fresnel, uPower);

    gl_FragColor = vec4(uColor, intensity * uOpacity);
  }
`;

/**
 * Tạo lớp vỏ khí quyển Fresnel bao quanh hành tinh
 * @param {number} planetRadius - Bán kính hành tinh (đã scale)
 * @param {Object} atmosphereConfig - { color, opacity, power }
 * @returns {THREE.Mesh} - Mesh khí quyển
 */
export function createAtmosphere(planetRadius, atmosphereConfig) {
  const { color, opacity, power } = atmosphereConfig;

  // Geometry lớn hơn hành tinh 3-5%
  const atmosphereGeometry = new THREE.SphereGeometry(1, 64, 64);

  const atmosphereMaterial = new THREE.ShaderMaterial({
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uPower: { value: power },
    },
    side: THREE.BackSide,  // Render mặt trong để tạo hiệu ứng halo
    transparent: true,
    depthWrite: false,      // Không ghi Z-buffer để không che các object khác
    blending: THREE.AdditiveBlending, // Pha trộn cộng dồn cho hiệu ứng phát sáng
  });

  const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);

  // Scale lớn hơn hành tinh 5%
  const scale = planetRadius * 1.05;
  atmosphereMesh.scale.set(scale, scale, scale);

  return atmosphereMesh;
}
