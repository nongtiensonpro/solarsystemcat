# Kế hoạch Tối ưu Hiệu năng — Chế độ Kepler Mặc định

## Tổng quan

Mục tiêu: Đạt FPS cao và ổn định (≥60 FPS trên desktop, ≥30 FPS trên mobile) ở chế độ Kepler mặc định bằng cách giảm CPU cost mỗi frame, giảm áp lực GC, và tối ưu GPU pipeline.

---

## 1. 🚨 Vấn đề cấp bách: Object Allocation trong Hot-Path

### Hiện trạng
Mỗi frame, vòng lặp `animate()` tạo ra **nhiều đối tượng `THREE.Vector3` mới** trong per-body loop (~30 bodies):

| Vị trí | Dòng | Vấn đề |
|--------|------|--------|
| `bodyWorldPos` | 1075 | `new THREE.Vector3()` mỗi frame × mỗi body |
| `sunDir` (từ trường) | 1080 | `new THREE.Vector3(0,0,0).sub(bodyWorldPos)` |
| `sunDir` (khí quyển) | 1099 | `new THREE.Vector3(0,0,0).sub(bodyWorldPos)` |
| `sunDir` (mây) | 1136 | `new THREE.Vector3(0,0,0).sub(bodyWorldPos)` |
| `planetPos` (vành đai) | 1183 | `new THREE.Vector3()` |
| Camera tracking | 1238–1246 | `new THREE.Vector3()` nhiều lần |
| Ring tooltips | 1264, 1297 | `new THREE.Vector3()` |
| Ghost moon | 1343 | `new THREE.Vector3()` |
| Sunlight path | 1380 | `new THREE.Vector3()` |

**Tác động**: ~150+ object allocations/frame → GC pressure → micro-stutter mỗi vài giây.

### Giải pháp: Vector Pooling

```js
// Định nghĩa pool ở đầu hàm bootstrap() — cấp phát một lần
const _v = new THREE.Vector3();   // reusable temp vector
const _v2 = new THREE.Vector3();  // cho sun direction
const _v3 = new THREE.Vector3();  // cho planet position
const _sunDir = new THREE.Vector3();
```

- Thay `const bodyWorldPos = new THREE.Vector3()` → `body.pivot.getWorldPosition(_v)`
- Thay `new THREE.Vector3(0,0,0).sub(bodyWorldPos).normalize()` → `_sunDir.copy(_v).negate().normalize()`
- Áp dụng cho tất cả điểm trong bảng trên

**Ước lượng**: Giảm 100% allocation trong hot path. Loại bỏ GC micro-stutter.

---

## 2. 🔥 Vấn đề: Cập nhật Vành đai Tiểu hành tinh (3000–5000 objects)

### Hiện trạng
`asteroidBelt.update()` (dòng 1394) chạy mỗi frame, lặp qua 3000–5000 tiểu hành tinh, mỗi cái tính:
- `Math.sin`, `Math.cos`, `Math.sqrt` (quỹ đạo Kepler đơn giản hóa)
- `dummy.position.set()`, `dummy.rotation.set()`, `dummy.scale.set()`
- `dummy.updateMatrix()`, `instancedMesh.setMatrixAt()`
- Ghi `instanceMatrix.needsUpdate = true`

**Tác động**: 3000–5000 vòng lặp với floating-point math và matrix ops mỗi frame.

### Giải pháp A: Throttle cập nhật quỹ đạo (High impact)
Chỉ cập nhật vị trí quỹ đạo mỗi **N frame** (N=2 hoặc 3). Nội suy vị trí giữa các frame.

```js
// Trong asteroidBelt.update():
const ORBIT_UPDATE_INTERVAL = 3; // update quỹ đạo mỗi 3 frame
if (frameCount % ORBIT_UPDATE_INTERVAL === 0) {
  // tính toán vị trí quỹ đạo đầy đủ
} else {
  // chỉ cập nhật rotation (rẻ hơn nhiều)
}
```

### Giải pháp B: Chỉ cập nhật rotation mỗi frame, quỹ đạo throttle
- Rotation (self-rotation) vẫn update mỗi frame (chỉ += số float)
- Position (orbital) update mỗi 2-3 frame

### Giải pháp C: Half float + WebGL buffer optimization
Dùng `Float32Array` thay vì `THREE.Object3D` matrix ops:
- Pre-allocate matrix array, ghi trực tiếp bằng `setMatrixAt` không qua `dummy`

**Ước lượng**: Giảm 50–70% CPU time cho asteroid belt.

---

## 3. 🔥 Vấn đề: Redundant `getWorldPosition()` và `traverse()`

### Hiện trạng
- `body.pivot.getWorldPosition(bodyWorldPos)` gọi 1 lần (dòng 1076)
- Nhưng các section D3, D4, D5, D6 vẫn gọi lại hoặc dùng chung `bodyWorldPos`

### Giải pháp: Tái cấu trúc per-body loop

```
for each body:
  1. body.pivot.getWorldPosition(_v)          // 1 lần duy nhất
  2. _sunDir.copy(_v).negate().normalize()    // 1 lần duy nhất
  3. distToCamera = camera.position.distanceTo(_v) // 1 lần
  
  4. if isMagneticFieldEnabled → dùng _sunDir
  5. if atmosphereMeshes → dùng _sunDir
  6. if volumetricCloudMesh → dùng _sunDir
  7. if ring mesh → dùng _v (cho uPlanetPosition)
```

Thêm early-exit: nếu `distToCamera > threshold` thì skip atmosphere/aurora/clouds.

**Ước lượng**: Giảm ~30% compute trong per-body section.

---

## 4. ⚡ Vấn đề: Shader Uniform Updates Cho Mọi Body

### Hiện trạng
Mỗi frame, cho mỗi body:
- Magnetic field: `group.traverse()` duyệt toàn bộ scene graph → set uniforms
- Atmosphere: loop qua `atmosphereMeshes` array → set uniforms
- Aurora: `group.traverse()` → set uniforms
- Clouds: set uniforms
- Rain/snow effects: set uniforms

Nhiều body không có các effect này nhưng vẫn bị check.

### Giải pháp: Distance-based Culling + Skip invisible

```js
// Early exit: body far away
if (distToCamera > FAR_CULL_DISTANCE) {
  // chỉ update Kepler position + rotation, skip mọi effect
  continue;
}
```

Các ngưỡng hợp lý:
- Aurora: `radius * 8` (đã có)
- Magnetic field: `radius * 20` (thêm mới)
- Volumetric clouds: `radius * 15` (thêm mới)
- Atmosphere scattering: `radius * 50` (thêm mới)
- Rain/snow effects: `radius * 30` (đã có isClose)

**Ưu điểm**: Khi ở overview xa, chỉ 8 planets + Sun được update đầy đủ. Moons và chi tiết bị skip.

**Ước lượng**: Giảm 40–60% CPU time trong per-body loop khi ở xa.

---

## 5. ⚡ Vấn đề: Bloom Pass Full-Resolution

### Hiện trạng
`SelectiveBloomPass` render bloom layer ở full resolution (dòng 108–112 postprocessing.js). `bloomComposer.render()` chạy mỗi frame.

### Giải pháp: Half-resolution bloom target

```js
this.bloomRenderTarget = new THREE.WebGLRenderTarget(
  this.resolution.x / 2,  // half width
  this.resolution.y / 2,  // half height
  { ... }
);
```

Bloom là hiệu ứng "mờ", quarter số pixel không ảnh hưởng chất lượng thị giác.

**Ước lượng**: Giảm 40% GPU time cho bloom pass (đặc biệt ảnh hưởng trên mobile iGPU).

---

## 6. 📊 Vấn đề: Minimap Canvas Redraw Mỗi Frame

### Hiện trạng
`updateMinimap()` (dòng 1397) được gọi mỗi frame, clear và redraw toàn bộ canvas 2D. Ngay cả khi minimap ẩn (`display:none`), function vẫn chạy.

### Giải pháp
```js
// Trong updateMinimap():
const minimapContainer = document.getElementById('minimap-container');
if (!minimapContainer || minimapContainer.style.display === 'none') return;
```

Thêm `frameCount % 2 === 0` throttle cho minimap update khi không tracking body nào.

**Ước lượng**: Giảm 0.5–1ms JS CPU time mỗi frame (tích lũy).

---

## 7. 🎯 Vấn đề: Label DOM Updates (Throttle chưa đủ)

### Hiện trạng
Labels update mỗi 3 frame (desktop) / 6 frame (mobile). Tuy nhiên `updateLabels()` gọi `camera.position.distanceTo()` cho mỗi label (~30+) và cập nhật CSS transform.

### Giải pháp: Tăng throttle + Frustum culling
- Throttle lên 4 frame (desktop) — thị giác khó nhận biết
- Chỉ update labels cho body nằm trong frustum (dùng `camera.frustum`)

**Ước lượng**: Giảm 0.3–0.5ms mỗi frame.

---

## 8. 🎯 Vấn đề: `solarWindStrength` và `Math.sin` Overhead

### Hiện trạng
Dòng 956–957 tính toán phức tạp mỗi frame:
```js
const solarWindStrength = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(simulationTime * 0.00003)) 
  * (0.6 + 0.4 * Math.sin(simulationTime * 0.00008 + 1.3));
```
Đây là 2 `Math.sin` mỗi frame.

### Giải pháp
Throttle: chỉ tính mỗi 3-5 frame với nội suy tuyến tính.
```js
if (frameCount % 3 === 0) {
  _solarWindStrength = computeSolarWind(simulationTime);
}
// Dùng _solarWindStrength cached
```

Hoặc dùng LUT sin từ kepler.js thay vì Math.sin.

**Ước lượng**: Giảm 0.02ms — tác động nhỏ nhưng dễ làm.

---

## 9. 🎯 Vấn đề: Orbit Lines Animated Shader Uniforms

### Hiện trạng
Dòng 1199–1209: loop qua tất cả orbit lines và nbodyOrbitLines để update `uTime` uniform mỗi frame.

### Giải pháp
Throttle lên mỗi 2 frame. Hoặc dùng `deltaTime` tích lũy thay vì gán mỗi frame:
```js
if (frameCount % 2 === 0) {
  for (const orbit of orbits) {
    if (orbit.visible && orbit.material.uniforms?.uTime) {
      orbit.material.uniforms.uTime.value += deltaTime * 2; // compensate for throttle
    }
  }
}
```

---

## 10. 🎯 Vấn đề: Hero Moon Pulse (`Date.now()` per frame)

### Hiện trạng
Dòng 1191–1196: `Math.sin(Date.now() * 0.003)` gọi `Date.now()` mỗi frame cho mỗi hero moon.

### Giải pháp
Dùng `simulationTime` thay vì `Date.now()`. Hoặc pre-compute `time = Date.now()` một lần đầu frame.

---

## 11. 📦 Vấn đề: Texture Loading không ảnh hưởng runtime

Đã được xử lý tốt bởi textureLoader. Không cần can thiệp.

---

## 12. 🖥️ GPU-side: Shadow Map Resolution

### Hiện trạng
Shadow map 2048×2048 với `PCFSoftShadowMap` (scene.js dòng 64–68). Khi có nhiều planet nhận shadow, đây là GPU cost lớn.

### Giải pháp (cho Low/Balanced preset)
- Giảm shadow map xuống 1024×1024 ở preset Balanced
- Tắt shadow ở preset Low hoặc khi ở overview xa

---

## Thứ tự ưu tiên triển khai

| Ưu tiên | Vấn đề | Nỗ lực | Tác động |
|---------|--------|--------|----------|
| **P0** | Object allocation hot-path (mục 1) | 3-4 files, ~20 edits | Cao — loại bỏ GC stutter |
| **P0** | Asteroid belt throttle (mục 2) | 1 file (asteroidBelt.js) | Cao — 3000-5000 objects |
| **P0** | Redundant getWorldPosition + restructure (mục 3) | 1 file (main.js) | Cao — 30% per-body compute |
| **P1** | Distance-cull expensive effects (mục 4) | 1 file (main.js) | Trung bình-Cao |
| **P1** | Bloom half-res (mục 5) | 1 file (postprocessing.js) | Trung bình — GPU saving |
| **P2** | Minimap early return (mục 6) | 1 file (main.js) | Thấp-Trung bình |
| **P2** | Label throttle increase (mục 7) | 1 file (main.js) | Thấp |
| **P2** | Solar wind throttle (mục 8) | 1 file (main.js) | Thấp |
| **P2** | Orbit uniforms throttle (mục 9) | 1 file (main.js) | Thấp |
| **P2** | Hero moon Date.now() fix (mục 10) | 1 file (main.js) | Rất thấp |

---

## Cách đo lường hiệu quả

Hiện tại đã có FPS counter (`src/main.js:1403-1413`). Để đánh giá chính xác:

1. **Before/After comparison**: Bật FPS counter, record FPS trong 30 giây ở cùng view (overview mặc định)
2. **Chrome DevTools Performance tab**: Record 5s profile, đo:
   - JS Heap size (GC pressure)
   - Scripting time/frame
   - Rendering time/frame
   - Number of major GC events
3. **Test scenarios**:
   - Overview (Sun view, tất cả planets visible)
   - Close-up Earth (atmosphere, clouds, magnetic field active)
   - Asteroid belt view
   - Saturn close-up (rings + hero moons)

---

## Kết luận

Tổng ước tính cải thiện sau khi áp dụng P0 + P1:
- **CPU time/frame**: Giảm 40–60%
- **GPU time/frame**: Giảm 15–25% (bloom half-res)
- **GC pauses**: Loại bỏ hoàn toàn (vector pooling)
- **FPS dự kiến**: Từ ~45-55 lên ~55-60 (desktop, high preset)

Chi phí triển khai: ~4-6 giờ cho P0+P1, ~2-3 giờ cho P2.
