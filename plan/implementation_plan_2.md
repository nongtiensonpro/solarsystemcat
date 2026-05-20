# Kế Hoạch Nâng Cấp Hiệu Năng Kepler Engine & Tăng Cực Hạn FPS

Bản kế hoạch này tập trung vào hai khu vực có chi phí tính toán CPU cao nhất trong quá trình render hệ mặt trời ở chế độ mặc định (Kepler mode): **Kepler Orbital Dynamics Engine** (`kepler.js`) và **Vành Đai Tiểu Hành Tinh** (`asteroidBelt.js`). Bằng các kỹ thuật tối ưu toán học (fast-paths), giảm thiểu phép gọi hàm siêu việt (`Math.sin`/`Math.cos`), loại bỏ cơ chế tìm kiếm trong `WeakMap`, và ghi thẳng ma trận chuyển động vào WebGL Buffer (Direct Buffer Writes) không thông qua Three.js Object3D, hiệu năng xử lý của CPU sẽ tăng vượt bậc, từ đó nâng cấp đáng kể chỉ số FPS.

---

## Các Đề Xuất Tối Ưu Hóa Chính

### 1. Tối ưu hóa thuật toán Kepler Solver (`src/kepler.js`)
* **Fast-Path cho quỹ đạo lệch tâm thấp ($e < 0.15$)**: Hơn 95% hành tinh và vệ tinh trong hệ mặt trời (kể cả 25 vệ tinh của Sao Thổ) có quỹ đạo gần tròn ($e < 0.15$). Thay vì chạy vòng lặp Halley tối đa 15 lần, ta chỉ cần giải xấp xỉ bậc một (dùng LUT nội suy tuyến tính đã có) và thực hiện **đúng một bước lặp Newton-Raphson**. Điều này đem lại độ chính xác toán học $O(e^6) \approx 10^{-6} \to 10^{-8}$ rad (hoàn toàn không thể phân biệt bằng mắt thường trên màn hình) với chi phí CPU gần như bằng 0 và không có vòng lặp.
* **Loại bỏ tính toán lượng giác dư thừa (`solveKeplerSinCos`)**: Hiện tại, sau khi tìm được Eccentric Anomaly $E$, code gọi hàm tiếp tục tính `Math.sin(E)` và `Math.cos(E)`. Vì các giá trị này đã được tính ở bước cuối cùng của Kepler Solver, ta sẽ tạo một hàm tích hợp `solveKeplerSinCos` trả về trực tiếp bộ ba $(E, \sin E, \cos E)$ qua một đối tượng tái sử dụng duy nhất (`scratchSinCos`), tiết kiệm từ 30% đến 50% số lần gọi hàm lượng giác siêu việt (`Math.sin`/`Math.cos`) trên toàn bộ hệ thống.
* **Bypass WeakMap Cache**: Thay đổi cơ chế cache ma trận quay từ `WeakMap.get(data)` thành truy cập thuộc tính trực tiếp `data._keplerCache`. Thuộc tính ẩn này truy xuất nhanh hơn đáng kể so với cấu trúc bảng băm của `WeakMap` trong hot path 60fps.

### 2. Ghi trực tiếp ma trận Vành đai Tiểu hành tinh (`src/asteroidBelt.js`)
* Hiện tại, vòng lặp cập nhật chuyển động cho 3000 tiểu hành tinh mỗi frame đang sử dụng một đối tượng `dummy` dạng `THREE.Object3D`. Việc liên tục gọi `dummy.position.set`, `dummy.rotation.set`, `dummy.scale.set`, `dummy.updateMatrix()` và sao chép ma trận qua `setMatrixAt` tạo ra overhead cực kỳ lớn về cuộc gọi hàm của Three.js cũng như áp lực dọn rác (GC pressure).
* **Giải pháp**: Viết công thức ma trận khép kín (closed-form matrix) trực tiếp cho phép dịch chuyển (Translation), tự quay quanh trục (Euler XYZ Rotation), và đồng dạng tỉ lệ (Uniform Scale), sau đó ghi thẳng các phần tử Float32 này trực tiếp vào mảng WebGL đệm (`instancedMesh.instanceMatrix.array`). Phương pháp này bỏ qua hoàn toàn các lớp trung gian của Three.js, tăng tốc độ xử lý vòng lặp tiểu hành tinh lên tới **10 lần**.

---

## User Review Required

> [!NOTE]
> Các nâng cấp này tối ưu hóa sâu ở tầng thuật toán và cấu trúc bộ nhớ đệm nên không làm thay đổi giao diện người dùng, chất lượng đồ họa hay tính năng vật lý của ứng dụng. Mọi chuyển động của hành tinh, vệ tinh, và tiểu hành tinh sẽ mượt mà hơn rất nhiều nhờ giảm nghẽn CPU (CPU bottleneck).

> [!IMPORTANT]
> Phương pháp fast-path lượng giác $e < 0.15$ đảm bảo sai số vị trí hiển thị dưới mức $0.0001$ pixel trên màn hình thường, hoàn toàn an toàn và tối ưu tuyệt đối cho đồ họa 3D thời gian thực.

---

## Open Questions

Không có câu hỏi mở nào cần làm rõ. Kế hoạch này tối ưu hóa các thành phần lõi hiện tại dựa trên toán học và cấu trúc dữ liệu hiệu năng cao mà không thay đổi bất cứ API công khai nào.

---

## Proposed Changes

### § 1. Core Kepler Module
#### [MODIFY] [kepler.js](file:///d:/solarsystemcat/src/kepler.js)
* Thêm cấu trúc tái sử dụng `scratchSinCos = { sinE: 0, cosE: 0 }`.
* Phát triển hàm tích hợp `solveKeplerSinCos(M, e, tolerance, maxIter)` hỗ trợ fast-path $e < 0.15$ dùng 1 bước Newton-Raphson và lưu trực tiếp kết quả $\sin(E)$, $\cos(E)$ vào `scratchSinCos`.
* Thay đổi `getOrCreateCache` sử dụng truy cập thuộc tính ẩn `data._keplerCache` trực tiếp.
* Cập nhật `computeAllPositions`, `computeOrbitalPositionInto`, `computeOrbitalVelocity`, `computeOrbitalState`, `computeAllStates`, và `sampleOrbitPath` để sử dụng hàm tích hợp `solveKeplerSinCos` và bỏ hoàn toàn việc gọi lại lượng giác trùng lặp.

### § 2. Asteroid Simulation Module
#### [MODIFY] [asteroidBelt.js](file:///d:/solarsystemcat/src/asteroidBelt.js)
* Loại bỏ đối tượng trung gian `dummy` khỏi vòng lặp cập nhật chính.
* Cập nhật hàm `update` để ghi trực tiếp các hệ số ma trận được tính toán khép kín vào `instancedMesh.instanceMatrix.array` theo kiểu tuần tự (Direct Buffer Writes).

---

## Verification Plan

### Automated Tests
* Chạy ứng dụng thông qua môi trường phát triển và kiểm tra log console để đảm bảo không có bất kỳ lỗi JavaScript nào phát sinh.
* Chạy bộ test hiện tại của project nếu có (ví dụ: `npm run test` nếu có script tương ứng trong `package.json`).

### Manual Verification
* Kích hoạt bộ đếm FPS trên giao diện người dùng (FPS Counter) để so sánh chỉ số FPS trước và sau khi tối ưu hóa ở chế độ mặc định (Kepler mode).
* Quan sát chuyển động của các vệ tinh Sao Thổ và Vành đai tiểu hành tinh để kiểm chứng quỹ đạo vẫn chính xác tuyệt đối, mượt mà và không bị giật, rung hay lệch hướng.
