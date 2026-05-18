# Kế Hoạch Nâng Cấp Sao Chổi (Comet Enhancement Plan)

## Tổng quan

Sao chổi hiện chỉ có 1 thiên thể (Halley) với đuôi hình nón đơn giản, quầng sáng Fresnel, không texture bề mặt. Mục tiêu: nâng lên ngang tầm chất lượng với các hành tinh/vệ tinh khác.

---

## Phase 1: Dữ Liệu Sao Chổi Mới

### 1.1 Thêm 4 sao chổi nổi tiếng vào `public/data/solar-system.json`

| ID | Tên | Chu kỳ (ngày) | a (AU) | e | i (°) | Đặc điểm |
|----|-----|---------------|--------|---|-------|----------|
| `hale-bopp` | Hale-Bopp | 101,647 (278 năm) | 186 | 0.995 | 89.4 | Vĩ đại thế kỷ 20, đuôi xanh+trắng rõ |
| `neowise` | NEOWISE (C/2020 F3) | 4,500 (12.3 năm) | 28 | 0.999 | 128.9 | Đuôi kép ấn tượng, bay gần Mặt Trời |
| `67p` | 67P/Churyumov-Gerasimenko | 2,512 (6.88 năm) | 3.46 | 0.641 | 7.04 | Có texture hình vịt, Rosetta đáp |
| `tempel-1` | 9P/Tempel 1 | 2,060 (5.64 năm) | 3.15 | 0.510 | 10.5 | Deep Impact bắn phá |

**Cấu trúc entry mẫu** (theo pattern của Halley):
```json
{
  "id": "hale-bopp",
  "parentId": "sun",
  "name": { "vi": "Sao chổi Hale-Bopp", "en": "Hale-Bopp" },
  "type": "comet",
  "physical": { "radius": 0.03, "massKg": 1.3e15, "density": 0.6, "meanTemperatureC": -220 },
  "orbit": { "semiMajorAxis": 186, "orbitalPeriod": 101647, "eccentricity": 0.995, "inclination": 89.4 },
  "rotation": { "axialTilt": 0, "rotationPeriod": 48, "oblateness": 0 },
  "render": { "fallbackColor": "#CCCCFF" },
  "textures": null,
  "atmosphere": null,
  "rings": null,
  "info": { "summaryVi": "...", "compositionVi": "..." }
}
```

### 1.2 Nâng cấp data Halley

- Thêm `"orbitalPeriodYears": 75.3` hoặc tính từ orbitalPeriod
- Thêm `"nextPerihelion": "2061-07-28"` (ngày điểm cận nhật tiếp theo)
- Thêm `"tailLengthKm": 15000000` (15 triệu km)
- Thêm `"comaDiameterKm": 100000` (100,000 km)
- Thêm `"nucleusDimensions": "15×8×8 km"` (kích thước thực lõi)

---

## Phase 2: Bề Mặt Lõi (Nucleus) — `createPlanet.js`

### 2.1 Material tối carbon

File: `src/createPlanet.js` (sửa block lines 142-144, 171-173)

Hiện tại: `emissive: 0x88ccff, emissiveIntensity: 2.5`
Cập nhật thành:

```javascript
if (data.type === 'comet') {
  // Lõi carbon tối với phát sáng nhẹ từ outgassing
  pbrRoughness = 0.95;
  pbrMetalness = 0.0;
}
```
Và ở phần emissive:
```javascript
} else if (data.type === 'comet') {
  emissiveColor = new THREE.Color(0x88ccff);
  emissiveInt = 0.5;  // Giảm từ 2.5 → 0.5, để outgassing là chính
}
```

### 2.2 Shader bề mặt lõi (tùy chọn nâng cao)

Tạo procedural nucleus texture bằng Canvas:
- Màu nền: `#1a1a2e` (carbon đen)
- Đốm sáng: chấm nhỏ `#445566` ngẫu nhiên (băng bẩn)
- Vùng outgassing: `#88ddff` với alpha thấp ở rìa

Nếu không dùng texture, dùng `MeshStandardMaterial` với `color: 0x2a3040`, `emissive: 0x4488aa`, `emissiveIntensity` thay đổi theo khoảng cách Mặt Trời.

---

## Phase 3: Đuôi Sao Chổi Nâng Cao — `comets.js`

### 3.1 Đuôi Ion (giữ nguyên cải tiến)

File: `src/comets.js` (sửa `createCometTail()`)

- Thêm uniform `uBrightness` để điều chỉnh theo khoảng cách Mặt Trời
- Thêm uniform `uColor` có thể đổi: xanh ion (#aaccff) hoặc trắng bụi
- Tail length động: `length = 15 * brightnessFactor` (từ 5 → 25 AU)

### 3.2 Đuôi Bụi (Dust Tail) mới — `createCometDustTail()`

Tạo đuôi thứ hai: rộng hơn, cong hơn, màu trắng/cream.

```javascript
export function createCometDustTail() {
  // ConeGeometry rộng hơn (radius=2.0, length=12)
  // Shader: màu trắng kem (#ffeedd), alpha nhỏ hơn
  // Xoay lệch 5-10° so với đuôi ion để tạo hiệu ứng hai đuôi
  // Có thể dùng CatmullRomCurve3 để tạo đường cong
}
```

Gắn cả `tailMesh` và `dustTailMesh` vào `pivot` trong `createPlanet.js`.

### 3.3 Cập nhật runtime (`main.js`)

Trong vòng lặp animation (lines 979-998):

```javascript
// Đuôi ion
if (body.tailMesh) {
  const awayPos = body.pivot.position.clone().multiplyScalar(2);
  body.tailMesh.lookAt(awayPos);
  
  const distAU = body.pivot.position.length() / AU;
  const maxTailDist = 10.0;
  let tailOpacity = 1.0 - (distAU / maxTailDist);
  tailOpacity = Math.max(0, Math.min(1, tailOpacity));
  
  body.tailMesh.material.uniforms.uOpacity.value = tailOpacity;
  body.tailMesh.visible = tailOpacity > 0.05;
  
  // Cập nhật độ dài động
  const tailLength = 5 + 20 * tailOpacity; // 5 → 25
  body.tailMesh.scale.z = tailLength / 15; // 15 là base length
}

// Đuôi bụi
if (body.dustTailMesh) {
  body.dustTailMesh.lookAt(awayPos);
  body.dustTailMesh.rotation.z = 0.15; // Lệch nhẹ so với đuôi ion
  body.dustTailMesh.material.uniforms.uOpacity.value = tailOpacity * 0.6;
  body.dustTailMesh.visible = tailOpacity > 0.05;
}

// Coma động: scale thay đổi theo khoảng cách
if (body.comaMesh) {
  body.comaMesh.material.uniforms.uOpacity.value = tailOpacity * 0.8;
  body.comaMesh.visible = tailOpacity > 0.05;
  // Scale coma: 2× → 5× nucleus radius dựa trên độ sáng
  const comaScale = 2 + 3 * tailOpacity;
  const baseScale = body.data.physical.radius * 3.0;
  body.comaMesh.scale.setScalar(baseScale * (comaScale / 3));
}
```

---

## Phase 4: Đường Cong Độ Sáng (Brightness Curve)

### 4.1 Công thức độ sáng

Sao chổi sáng theo `1/r²` (r = khoảng cách Mặt Trời). Hiện tại dùng linear fade.

Cập nhật `main.js`:

```javascript
const distAU = body.pivot.position.length() / AU;
const r = Math.max(distAU, 0.5); // Tránh infinite tại r=0
// Công thức độ sáng: I = I0 * r^(-2.5) (gần đúng thực tế)
const brightnessFactor = Math.pow(r, -2.5);
let tailOpacity = Math.min(1, brightnessFactor / 0.1); // normalize
tailOpacity = Math.max(0, Math.min(1, tailOpacity));
```

### 4.2 Emissive nhân với brightness

```javascript
// Trong animation loop, cập nhật emissive nucleus
if (body.mesh && body.data.type === 'comet') {
  body.mesh.material.emissiveIntensity = 0.5 + 2.0 * tailOpacity;
}
```

---

## Phase 5: UI — Info Panel Sao Chổi

File: `src/ui.js` (sau line 964, trước section ghost moons)

### 5.1 Section "☄️ Cấu trúc Sao chổi"

```javascript
let cometInfoHtml = '';
if (data.type === 'comet') {
  const orbitalPeriodYears = (data.orbitalPeriod / 365.25).toFixed(1);
  cometInfoHtml = `
    <div class="info-section-title">☄️ Cấu trúc Sao chổi</div>
    <div class="info-layer" style="border-left-color: #88ccff; background: rgba(136, 204, 255, 0.05);">
      <div class="info-row sub"><span class="label">Lõi</span><span class="value">Đá, bụi, băng (CO, H₂O, NH₃)</span></div>
      <div class="info-row sub"><span class="label">Đuôi ion</span><span class="value">~15 triệu km, hướng xa Mặt Trời</span></div>
      <div class="info-row sub"><span class="label">Đuôi bụi</span><span class="value">Cong, rộng, màu trắng kem</span></div>
      <div class="info-row sub"><span class="label">Quầng (Coma)</span><span class="value">~100,000 km, khí và bụi</span></div>
      <div class="info-row sub"><span class="label">Chu kỳ quỹ đạo</span><span class="value">${orbitalPeriodYears} năm</span></div>
    </div>
  `;
}
```

### 5.2 Thêm vào rows

Thêm `['Chu kỳ', `${orbitalPeriodYears} năm`]` vào rows cho comets (line 982).

---

## Phase 6: Cập Nhật Hiển Thị

### 6.1 Minimap — `src/main.js` (line 1411)

Bỏ qua comet trong minimap. Cập nhật:

```javascript
if (body.data.isMoon || body.data.id === 'sun' || body.data.type === 'comet') return;
```
→ Sửa thành chỉ skip moon và sun.

### 6.2 Cinematic Camera — `src/main.js` (lines 107, 122)

Hiện tại comets bị loại khỏi cinematic. Có thể thêm 10% chance để camera ngắm sao chổi khi ở gần:

```javascript
// Thêm comets vào cinematic planets nếu tailOpacity > 0.3
function getCinematicPlanets() {
  return Array.from(bodyById.values()).filter(b =>
    b.data.type !== 'star' && !b.data.isMoon
  );
}
```

### 6.3 Label — `src/labels.js` (line 61-69)

Giảm auto-hide distance cho comet: từ 80→120 lên 120→180 để thấy label từ xa hơn vì sao chổi lớn và hiếm.

---

## Phase 7: N-Body Gravity Cho Sao Chổi

File: `src/main.js`

Kiểm tra comets có được include trong N-body gravity simulation không. Nếu chưa, thêm chúng vào focus group.

Sao chổi với e > 0.9 (Halley, Hale-Bopp, NEOWISE) đặc biệt hưởng lợi từ N-body vì quỹ đạo bị nhiễu loạn mạnh bởi Sao Mộc.

---

## Thứ Tự Ưu Tiên

| Ưu tiên | Phase | Nội dung | File | Thời gian |
|---------|-------|----------|------|-----------|
| **P0** | 3.1 | Cải tiến đuôi ion (tail dài động) | `comets.js`, `main.js` | 30 phút |
| **P0** | 3.3 | Coma scale động | `main.js` | 15 phút |
| **P0** | 4 | Brightness curve (1/r²) | `main.js` | 15 phút |
| **P1** | 1 | Thêm 4 sao chổi mới | `solar-system.json` | 30 phút |
| **P1** | 2 | Nucleus material tối | `createPlanet.js` | 15 phút |
| **P1** | 5 | Info panel comet | `ui.js` | 20 phút |
| **P2** | 3.2 | Đuôi bụi (dust tail) | `comets.js`, `main.js` | 45 phút |
| **P2** | 6.1 | Minimap hiển thị comet | `main.js` | 5 phút |
| **P3** | 6.2 | Cinematic camera cho comet | `main.js` | 10 phút |
| **P3** | 6.3 | Label comet xa hơn | `labels.js` | 5 phút |
| **P3** | 7 | N-body cho comet | `main.js` | 15 phút |

---

## Kiểm Tra Sau Khi Triển Khai

1. `npm run dev` — không lỗi build
2. Chọn từng sao chổi — đuôi, quầng, lõi hiển thị đúng
3. Kéo xa/ gần Mặt Trời — đuôi mờ dần >10 AU
4. Info panel — section sao chổi xuất hiện
5. Minimap — chấm sao chổi hiển thị
6. Hiệu năng — 4 comets cùng lúc không lag
