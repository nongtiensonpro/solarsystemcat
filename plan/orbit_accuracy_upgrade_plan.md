# Kế Hoạch Nâng Cấp Độ Chính Xác Đường Hiển Thị Quỹ Đạo

> Dựa trên phân tích codebase `solarsystemcat` ngày 2026-05-17

---

## 1. Hiện Trạng

| Yếu tố | Giá trị hiện tại |
|--------|-----------------|
| **Số segment** | 256 (hành tinh), 128 (vệ tinh) — **cố định** |
| **Phương pháp sampling** | Uniform `theta` (góc tham số), không theo dị thường thực |
| **Đường cong** | `THREE.Line` — nối thẳng giữa các điểm, **không nội suy** |
| **Cập nhật** | Geometry **precompute một lần** khi khởi động |
| **Khi N-body bật** | **Ẩn toàn bộ** đường quỹ đạo |
| **Eccentricity range** | 0.0 (tròn) → 0.96714 (Halley) |

### Vấn đề chính

1. **Sampling đều theo theta**: Với quỹ đạo lệch tâm cao (Halley e=0.967, Mercury e=0.206, Pluto e=0.244), điểm phân bố không theo độ cong thực tế — vùng gần cận điểm (periapsis) có độ cong lớn nhất nhưng lại không được sampling dày hơn.
2. **Số segment cố định**: Quỹ đạo tròn (e~0) dư điểm, quỹ đạo méo (e~0.97) thiếu điểm.
3. **Không nội suy**: Mỗi đoạn là đường thẳng — với 256 điểm, sai số hình học tối đa ≈ `a * (1 - cos(π/256)) ≈ a * 0.00012` với quỹ đạo tròn, nhưng lớn hơn nhiều ở cận điểm của quỹ đạo méo.
4. **N-body ẩn đường quỹ đạo**: Mất hoàn toàn guide line khi bật gravity.

---

## 2. Kế Hoạch Nâng Cấp

### Phase 1: Sampling Thông Minh (Kepler) — Ngay lập tức

#### 1A. Chuyển sang sampling theo Mean Anomaly (M)

**Hiện tại** (`orbits.js:27-29`):
```js
const theta = (i / segments) * Math.PI * 2;
const xLocal = a * Math.cos(theta) - a * e;
const zLocal = b * Math.sin(theta);
```

**Mới**: Dùng `solveKepler()` (đã có sẵn trong `kepler.js`) để sampling đều theo M:
```js
for (let i = 0; i <= segments; i++) {
    const M = (i / segments) * Math.PI * 2;
    const E = solveKepler(M, e);
    const xLocal = a * (Math.cos(E) - e);
    const zLocal = a * Math.sqrt(1 - e * e) * Math.sin(E);
    // + inclination
}
```

**Lợi ích**: Điểm tự động tập trung ở cận điểm (periapsis) nơi độ cong lớn nhất, theo đúng động học Kepler.

#### 1B. Adaptive segment count theo eccentricity

| e | Planets | Moons | Lý do |
|---|---------|-------|-------|
| < 0.02 | 128 | 64 | Gần tròn, ít điểm đã đủ |
| < 0.1 | 256 | 128 | Giữ nguyên hiện tại |
| < 0.5 | 512 | 256 | Mercury, Pluto |
| ≥ 0.5 | 1024 | 512 | Quỹ đạo méo đáng kể |
| ≥ 0.9 | 2048 | — | Halley's comet |

Công thức đề xuất: `segments = Math.max(minSeg, Math.round(baseSeg * (1 + e * 10)))`

Ví dụ: base=256, e=0.967 → 256*(1+9.67) ≈ 2730 segments. Nhưng cần chặn trên để tránh quá tải geometry.

Đề xuất refined: `segments = Math.min(maxSeg, Math.round(baseSeg * (1 + e * 5)))`
- baseSeg default: 256 (planet), 128 (moon)
- maxSeg: 2048 (planet), 1024 (moon)

#### 1C. Thêm tùy chọn chất lượng cho orbit (theo render preset)

Trong `renderConfig.js`, thêm:
```js
orbitQuality: {
    low: { multiplier: 0.5 },
    balanced: { multiplier: 1.0 },
    high: { multiplier: 2.0 }
}
```

Nhân với segment count từ 1B.

#### 1D. Nội suy Catmull-Rom (tùy chọn)

Thay `THREE.Line` bằng `THREE.CatmullRomCurve3` để có đường cong mượt qua các điểm sampling. Giảm số segment nhưng vẫn giữ độ chính xác thị giác.

Hiện tại `cinematicCamera.js` đã dùng `CatmullRomCurve3` nên Three.js bundle đã có sẵn — không tăng kích thước.

**Cách làm**:
```js
const curve = new THREE.CatmullRomCurve3(points, false); // closed=false
const curvePoints = curve.getPoints(segments * 2); // oversample gấp đôi
const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
```

**Tác động**: Đường cong mượt hơn, giảm hiện tượng "gấp khúc" (aliasing) ở vùng độ cong cao.

#### 1E. Cập nhật file bị tác động

| File | Thay đổi |
|------|---------|
| `src/orbits.js` | Sửa `createOrbitLine()`: sampling theo M, adaptive segments, CatmullRom |
| `src/kepler.js` | Export `solveKepler` (đã export sẵn, không cần đổi) |
| `src/renderConfig.js` | Thêm `orbitQuality` vào quality preset |
| `src/dataLoader.js` | Có thể thêm trường `eccentricity` normalized (đã có) |

---

### Phase 2: Đường Quỹ Đạo Động Cho N-body

#### 2A. Dự đoán quỹ đạo từ trạng thái hiện tại

Khi N-body active, thay vì ẩn orbit line, tính trajectory prediction:

1. Lưu state hiện tại của tất cả bodies
2. Tích phân forward trong 1 chu kỳ quỹ đạo (dùng `orbitalPeriod` từ data)
3. Ghi lại vị trí tại N điểm (N = segments từ Phase 1)
4. Cập nhật geometry của orbit line

**Integrator cho prediction**: Dùng lại `gravitySubstep()` với step size cố định lớn hơn (vì là dự đoán, không cần chính xác tuyệt đối).

**Giới hạn**: Chỉ dự đoán cho body được focus (focused body + các body ảnh hưởng chính) để tránh tính toán quá nặng.

#### 2B. Cache và cập nhật có điều kiện

- Cache trajectory points
- Recompute khi:
  - `simulationTime` thay đổi > threshold (ví dụ 0.1% chu kỳ)
  - Khoảng cách giữa vị trí thực tế và vị trí predicted lệch > 1% bán trục lớn
  - Hoặc mỗi N frame (throttle: 30-60 frame một lần)

#### 2C. Hiển thị vùng không chắc chắn (tùy chọn nâng cao)

Dùng độ mờ (opacity) giảm dần ở phần xa của trajectory để biểu thị độ tin cậy thấp hơn.

#### 2D. File bị tác động

| File | Thay đổi |
|------|---------|
| `src/orbits.js` | Thêm `updateOrbitLineNbody(body, state, scene)` |
| `src/gravity.js` | Export `gravitySubstep` (đã export), thêm `predictTrajectory()` |
| `src/main.js` | Gọi `updateOrbitLineNbody` trong animation loop khi N-body active |

---

### Phase 3: Hiển Thị Nâng Cao (Dài hạn)

#### 3A. Multi-revolution cho quỹ đạo dài

- Comet Halley (75 năm): hiển thị vài vòng để thấy hình dạng quỹ đạo đầy đủ
- Dùng các vòng mờ dần (giảm opacity) cho các vòng xa hơn

#### 3B. Color-coding độ chính xác

- Phần quỹ đạo gần vị trí hiện tại: màu sáng, đậm
- Phần xa vị trí hiện tại (độ tin cậy thấp hơn với N-body): màu mờ hơn
- Gradient từ xanh (chính xác) → đỏ (sai số lớn)

#### 3C. Hiển thị nhiễu loạn (perturbation)

- Cho N-body mode: hiển thị cả quỹ đạo Kepler gốc (mờ) và quỹ đạo N-body (đậm) để thấy tác động của nhiễu loạn hấp dẫn

---

## 3. So Sánh Chi Phí / Lợi Ích

| Phase | Chi phí thực hiện | Cải thiện độ chính xác | Tác động performance |
|-------|------------------|----------------------|-------------------|
| **1A** (Mean Anomaly) | Thấp (~2 giờ) | Cao (phân bố điểm theo vật lý) | Không đáng kể |
| **1B** (Adaptive segments) | Thấp (~1 giờ) | Cao (đủ điểm cho quỹ đạo méo) | Trung bình (nhiều điểm hơn cho e cao) |
| **1C** (Quality preset) | Thấp (~30 phút) | Trung bình | Kiểm soát được |
| **1D** (Catmull-Rom) | Trung bình (~3 giờ) | Cao (mượt hơn, giảm segment) | Trung bình (curve evaluation) |
| **2A+B** (N-body dynamic) | Cao (~8 giờ) | Rất cao (giải quyết mất orbit khi N-body) | Cao (cần tích phân thêm) |
| **2C** (Uncertainty viz) | Trung bình (~3 giờ) | Thấp (chỉ visual) | Thấp |
| **3A-C** | Cao (~5 giờ mỗi mục) | Trung bình-cao | Trung bình-cao |

---

## 4. Lộ Trình Đề Xuất

### Giai đoạn 1 (Ngay lập tức — 1-2 ngày)

1. ✅ **1A**: Chuyển sampling từ `theta` sang `M` → `solveKepler()` cho `orbits.js`
2. ✅ **1B**: Thêm `getSegmentCount(eccentricity, isMoon, qualityMultiplier)` 
3. ✅ **1C**: Tích hợp vào `renderConfig.js` quality preset
4. ✅ **1D**: Tùy chọn dùng `CatmullRomCurve3` để nội suy (có thể bật/tắt)
5. Kiểm tra: visual diff cho từng planet (tròn → méo) và Halley

### Giai đoạn 2 (Trung hạn — 3-5 ngày)

1. ✅ **2A**: Implement `predictTrajectory()` trong `gravity.js`
2. ✅ **2B**: Cache và throttle logic trong `main.js`
3. ✅ **2C**: Update orbit line geometry trong animation loop
4. Kiểm tra: so sánh Kepler orbit line vs N-body predicted vs actual position

### Giai đoạn 3 (Dài hạn — 1-2 tuần)

1. ✅ **3A**: Multi-revolution cho Halley
2. ✅ **3B**: Color gradient chính xác
3. ✅ **3C**: Overlay Kepler + N-body

---

## 5. Chi Tiết Kỹ Thuật Cho Phase 1

### Sửa `src/orbits.js`

```js
// Hàm xác định số segment theo eccentricity
function getSegmentCount(eccentricity, isMoon, qualityMultiplier = 1) {
    const base = isMoon ? 128 : 256;
    const e = Math.abs(eccentricity);
    let factor;
    if (e < 0.02) factor = 0.5;
    else if (e < 0.1) factor = 1.0;
    else if (e < 0.5) factor = 2.0;
    else if (e < 0.9) factor = 4.0;
    else factor = 8.0;
    const maxSeg = isMoon ? 1024 : 2048;
    return Math.min(maxSeg, Math.round(base * factor * qualityMultiplier));
}
```

### Sửa sampling loop

```js
const segments = getSegmentCount(data.eccentricity, data.isMoon, qualityMultiplier);
const points = [];

for (let i = 0; i <= segments; i++) {
    const M = (i / segments) * Math.PI * 2;
    const E = solveKepler(M, e);
    const xLocal = a * (Math.cos(E) - e);
    const zLocal = a * Math.sqrt(1 - e * e) * Math.sin(E);

    const x = xLocal;
    const y = zLocal * Math.sin(incRad);
    const z = zLocal * Math.cos(incRad);

    points.push(new THREE.Vector3(x, y, z));
}
```

### Catmull-Rom tùy chọn

```js
let geometry;
if (useCatmullRom) {
    const curve = new THREE.CatmullRomCurve3(points, true);
    const refinedPoints = curve.getPoints(segments * 2);
    geometry = new THREE.BufferGeometry().setFromPoints(refinedPoints);
} else {
    geometry = new THREE.BufferGeometry().setFromPoints(points);
}
```

### Vertex shader cho Hero Moon

Với hero moon orbit (dashed animated), cần đảm bảo attribute `index` được tính lại khi số segment thay đổi:

```js
const indices = new Float32Array(points.length);
for (let i = 0; i < points.length; i++) indices[i] = i;
geometry.setAttribute('index', new THREE.BufferAttribute(indices, 1));
```

---

## 6. Chi Tiết Kỹ Thuật Cho Phase 2

### `predictTrajectory()` trong `gravity.js`

```js
export function predictTrajectory(bodyId, numSteps, stepSize) {
    const entries = getRelevantEntries();
    const trajectory = [];
    const stateSnapshot = saveState(entries); // copy state

    for (let i = 0; i < numSteps; i++) {
        gravitySubstep(stepSize);
        const s = state.get(bodyId);
        if (s) trajectory.push({ x: s.px, y: s.py, z: s.pz });
    }

    restoreState(stateSnapshot); // khôi phục lại state gốc
    return trajectory;
}
```

### Cập nhật orbit line trong `main.js`

```js
// Trong animation loop, khi N-body active
if (newtonGravityActive && trackedBody) {
    updateNbodyOrbitLine(trackedBody, simulationTime);
}
```

---

## 7. Verification

Sau mỗi phase:

| Kiểm tra | Công cụ |
|----------|---------|
| Visual: quỹ đạo tròn (Moon) không bị vỡ | Mắt thường + screenshot |
| Visual: Halley quỹ đạo méo có đủ điểm ở cận điểm | Zoom vào periapsis |
| Performance: số điểm geometry có tăng đột biến? | Three.js `renderer.info` |
| N-body: predicted trajectory có khớp vị trí thực tế? | Overlay + đo khoảng cách |
| Build thành công | `npm run build` |
| Không lỗi console | Browser console |

---

## 8. Rủi Ro

| Rủi ro | Tác động | Giảm thiểu |
|--------|----------|------------|
| Nhiều segment cho e cao làm chậm render | FPS giảm | Quality preset giới hạn, CatmullRom giảm segment nhưng vẫn mượt |
| CatmullRomCurve3 tạo điểm không đều | Quỹ đạo sai lệch | Kiểm tra visual, giữ fallback Line |
| N-body prediction không kịp real-time | Giật/lag | Chỉ predict cho focused body, throttle |
| Shader hero moon không đồng bộ với index mới | Dash pattern sai | Cập nhật index attribute sau khi thay đổi segment |
