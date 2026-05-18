# Kế Hoạch Nâng Cấp Quỹ Đạo Kepler — Tích Hợp NASA JPL Horizons

> Dựa trên phân tích codebase ngày 2026-05-18
> Tài liệu tham khảo: `nasa_horizons_integration_plan.md`, `orbit_accuracy_upgrade_plan_v2.md`

---

## 1. Hiện Trạng & Khoảng Cách (Gap Analysis)

### 1.1. Dữ liệu quỹ đạo hiện tại trong `solar-system.json`

| Trường | Trạng thái | Ghi chú |
|--------|-----------|---------|
| `semiMajorAxis` (a) | ✅ Có | Đơn vị AU |
| `orbitalPeriod` (P) | ✅ Có | Đơn vị ngày |
| `eccentricity` (e) | ✅ Có | |
| `inclination` (i) | ✅ Có | Đơn vị độ |
| `longitudeOfAscendingNode` (Ω) | ❌ **Thiếu** | Mặc định = 0 trong kepler.js |
| `argumentOfPerihelion` (ω) | ❌ **Thiếu** | Mặc định = 0 trong kepler.js |
| `meanAnomaly` (M) | ❌ **Thiếu** | Chỉ có `initialPhaseDeg` trong `render` |

### 1.2. Khoảng cách trong xử lý (Engine)

| Module | Vấn đề | Mức độ |
|--------|--------|--------|
| `kepler.js` | ✅ Engine đã hỗ trợ `longitudeAscending`, `argumentPeriapsis`, `initialPhaseDeg` — nhưng dữ liệu đầu vào luôn là 0 | OK |
| `orbits.js` | ❌ `createOrbitLine()` chỉ dùng **xoay Y-Z theo inclination**, không dùng ma trận xoay 3D đầy đủ | **CAO** |
| `dataLoader.js` | ❌ Không flatten `longitudeAscending`, `argumentPeriapsis`, `meanAnomaly` từ JSON | **CAO** |
| `nasa_sync_script` | ❌ Script trong plan có ánh xạ `OM`→`longitudeOfAscendingNode`, `W`→`argumentOfPerihelion`, `MA`→`meanAnomaly` nhưng chưa triển khai | **CAO** |

### 1.3. Tác động thực tế

| Thiên thể | Ω (độ) | ω (độ) | Tác động khi thiếu |
|-----------|--------|--------|-------------------|
| Mercury | 48.33° | 29.12° | Quỹ đạo xoay sai góc ~48°, cận điểm lệch ~29° |
| Venus | 76.68° | 54.88° | Sai nhẹ (e=0.0068) |
| Earth | 348.74° | 114.21° | Cận điểm lệch ~114° |
| Mars | 49.56° | 286.50° | Lệch đáng kể |
| Jupiter | 100.46° | 273.87° | Lệch >100° |
| Saturn | 113.67° | 339.39° | Lệch >110° |
| Pluto | 110.30° | 113.76° | **Nghiêm trọng**: quỹ đạo nghiêng 17.2° + xoay sai |
| Halley | 58.42° | 111.33° | **Rất nghiêm trọng**: e=0.967, cận điểm lệch hoàn toàn |
| Moon | — | — | Quỹ đạo quanh Trái Đất, Ω và ω so với mặt phẳng hoàng đạo |

---

## 2. Kiến Trúc Đề Xuất

```mermaid
graph TD
    A[NASA JPL Horizons API] -->|ELEMENTS + OBJ_DATA| B[Sync Script]
    B --> C[solar-system.json]
    C --> D[dataLoader.js]
    D -->|Flatten: a, e, i, Ω, ω, M0| E[Kepler Engine kepler.js]
    D -->|Flatten: a, e, i, Ω, ω| F[Orbit Renderer orbits.js]
    E -->|Full 3D rotation matrix Rz(-Ω)·Rx(-i)·Rz(-ω)| G[Planet Position]
    F -->|Full 3D rotation matrix| H[Orbit Path Line]
```

### 2.1. Luồng dữ liệu mới

1. **NASA Horizons** → trả về 7 tham số Kepler + thông số vật lý
2. **Sync script** → parse, ánh xạ, ghi vào `solar-system.json` (trường `orbit` mở rộng)
3. **dataLoader.js** → flatten Ω, ω, M0 vào normalized body data
4. **kepler.js** → engine **đã hỗ trợ sẵn** (chỉ cần dữ liệu đầu vào mới)
5. **orbits.js** → **CẦN SỬA** để dùng ma trận xoay 3D đầy đủ thay vì xoay Y-Z đơn giản

---

## 3. Kế Hoạch Chi Tiết Theo Phase

### Phase 1: Mở Rộng Schema Dữ Liệu  (1-2 ngày)

#### 1A. Thêm trường vào `solar-system.json`

Bổ sung 3 trường vào object `orbit` của mỗi body:

```json
{
  "orbit": {
    "semiMajorAxis": 0.387,
    "orbitalPeriod": 87.97,
    "eccentricity": 0.2056,
    "inclination": 7.0,
    "longitudeOfAscendingNode": 48.33,
    "argumentOfPerihelion": 29.12,
    "meanAnomaly": 174.8
  }
}
```

Giá trị NASA Horizons thực tế cho từng hành tinh:

| Body | Ω (deg) | ω (deg) | M tại epoch J2000 (deg) |
|------|---------|---------|------------------------|
| Mercury | 48.331 | 29.124 | 174.796 |
| Venus | 76.680 | 54.884 | 50.115 |
| Earth | 348.739 | 114.207 | 357.518 |
| Mars | 49.558 | 286.502 | 19.373 |
| Jupiter | 100.464 | 273.867 | 19.650 |
| Saturn | 113.666 | 339.392 | 316.967 |
| Uranus | 74.006 | 96.998 | 142.239 |
| Neptune | 131.784 | 276.348 | 256.228 |
| Pluto | 110.304 | 113.763 | 14.530 |
| Moon (quanh Earth) | — | — | — |

#### 1B. Cập nhật `dataLoader.js` — flatten trường mới

Trong hàm `normalizeBody()`, thêm:

```js
// ─── Orbit mở rộng từ NASA Horizons ───
longitudeAscending: raw.orbit?.longitudeOfAscendingNode ?? 0,
argumentPeriapsis: raw.orbit?.argumentOfPerihelion ?? 0,
meanAnomaly: raw.orbit?.meanAnomaly ?? 0,
```

**Tác động**: `kepler.js` đã đọc `data.longitudeAscending`, `data.argumentPeriapsis`, `data.initialPhaseDeg` trong `getOrCreateCache()`. Sau khi flatten, engine tự động dùng giá trị mới mà không cần sửa kepler.js.

#### 1C. Giá trị mặt định an toàn

- `longitudeAscending`: 0 → quỹ đạo không xoay quanh trục Z (hợp lý cho mô phỏng cơ bản)
- `argumentPeriapsis`: 0 → cận điểm nằm trên trục X
- `meanAnomaly`: 0 → hành tinh bắt đầu tại cận điểm

**Các file bị tác động:**
| File | Thay đổi |
|------|---------|
| `public/data/solar-system.json` | +3 trường cho mỗi body |
| `src/dataLoader.js` | +3 dòng flatten |
| `plan/nasa_horizons_integration_plan.md` | Cập nhật script sync |

---

### Phase 2: Sửa `orbits.js` — Full 3D Rotation cho Orbit Path  (2-3 ngày)

#### 2A. Vấn đề hiện tại

Hiện tại `orbits.js:61-71`:
```js
const x = xLocal;
const y = zLocal * Math.sin(incRad);
const z = zLocal * Math.cos(incRad);
```

Chỉ xoay trong mặt phẳng Y-Z (theo inclination), **bỏ qua Ω và ω**.

#### 2B. Giải pháp: Dùng lại ma trận xoay từ kepler.js

Cách 1 (tái sử dụng rotation matrix từ `kepler.js`):
```js
import { getOrCreateCache } from './kepler.js';

// Trong createOrbitLine:
const cache = getOrCreateCache(data);
// cache.r00..r21 là 6 phần tử của ma trận xoay 3D

for (let i = 0; i <= totalSegs; i++) {
  const M = (i / totalSegs) * Math.PI * 2 * revolutions;
  const E = solveKepler(M, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);

  // Full 3D rotation — giống hệt kepler.js §5
  const x = cache.r00 * xp + cache.r01 * yp;
  const y = cache.r10 * xp + cache.r11 * yp;
  const z = cache.r20 * xp + cache.r21 * yp;

  rawPoints.push(new THREE.Vector3(x, y, z));
}
```

Cách này đơn giản nhất vì `kepler.js` đã tính sẵn ma trận xoay 3D đầy đủ.

#### 2C. Cảnh báo

`getOrCreateCache()` hiện là hàm **internal** của `kepler.js`. Cần export nó:

```js
// kepler.js — thêm export
export function getOrCreateCache(data) { ... }
```

Hoặc expose một hàm getter an toàn hơn:
```js
export function getOrbitRotationMatrix(data) {
  const c = getOrCreateCache(data);
  return { r00: c.r00, r01: c.r01, r10: c.r10, r11: c.r11, r20: c.r20, r21: c.r21 };
}
```

#### 2D. Xử lý trường hợp đặc biệt: `orbitPlane === "parentEquator"`

Khi moon có `orbitPlane: "parentEquator"` (ví dụ Io, các moon của Jupiter):
- Cần lấy ma trận xoay của **hành tinh mẹ** (parent) thay vì dùng Ω, ω riêng
- Hiện tại, các moon này dùng `displayOrbitRadius` với xoay Y-Z đơn giản

Giải pháp: Trong `createOrbitLine()`, nếu `data.orbitPlane === 'parentEquator'`:
- Bỏ qua Ω/ω của moon
- Tính mặt phẳng quỹ đạo theo axial tilt của parent
- Giữ nguyên xoay Y-Z hiện tại cho trường hợp này

```js
if (data.orbitPlane === 'parentEquator') {
  // Giữ nguyên logic cũ (Y-Z rotation theo inclination của parent)
  // ...
} else {
  // Dùng ma trận xoay 3D đầy đủ từ kepler.js cache
  // ...
}
```

#### 2E. Kiểm tra độ chính xác

| Body | Trước (sai số) | Sau (đúng) |
|------|---------------|------------|
| Mercury | Cận điểm lệch ~29° | Cận điểm đúng vị trí |
| Pluto | Quỹ đạo nghiêng 17.2° nhưng xoay sai hướng | Quỹ đạo đúng 3D |
| Halley | e=0.967, cận điểm lệch >100° | Quỹ đạo thực tế chính xác |

**Các file bị tác động:**
| File | Thay đổi |
|------|---------|
| `src/kepler.js` | Export `getOrCreateCache` hoặc `getOrbitRotationMatrix` |
| `src/orbits.js` | Sửa `createOrbitLine()`: dùng ma trận xoay 3D đầy đủ |

---

### Phase 3: Cập Nhật NASA Sync Script  (1 ngày)

#### 3A. Bổ sung trường Ω, ω, M vào script sync

Trong `scripts/sync-nasa-horizons.js`, cập nhật hàm `parseHorizonsResponse()`:

```js
// Trích xuất thêm các tham số quỹ đạo mới
// (bổ sung vào phần 2 trong hàm parseHorizonsResponse)
const omMatch = dataBlock.match(/OM=\s*([\d.E+-]+)/);   // Longitude of Ascending Node
const wMatch = dataBlock.match(/W=\s*([\d.E+-]+)/);      // Argument of Perihelion
const maMatch = dataBlock.match(/MA=\s*([\d.E+-]+)/);    // Mean Anomaly at epoch

if (omMatch) result.orbit.longitudeOfAscendingNode = parseFloat(omMatch[1]);
if (wMatch) result.orbit.argumentOfPerihelion = parseFloat(wMatch[1]);
if (maMatch) result.orbit.meanAnomaly = parseFloat(maMatch[1]);
```

#### 3B. Cập nhật ánh xạ khi ghi JSON

Trong vòng lặp `sync()`:
```js
// Sau khi parse
if (parsed.orbit.longitudeOfAscendingNode !== undefined)
  body.orbit.longitudeOfAscendingNode = parsed.orbit.longitudeOfAscendingNode;
if (parsed.orbit.argumentOfPerihelion !== undefined)
  body.orbit.argumentOfPerihelion = parsed.orbit.argumentOfPerihelion;
if (parsed.orbit.meanAnomaly !== undefined)
  body.orbit.meanAnomaly = parsed.orbit.meanAnomaly;
```

#### 3C. Đồng bộ thời gian Epoch

Hiện tại script dùng `START_TIME` cố định (`'2026-05-18'`). Cần lưu epoch:
- Thêm trường `epoch` vào mỗi body (hoặc global) trong JSON
- Khi fetch, dùng epoch làm `START_TIME`
- Giá trị `meanAnomaly` chỉ có ý nghĩa tại epoch cụ thể

**Các file bị tác động:**
| File | Thay đổi |
|------|---------|
| `scripts/sync-nasa-horizons.js` | Parse Ω, ω, M + epoch field |
| `public/data/solar-system.json` | Có thể thêm `epoch` field |

---

### Phase 4: Real-time Live Sync (UI)  (2-3 ngày)

#### 4A. Nút "NASA Live Sync" trên UI

Thêm nút trên thanh điều khiển:
- Khi nhấn: gọi API Horizons với `EPHEM_TYPE='VECTORS'` cho ngày giờ hiện tại
- Nhận tọa độ Cartesian 3D từ NASA
- Chuyển đổi tọa độ NASA → Three.js (theo công thức trong tài liệu)
- Cập nhật vị trí `pivot.position` của từng hành tinh

#### 4B. Chuyển đổi tọa độ

```js
// NASA → Three.js
xThree = xNASA * scaleFactor;
yThree = zNASA * scaleFactor;
zThree = -yNASA * scaleFactor;
```

#### 4C. Cơ chế fallback

- Nếu API call thất bại (offline/rate limit): dùng Kepler engine với dữ liệu hiện có
- Cache kết quả cuối cùng trong localStorage
- Hiển thị trạng thái: "Live" (xanh), "Kepler" (vàng), "Offline" (đỏ)

---

### Phase 5: Bảng Thông Số Khoa Học NASA  (1-2 ngày)

#### 5A. Tab "NASA Specs" trong Info Panel

Khi đã có dữ liệu từ `OBJ_DATA='YES'`, hiển thị:
- Bán kính xích đạo (km)
- Khối lượng (kg)
- Mật độ (g/cm³)
- Chu kỳ tự quay (giờ)
- Độ nghiêng trục quay (độ)
- Suất phản chiếu (albedo)

#### 5B. Dữ liệu trong `solar-system.json`

Đã có `physical` object trong JSON. Cần đảm bảo đồng bộ qua NASA sync script.

---

## 4. Lộ Trình Thực Hiện

| Phase | Nội dung | Thời gian | Ưu tiên |
|-------|----------|-----------|---------|
| **1A** | Thêm Ω, ω, M vào solar-system.json | 4 giờ | 🔴 **Cao** |
| **1B** | Cập nhật dataLoader.js flatten | 1 giờ | 🔴 **Cao** |
| **2A-2C** | Sửa orbits.js dùng ma trận xoay 3D đầy đủ | 6 giờ | 🔴 **Cao** |
| **2D** | Xử lý orbitPlane === "parentEquator" | 2 giờ | 🟡 Trung bình |
| **3A-3B** | Cập nhật NASA sync script | 3 giờ | 🟡 Trung bình |
| **3C** | Xử lý epoch cho meanAnomaly | 2 giờ | 🟡 Trung bình |
| **4A-4C** | Real-time Live Sync UI | 8 giờ | 🟢 Thấp |
| **5A-5B** | Bảng NASA Specs | 4 giờ | 🟢 Thấp |

**Tổng thời gian ước tính: ~30 giờ (4-5 ngày làm việc)**

---

## 5. Rủi Ro & Giảm Thiểu

| Rủi ro | Tác động | Giảm thiểu |
|--------|----------|------------|
| Sai Ω/ω làm hỏng orbit line của moons | Visual lỗi | Giữ fallback orbitPlane="parentEquator" |
| API NASA Horizons thay đổi endpoint | Sync script hỏng | Có fallback dùng dữ liệu tĩnh |
| Cache WeakMap trong kepler.js bị clear | Giảm performance mỗi lần tạo orbit | Export getter không làm invalid cache |
| meanAnomaly tại epoch khác nhau | Vị trí hành tinh lệch | Lưu epoch trong JSON, đồng bộ thời gian |
| performance: 2048 points × 3D rotation | FPS giảm nhẹ | Pre-compute rotation matrix (đã có cache) |

---

## 6. Verification

| Kiểm tra | Cách kiểm tra |
|----------|---------------|
| Mercury orbit có Ω=48°, ω=29° | Visual: quỹ đạo nghiêng + xoay đúng |
| Pluto orbit nghiêng 17.2° | Visual: quỹ đạo cắt qua mặt phẳng hoàng đạo |
| Halley orbit e=0.967, 3 revolutions | Visual: cận điểm đúng vị trí |
| Moon orbitPlane="parentEquator" | Visual: không thay đổi so với hiện tại |
| NASA sync chạy được | `npm run sync-nasa` |
| Build không lỗi | `npm run build` |
| FPS không giảm >10% | `renderer.info` + FPS counter |
