import * as THREE from 'three';

const TAIL_BASE_LENGTH = 15;
const TAIL_MAX_LENGTH = 25;
const TAIL_MIN_LENGTH = 5;

// Scratch vector dùng lại — zero allocation
const _awayPos = new THREE.Vector3();

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

// ─────────────────────────────────────────────────────────────────────────────
// § Comet Visual Update — Cập nhật đuôi, quầng, độ sáng cho tất cả sao chổi
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cập nhật visual effects cho tất cả sao chổi trong một vòng lặp chuyên biệt.
 * Tách biệt khỏi vòng lặp bodies chung trong main.js.
 *
 * Xử lý:
 * - Đuôi ion: hướng ngược Mặt Trời, độ sáng ~ 1/r^2.5
 * - Đuôi bụi: tương tự nhưng mờ hơn, lệch nhẹ
 * - Quầng (coma): scale theo khoảng cách
 * - Lõi sáng (outgassing): emissive intensity
 * - Visibility culling: ẩn hoàn toàn khi > 10 AU
 *
 * @param {Array} cometBodies - Mảng body objects chỉ chứa sao chổi
 * @param {number} auScale - Hệ số quy đổi AU (constants.AU)
 */
export function updateCometVisuals(cometBodies, auScale) {
  for (let i = 0; i < cometBodies.length; i++) {
    const body = cometBodies[i];
    if (!body.tailMesh) continue;

    // Tính khoảng cách AU từ Mặt Trời
    const pos = body.pivot.position;
    const distAU = pos.length() / auScale;
    const r = Math.max(distAU, 0.5);

    // Độ sáng: I = 1/r^2.5 (brightness curve thực tế)
    const brightnessFactor = Math.pow(r, -2.5);
    const maxTailDist = 10.0;
    let tailOpacity = 1.0 - (distAU / maxTailDist);
    tailOpacity = Math.max(0, Math.min(1, tailOpacity));
    const brightness = Math.min(1, brightnessFactor / 0.1);

    // Visibility culling: ẩn khi quá xa
    const isVisible = tailOpacity > 0.05;

    // ── Đuôi ion ──
    _awayPos.copy(pos).multiplyScalar(2);
    body.tailMesh.lookAt(_awayPos);
    body.tailMesh.material.uniforms.uOpacity.value = tailOpacity;
    body.tailMesh.material.uniforms.uBrightness.value = brightness;
    body.tailMesh.visible = isVisible;

    // Độ dài đuôi động: 5 → 25 AU
    const tailScale = 5 + 20 * tailOpacity;
    body.tailMesh.scale.z = tailScale / 15;

    // ── Đuôi bụi ──
    if (body.dustTailMesh) {
      body.dustTailMesh.lookAt(_awayPos);
      body.dustTailMesh.material.uniforms.uOpacity.value = tailOpacity * 0.5;
      body.dustTailMesh.material.uniforms.uBrightness.value = brightness * 0.7;
      body.dustTailMesh.visible = isVisible;
      const dustScale = 3 + 9 * tailOpacity;
      body.dustTailMesh.scale.z = dustScale / 12;
    }

    // ── Quầng (coma) ──
    if (body.comaMesh) {
      body.comaMesh.material.uniforms.uOpacity.value = tailOpacity * 0.8;
      body.comaMesh.material.uniforms.uBrightness.value = brightness;
      body.comaMesh.visible = isVisible;
      const baseScale = body.data.physical.radius * 3.0;
      const comaFactor = 1 + 1.5 * tailOpacity;
      body.comaMesh.scale.setScalar(baseScale * comaFactor);
    }

    // ── Lõi sáng (outgassing) ──
    if (body.mesh && body.mesh.material) {
      body.mesh.material.emissiveIntensity = 0.3 + 2.0 * tailOpacity;
    }
  }
}
