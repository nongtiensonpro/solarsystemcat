import * as THREE from 'three';

const PLUME_VERTEX_SHADER = `
attribute float size;
attribute float opacity;
attribute float life;
varying float vOpacity;

void main() {
  // Fade in at start, fade out at end
  float fade = smoothstep(0.0, 0.2, life) * smoothstep(1.0, 0.6, life);
  vOpacity = opacity * fade;
  
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (100.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const PLUME_FRAGMENT_SHADER = `
uniform vec3 color;
varying float vOpacity;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);
  float alpha = smoothstep(0.5, 0.1, dist);
  gl_FragColor = vec4(color, alpha * vOpacity);
}
`;

export function createEnceladusPlume(moonRadius) {
  const PARTICLE_COUNT = 800;
  const geometry = new THREE.BufferGeometry();
  
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const velocities = new Float32Array(PARTICLE_COUNT * 3);
  const sizes = new Float32Array(PARTICLE_COUNT);
  const opacities = new Float32Array(PARTICLE_COUNT);
  const lives = new Float32Array(PARTICLE_COUNT);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    lives[i] = Math.random(); // Khởi tạo ngẫu nhiên vòng đời để luồng phun đều
    
    // Khởi tạo vận tốc hướng xuống cực nam (y âm), tỏa nhẹ ra xung quanh
    const speed = 0.5 + Math.random() * 0.5; // m/s relative
    velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.3 * speed;
    velocities[i * 3 + 1] = -speed; // hướng xuống
    velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.3 * speed;
    
    sizes[i] = (0.2 + Math.random() * 0.3) * moonRadius;
    opacities[i] = 0.3 + Math.random() * 0.3;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));
  geometry.setAttribute('life', new THREE.BufferAttribute(lives, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(0xd0e8f0) }
    },
    vertexShader: PLUME_VERTEX_SHADER,
    fragmentShader: PLUME_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const points = new THREE.Points(geometry, material);
  points.renderOrder = 3;

  return {
    mesh: points,
    update: (deltaTime) => {
      const posAttr = geometry.attributes.position;
      const lifeAttr = geometry.attributes.life;
      
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        let life = lifeAttr.array[i];
        life += deltaTime * 0.2; // Thời gian sống khoảng 5s
        
        if (life >= 1.0) {
          life = 0;
          // Reset vị trí về cực nam
          posAttr.array[i * 3 + 0] = (Math.random() - 0.5) * moonRadius * 0.1;
          posAttr.array[i * 3 + 1] = -moonRadius * 0.95; // Cực nam
          posAttr.array[i * 3 + 2] = (Math.random() - 0.5) * moonRadius * 0.1;
        } else {
          // Cập nhật vị trí theo vận tốc
          posAttr.array[i * 3 + 0] += velocities[i * 3 + 0] * deltaTime * moonRadius;
          posAttr.array[i * 3 + 1] += velocities[i * 3 + 1] * deltaTime * moonRadius;
          posAttr.array[i * 3 + 2] += velocities[i * 3 + 2] * deltaTime * moonRadius;
        }
        
        lifeAttr.array[i] = life;
      }
      
      posAttr.needsUpdate = true;
      lifeAttr.needsUpdate = true;
    }
  };
}
