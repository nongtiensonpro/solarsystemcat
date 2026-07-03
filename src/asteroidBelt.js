import * as THREE from 'three';
import { AU } from './constants.js';

/**
 * Tạo vành đai tiểu hành tinh giữa Sao Hỏa và Sao Mộc
 * Sử dụng InstancedMesh để render hàng ngàn thiên thể với 1 draw call.
 * 
 * Tối ưu hóa cực hạn (v2.0):
 * - Loại bỏ hoàn toàn đối tượng Object3D trung gian (dummy).
 * - Sử dụng công thức lượng giác khép kín để ghi trực tiếp ma trận dịch chuyển, 
 *   tự quay và tỉ lệ vào WebGL Array Buffer (Direct Buffer Writes), tiết kiệm hàng ngàn phép gọi hàm Three.js mỗi frame.
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
  const color = new THREE.Color();
  const array = instancedMesh.instanceMatrix.array;

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
    const meanMotion = (Math.PI * 2) / periodSeconds;

    // Inclination (độ nghiêng) ngẫu nhiên nhỏ (±10 độ = ±0.17 rad)
    const inclination = (random() - 0.5) * 0.34;
    
    // Kích thước ngẫu nhiên (từ 0.02 đến 0.08 units)
    const scale = 0.02 + random() * 0.06;
    
    // Tốc độ xoay quanh trục ngẫu nhiên
    const rotSpeedX = (random() - 0.5) * 5;
    const rotSpeedY = (random() - 0.5) * 5;
    const rotSpeedZ = (random() - 0.5) * 5;

    // Eccentricity ngẫu nhiên (0.0 - 0.25) phản ánh thực tế vành đai
    const eccentricity = random() * 0.25;
    const sqrtOneMinusE2 = Math.sqrt(1 - eccentricity * eccentricity);

    // Góc cận điểm (argument of periapsis) ngẫu nhiên
    const argPeriapsis = random() * Math.PI * 2;
    const cosW = Math.cos(argPeriapsis);
    const sinW = Math.sin(argPeriapsis);
    const sinInclination = Math.sin(inclination);
    const cosInclination = Math.cos(inclination);

    const rotX = random() * Math.PI;
    const rotY = random() * Math.PI;
    const rotZ = random() * Math.PI;

    asteroidData.push({
      a: r,
      meanMotion,
      initialTheta: initialTheta,
      inclination: inclination,
      eccentricity,
      sqrtOneMinusE2,
      cosW,
      sinW,
      sinInclination,
      cosInclination,
      scale: scale,
      rotSpeedX,
      rotSpeedY,
      rotSpeedZ,
      rotX,
      rotY,
      rotZ,
    });
    
    // Khởi tạo ma trận ban đầu
    const x = r * Math.cos(initialTheta);
    const y = r * Math.sin(initialTheta) * Math.sin(inclination);
    const z = r * Math.sin(initialTheta) * Math.cos(inclination);
    asteroidData[i].x = x;
    asteroidData[i].y = y;
    asteroidData[i].z = z;
    
    // Tính toán và ghi ma trận ban đầu trực tiếp (Zero Allocation)
    const s = scale;
    const sx = Math.sin(rotX), cx = Math.cos(rotX);
    const sy = Math.sin(rotY), cy = Math.cos(rotY);
    const sz = Math.sin(rotZ), cz = Math.cos(rotZ);

    const idx = i * 16;
    
    // Cột 0
    array[idx]     = s * cy * cz;
    array[idx + 1] = s * (sx * sy * cz + cx * sz);
    array[idx + 2] = s * (-cx * sy * cz + sx * sz);
    array[idx + 3] = 0;

    // Cột 1
    array[idx + 4] = -s * cy * sz;
    array[idx + 5] = s * (-sx * sy * sz + cx * cz);
    array[idx + 6] = s * (cx * sy * sz + sx * cz);
    array[idx + 7] = 0;

    // Cột 2
    array[idx + 8]  = s * sy;
    array[idx + 9]  = -s * sx * cy;
    array[idx + 10] = s * cx * cy;
    array[idx + 11] = 0;

    // Cột 3 (Dịch chuyển)
    array[idx + 12] = x;
    array[idx + 13] = y;
    array[idx + 14] = z;
    array[idx + 15] = 1;
  }

  instancedMesh.instanceMatrix.needsUpdate = true;
  instancedMesh.instanceColor.needsUpdate = true;

  let _orbitFrame = 0;
  let orbitInterval = 3; // tính quỹ đạo mỗi 3 frame, rotation vẫn mỗi frame

  return {
    mesh: instancedMesh,
    setCount: (count) => {
      instancedMesh.count = Math.min(count, maxCount);
    },
    setOrbitInterval: (interval) => {
      orbitInterval = Math.max(1, Math.floor(interval || 1));
    },
    update: (simulationTime, deltaTime) => {
      const currentMod = _orbitFrame % orbitInterval;
      _orbitFrame++;
      const array = instancedMesh.instanceMatrix.array;
      const count = instancedMesh.count;

      for (let i = 0; i < count; i++) {
        const data = asteroidData[i];

        if (i % orbitInterval === currentMod) {
          const meanAnomaly = data.meanMotion * simulationTime + data.initialTheta;
          const e = data.eccentricity;
          const E = meanAnomaly + e * Math.sin(meanAnomaly);
          const xOrbital = data.a * (Math.cos(E) - e);
          const zOrbital = data.a * data.sqrtOneMinusE2 * Math.sin(E);

          const xLocal = xOrbital * data.cosW - zOrbital * data.sinW;
          const zLocal = xOrbital * data.sinW + zOrbital * data.cosW;

          data.x = xLocal;
          data.y = zLocal * data.sinInclination;
          data.z = zLocal * data.cosInclination;
        }

        data.rotX += data.rotSpeedX * deltaTime;
        data.rotY += data.rotSpeedY * deltaTime;
        data.rotZ += data.rotSpeedZ * deltaTime;

        // Tính lượng giác tự quay
        const s = data.scale;
        const ax = data.rotX, ay = data.rotY, az = data.rotZ;
        const sx = Math.sin(ax), cx = Math.cos(ax);
        const sy = Math.sin(ay), cy = Math.cos(ay);
        const sz = Math.sin(az), cz = Math.cos(az);

        const idx = i * 16;
        
        // Cột 0 (Scaled Rotation)
        array[idx]     = s * cy * cz;
        array[idx + 1] = s * (sx * sy * cz + cx * sz);
        array[idx + 2] = s * (-cx * sy * cz + sx * sz);
        array[idx + 3] = 0;

        // Cột 1 (Scaled Rotation)
        array[idx + 4] = -s * cy * sz;
        array[idx + 5] = s * (-sx * sy * sz + cx * cz);
        array[idx + 6] = s * (cx * sy * sz + sx * cz);
        array[idx + 7] = 0;

        // Cột 2 (Scaled Rotation)
        array[idx + 8]  = s * sy;
        array[idx + 9]  = -s * sx * cy;
        array[idx + 10] = s * cx * cy;
        array[idx + 11] = 0;

        // Cột 3 (Dịch chuyển)
        array[idx + 12] = data.x;
        array[idx + 13] = data.y;
        array[idx + 14] = data.z;
        array[idx + 15] = 1;
      }
      instancedMesh.instanceMatrix.needsUpdate = true;
    }
  };
}
