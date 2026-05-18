import * as THREE from 'three';
import { AU } from './constants.js';

/**
 * Tạo vành đai tiểu hành tinh giữa Sao Hỏa và Sao Mộc
 * Sử dụng InstancedMesh để render hàng ngàn thiên thể với 1 draw call.
 * 
 * @param {number} maxCount - Số lượng tối đa tiểu hành tinh
 * @returns {{ mesh: THREE.InstancedMesh, update: Function, setCount: Function }}
 */
export function createAsteroidBelt(maxCount = 5000) {
  // Khoảng cách của vành đai chính (2.2 đến 3.2 AU)
  const innerRadius = 2.2 * AU;
  const outerRadius = 3.2 * AU;

  // Pseudo-random generator để có kết quả nhất quán
  let seed = 12345;
  function random() {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  }

  // Dùng hình đa diện Dodecahedron thay cho Icosahedron và làm méo các vertex
  const geometry = new THREE.DodecahedronGeometry(1, 0);

  // Biến dạng nhẹ các vertex để asteroid trông méo mó tự nhiên
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const noise = 0.7 + random() * 0.6; // Scale 0.7-1.3
    positions.setXYZ(i, x * noise, y * noise, z * noise);
  }
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    roughness: 1.0, // Đá nhám hoàn toàn
    metalness: 0.0, // Không phản quang
  });

  const instancedMesh = new THREE.InstancedMesh(geometry, material, maxCount);
  instancedMesh.name = 'asteroid_belt';

  // Array lưu trữ thông số quỹ đạo của từng tiểu hành tinh
  const asteroidData = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  for (let i = 0; i < maxCount; i++) {
    // Gán màu ngẫu nhiên cho từng tiểu hành tinh (biến thiên trong khoảng xám-nâu)
    const hue = 0.08 + random() * 0.04;     // Nâu nhạt
    const sat = 0.1 + random() * 0.2;        // Bão hòa thấp
    const light = 0.25 + random() * 0.25;    // Sáng trung bình
    color.setHSL(hue, sat, light);
    instancedMesh.setColorAt(i, color);

    // Phân bố bán kính có thiên hướng tập trung ở giữa vành đai
    const t = random();
    const r = innerRadius + (outerRadius - innerRadius) * t;
    
    // Góc ban đầu ngẫu nhiên
    const initialTheta = random() * Math.PI * 2;
    
    // Tính chu kỳ quỹ đạo (Định luật 3 Kepler: T^2 = a^3)
    const aAU = r / AU;
    const periodYears = Math.pow(aAU, 1.5);
    const periodSeconds = periodYears * 365.25 * 86400; // Giây

    // Inclination (độ nghiêng) ngẫu nhiên nhỏ (±10 độ = ±0.17 rad)
    const inclination = (random() - 0.5) * 0.34;
    
    // Kích thước ngẫu nhiên (từ 0.02 đến 0.08 units)
    const scale = 0.02 + random() * 0.06;
    
    // Tốc độ xoay quanh trục ngẫu nhiên
    const rotSpeedX = (random() - 0.5) * 5;
    const rotSpeedY = (random() - 0.5) * 5;
    const rotSpeedZ = (random() - 0.5) * 5;

    // Eccentricity ng?u nhiên (0.0 - 0.25) ph?n ánh th?c t? vành ?ai
    const eccentricity = random() * 0.25;

    // Góc c?n ?i?m (argument of periapsis) ng?u nhiên
    const argPeriapsis = random() * Math.PI * 2;

    asteroidData.push({
      a: r,
      period: periodSeconds,
      initialTheta: initialTheta,
      inclination: inclination,
      eccentricity,
      argPeriapsis,
      scale: scale,
      rotSpeedX,
      rotSpeedY,
      rotSpeedZ,
      // L?u tr? góc xoay hi?n t?i ?? c?p nh?t liên t?c
      rotX: random() * Math.PI,
      rotY: random() * Math.PI,
      rotZ: random() * Math.PI,
    });
    
    // Khởi tạo ma trận ban đầu
    const x = r * Math.cos(initialTheta);
    const y = r * Math.sin(initialTheta) * Math.sin(inclination);
    const z = r * Math.sin(initialTheta) * Math.cos(inclination);
    
    dummy.position.set(x, y, z);
    dummy.rotation.set(asteroidData[i].rotX, asteroidData[i].rotY, asteroidData[i].rotZ);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);
  }

  instancedMesh.instanceMatrix.needsUpdate = true;
  instancedMesh.instanceColor.needsUpdate = true;

  let _orbitFrame = 0;
  const ORBIT_INTERVAL = 3; // tính qu? ??o m?i 3 frame, rotation v?n m?i frame

  return {
    mesh: instancedMesh,
    setCount: (count) => {
      instancedMesh.count = Math.min(count, maxCount);
    },
    update: (simulationTime, deltaTime) => {
      const doOrbit = (_orbitFrame++ % ORBIT_INTERVAL) === 0;

      for (let i = 0; i < instancedMesh.count; i++) {
        const data = asteroidData[i];

        if (doOrbit) {
          const meanAnomaly = (2 * Math.PI / data.period) * simulationTime + data.initialTheta;
          const e = data.eccentricity;
          const E = meanAnomaly + e * Math.sin(meanAnomaly);
          const xOrbital = data.a * (Math.cos(E) - e);
          const zOrbital = data.a * Math.sqrt(1 - e * e) * Math.sin(E);

          const cosW = Math.cos(data.argPeriapsis);
          const sinW = Math.sin(data.argPeriapsis);
          const xLocal = xOrbital * cosW - zOrbital * sinW;
          const zLocal = xOrbital * sinW + zOrbital * cosW;

          const x = xLocal;
          const y = zLocal * Math.sin(data.inclination);
          const z = zLocal * Math.cos(data.inclination);

          dummy.position.set(x, y, z);
        }

        data.rotX += data.rotSpeedX * deltaTime;
        data.rotY += data.rotSpeedY * deltaTime;
        data.rotZ += data.rotSpeedZ * deltaTime;
        dummy.rotation.set(data.rotX, data.rotY, data.rotZ);

        dummy.scale.set(data.scale, data.scale, data.scale);
        dummy.updateMatrix();

        instancedMesh.setMatrixAt(i, dummy.matrix);
      }
      instancedMesh.instanceMatrix.needsUpdate = true;
    }
  };
}
