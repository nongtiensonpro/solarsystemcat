# Phân Tích & Kế Hoạch Nâng Cấp Độ Chính Xác Đường Quỹ Đạo (v2)

> Phân tích codebase ngày 2026-05-18
> Dựa trên code thực tế sau khi Phase 1 đã được triển khai

---

## 1. Hiện Trạng Chi Tiết

### 1A. Kepler Engine (`src/kepler.js`) ✅ Hoạt động tốt
| Thành phần | Trạng thái |
|-----------|-----------|
| `solveKepler()` Newton-Raphson tolerance 1e-10 | ✅ |
| `computeOrbitalPosition()` đúng công thức | ✅ |
| `computeOrbitalVelocity()` đạo hàm giải tích | ✅ |

### 1B. Orbit Lines (`src/orbits.js`) ✅ Phase 1 đã triển khai
- ✅ **Sampling theo Mean Anomaly** dùng `solveKepler()`
- ✅ **Adaptive segment count** theo eccentricity (128-2048)
- ✅ **CatmullRomCurve3** nội suy (tùy chọn theo quality preset)
- ✅ **Quality preset** (`orbitQuality`, `orbitCatmullRom` trong `renderConfig.js`)

### 1C. N-body Gravity (`src/gravity.js`) ⚠️ Còn vấn đề
| Thành phần | Trạng thái |
|-----------|-----------|
| Yoshida 4th-order symplectic integrator | ✅ |
| Adaptive timestep (1s-3600s) | ✅ |
| Energy diagnostics | ✅ |
| `predictTrajectory()` | ⚠️ Fixed maxSteps=2000 |
| PN corrections | ✅ Tùy chọn |

### 1D. N-body Orbit Lines (`src/main.js` + `src/orbits.js`) ⚠️ Còn vấn đề
| Thành phần | Trạng thái |
|-----------|-----------|
| `createNbodyOrbitLine()` | ✅ |
| `updateOrbitLineGeometry()` | ✅ |
| Throttle mỗi 45 frame | ✅ |
| Segment count | ⚠️ Bị cap cứng 256 điểm |
| Cache/Tái tính toán thông minh | ❌ |

---

## 2. Các Vấn Đề Phát Hiện

### Vấn Đề 1: N-body prediction không đủ cho quỹ đạo dài [CAO]
- **File**: `src/gravity.js:483,494`
- **Mô tả**: `predictTrajectory()` dùng `PREDICT_MAX_STEPS = 2000` cố định.
  - Với bước thích ứng ~3600s, 2000 bước ≈ 2000 giờ ≈ 83 ngày
  - Halley's comet chu kỳ 27,503 ngày (75 năm): chỉ predict được ~0.3% quỹ đạo
- **Tác động**: N-body orbit line cho Halley gần như không thấy được
- **Fix**: Tính `maxSteps` động dựa trên `orbitalPeriod / stepSize`

### Vấn Đề 2: N-body orbit line bị cap cứng 256 điểm [CAO]
- **File**: `src/main.js:916`
- **Code**: `numPoints = Math.min(256, getSegmentCount(...))`
- **Tác động**: Mercury (e=0.206), Pluto (e=0.244) chỉ được 256 điểm dù cần 512+
- **Fix**: Tăng cap lên 2048 hoặc dynamic theo quality preset

### Vấn Đề 3: Thiếu hiển thị đa vòng quỹ đạo [TRUNG BÌNH]
- Halley e=0.967 cần hiển thị vài vòng quỹ đạo để thấy hình dạng thực
- Hiện tại chỉ có 1 vòng (hoặc 1 phần với N-body)
- **Fix**: Thêm multi-revolution rendering cho Kepler orbit lines

### Vấn Đề 4: Thiếu trực quan hóa độ bất định [TRUNG BÌNH]
- N-body prediction càng xa càng kém chính xác
- Không có chỉ thị visual nào về độ tin cậy
- **Fix**: Gradient opacity/màu sắc dọc đường dự đoán

### Vấn Đề 5: Không có overlay Kepler vs N-body [THẤP]
- Khi bật N-body, Kepler orbit bị ẩn hoàn toàn
- Không thấy được tác động của nhiễu loạn hấp dẫn
- **Fix**: Tùy chọn hiển thị overlay (Kepler mờ + N-body đậm)

### Vấn Đề 6: Vành đai tiểu hành tinh eccentricity = 0 [THẤP]
- `src/asteroidBelt.js`: tất cả 5000 tiểu hành tinh quỹ đạo tròn
- Thực tế vành đai có eccentricity trung bình ~0.14
- **Fix**: Thêm eccentricity ngẫu nhiên vào phân bố

### Vấn Đề 7: Khởi tạo vận tốc N-body từ Kepler [THẤP]
- `src/gravity.js:108`: Vận tốc khởi tạo từ `computeOrbitalVelocity()` thuần Kepler
- Không tính nhiễu loạn từ các hành tinh khác
- Gây ra "sốc" ban đầu khi bật N-body

---

## 3. Kế Hoạch Nâng Cấp

### Phase 2B: N-body Prediction Thông Minh (Ngay lập tức)

#### 2B.1 Dynamic maxSteps cho predictTrajectory
```js
// gravity.js
export function predictTrajectory(bodyId, numPoints, maxSteps = null) {
  if (maxSteps === null) {
    // Tính số bước cần cho 1 chu kỳ quỹ đạo
    const body = bodyByIdRef?.get(bodyId);
    if (body?.data?.orbitalPeriod) {
      const periodSeconds = body.data.orbitalPeriod * 86400;
      const stepSize = computeAdaptiveStep(getRelevantEntries());
      maxSteps = Math.ceil(periodSeconds / Math.max(stepSize, MIN_SUBSTEP));
    } else {
      maxSteps = PREDICT_MAX_STEPS;
    }
  }
  // ... rest of function
}
```

#### 2B.2 Bỏ cap 256 điểm cho N-body orbit lines
```js
// main.js
const numPoints = getSegmentCount(body.data.eccentricity || 0, body.data.isMoon, qualityMultiplier);
```
Không dùng `Math.min(256, ...)` nữa.

#### 2B.3 Cache có điều kiện thông minh
- Chỉ recompute prediction khi:
  - Thời gian mô phỏng thay đổi > threshold (0.1% chu kỳ)
  - Khoảng cách vị trí thực tế lệch > 1% bán trục lớn so với predicted
  - Hoặc mỗi N frame (throttle hiện tại 45 frame)

### Phase 3A: Multi-Revolution & Hiển Thị Nâng Cao

#### 3A.1 Multi-revolution cho Kepler orbit line
- Cho các thiên thể có eccentricity cao (>= 0.9): Halley
- Hiển thị 2-3 vòng quỹ đạo với độ mờ giảm dần
- Dùng CatmullRomCurve3 nối các vòng

#### 3A.2 Gradient độ tin cậy cho N-body prediction
- Đầu đường dự đoán (gần vị trí hiện tại): màu sáng, opacity cao
- Cuối đường dự đoán (xa về tương lai): opacity giảm dần về 0
- Sử dụng vertex colors hoặc multiple line segments

#### 3A.3 Perturbation overlay (Kepler + N-body)
- Tùy chọn hiển thị cả 2 quỹ đạo:
  - Kepler: mờ (opacity 0.15), màu gốc
  - N-body: đậm (opacity 0.5), màu xanh lá

### Phase 3B: Cải Thiện Phụ Trợ

#### 3B.1 Vành đai tiểu hành tinh ngẫu nhiên
- Thêm eccentricity ngẫu nhiên 0.05-0.25
- Thêm inclination ngẫu nhiên 0-10 độ

#### 3B.2 Khởi tạo vận tốc N-body mượt
- Thay vì jump từ Kepler sang N-body, làm mượt transition

---

## 4. Chi Tiết Kỹ Thuật

### 4A. Sửa `src/gravity.js` — Dynamic maxSteps

```js
const PREDICT_MAX_STEPS = 2000;
const PREDICT_MAX_STEPS_LONG = 100000; // Cho quỹ đạo dài

export function predictTrajectory(bodyId, numPoints, maxSteps = null, bodyByIdRefLocal = null) {
  // Nếu không có maxSteps, tính động
  if (maxSteps === null) {
    maxSteps = PREDICT_MAX_STEPS;
    if (bodyByIdRefLocal) {
      const bodyData = bodyByIdRefLocal.get(bodyId)?.data;
      if (bodyData?.orbitalPeriod > 1000) { // > 1000 ngày
        const periodSeconds = bodyData.orbitalPeriod * 86400;
        // Ước lượng step size từ adaptive step calculator
        const estimatedStepSize = 1800; // ~30 phút conservative
        const neededSteps = Math.ceil(periodSeconds / estimatedStepSize);
        maxSteps = Math.min(PREDICT_MAX_STEPS_LONG, Math.max(PREDICT_MAX_STEPS, neededSteps));
      }
    }
  }
  // ...phần còn lại giữ nguyên
}
```

### 4B. Sửa `src/main.js` — Bỏ cap 256

```js
// Dòng 915-917 hiện tại:
const numPoints = Math.min(256,
  getSegmentCount(body.data.eccentricity || 0, body.data.isMoon, qualityMultiplier));

// Sửa thành:
const numPoints = getSegmentCount(body.data.eccentricity || 0, body.data.isMoon, qualityMultiplier);
```

### 4C. Thêm Opacity Gradient cho N-body Lines

Trong `updateOrbitLineGeometry()` ở `orbits.js`:
```js
// Thêm màu sắc cho mỗi vertex (gradient từ đậm → mờ)
const colors = new Float32Array(points.length * 3);
for (let i = 0; i < points.length; i++) {
  const t = i / points.length;
  const alpha = 1.0 - t * 0.7; // Từ 1.0 → 0.3
  colors[i * 3] = alpha;     // R
  colors[i * 3 + 1] = alpha; // G
  colors[i * 3 + 2] = alpha; // B
}
newGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
```

Sau đó dùng `LineBasicMaterial({ vertexColors: true })` cho N-body lines.

---

## 5. Tác Động Performance

| Thay đổi | Tác động FPS | Ghi chú |
|----------|-------------|---------|
| Dynamic maxSteps | Trung bình | Chỉ ảnh hưởng khi prediction chạy (mỗi 45 frame) |
| Bỏ cap 256 | Thấp | Tăng số điểm nhưng mỗi 45 frame mới rebuild |
| Multi-revolution | Thấp | Tăng 2-3x số điểm cho 1-2 body |
| Vertex colors | Không đáng kể | Chỉ thay đổi attribute |
| Asteroid eccentricity | Không | Chỉ thay đổi initial data |

---

## 6. Verification Plan

| Kiểm tra | Method |
|----------|--------|
| N-body prediction đủ dài cho Halley | Zoom vào Halley, bật N-body, kiểm tra orbit line |
| Không cap 256 cho Mercury/Pluto | Mở browser console, check segment count |
| Opacity gradient giảm dần | Visual check trên N-body orbit lines |
| Multi-revolution mượt | Visual check Halley's comet |
| Build không lỗi | `npm run build` |
| Unit tests pass | `npm test` |
| Không warning console | Browser console |

---

## 7. Lộ Trình

| Task | Thời gian | Mức ưu tiên |
|------|-----------|------------|
| 2B.1 Dynamic maxSteps | 1-2 giờ | 🔴 Cao |
| 2B.2 Bỏ cap 256 | 15 phút | 🔴 Cao |
| 2B.3 Cache thông minh | 1-2 giờ | 🟡 Trung bình |
| 3A.1 Multi-revolution | 3-4 giờ | 🟡 Trung bình |
| 3A.2 Opacity gradient | 1-2 giờ | 🟡 Trung bình |
| 3A.3 Perturbation overlay | 2-3 giờ | 🟢 Thấp |
| 3B.1 Asteroid eccentricity | 30 phút | 🟢 Thấp |
| 3B.2 Velocity smooth start | 1 giờ | 🟢 Thấp |
