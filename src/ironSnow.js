import * as THREE from 'three';

const ironSnowVertexShader = /* glsl */`
  uniform float uTime;
  attribute float aSpeed;
  attribute float aOffset;
  
  varying float vAlpha;
  varying float vDepth;

  void main() {
    // Hạt bắt đầu từ 0.75 và rơi xuống lõi trong (0.15)
    vec3 pos = position;
    
    // Tính toán lại bán kính rơi dựa trên tốc độ và thời gian
    // drop dao động từ 0.0 đến 1.0 (chu kỳ rơi)
    float drop = fract((uTime * aSpeed + aOffset));
    
    // Khoảng cách thực tế hạt rơi (ví dụ rơi từ 100% xuống 20% bán kính ban đầu)
    // Tương đương ranh giới 0.75 -> 0.15
    float scale = 1.0 - drop * 0.8; 
    vec3 newPos = pos * scale;
    
    // Lưu độ sâu để truyền sang fragment shader đổi màu
    vDepth = drop;
    
    // Alpha mờ dần khi mới sinh ra và khi chạm lõi
    vAlpha = smoothstep(0.0, 0.1, drop) * (1.0 - smoothstep(0.9, 1.0, drop));
    
    vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
    gl_PointSize = 3.0 * (100.0 / -mvPosition.z); // Perspective scale
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const ironSnowFragmentShader = /* glsl */`
  varying float vAlpha;
  varying float vDepth;
  uniform vec3 uColorTop;
  uniform vec3 uColorBottom;

  void main() {
    // Tạo hình tròn mềm
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    
    float intensity = (0.5 - d) * 2.0;
    
    // Mix màu: từ trắng xám (0.0) -> vàng đồng (1.0)
    vec3 mixedColor = mix(uColorTop, uColorBottom, vDepth);
    
    gl_FragColor = vec4(mixedColor * intensity, vAlpha * intensity * 0.8);
  }
`;

/**
 * Tạo particle system mô phỏng Tuyết Sắt (Iron Snow) cho Sao Thủy
 * @param {number} planetRadius - Bán kính hành tinh
 * @param {number} outerFraction - Tỷ lệ bán kính bắt đầu rơi (0.75)
 * @param {number} count - Số lượng hạt
 * @returns {THREE.Points}
 */
export function createIronSnow(planetRadius, outerFraction = 0.75, count = 1500) {
  const geometry = new THREE.BufferGeometry();
  
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const offsets = new Float32Array(count);
  
  const baseRadius = planetRadius * outerFraction;

  for (let i = 0; i < count; i++) {
    // Phân bố ngẫu nhiên trên mặt cầu
    const phi = Math.acos(-1 + (2 * i) / count);
    const theta = Math.sqrt(count * Math.PI) * phi;
    
    const x = baseRadius * Math.cos(theta) * Math.sin(phi);
    const y = baseRadius * Math.sin(theta) * Math.sin(phi);
    const z = baseRadius * Math.cos(phi);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // Tốc độ rơi nhanh hơn mưa heli một chút vì gia tốc trọng trường ở lõi kim loại đặc
    speeds[i] = 0.08 + Math.random() * 0.05; 
    offsets[i] = Math.random(); 
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorTop: { value: new THREE.Color(0xffffff) }, // Trắng xám
      uColorBottom: { value: new THREE.Color(0x886600) } // Vàng đồng
    },
    vertexShader: ironSnowVertexShader,
    fragmentShader: ironSnowFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  material.userData.isIronSnowShader = true;

  const points = new THREE.Points(geometry, material);
  points.name = 'iron_snow';
  points.renderOrder = -1;
  return points;
}
