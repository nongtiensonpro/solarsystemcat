# Kế Hoạch Nâng Cấp Ánh Sáng Mặt Trời — "Sunlight Everywhere"

## Mục Tiêu

Đảm bảo **mọi nơi trong hệ mặt trời** đều nhận được ánh sáng từ Mặt Trời, kể cả các vùng xa nhất (Kuiper Belt, Oort Cloud). Đây là cơ chế **minh họa trực quan** giúp người dùng nhận biết ngay đây là hệ mặt trời với Mặt Trời ở trung tâm.

---

## Phân Tích Hiện Trạng

### Cấu hình ánh sáng hiện tại (`src/scene.js`)

| Thành phần | Giá trị | Ghi chú |
|---|---|---|
| `AmbientLight` | `0xffffff, 0.45` | Ánh sáng môi trường cố định, không đến từ Mặt Trời |
| `PointLight` | `0xfff5e0, 80000, 0` | Ánh sáng điểm từ tâm, cường độ衰减 theo khoảng cách (inverse-square) |
| `toneMappingExposure` | `1.3` | Phơi sáng tổng thể |

### Vấn đề

1. **Inverse-square law**: `PointLight` giảm cường độ theo bình phương khoảng cách → các hành tinh xa (Sao Hải Vương ~4500 unit) nhận rất ít ánh sáng
2. **AmbientLight cố định**: Không mang tính "đến từ Mặt Trời", làm mất cảm giác trung tâm
3. **Không có hiệu ứng tỏa sáng**: Thiếu visual cue cho thấy ánh sáng lan tỏa từ Mặt Trời ra toàn hệ

---

## Kế Hoạch Thực Hiện

### Phase 1: Multi-Layer Sunlight System

#### 1.1 — Secondary Fill Light với Custom Decay

Thêm một `PointLight` thứ hai tại gốc tọa độ nhưng dùng **decay thấp hơn** để ánh sáng không giảm nhanh ở khoảng cách xa:

```js
// Primary light — inverse-square (decay=2), physically correct cho vùng gần
const sunLightPrimary = new THREE.PointLight(0xfff5e0, 80000, 0);
sunLightPrimary.castShadow = true;
sunLightPrimary.decay = 2; // Mặc định Three.js

// Secondary fill light — decay thấp (0.8) để vùng xa vẫn nhận ánh sáng
const sunLightFill = new THREE.PointLight(0xffeedd, 8000, 0);
sunLightFill.decay = 0.8; // <-- Khác biệt then chốt: giảm chậm hơn inverse-square
scene.add(sunLightFill);
```

**Tại sao không chỉ tăng cường độ đèn chính?** Vì hai đèn cùng vị trí + cùng decay = chỉ là một đèn mạnh hơn, không thay đổi đường cong衰减. Decay khác nhau → fill light chiếm ưu thế ở vùng xa, primary chiếm ưu thế ở vùng gần.

**Bảng so sánh decay:**

| Decay | Công thức | Ánh sáng tại 4500 units (so với gốc) |
|---|---|---|
| 2 (inverse-square) | `I / d²` | ~0.000005x |
| 1 (linear) | `I / d` | ~0.0002x |
| 0.8 (custom) | `I / d^0.8` | ~0.001x — vẫn nhìn thấy |
| 0 (no decay) | `I` | 1x — không thực tế |

#### 1.2 — Hemisphere Light mô phỏng ánh sáng tán xạ

```js
// Ánh sáng tán xạ từ "không gian" — sky từ hướng Mặt Trời, ground tối
const hemiLight = new THREE.HemisphereLight(0xfff0cc, 0x080815, 0.3);
scene.add(hemiLight);
```

**Lý do**: Tạo cảm giác ánh sáng đến từ một hướng (Mặt Trời), không phải ambient đều khắp.

---

### Phase 2: Volumetric Light Shaft Effect

#### 2.1 — Selective Bloom (Chỉ bloom Mặt Trời)

`UnrealBloomPass` mặc định bloom **tất cả** pixel vượt threshold — bao gồm UI overlay, labels, orbit lines. Kết quả rất xấu.

**Giải pháp**: Dùng `THREE.Layers` để bloom chỉ áp dụng cho Mặt Trời:

```js
// Định nghĩa bloom layer
const BLOOM_LAYER = 1;

// Gán Mặt Trời (và corona/glow) vào bloom layer
sun.layers.enable(BLOOM_LAYER);
sunCorona.layers.enable(BLOOM_LAYER);
outerGlow.layers.enable(BLOOM_LAYER);

// Các object khác KHÔNG enable layer 1 → không bị bloom
// (mặc định mọi object ở layer 0)
```

```js
// Trong postprocessing.js — render 2 pass rồi blend
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Pass 1: Render scene thường (không bloom layer)
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Pass 2: Bloom — chỉ render objects ở BLOOM_LAYER
const bloomComposer = new EffectComposer(renderer);
const bloomRenderPass = new RenderPass(scene, camera);
bloomRenderPass.layers = new THREE.Layers();
bloomRenderPass.layers.set(BLOOM_LAYER);
bloomComposer.addPass(bloomRenderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.5,  // strength
  0.4,  // radius
  0.85  // threshold
);
bloomComposer.addPass(bloomPass);

// Pass 3: Blend bloom vào scene chính
// (dùng ShaderPass với custom blend shader)
```

**Tham khảo**: `three.js examples/webgl_postprocessing_unreal_bloom_selective`

#### 2.2 — Light Cone / Volumetric Shafts (Optional)

Tạo các nón sáng mờ từ Mặt Trời bằng custom shader:

- Dùng `ConeGeometry` với material transparent + additive blending
- Xoay ngẫu nhiên để tạo hiệu ứng "tia sáng"
- Opacity rất thấp (~0.03-0.05) để không gây chói

---

### Phase 3: Adaptive Sunlight Intensity

#### 3.1 — Camera-Based Exposure (Logarithmic Compensation)

Điều chỉnh `toneMappingExposure` dựa trên khoảng cách camera đến Mặt Trời:

```js
function updateSunlightExposure(cameraPosition) {
  const dist = cameraPosition.length();
  const normalized = dist / 4500; // Neptune = 1.0
  // Logarithmic compensation — tự nhiên hơn tuyến tính
  // log1p(0) = 0 → exposure = 1.0 (gần Mặt Trời)
  // log1p(1) ≈ 0.693 → exposure ≈ 1.55 (Neptune)
  // log1p(10) ≈ 2.4 → exposure ≈ 2.9 (xa hơn)
  const exposure = THREE.MathUtils.clamp(
    1.0 + Math.log1p(normalized) * 0.8,
    1.0,
    2.5
  );
  renderer.toneMappingExposure = exposure;
}
```

**Tại sao không dùng tuyến tính?** Ánh sáng mất theo inverse-square (bình phương), nên compensation cần theo logarithmic hoặc căn bậc hai để tự nhiên. Công thức tuyến tính `1 + dist * 0.0003` cho exposure = 2.35 ở Neptune — quá cao, gây wash-out.

**So sánh:**

| Khoảng cách | Tuyến tính (cũ) | Logarithmic (mới) |
|---|---|---|
| 0 (Mặt Trời) | 1.0 | 1.0 |
| 500 | 1.15 | 1.37 |
| 2000 | 1.6 | 1.63 |
| 4500 (Neptune) | 2.35 | 1.83 |
| 10000 | 4.0 → clamp 3.0 | 2.17 |

#### 3.2 — Planet Material Brightness Adjustment (Thế cho Light Boost)

Thay vì đặt PointLight tại mỗi hành tinh (anti-pattern: sáng sai hướng, N draw calls), điều chỉnh **material** của hành tinh xa để phản chiếu nhiều ánh sáng hơn:

```js
// Trong createPlanet.js — khi tạo hành tinh xa
function createPlanet(data) {
  const material = new THREE.MeshStandardMaterial({
    map: data.texture,
    roughness: data.roughness,
    metalness: data.metalness,
  });

  // Hành tinh xa → giảm roughness, tăng emissive nhẹ để "bắt sáng" tốt hơn
  if (data.distanceFromSun > 2000) {
    material.roughness = Math.max(0.3, material.roughness * 0.7);
    material.emissive = new THREE.Color(0x332200); // Ánh sáng ấm nhẹ
    material.emissiveIntensity = 0.15; // Không tự phát sáng, chỉ "giữ ấm"
  }

  return new THREE.Mesh(geometry, material);
}
```

**Tại sao đúng hơn?**
- Ánh sáng vẫn đến từ đúng hướng (Mặt Trời)
- Không thêm draw calls
- EmissiveIntensity thấp (0.15) chỉ bù đắp vùng tối, không biến hành tinh thành đèn

---

### Phase 4: Visual Sunlight Indicators

#### 4.1 — Sun Glow Sprite

Thêm sprite phát sáng quanh Mặt Trời, luôn nhìn thấy dù ở khoảng cách nào:

```js
const glowTexture = createGlowTexture(); // Radial gradient texture
const glowSprite = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffdd88,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
glowSprite.scale.set(40, 40, 1); // Luôn lớn, dễ nhìn
sun.add(glowSprite);
```

#### 4.2 — Light Direction Indicator

Thêm mũi tên/đường mờ chỉ hướng từ mỗi hành tinh về Mặt Trời (toggle được):

```js
// Vẽ đường mờ từ hành tinh về Mặt Trời
function createSunlightPath(planetPosition) {
  const points = [planetPosition, new THREE.Vector3(0, 0, 0)];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0xffdd88,
    transparent: true,
    opacity: 0.15,
  });
  return new THREE.Line(geometry, material);
}
```

---

### Phase 5: Sun Corona & Surface Enhancement

#### 5.1 — Tăng cường Corona hiện tại

Trong `src/sun.js`, điều chỉnh corona để tỏa sáng hơn:

- Tăng `uInnerColor` brightness: `0xffe8a0` → `0xfff5cc`
- Giảm falloff exponent: `3.0` → `2.0` (corona rộng hơn)
- Tăng alpha multiplier: `0.7` → `0.9`

#### 5.2 — Thêm Outer Glow Layer

Thêm lớp glow thứ 3 ngoài corona (bán kính 2.0x):

```js
export function createSunOuterGlow(radius) {
  const geometry = new THREE.SphereGeometry(2.0, 64, 64);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffcc66) },
      uTime: { value: 0 },
    },
    vertexShader: outerGlowVertexShader,
    fragmentShader: outerGlowFragmentShader,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.setScalar(radius);
  return mesh;
}
```

---

### Phase 6: Corona Structural Enhancement — Fix "Flat Corona"

> **Nhận xét từ review**: Corona hiện tại bị "flat" — viền ngoài hình tròn hoàn hảo, alpha falloff đơn điệu, không có cấu trúc streamers/spicules. Nguyên nhân: shader dùng pure radial distance để tính alpha.

#### 🔬 Chẩn Đoán

| Triệu chứng | Nguyên nhân gốc |
|---|---|
| Viền ngoài hình tròn hoàn hảo | Boundary đều, như vẽ bằng compass |
| Alpha falloff đơn điệu | Mờ dần theo hàm đơn giản (linear/power), không có texture |
| Không có cấu trúc | Corona thực tế có streamers, spicules, vùng sáng/tối không đều |

#### 6.1 — Noise-Modulated Falloff (P0)

Thay vì alpha chỉ phụ thuộc vào distance, thêm **fbm (Fractal Brownian Motion)** làm biến dạng khoảng cách nhận thức:

```glsl
// ── Value Noise 2D — thêm vào đầu fragment shader
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f); // smoothstep
  return mix(
    mix(hash(i + vec2(0,0)), hash(i + vec2(1,0)), u.x),
    mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x),
    u.y
  );
}

// ── Fractal Brownian Motion — 4 octaves tạo cấu trúc tự nhiên
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * valueNoise(p);
    p *= 2.1;          // tăng frequency mỗi octave
    amplitude *= 0.5;  // giảm amplitude
  }
  return value;
}
```

**Tại sao fbm 4 octaves?** Noise đơn trông đơn điệu — fbm tạo ra cấu trúc tự nhiên giống mây/lửa ở nhiều tỉ lệ khác nhau.

#### 6.2 — Sửa Fragment Shader Corona (P0)

```glsl
uniform float uTime;
uniform vec3 uInnerColor;    // 0xfff5cc
uniform vec3 uOuterColor;    // 0xff8800
uniform float uFalloffExp;   // 2.0
uniform float uNoiseAmp;     // 0.18

varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
  // Fresnel base — sáng ở viền, tối ở trung tâm
  float fresnel = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDir)));
  
  // Lấy UV trên sphere để sample noise
  vec2 noiseUV = vNormal.xy * 2.5 + uTime * 0.05;
  
  // Noise modulation — biên độ 0.18 = viền lồi lõm ~18% radius
  float n = fbm(noiseUV);
  float noiseOffset = (n - 0.5) * uNoiseAmp;
  
  // Fresnel bị distort bởi noise
  float distortedFresnel = fresnel + noiseOffset;
  distortedFresnel = clamp(distortedFresnel, 0.0, 1.0);
  
  // Falloff
  float alpha = pow(distortedFresnel, uFalloffExp) * 0.9;
  
  // Màu: nội tâm sáng → ngoại vi cam đỏ
  vec3 color = mix(uInnerColor, uOuterColor, 1.0 - distortedFresnel);
  
  // Thêm noise vào color để tạo streamer
  color += vec3(n * 0.15, n * 0.05, 0.0);
  
  gl_FragColor = vec4(color, alpha);
}
```

#### 6.3 — Multi-Layer Corona (P1)

Một layer duy nhất dù có noise vẫn trông hơi phẳng. Dùng **3 layers** với scale và noise khác nhau:

```js
// src/sun.js
export function createSunCorona(radius) {
  const layers = [
    { scale: 1.15, opacity: 0.90, noiseAmp: 0.12, falloff: 2.5 },  // Inner glow — chặt
    { scale: 1.40, opacity: 0.55, noiseAmp: 0.20, falloff: 2.0 },  // Mid corona — vừa
    { scale: 1.85, opacity: 0.20, noiseAmp: 0.30, falloff: 1.5 },  // Outer halo — loãng
  ];

  const group = new THREE.Group();

  layers.forEach(({ scale, opacity, noiseAmp, falloff }) => {
    const geo = new THREE.SphereGeometry(radius, 64, 64);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:       { value: 0 },
        uInnerColor: { value: new THREE.Color(0xfff5cc) },
        uOuterColor: { value: new THREE.Color(0xff6600) },
        uFalloffExp: { value: falloff },
        uNoiseAmp:   { value: noiseAmp },
        uOpacity:    { value: opacity },
      },
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(scale);
    group.add(mesh);
  });

  return group;
}
```

**Tại sao 3 layers?**

| Layer | Scale | Opacity | NoiseAmp | Vai trò |
|---|---|---|---|---|
| Inner | 1.15 | 0.90 | 0.12 | Vùng sáng ngay sát bề mặt, chặt và sáng |
| Mid | 1.40 | 0.55 | 0.20 | Phần corona chính, noise nhiều để tạo cấu trúc |
| Outer | 1.85 | 0.20 | 0.30 | Halo mờ rộng, fix vấn đề "boundary rõ ràng" |

#### 6.4 — Animate Corona (P1)

```js
// Trong animation loop
function updateSun(deltaTime) {
  sun.coronaGroup.children.forEach((mesh, i) => {
    mesh.material.uniforms.uTime.value += deltaTime * (0.3 + i * 0.1);
    // Mỗi layer chạy tốc độ hơi khác nhau → tránh periodic artifact
  });
}
```

Tốc độ animation rất chậm (0.3-0.5) — mắt thường sẽ thấy corona "thở" nhẹ chứ không thấy đang animate.

#### Kết Quả Mong Đợi Phase 6

| Trước | Sau |
|---|---|
| Viền corona hình tròn đều | Irregular, có nhô/lõm |
| Gradient đơn sắc | Có streamer/spicule |
| Ranh giới space rõ, cứng | Fade out mềm mại |
| Static | "Thở" nhẹ |

---

## Thứ Tự Ưu Tiên

| Priority | Phase | Effort | Impact |
|---|---|---|---|
| 🔴 P0 | Phase 1.1: Secondary Fill Light (custom decay) | Thấp | Cao nhất |
| 🔴 P0 | Phase 6.1-6.2: Noise-Modulated Corona Falloff | Trung bình | Cao nhất |
| 🔴 P0 | Phase 6.3: Multi-Layer Corona (3 layers) | Trung bình | Cao nhất |
| 🟡 P1 | Phase 6.4: Corona Animation (uTime per layer) | Thấp | Cao |
| 🟡 P1 | Phase 3.1: Adaptive Exposure (logarithmic) | Thấp | Cao |
| 🟡 P1 | Phase 4.1: Sun Glow Sprite | Thấp | Trung bình |
| 🟡 P1 | Phase 3.2: Planet Material Brightness | Thấp | Trung bình |
| 🟢 P2 | Phase 2.1: Selective Bloom | Trung bình | Cao |
| 🟢 P2 | Phase 4.2: Light Path Lines | Thấp | Trung bình |
| 🔵 P3 | Phase 2.2: Volumetric Shafts | Cao | Thấp (visual only) |

---

## File Cần Sửa

| File | Thay đổi |
|---|---|
| `src/scene.js` | Thêm secondary fill light (decay=0.8), hemisphere light, adaptive exposure (logarithmic) |
| `src/sun.js` | Thêm fbm() noise, multi-layer corona (3 layers), outer glow layer, animation per layer |
| `src/postprocessing.js` | Thêm Selective Bloom qua THREE.Layers |
| `src/createPlanet.js` | Planet material brightness cho hành tinh xa, corona group thay vì single mesh |
| `src/main.js` | Update uTime cho từng corona layer, outer glow, sunlight paths |
| `src/ui.js` | Thêm nút toggle sunlight paths |

---

## Kết Quả Mong Đợi

1. **Mọi hành tinh** — từ Sao Thủy đến Kuiper Belt — đều nhận ánh sáng rõ ràng từ Mặt Trời
2. **Visual cue mạnh**: Người dùng nhìn vào thấy ngay "ánh sáng tỏa từ trung tâm"
3. **Không gây chói**: Ánh sáng đồng đều, không burn-out ở gần Mặt Trời
4. **Performance**: Không impact đáng kể (thêm 1-2 lights, bloom pass đã có sẵn infrastructure)
5. **Corona tự nhiên**: Viền không còn hình tròn đều, có streamers/spicules, "thở" nhẹ theo thời gian
