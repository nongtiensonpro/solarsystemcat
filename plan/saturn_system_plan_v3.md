# Kế Hoạch Hệ Sao Thổ — Vành Đai Rõ Nét & Mật Độ Vệ Tinh Ảo

> **Dự án:** Solar System 3D
> **Phiên bản:** 3.0
> **Ngày cập nhật:** 2026-05-16
> **Mục tiêu cốt lõi:**
> 1. Người dùng nhìn vào Sao Thổ lần đầu thấy ngay vành đai đẹp, có cấu trúc.
> 2. Người dùng cảm nhận hệ vệ tinh đông đúc và vĩ đại dù không render hết 292 vệ tinh.
> 3. Chỉ những vệ tinh có dữ liệu đầy đủ mới được hiển thị thật — phần còn lại dùng kỹ thuật tạo ảo giác mật độ.

---

## 0. Nguyên Tắc Thiết Kế

**Nguyên tắc 1 — Vành đai là nhân vật chính.**
Mọi quyết định layout, render order, camera, orbit line đều phải tự hỏi: *"Quyết định này có làm vành đai bị che khuất không?"* Nếu có — tìm cách khác.

**Nguyên tắc 2 — Thật ít, ảo nhiều, trải nghiệm phải như thật nhiều.**
24 vệ tinh có dữ liệu đầy đủ được render thật. Hàng trăm vệ tinh còn lại được mô phỏng bằng kỹ thuật — người dùng không cần biết đâu là thật đâu là ảo, miễn là cảm giác đúng.

**Nguyên tắc 3 — Không hiển thị dữ liệu thiếu.**
Vệ tinh không có đủ `radius`, `orbitalPeriod`, `semiMajorAxisKm`, `inclination` thì không được render thành object riêng. Thay vào đó chúng đóng góp vào hệ thống mật độ ảo.

---

## 1. Mục Tiêu và Tiêu Chí Nghiệm Thu

### 1.1 Must-have

| # | Mục tiêu | Tiêu chí nghiệm thu |
|---|---|---|
| M1 | Cassini Division nhìn rõ từ camera mặc định | Thấy khoảng tối giữa A ring và B ring ở distance 180 |
| M2 | Vành đai có cấu trúc nhiều lớp | A/B/C ring khác nhau về độ sáng; Encke Gap thấy được |
| M3 | Camera mặc định ở góc tối ưu | 28° so với mặt phẳng xích đạo, distance 180, animate vào |
| M4 | H0 heroes có texture/bề mặt riêng | Không vệ tinh H0 nào dùng fallback màu đơn sắc |
| M5 | Cảm giác có rất nhiều vệ tinh | Ghost moon cloud hiển thị ở outer region và irregular band |
| M6 | Orbit line không che vành đai | H1 orbit ẩn mặc định; H2 ghost không có orbit line riêng |
| M7 | Enceladus plume hiển thị | Thấy plume cực nam khi camera < 30 units |
| M8 | Không vệ tinh nào nằm trong mesh Sao Thổ | Pericenter > `saturn.displayRadius + 2` |

### 1.2 Should-have

| # | Mục tiêu |
|---|---|
| S1 | Ring shadow đổ lên bề mặt Sao Thổ |
| S2 | Ring forward scattering khi xem backlit |
| S3 | Tooltip fact tiếng Việt khi hover H0/H1 |
| S4 | Ghost moons có chuyển động đủ để thấy sự chuyển động của hệ |
| S5 | Intro animation zoom từ xa vào Saturn view |
| S6 | Camera preset: Ring View, Polar View, Close View |

### 1.3 Won't-have

- Render từng vệ tinh H2 không đủ dữ liệu thành mesh riêng.
- Orbit mechanics ephemeris thời gian thực từng vệ tinh H2.
- Texture thủ công cho irregular moons.

---

## 2. Phân Loại Vệ Tinh — Thật và Ảo

### 2.1 Định nghĩa "dữ liệu đầy đủ"

Một vệ tinh được coi là có đủ dữ liệu để render thật khi có đầy đủ **tất cả** các trường sau:

```
radiusKm          — bán kính vật lý (km)
semiMajorAxisKm   — bán trục lớn quỹ đạo (km)
orbitalPeriod     — chu kỳ quỹ đạo (ngày)
eccentricity      — độ lệch tâm
inclination       — độ nghiêng quỹ đạo (degrees)
```

Thiếu bất kỳ trường nào → vệ tinh đó **không được render riêng** mà đóng góp vào Ghost Moon System (xem mục 4).

### 2.2 Danh sách vệ tinh render thật (Real Moons)

Dựa trên dữ liệu JPL/MPC hiện tại, chia làm 2 tier:

#### Tier H0 — Hero Moons (9 vệ tinh, luôn hiển thị)

| Vệ tinh | Radius (km) | Đặc điểm nổi bật |
|---|---:|---|
| Mimas | 198.2 | Crater Herschel, trông như Death Star |
| Enceladus | 252.1 | Tiger stripes, plume nước ở cực nam |
| Tethys | 533.0 | Odysseus crater khổng lồ, Ithaca Chasma |
| Dione | 561.4 | Wispy terrain — vách đá băng trắng |
| Rhea | 764.3 | Nhiều hố va chạm nhất trong nhóm |
| Titan | 2575.0 | Lớn hơn Sao Thủy, khí quyển cam dày |
| Hyperion | 135.0 | Hình xốp bất quy tắc, màu vàng rỉ |
| Iapetus | 734.5 | Hai bán cầu trắng/đen hoàn toàn khác nhau |
| Phoebe | 106.5 | Retrograde, bề mặt tối carbon |

#### Tier H1 — Named Moons có đủ dữ liệu (15 vệ tinh, hiển thị mặc định)

| Vệ tinh | Nhóm | Ghi chú |
|---|---|---|
| Pan | Ring shepherd | Encke Gap — hình dẹt như đĩa bay |
| Daphnis | Ring shepherd | Keeler Gap — tạo sóng trên vành A |
| Atlas | Ring shepherd | Dẹt ở xích đạo |
| Prometheus | F ring shepherd | Tương tác rõ với F ring |
| Pandora | F ring shepherd | Outer F ring shepherd |
| Epimetheus | Co-orbital | Hoán đổi quỹ đạo với Janus |
| Janus | Co-orbital | Hiện tượng co-orbital độc đáo |
| Aegaeon | G ring | Moonlet nhỏ trong G ring |
| Methone | Alkyonides | Hình oval mịn bất thường |
| Anthe | Alkyonides | Cực nhỏ |
| Pallene | Alkyonides | Tạo Pallene ring mờ |
| Telesto | Tethys Trojan L4 | |
| Calypso | Tethys Trojan L5 | |
| Helene | Dione Trojan L4 | Bề mặt có rãnh |
| Polydeuces | Dione Trojan L5 | |

**Tổng real moons: 24 vệ tinh.**

### 2.3 Phần còn lại — Ghost Moon System

Toàn bộ 268+ vệ tinh còn lại (irregular moons chưa có đủ dữ liệu vật lý) **không render thành object riêng**. Thay vào đó, số lượng của chúng được dùng như input để sinh ra Ghost Moon System (xem mục 4).

Dữ liệu quỹ đạo thô (semiMajorAxisKm, inclination, prograde/retrograde) của các vệ tinh này vẫn được load vào catalog để:
- Xác định phân bố không gian thực tế của ghost cloud.
- Giữ scientific accuracy về *vùng* phân bố, không cần accuracy từng cá thể.

---

## 3. Vành Đai — Spec Kỹ Thuật Chi Tiết

### 3.1 Cấu trúc vành đai cần render

**Đây là phần bắt buộc implement trước mọi thứ khác.**

| Vùng vành | Bán kính vật lý (km) | Display radius (units) | Opacity | Màu sắc |
|---|---|---:|---|---|
| D ring | 67,000 – 74,500 | 14.9 – 16.5 | 0.05 – 0.08 | Xám rất nhạt |
| C ring | 74,500 – 92,000 | 16.5 – 20.4 | 0.20 – 0.30 | Xám/nâu nhạt |
| B ring | 92,000 – 117,580 | 20.4 – 26.1 | 0.85 – 0.95 | Trắng kem — sáng nhất |
| **Cassini Division** | **117,580 – 122,170** | **26.1 – 27.1** | **0.04** | **Tối — xuyên thấy Sao Thổ** |
| A ring | 122,170 – 136,775 | 27.1 – 30.4 | 0.70 – 0.80 | Trắng hơi vàng |
| **Encke Gap** | **133,589 – 133,777** | **~29.65** | **0.03** | **Khe tối trong A ring** |
| F ring | ~140,180 | ~31.1 | 0.30 – 0.40 | Trắng, rất mảnh |
| G ring | ~170,000 | ~37.8 | 0.04 | Mờ, rộng |
| E ring | 180,000 – 480,000 | 40 – 106 | 0.015 | Cực mờ, chỉ gợi ý |

> **Quy ước:** `display_radius = (physical_km / 58232) * 9.45`. Saturn display radius = 9.45 units.

### 3.2 Kỹ thuật render

#### Asset texture vành đai

```
public/textures/saturn/
  ring-colormap.png     # 4096 × 1 px — màu từ D đến F ring theo trục X
  ring-alpha.png        # 4096 × 1 px — opacity từ D đến F ring theo trục X
  ring-normal.png       # 2048 × 1 px — gợn sóng nhẹ trên B ring (optional)
```

Pixel tại vị trí tương ứng Cassini Division và Encke Gap phải có alpha < 0.05 — đây là điểm bắt buộc để người dùng nhận ra ngay đây là Sao Thổ.

#### Ring geometry setup

```javascript
const ringGeometry = new THREE.RingGeometry(
  D_RING_INNER,   // 14.9
  F_RING_OUTER,   // 31.5
  256,            // thetaSegments — đủ mịn
  4               // phiSegments
);

const ringMaterial = new THREE.MeshBasicMaterial({
  map: ringColormap,
  alphaMap: ringAlpha,
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
});

ring.renderOrder = 1; // render sau Saturn mesh, trước orbit lines
```

#### Ring UV mapping theo hướng tâm

RingGeometry mặc định của Three.js không map UV đúng theo hướng tâm. Cần custom UV:

```javascript
// Sau khi tạo RingGeometry, remap UV theo radius
const positions = ringGeometry.attributes.position;
const uvs = ringGeometry.attributes.uv;

for (let i = 0; i < positions.count; i++) {
  const x = positions.getX(i);
  const y = positions.getY(i);
  const r = Math.sqrt(x * x + y * y);
  // Normalize radius từ D_RING_INNER đến F_RING_OUTER về [0, 1]
  const u = (r - D_RING_INNER) / (F_RING_OUTER - D_RING_INNER);
  uvs.setXY(i, u, 0.5); // v = 0.5 vì texture là 1D strip
}
uvs.needsUpdate = true;
```

#### Ring shadow trên Saturn (S1 — Should-have)

```javascript
// Projected decal hoặc custom shader trên Saturn sphere
// Shadow band chỉ đổ ở phía đối diện ánh sáng
// Opacity shadow tỷ lệ với ring-alpha tại radius tương ứng (B ring đổ bóng đậm nhất)
const ringShadowTexture = generateRingShadowTexture(ringAlphaData);
saturnMaterial.uniforms.ringShadow = { value: ringShadowTexture };
saturnMaterial.uniforms.ringInner = { value: D_RING_INNER };
saturnMaterial.uniforms.ringOuter = { value: F_RING_OUTER };
```

#### Ring forward scattering (S2 — Should-have)

```glsl
// Fragment shader cho ring — tăng sáng khi camera ở phía mặt trời nhìn về
float backlit = pow(max(0.0, -dot(normalize(vViewDir), normalize(uLightDir))), 6.0);
finalColor += vec3(0.9, 0.95, 1.0) * backlit * ringAlpha * 0.5;
```

### 3.3 Render order toàn cảnh

```javascript
saturn.mesh.renderOrder       = 0;
saturnRing.renderOrder        = 1;  // vành đai trên Saturn
moonOrbit_H0.renderOrder      = 2;  // orbit H0 trên vành
ghost_cloud.renderOrder       = 2;  // ghost moons cùng layer orbit
moon_H0.renderOrder           = 3;
moon_H1.renderOrder           = 3;
labels.renderOrder            = 10;
```

### 3.4 Checklist vành đai — phải pass trước khi làm vệ tinh

- [ ] Cassini Division thấy rõ ở camera distance 180.
- [ ] B ring sáng hơn A ring, A ring sáng hơn C ring rõ ràng.
- [ ] Encke Gap thấy như khe tối mảnh trong A ring.
- [ ] Ring render từ cả hai mặt (DoubleSide).
- [ ] Không z-fighting với Saturn mesh.
- [ ] FPS không giảm > 10% so với khi tắt ring.

---

## 4. Ghost Moon System — Tạo Ảo Giác Mật Độ Vệ Tinh

Đây là kỹ thuật trung tâm của phiên bản này. Mục tiêu: người dùng nhìn vào outer region của Sao Thổ và cảm thấy *"có rất nhiều thứ đang bay ở đó"* — dù không có vệ tinh thật nào được render ở đó.

### 4.1 Triết lý thiết kế Ghost System

> Não người không đếm được số lượng vật thể chuyển động — não chỉ nhận ra "thưa" hay "dày". Ghost Moon System khai thác điều này: dùng vài trăm điểm sáng nhỏ chuyển động hợp lý để não tự cảm nhận "có rất nhiều vệ tinh".

Ghost không cần:
- Mesh chi tiết.
- Texture riêng.
- Orbit line.
- Label.
- Data chính xác từng cá thể.

Ghost cần:
- Kích thước và độ sáng phù hợp (không quá lớn, không quá nhỏ).
- Chuyển động theo đúng hướng (prograde/retrograde theo nhóm).
- Phân bố đúng vùng không gian thực tế của irregular moons.
- Số lượng đủ để tạo cảm giác dày — khoảng 150–300 ghost particles.

### 4.2 Ba vùng Ghost Cloud

#### Vùng A — Inner Ghost Band (giữa F ring và Mimas)

```
Display radius: 32 – 46 units
Mục đích: Gợi ý có nhiều moonlet nhỏ trong vùng này
Ghost count: 40 – 60 particles
Inclination jitter: ±2°  (gần mặt phẳng xích đạo)
Chuyển động: prograde, tốc độ cao (gần Sao Thổ)
Kích thước: 0.08 – 0.18 units
Opacity: 0.4 – 0.7
Màu: trắng băng #D0E8F0
```

#### Vùng B — Mid Ghost Band (giữa Mimas và Titan)

```
Display radius: 48 – 108 units
Mục đích: Tạo cảm giác có nhiều vệ tinh nhỏ xen giữa các H0
Ghost count: 50 – 80 particles
Inclination jitter: ±5°
Chuyển động: prograde, tốc độ trung bình
Kích thước: 0.06 – 0.14 units
Opacity: 0.3 – 0.5
Màu: xám nhạt #B8C8D0
```

#### Vùng C — Outer Irregular Cloud (ngoài Titan)

```
Display radius: 120 – 260 units
Mục đích: Hiển thị "đám mây" irregular moons — đây là ảnh tượng trưng
         cho 260+ vệ tinh bất quy tắc thực sự tồn tại
Ghost count: 120 – 180 particles
Inclination jitter: ±30° đến ±50° (irregular moons thực sự nghiêng nhiều)
Chuyển động: mix 70% prograde + 30% retrograde (phản ánh tỷ lệ thực)
Kích thước: 0.04 – 0.10 units
Opacity: 0.15 – 0.35  (mờ hơn — gợi ý từ xa)
Màu: xám tối #788090
```

### 4.3 Kỹ thuật render Ghost System

#### Dùng Points / PointsMaterial

Ghost moons là `THREE.Points` — một draw call cho toàn bộ hàng trăm ghost, cực kỳ nhẹ:

```javascript
class GhostMoonCloud {
  constructor(zone) {
    this.zone = zone;
    this.count = zone.ghostCount;
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

      // Inclination trong range của zone, có jitter
      const inclRange = this.zone.inclinationRange;
      this.inclinations[i] = lerp(inclRange[0], inclRange[1], seed()) * (seed() > 0.5 ? 1 : -1);

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
      uniforms: { color: { value: new THREE.Color(this.zone.color) } },
      vertexShader: GHOST_VERTEX_SHADER,
      fragmentShader: GHOST_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // additive blending — chồng lên nhau không bị vệt đen
    });

    this.points = new THREE.Points(this.geometry, this.material);
  }

  update(deltaTime) {
    for (let i = 0; i < this.count; i++) {
      this.phases[i] += this.speeds[i] * deltaTime;

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
```

#### Shader cho ghost particles

```glsl
// VERTEX SHADER
attribute float size;
attribute float opacity;
varying float vOpacity;

void main() {
  vOpacity = opacity;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (300.0 / -mvPosition.z); // scale với distance
  gl_Position = projectionMatrix * mvPosition;
}

// FRAGMENT SHADER
uniform vec3 color;
varying float vOpacity;

void main() {
  // Hình tròn mềm — không phải square pixel
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);
  float alpha = smoothstep(0.5, 0.2, dist); // soft circle
  gl_FragColor = vec4(color, alpha * vOpacity);
}
```

### 4.4 Cấu hình zone constants

```javascript
const GHOST_ZONES = {
  innerBand: {
    seedOffset: 1000,
    ghostCount: 50,
    radiusMin: 32, radiusMax: 46,
    inclinationRange: [0, 0.035],   // ±2° in radians
    retrogradeRatio: 0.0,
    sizeMin: 0.08, sizeMax: 0.18,
    opacityMin: 0.4, opacityMax: 0.7,
    color: '#D0E8F0',
  },
  midBand: {
    seedOffset: 2000,
    ghostCount: 65,
    radiusMin: 48, radiusMax: 108,
    inclinationRange: [0, 0.087],   // ±5°
    retrogradeRatio: 0.05,
    sizeMin: 0.06, sizeMax: 0.14,
    opacityMin: 0.3, opacityMax: 0.5,
    color: '#B8C8D0',
  },
  outerCloud: {
    seedOffset: 3000,
    ghostCount: 150,
    radiusMin: 120, radiusMax: 260,
    inclinationRange: [0.52, 0.87], // 30°–50°
    retrogradeRatio: 0.30,
    sizeMin: 0.04, sizeMax: 0.10,
    opacityMin: 0.15, opacityMax: 0.35,
    color: '#788090',
  },
};
```

### 4.5 LOD cho Ghost System — tránh render thừa

```javascript
function updateGhostVisibility(cameraDistance) {
  // Inner band: chỉ hiển thị khi camera đủ gần Sao Thổ
  ghostInner.visible = cameraDistance < 300;

  // Mid band: luôn hiển thị trong Saturn view
  ghostMid.visible = true;

  // Outer cloud: ẩn khi camera quá gần (nhìn close-up Saturn thì không cần)
  ghostOuter.visible = cameraDistance > 80;

  // Giảm ghost count khi camera rất xa (overview mode)
  if (cameraDistance > 500) {
    ghostOuter.material.uniforms.globalOpacity = { value: 0.5 };
  }
}
```

### 4.6 Khi người dùng chọn một ghost particle

Ghost particles không thể click (dùng Points không có raycasting từng particle hiệu quả). Nếu người dùng click vào vùng ghost cloud, hiển thị popup chung:

```
╔═══════════════════════════════════════╗
║  🌑 Vùng vệ tinh bất quy tắc         ║
║  ─────────────────────────────────── ║
║  Sao Thổ có hơn 260 vệ tinh bất quy  ║
║  tắc trong vùng này — đa số là các   ║
║  thiên thạch bị bắt giữ từ vành đai  ║
║  Kuiper hàng tỷ năm trước.            ║
║                          [Tìm hiểu]  ║
╚═══════════════════════════════════════╝
```

---

## 5. Camera và UX Quan Sát

### 5.1 Góc camera mặc định

```javascript
const SATURN_DEFAULT_VIEW = {
  distance: 180,
  inclination: 28,    // độ — thấy vành rõ mà không quá nghiêng
  azimuth: 30,        // lệch nhẹ để vành không thẳng đứng hoàn toàn
  fov: 45,
  animationDuration: 2200,  // ms, ease-in-out-cubic
  easing: 'easeInOutCubic',
};
```

### 5.2 Intro animation (lần đầu vào Saturn view)

```
0ms      → camera ở distance 2000, nhìn thẳng vào Saturn
0–700ms  → zoom nhanh vào distance 300 (ease-in)
700–2200ms → zoom tiếp về 180 + tilt về inclination 28° (ease-out)
2200ms   → dừng, bật interaction
```

Không lặp lại nếu đã vào Saturn view trong session.

### 5.3 Camera presets

| Preset | Phím tắt | distance | inclination | Mục đích |
|---|---|---:|---:|---|
| 🪐 Mặc định | `1` | 180 | 28° | Góc đẹp nhất xem vành |
| ↔ Ngang vành | `2` | 220 | 3° | Thấy vành mỏng như tờ giấy |
| ⬆ Cực | `3` | 280 | 82° | Thấy toàn bộ hệ vệ tinh và ghost cloud |
| 🔍 Gần | `4` | 55 | 35° | Chi tiết vành và Saturn surface |

Nút preset đặt góc dưới phải viewport Saturn view, hiện/ẩn theo context.

---

## 6. Layout Quỹ Đạo Real Moons

### 6.1 Vùng cấm

```
saturn.displayRadius = 9.45 units
F ring display outer = 31.5 units

Quy tắc:
- Vệ tinh thường: displayOrbitRadius >= 34.0 (F ring outer + clearance 2.5)
- Ring-embedded (Pan, Daphnis, Aegaeon): ngoại lệ có chủ đích, dùng lane marker
- Không vệ tinh nào trong [0, saturn.displayRadius]
```

> ⚠️ **Làm rõ schema:** `rings.outerRadius = 2.34` trong data là **multiplier** của `saturn.displayRadius`. Phải thêm annotation `"unit": "multiplier_of_display_radius"` vào schema để tránh nhầm với giá trị tuyệt đối.

### 6.2 Slot layout H0 và H1

| Vệ tinh | Tier | Display Radius | Initial Phase° | Ghi chú |
|---|---|---:|---:|---|
| Pan | H1 | 29.65 | 15 | Encke Gap — ring-embedded, lane marker |
| Daphnis | H1 | 30.05 | 55 | Keeler Gap — ring-embedded |
| Atlas | H1 | 32.5 | 95 | F ring shepherd |
| Prometheus | H1 | 35.0 | 135 | F ring inner |
| Pandora | H1 | 37.5 | 175 | F ring outer |
| Epimetheus | H1 | 40.5 | 215 | Co-orbital Janus |
| Janus | H1 | 43.0 | 255 | Co-orbital Epimetheus |
| Aegaeon | H1 | 45.5 | 295 | G ring moonlet |
| **Mimas** | **H0** | **49.0** | 25 | Hero nhỏ nhất |
| Methone | H1 | 52.0 | 70 | Alkyonides |
| Anthe | H1 | 54.0 | 115 | Alkyonides |
| Pallene | H1 | 56.0 | 160 | Alkyonides |
| **Enceladus** | **H0** | **61.0** | 205 | Plume cực nam |
| **Tethys** | **H0** | **68.0** | 250 | Odysseus crater |
| Telesto | H1 | 71.0 | 290 | Trojan L4 Tethys |
| Calypso | H1 | 74.0 | 330 | Trojan L5 Tethys |
| **Dione** | **H0** | **79.0** | 20 | Wispy terrain |
| Helene | H1 | 82.0 | 75 | Trojan L4 Dione |
| Polydeuces | H1 | 85.0 | 130 | Trojan L5 Dione |
| **Rhea** | **H0** | **93.0** | 185 | Largest regular |
| **Titan** | **H0** | **115.0** | 240 | Lớn nhất — cần slot rộng |
| **Hyperion** | **H0** | **130.0** | 300 | Bất quy tắc, gần Titan |
| **Iapetus** | **H0** | **155.0** | 345 | Nghiêng, outer H0 |
| **Phoebe** | **H0** | **195.0** | 40 | Retrograde hero |

> **Lý do khoảng cách lớn:** Titan ở 115, Hyperion ở 130, Iapetus ở 155, Phoebe ở 195 — tạo cảm giác hệ vệ tinh rộng lớn. Ghost cloud ngoài 120 sẽ lấp đầy khoảng trống giữa các real moons này.

### 6.3 Orbit line policy

| Tầng | Orbit line | Khi nào hiển thị |
|---|---|---|
| H0 | Mảnh, opacity 0.35, màu trắng xanh | Luôn |
| H1 | — | Chỉ khi hover hoặc filter "Vành" bật |
| Ghost | Không có orbit line | — |

---

## 7. Bề Mặt Vệ Tinh

### 7.1 H0 — Texture riêng

```
public/textures/planets/
  mimas/       albedo.jpg, normal.jpg
  enceladus/   albedo.jpg, normal.jpg, roughness.jpg
  tethys/      albedo.jpg, normal.jpg
  dione/        albedo.jpg
  rhea/         albedo.jpg
  titan/        albedo.jpg, haze.jpg  (đã có, cần nâng)
  hyperion/    albedo.jpg  (hoặc procedural)
  iapetus/     albedo.jpg  (two-tone map)
  phoebe/       albedo.jpg  (hoặc procedural)
```

### 7.2 H1 — Procedural mesh và material

Module `src/smallMoonSurface.js`:

```javascript
// Shape presets
const SHAPE_PRESETS = {
  saucer:       { scaleY: 0.55, scaleXZ: 1.0 },   // Pan, Atlas
  potato:       { noise: 0.25, seed: id },          // hầu hết H1
  shard:        { noise: 0.40, seed: id },           // Hyperion-like
  oval:         { scaleY: 1.15, noise: 0.05 },      // Methone
  'dark-cratered': { noise: 0.20, roughness: 0.95, color: '#3A3A45' },
  'icy-chip':   { noise: 0.15, roughness: 0.6, color: '#C8DCE8' },
};

// Surface profiles theo nhóm
const SURFACE_PROFILES = {
  'ring-shepherd':  { preset: 'potato', color: '#8A9098', roughness: 0.90 },
  'ring-embedded':  { preset: 'saucer', color: '#7A8088', roughness: 0.92 },
  'alkyonides':     { preset: 'oval',   color: '#C0D8E4', roughness: 0.50 },
  'trojan':         { preset: 'potato', color: '#B0C4D0', roughness: 0.70 },
};
```

### 7.3 Enceladus Plume

```javascript
const PLUME_CONFIG = {
  origin: new THREE.Vector3(0, -enceladusDisplayRadius, 0),
  direction: new THREE.Vector3(0, -1, 0),
  spreadAngle: 18,          // degrees
  particleCount: 350,
  speedRange: [0.02, 0.06],
  lifetimeRange: [60, 120], // frames
  color: new THREE.Color(0.88, 0.94, 1.0),
  opacityNear: 0.35,
  fadeStart: 30,            // units — bắt đầu fade
  fadeEnd: 80,              // units — ẩn hoàn toàn
};
```

Checklist plume:
- [ ] Thấy từ phía cực nam khi camera < 30 units.
- [ ] Không che lấp toàn bộ vệ tinh.
- [ ] FPS không giảm (particle count <= 400).
- [ ] Ẩn ở khoảng cách > 80 units.

---

## 8. Nguồn Dữ Liệu

### 8.1 Cấu trúc file

```
public/data/
  solar-system.json             # Hành tinh + H0 Saturn moons
  saturn-moons.catalog.json     # 24 real moons với đủ data
  saturn-moons.ghost-config.json  # Config zone ghost cloud (không phải per-moon data)
  saturn-moons.sources.json     # Attribution, ngày snapshot, count
```

### 8.2 Schema vệ tinh real moon

```json
{
  "id": "enceladus",
  "parentId": "saturn",
  "name": { "vi": "Enceladus", "en": "Enceladus" },
  "designation": "Saturn II",
  "type": "moon",
  "saturnMoon": {
    "group": "regular-major",
    "lodTier": "hero",
    "source": "JPL SSD SAT365",
    "catalogSnapshot": "2026-05-16"
  },
  "physical": {
    "radiusKm": 252.1,
    "massKg": 1.08e20
  },
  "orbit": {
    "semiMajorAxisKm": 237948,
    "orbitalPeriod": 1.370218,
    "eccentricity": 0.0047,
    "inclination": 0.009
  },
  "render": {
    "displayOrbitRadius": 61,
    "physicalDisplayRadius": 4.2,
    "initialPhaseDeg": 205,
    "orbitPlane": "parentEquator",
    "layoutClass": "regular-major",
    "ringEmbedded": false,
    "ringLane": null,
    "surfaceProfile": "icy-active",
    "labelPriority": 1,
    "verticalLabelOffset": 1.5
  },
  "textures": {
    "albedo": "/textures/planets/enceladus/albedo.jpg",
    "normal": "/textures/planets/enceladus/normal.jpg",
    "roughness": "/textures/planets/enceladus/roughness.jpg"
  },
  "ui": {
    "factVi": "Enceladus phun nước lỏng ra vũ trụ từ các vết nứt ở cực nam — bằng chứng về đại dương ngầm bên dưới lớp băng.",
    "factEn": "Enceladus sprays liquid water into space from cracks at its south pole."
  }
}
```

### 8.3 Schema ghost config

```json
{
  "generatedAt": "2026-05-16",
  "totalIrregularMoons": 268,
  "note": "Ghost cloud đại diện cho 268 vệ tinh bất quy tắc không có đủ dữ liệu vật lý để render riêng",
  "zones": {
    "innerBand":  { "seedOffset": 1000, "ghostCount": 50,  "radiusMin": 32,  "radiusMax": 46,  "inclinationRangeDeg": [0, 2],    "retrogradeRatio": 0.00, "color": "#D0E8F0", "sizeMin": 0.08, "sizeMax": 0.18, "opacityMin": 0.4, "opacityMax": 0.7 },
    "midBand":    { "seedOffset": 2000, "ghostCount": 65,  "radiusMin": 48,  "radiusMax": 108, "inclinationRangeDeg": [0, 5],    "retrogradeRatio": 0.05, "color": "#B8C8D0", "sizeMin": 0.06, "sizeMax": 0.14, "opacityMin": 0.3, "opacityMax": 0.5 },
    "outerCloud": { "seedOffset": 3000, "ghostCount": 150, "radiusMin": 120, "radiusMax": 260, "inclinationRangeDeg": [30, 50],  "retrogradeRatio": 0.30, "color": "#788090", "sizeMin": 0.04, "sizeMax": 0.10, "opacityMin": 0.15,"opacityMax": 0.35 }
  }
}
```

---

## 9. UI/UX Saturn Panel

### 9.1 Layout khi ở Saturn view

```
[Viewport chính]
                                        [🪐] [↔] [⬆] [🔍]  ← camera presets
                                                              góc dưới phải

[bottom bar]:  🔍 Tìm vệ tinh...    [Chính] [Vành] [Tất cả]
```

### 9.2 Filter behavior

| Filter | Real moons hiển thị | Ghost | Orbit lines |
|---|---|---|---|
| **Chính** (default) | H0 + H1 | Cả 3 zone | H0 only |
| **Vành** | H0 + H1 ring/shepherd | Inner band only | H0 + H1 khi hover |
| **Tất cả** | H0 + H1 | Cả 3 zone, opacity +20% | H0 only |

Ghost cloud luôn hiển thị ở chế độ Chính và Tất cả — đây là yếu tố tạo cảm giác "đông đúc" mà người dùng thấy ngay.

### 9.3 Tooltip khi hover H0/H1

```
╔════════════════════════════════════╗
║  🌕  Enceladus  ·  Saturn II       ║
║  Đường kính: 504 km                ║
║  ─────────────────────────────── ║
║  Phun nước lỏng ra vũ trụ từ      ║
║  các vết nứt ở cực nam —           ║
║  bằng chứng đại dương ngầm.        ║
╚════════════════════════════════════╝
```

### 9.4 Popup khi click vùng ghost cloud

```
╔══════════════════════════════════════╗
║  🌑  Vùng vệ tinh bất quy tắc       ║
║  ─────────────────────────────────  ║
║  Sao Thổ có hơn 260 vệ tinh bất     ║
║  quy tắc trong vùng này. Đa số là   ║
║  thiên thạch bị bắt giữ từ vành     ║
║  đai Kuiper hàng tỷ năm trước.      ║
║                         [Tìm hiểu]  ║
╚══════════════════════════════════════╝
```

---

## 10. Kế Hoạch Triển Khai Theo Thứ Tự

### Phase 0 — Ring rendering ⭐ Không làm gì khác khi chưa pass checklist này

- [ ] Tạo `ring-colormap.png` và `ring-alpha.png` 4096×1.
- [ ] Custom UV mapping theo hướng tâm.
- [ ] Cassini Division thấy rõ ở distance 180.
- [ ] B ring sáng hơn A ring và C ring rõ ràng.
- [ ] Encke Gap thấy như khe tối trong A ring.
- [ ] DoubleSide — nhìn từ dưới vành vẫn thấy.
- [ ] Không z-fighting với Saturn mesh.

### Phase 1 — Camera mặc định

- [ ] Implement `SATURN_DEFAULT_VIEW` (incl=28°, distance=180, azimuth=30°).
- [ ] Intro animation 2200ms.
- [ ] 4 preset buttons + phím tắt 1–4.

### Phase 2 — Ghost Moon System

- [ ] Module `src/ghostMoonSystem.js` — Points, shader, update loop.
- [ ] Load `saturn-moons.ghost-config.json`.
- [ ] 3 ghost zones với đúng distribution và chuyển động.
- [ ] LOD: ẩn inner band khi distance > 300.
- [ ] Popup khi click vùng ghost.
- [ ] Kiểm thử: nhìn từ camera preset Cực (⬆) thấy outer cloud rõ.

### Phase 3 — H0 heroes

- [ ] Thêm 9 H0 vào catalog với slot mới (mục 6.2).
- [ ] Tạo thư mục texture từng H0.
- [ ] Enceladus plume particle system.
- [ ] Titan haze + atmosphere Fresnel.
- [ ] Iapetus two-tone albedo.
- [ ] Mimas Herschel crater bump map.

### Phase 4 — Chuẩn hóa render schema

- [ ] Normalize `physicalDisplayRadius`, `layoutClass`, `ringEmbedded`, `ringLane`, `lodTier`, `surfaceProfile`, `labelPriority`.
- [ ] Validation: vệ tinh thiếu data bắt buộc → warning + skip render, không crash.
- [ ] Annotation `rings.outerRadius` là multiplier.

### Phase 5 — H1 real moons

- [ ] Thêm 15 H1 vào catalog.
- [ ] `src/smallMoonSurface.js` — shape presets, procedural material.
- [ ] Pan/Atlas mesh dẹt (`saucer`).
- [ ] Gap lane marker cho Pan và Daphnis.
- [ ] H1 orbit ẩn mặc định.

### Phase 6 — Ring-embedded fix

- [ ] Z-fighting fix cho Pan/Daphnis (`polygonOffset` hoặc `renderOrder`).
- [ ] Label offset khỏi mặt phẳng vành.

### Phase 7 — UI và tooltip

- [ ] Search box cho 24 real moons.
- [ ] 3 filter buttons.
- [ ] Tooltip fact tiếng Việt H0 + H1 quan trọng.
- [ ] Popup ghost cloud.
- [ ] Camera preset buttons.

### Phase 8 — Ring shadow và scattering (Should-have)

- [ ] Ring shadow projected lên bề mặt Saturn.
- [ ] Forward scattering shader khi backlit.

### Phase 9 — Kiểm thử

- [ ] Build pass, không texture 404 cho H0.
- [ ] FPS >= 50 với ghost cloud đầy đủ.
- [ ] Cassini Division thấy rõ ở 4 preset camera.
- [ ] Ghost outer cloud thấy từ preset Cực (⬆).
- [ ] Plume Enceladus hoạt động.
- [ ] Không vệ tinh nào trong mesh Saturn.

---

## 11. Tiêu Chí Hoàn Thành

### Bắt buộc pass

- [ ] Cassini Division hiển thị rõ ràng từ camera mặc định.
- [ ] Camera mặc định vào Saturn view ở 28°, distance 180.
- [ ] 9 H0 có texture/bề mặt riêng.
- [ ] Enceladus plume hoạt động.
- [ ] Ghost cloud 3 zone hiển thị và chuyển động.
- [ ] Orbit lines H1 ẩn mặc định — vành đai không bị che.
- [ ] Popup ghost cloud khi click vùng irregular.
- [ ] Không vệ tinh nào trong mesh Saturn.
- [ ] Build pass, không texture 404.

### Nên pass

- [ ] Ring shadow trên Saturn.
- [ ] Ring forward scattering backlit.
- [ ] Intro animation mượt.
- [ ] FPS >= 50 ở tất cả preset.
- [ ] Tooltip fact tiếng Việt đầy đủ H0 + H1.

---

## 12. PR Đầu Tiên — Minimum Viable Impact

Nếu chỉ làm một PR, phải có đủ:

1. **Phase 0 hoàn toàn** — Ring với Cassini Division rõ.
2. **Phase 1 hoàn toàn** — Camera 28°.
3. **Phase 2 hoàn toàn** — Ghost Moon System outer cloud (150 ghost) — người dùng thấy ngay "có nhiều thứ bay quanh".
4. **Phase 3 một phần** — Titan + Enceladus (plume) + Iapetus.

Với 3 real moons chất lượng cao + ghost cloud + vành đai đúng cấu trúc, người dùng đã có trải nghiệm "wow" ngay lần đầu.

---

*Tài liệu này là source of truth. Mọi quyết định kỹ thuật không có trong tài liệu phải hỏi lại trước khi implement.*
