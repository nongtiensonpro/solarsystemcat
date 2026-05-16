import * as THREE from 'three';

// Hàm nội suy
function lerp(start, end, t) {
  return start * (1 - t) + end * t;
}

// Pseudo-random number generator (seed)
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

const GHOST_VERTEX_SHADER = `
attribute float size;
attribute float opacity;
varying float vOpacity;

void main() {
  vOpacity = opacity;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (300.0 / -mvPosition.z); // scale với distance
  gl_Position = projectionMatrix * mvPosition;
}
`;

const GHOST_FRAGMENT_SHADER = `
uniform vec3 color;
uniform float globalOpacity;
varying float vOpacity;

void main() {
  // Hình tròn mềm — không phải square pixel
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);
  float alpha = smoothstep(0.5, 0.2, dist); // soft circle
  gl_FragColor = vec4(color, alpha * vOpacity * globalOpacity);
}
`;

export class GhostMoonCloud {
  constructor(zoneName, zoneConfig) {
    this.name = zoneName;
    this.zone = zoneConfig;
    this.count = zoneConfig.ghostCount;
    this.positions = new Float32Array(this.count * 3);
    this.phases = new Float32Array(this.count);       // phase hiện tại (radians)
    this.radii = new Float32Array(this.count);         // display orbit radius
    this.speeds = new Float32Array(this.count);        // rad/frame
    this.inclinations = new Float32Array(this.count);  // inclination (radians)
    this.sizes = new Float32Array(this.count);
    this.opacities = new Float32Array(this.count);

    this._init();
    this._buildGeometry();
  }

  _init() {
    for (let i = 0; i < this.count; i++) {
      const seed = mulberry32(i + this.zone.seedOffset);

      // Random radius trong zone range
      this.radii[i] = lerp(this.zone.radiusMin, this.zone.radiusMax, seed());

      // Phase ban đầu ngẫu nhiên hoàn toàn
      this.phases[i] = seed() * Math.PI * 2;

      // Tốc độ: vệ tinh gần Sao Thổ quay nhanh hơn (Kepler's 3rd law gần đúng)
      // speed ∝ 1 / sqrt(radius^3) — normalize về range thực tế
      const baseSpeed = 0.0003 / Math.pow(this.radii[i] / 50, 1.5);
      this.speeds[i] = baseSpeed * (0.85 + seed() * 0.3);

      // Retrograde: speed âm
      if (seed() < this.zone.retrogradeRatio) {
        this.speeds[i] *= -1;
      }

      // Inclination trong range của zone, có jitter (từ JSON là degree, cần chuyển sang radian)
      const inclMinRad = THREE.MathUtils.degToRad(this.zone.inclinationRangeDeg[0]);
      const inclMaxRad = THREE.MathUtils.degToRad(this.zone.inclinationRangeDeg[1]);
      this.inclinations[i] = lerp(inclMinRad, inclMaxRad, seed()) * (seed() > 0.5 ? 1 : -1);

      this.sizes[i] = lerp(this.zone.sizeMin, this.zone.sizeMax, seed());
      this.opacities[i] = lerp(this.zone.opacityMin, this.zone.opacityMax, seed());
    }
  }

  _buildGeometry() {
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('opacity', new THREE.BufferAttribute(this.opacities, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: { 
        color: { value: new THREE.Color(this.zone.color) },
        globalOpacity: { value: 1.0 }
      },
      vertexShader: GHOST_VERTEX_SHADER,
      fragmentShader: GHOST_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // additive blending — chồng lên nhau không bị vệt đen
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.renderOrder = 2; // phase 2: render sau ring
  }

  update(deltaTime, timeScale) {
    for (let i = 0; i < this.count; i++) {
      // timeScale * deltaTime để đồng bộ với time control
      // speeds[i] ban đầu đang tính khá nhanh, nên điều chỉnh nhân với deltaTime
      // 0.0003 rad/frame ở 60fps tương đương 0.018 rad/s.
      // Chúng ta sẽ dùng tốc độ cơ bản nhân với timeScale.
      const timeDelta = deltaTime * timeScale * 0.05; 
      this.phases[i] += this.speeds[i] * timeDelta;

      const r = this.radii[i];
      const phi = this.phases[i];
      const incl = this.inclinations[i];

      // Vị trí 3D: quỹ đạo nghiêng theo inclination
      this.positions[i * 3 + 0] = r * Math.cos(phi);
      this.positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(incl);
      this.positions[i * 3 + 2] = r * Math.sin(phi) * Math.cos(incl);
    }
    this.geometry.attributes.position.needsUpdate = true;
  }
}

export class GhostMoonSystem {
  constructor(config) {
    this.group = new THREE.Group();
    this.clouds = {};
    
    // Tạo mây cho từng zone
    for (const [zoneName, zoneConfig] of Object.entries(config.zones)) {
      const cloud = new GhostMoonCloud(zoneName, zoneConfig);
      this.clouds[zoneName] = cloud;
      this.group.add(cloud.points);
    }

    // Ghost System bounds để raycaster dễ phát hiện
    // Dùng 1 mesh invisible dạng hình xuyến (Torus) ôm vùng outerCloud
    const outerZone = config.zones.outerCloud;
    const hitGeo = new THREE.TorusGeometry(
      (outerZone.radiusMin + outerZone.radiusMax) / 2, 
      (outerZone.radiusMax - outerZone.radiusMin) / 2, 
      8, 32
    );
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hitMesh = new THREE.Mesh(hitGeo, hitMat);
    this.hitMesh.rotation.x = Math.PI / 2; // Nằm trên mặt phẳng XZ
    this.hitMesh.userData = { isGhostSystemHitbox: true };
    this.group.add(this.hitMesh);
  }

  update(deltaTime, timeScale, cameraDistance) {
    // LOD based visibility
    if (this.clouds.innerBand) {
      this.clouds.innerBand.points.visible = cameraDistance < 300;
    }
    if (this.clouds.outerCloud) {
      this.clouds.outerCloud.points.visible = cameraDistance > 80;
      
      // Giảm opacity khi ở xa
      if (cameraDistance > 500) {
        this.clouds.outerCloud.material.uniforms.globalOpacity.value = 0.5;
      } else {
        this.clouds.outerCloud.material.uniforms.globalOpacity.value = 1.0;
      }
    }

    // Cập nhật vị trí các particle
    for (const cloud of Object.values(this.clouds)) {
      if (cloud.points.visible) {
        cloud.update(deltaTime, timeScale);
      }
    }
  }
}
