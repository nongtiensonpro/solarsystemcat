import * as THREE from 'three';

/**
 * Tạo đuôi sao chổi sử dụng custom shader để có hiệu ứng gradient fade out.
 * Mũi nhọn ở gốc tọa độ, đuôi mở rộng về hướng +Z.
 * 
 * @returns {THREE.Mesh}
 */
export function createCometTail() {
  const length = 15; // Chiều dài đuôi
  const radius = 1.0; // Bán kính đáy đuôi

  // ConeGeometry(radius, height, radialSegments, heightSegments, openEnded)
  const geometry = new THREE.ConeGeometry(radius, length, 16, 1, true);
  
  // Default: mũi nhọn ở y = height/2, đáy ở y = -height/2.
  // Dịch mũi nhọn về (0,0,0), đáy về (0, -length, 0)
  geometry.translate(0, -length / 2, 0);
  
  // Xoay -90 độ quanh trục X: 
  // Trục -Y sẽ thành trục +Z. Đáy sẽ ở z = length, mũi nhọn ở z = 0.
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xaaccff) }, // Xanh nhạt
      uOpacity: { value: 0.8 },
      uLength: { value: length }
    },
    vertexShader: `
      varying float vDistance;
      uniform float uLength;
      void main() {
        // Tính tỷ lệ khoảng cách từ mũi (z=0) đến đáy (z=length)
        vDistance = position.z / uLength;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vDistance;
      void main() {
        // Càng xa mũi (vDistance -> 1) thì càng mờ dần và fade out
        // Dùng hàm pow để đuôi mờ nhanh hơn ở phần cuối
        float alpha = pow(1.0 - vDistance, 1.5) * uOpacity;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const tailMesh = new THREE.Mesh(geometry, material);
  tailMesh.name = 'comet_tail';
  
  return tailMesh;
}

/**
 * Tạo quầng sáng (Coma) bao quanh lõi sao chổi
 * @param {number} nucleusRadius - Bán kính lõi sao chổi
 * @returns {THREE.Mesh}
 */
export function createCometComa(nucleusRadius) {
  const comaGeo = new THREE.SphereGeometry(1, 16, 16);
  const comaMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xaaddff) },
      uOpacity: { value: 0.6 },
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
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float fresnel = pow(1.0 - max(dot(vViewDir, vNormal), 0.0), 2.0);
        gl_FragColor = vec4(uColor, fresnel * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });

  const comaMesh = new THREE.Mesh(comaGeo, comaMat);
  const scale = nucleusRadius * 3.0; // Coma lớn hơn lõi 3 lần
  comaMesh.scale.set(scale, scale, scale);
  comaMesh.name = 'comet_coma';
  return comaMesh;
}
