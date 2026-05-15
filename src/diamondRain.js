import * as THREE from 'three';

const diamondRainVertexShader = /* glsl */`
  uniform float uTime;
  uniform float uRadius;
  attribute float aSpeed;
  attribute float aOffset;
  attribute float aSize;

  varying float vAlpha;

  // Simple rotation function
  mat3 rotationY(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat3(
      c, 0.0, s,
      0.0, 1.0, 0.0,
      -s, 0.0, c
    );
  }

  void main() {
    // Mưa kim cương chìm từ Manti xuống lõi (VD: 70% xuống 55%)
    vec3 pos = position;
    
    // Tính toán chu kỳ rơi
    float cycle = fract(uTime * aSpeed + aOffset);
    
    // Rơi khoảng 15% bán kính (từ r=0.7 xuống r=0.55)
    // Co ngót vị trí
    float scale = 1.0 - (cycle * 0.15 / 0.7);
    vec3 newPos = pos * scale;

    // Xoay quanh trục Y nhẹ nhàng mô phỏng dòng xoáy
    newPos = rotationY(uTime * aSpeed * 2.0) * newPos;
    
    // Làm mờ khi bắt đầu và kết thúc chu kỳ để loop mượt
    vAlpha = smoothstep(0.0, 0.1, cycle) * (1.0 - smoothstep(0.8, 1.0, cycle));
    
    vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
    gl_PointSize = aSize * ((uRadius * 20.0) / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const diamondRainFragmentShader = /* glsl */`
  varying float vAlpha;

  void main() {
    // Tạo hình thoi/kim cương đơn giản 2D (Diamond shape)
    vec2 coord = gl_PointCoord - vec2(0.5);
    float d = abs(coord.x) + abs(coord.y);
    
    // Nếu nằm ngoài hình thoi -> loại bỏ
    if (d > 0.5) discard;
    
    // Tạo viền sáng mô phỏng độ lấp lánh (gấp khúc)
    float edge = smoothstep(0.4, 0.5, d);
    float center = smoothstep(0.0, 0.2, 0.5 - d);
    
    // Màu xanh nhạt/trắng của kim cương lấp lánh
    vec3 color = mix(vec3(0.5, 0.8, 1.0), vec3(1.0, 1.0, 1.0), edge + center);
    
    // Độ trong suốt
    float alpha = vAlpha * (1.0 - d * 1.5);

    gl_FragColor = vec4(color, alpha * 0.8);
  }
`;

/**
 * Tạo particle system mô phỏng Mưa Kim Cương bên trong hành tinh băng
 * @param {number} planetRadius - Bán kính hành tinh
 * @param {number} outerFraction - Tỷ lệ bán kính bắt đầu mưa (ví dụ: 0.7)
 * @param {number} count - Số lượng hạt
 * @returns {THREE.Points}
 */
export function createDiamondRain(planetRadius, outerFraction = 0.7, count = 1500) {
  const geometry = new THREE.BufferGeometry();
  
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const offsets = new Float32Array(count);
  const sizes = new Float32Array(count);
  
  const baseRadius = planetRadius * outerFraction;

  for (let i = 0; i < count; i++) {
    // Phân bố ngẫu nhiên trên mặt cầu
    const phi = Math.acos(-1 + (2 * i) / count);
    const theta = Math.sqrt(count * Math.PI) * phi;
    
    // Để mưa tự nhiên hơn, xáo trộn một chút
    const r = baseRadius * (0.95 + Math.random() * 0.05);

    positions[i * 3] = r * Math.cos(theta) * Math.sin(phi);
    positions[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
    positions[i * 3 + 2] = r * Math.cos(phi);

    // Mưa kim cương rơi RẤT chậm so với Heli
    speeds[i] = 0.01 + Math.random() * 0.015; 
    offsets[i] = Math.random();
    
    // Kích thước hạt lấp lánh khác nhau
    sizes[i] = 3.0 + Math.random() * 4.0;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRadius: { value: planetRadius }
    },
    vertexShader: diamondRainVertexShader,
    fragmentShader: diamondRainFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  material.userData.isDiamondRainShader = true;

  const points = new THREE.Points(geometry, material);
  points.name = 'diamond_rain';
  points.renderOrder = -1; // Tạm chìm vào trong
  return points;
}
