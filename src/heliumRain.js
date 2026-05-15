import * as THREE from 'three';

const heliumRainVertexShader = /* glsl */`
  uniform float uTime;
  attribute float aSpeed;
  attribute float aOffset;
  
  varying float vAlpha;

  void main() {
    // Rơi từ ngoài vào tâm (từ radius ngoài xuống radius trong)
    // Particles được khởi tạo rải rác.
    vec3 pos = position;
    
    // Tính toán lại bán kính rơi dựa trên tốc độ và thời gian
    float dist = length(pos);
    float drop = fract((uTime * aSpeed + aOffset)) * 0.2; // Rơi một đoạn 20% bán kính
    
    // Tỷ lệ co lại
    float scale = 1.0 - drop;
    vec3 newPos = pos * scale;
    
    // Alpha mờ dần khi rơi sâu vào trong
    vAlpha = 1.0 - (drop / 0.2);
    
    vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
    gl_PointSize = 2.0 * (100.0 / -mvPosition.z); // Perspective scale
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const heliumRainFragmentShader = /* glsl */`
  varying float vAlpha;
  uniform vec3 uColor;

  void main() {
    // Tạo hình tròn mềm cho giọt mưa
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    
    float intensity = (0.5 - d) * 2.0;
    gl_FragColor = vec4(uColor * intensity, vAlpha * intensity * 0.5);
  }
`;

/**
 * Tạo particle system mô phỏng Mưa Heli bên trong hành tinh khí
 * @param {number} planetRadius - Bán kính hành tinh
 * @param {number} outerFraction - Tỷ lệ bán kính bắt đầu mưa (ví dụ: 0.8)
 * @param {number} count - Số lượng hạt
 * @returns {THREE.Points}
 */
export function createHeliumRain(planetRadius, outerFraction = 0.8, count = 2000) {
  const geometry = new THREE.BufferGeometry();
  
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const offsets = new Float32Array(count);
  
  const baseRadius = planetRadius * outerFraction;

  for (let i = 0; i < count; i++) {
    // Phân bố ngẫu nhiên trên mặt cầu ở bán kính baseRadius
    const phi = Math.acos(-1 + (2 * i) / count);
    const theta = Math.sqrt(count * Math.PI) * phi;
    
    const x = baseRadius * Math.cos(theta) * Math.sin(phi);
    const y = baseRadius * Math.sin(theta) * Math.sin(phi);
    const z = baseRadius * Math.cos(phi);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    speeds[i] = 0.05 + Math.random() * 0.05; // Tốc độ rơi
    offsets[i] = Math.random(); // Độ trễ ban đầu
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xffd700) } // Vàng nhạt
    },
    vertexShader: heliumRainVertexShader,
    fragmentShader: heliumRainFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  material.userData.isHeliumRainShader = true;

  const points = new THREE.Points(geometry, material);
  points.name = 'helium_rain';
  
  // Tạm ẩn khi chưa ở chế độ cross-section, nhưng ta có thể để nó chạy ngầm.
  // Thực tế, có thể cho opacity rất thấp hoặc render order để thấy lờ mờ.
  // Ở đây đặt renderOrder thấp để nằm trong hành tinh.
  points.renderOrder = -1;
  return points;
}
