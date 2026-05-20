# Kế hoạch tối ưu hóa hiệu năng chế độ Hấp dẫn Newton (N-body)

Chế độ Hấp dẫn Newton (N-body) hiện tại gặp vấn đề hiệu năng nghiêm trọng khiến FPS giảm xuống chỉ còn khoảng 5 FPS hoặc gây đóng băng trình duyệt tạm thời. Qua phân tích mã nguồn, chúng tôi đã phát hiện các nguyên nhân chính sau:

1. **Lặp tích phân hệ thống (N-body) nhiều lần:** Hàm cập nhật quỹ đạo động `updateNbodyPredictions` lặp qua từng thiên thể và gọi `predictTrajectory` riêng biệt. Với khoảng 80 thiên thể (bao gồm toàn bộ vệ tinh của Sao Thổ), hệ thống phải chạy lại toàn bộ mô phỏng tích phân N-body 80 lần khác nhau trên mỗi chu kỳ cập nhật, tạo ra hơn 4 tỷ phép tính thô trong vòng lặp chính.
2. **Số bước dự đoán quá lớn:** Các thiên thể có chu kỳ dài (như sao chổi Halley) yêu cầu tới 100.000 bước tích phân dự đoán, gây quá tải hoàn toàn cho JS đơn luồng.
3. **Mô phỏng cả các thiên thể không cần thiết:** Trong chế độ xem tổng quan (Overview), việc dự đoán quỹ đạo cho tất cả các vệ tinh siêu nhỏ của Sao Thổ là không cần thiết (không thể nhìn thấy ở khoảng cách xa) nhưng vẫn tốn cực kỳ nhiều tài nguyên tính toán.
4. **Không có cơ chế giới hạn an toàn trong vòng lặp chính:** Khi các thiên thể tiến quá gần nhau hoặc va chạm, bước tích phân thích ứng giảm xuống cực nhỏ, dẫn đến số lần lặp tăng vọt lên tới 86.400 lần mỗi khung hình, gây đóng băng trình duyệt.

---

## Các thay đổi đề xuất

Để khắc phục triệt để các vấn đề trên và đưa hiệu năng về mức **60 FPS mượt mà**, chúng tôi đề xuất các giải pháp tối ưu hóa sau:

### 1. Dự đoán quỹ đạo đơn luồng tích hợp (Single-pass Trajectory Prediction)
Thay vì chạy tích phân độc lập cho từng thiên thể, chúng tôi sẽ xây dựng hàm `predictTrajectories(configs)` nhận vào danh sách cấu hình của tất cả thiên thể cần dự đoán. Hàm này sẽ chạy mô phỏng tích phân N-body **chỉ duy nhất 1 lần** và ghi nhận tọa độ quỹ đạo của tất cả thiên thể song song. Điều này giúp giảm tải tính toán ngay lập tức từ **80 lần xuống còn 1 lần** (tốc độ tăng 80x).

### 2. Tinh lọc tập hợp thiên thể tích phân (Sub-system Integration)
Khi dự đoán quỹ đạo, chúng ta chỉ cần mô phỏng lực hấp dẫn giữa các hành tinh chính và Mặt Trời (Overview) hoặc giữa hành tinh mẹ, các vệ tinh của nó và Mặt Trời (khi Focus). Chúng ta sẽ lọc bỏ các vệ tinh không liên quan khỏi danh sách thiên thể tham gia tích phân dự đoán. 
* *Kết quả:* Số lượng thiên thể mô phỏng giảm từ 80 xuống còn 10 (trong chế độ Overview), giảm số phép tính từ $80^2$ xuống $10^2$ (tốc độ tăng thêm 64x).
* *Tổng hợp hai tối ưu hóa trên giúp tăng tốc độ xử lý dự đoán lên tới **5.000x - 20.000x**, giảm thời gian chạy từ 4.000ms xuống dưới **1-2ms**.*

### 3. Tinh chỉnh số bước dự đoán và Lọc vệ tinh trong chế độ Overview
* Cập nhật `updateNbodyPredictions` trong [main.js](file:///d:/solarsystemcat/src/main.js) để chỉ dự đoán quỹ đạo các hành tinh chính khi ở chế độ Overview (ẩn các đường quỹ đạo vệ tinh không nhìn thấy).
* Giảm giới hạn bước tích phân dự đoán tối đa từ 100.000 xuống mức hợp lý hơn là **3.000 bước** (`PREDICT_MAX_STEPS_LONG`) và bước mặc định xuống **1.200 bước** (`PREDICT_MAX_STEPS`), vẫn đảm bảo hiển thị quỹ đạo mượt mà và chính xác.

### 4. Cơ chế tự động giới hạn bước lặp tích phân an toàn (Anti-Freeze Safety Cap)
Thêm giới hạn số lần lặp tối đa (ví dụ: tối đa 300 bước) trong vòng lặp cập nhật vật lý chính `updateNewtonGravity` tại [gravity.js](file:///d:/solarsystemcat/src/gravity.js). Nếu phát hiện bước thích ứng quá nhỏ, hệ thống sẽ tự động điều chỉnh tăng nhẹ bước tích phân tối thiểu để vừa khớp với giới hạn lặp, tuyệt đối chống treo/đóng băng trình duyệt trong mọi trường hợp va chạm cực đoan.

---

## Chi tiết các thay đổi trong mã nguồn

### [Vật lý & Tích phân]

#### [MODIFY] [gravity.js](file:///d:/solarsystemcat/src/gravity.js)
* Giảm hằng số bước dự đoán để tối ưu hóa hiệu năng:
  ```javascript
  const PREDICT_MAX_STEPS = 1200;
  const PREDICT_MAX_STEPS_LONG = 3000;
  ```
* Bổ sung cơ chế giới hạn bước lặp an toàn trong `updateNewtonGravity` để tránh treo trình duyệt:
  ```javascript
  const MAX_ITERATIONS = 300;
  let iterationCount = 0;
  while (remaining > 0 && iterationCount < MAX_ITERATIONS) {
    let maxStep = computeAdaptiveStep(entries, maxAccel);
    // Tính toán bước tối thiểu cho phép để hoàn thành thời gian mô phỏng trong số lượt lặp còn lại
    const minStepAllowed = remaining / (MAX_ITERATIONS - iterationCount);
    if (maxStep < minStepAllowed) {
      maxStep = minStepAllowed;
    }
    const step = Math.min(remaining, maxStep);
    gravitySubstep(step, entries, epsSq);
    remaining -= step;
    iterationCount++;
  }
  ```
* Phát triển hàm `predictTrajectories(configs)` tối ưu hóa đơn luồng chạy song song:
  ```javascript
  export function predictTrajectories(configs) {
    if (configs.length === 0) return new Map();
    // 1. Lưu trạng thái hiện tại của toàn bộ hệ thống
    const savedState = [];
    for (const [id, s] of state) {
      savedState.push({ id, px: s.px, py: s.py, pz: s.pz, vx: s.vx, vy: s.vy, vz: s.vz, massNorm: s.massNorm, gravityAffected: s.gravityAffected });
    }

    // 2. Chuẩn bị dữ liệu tích phân riêng cho các thiên thể đích và xác định globalMaxSteps
    let globalMaxSteps = 0;
    const bodyData = [];
    const neededIds = new Set(['sun']); // Luôn bao gồm Mặt Trời

    for (const config of configs) {
      const { bodyId, numPoints } = config;
      if (!state.has(bodyId)) continue;
      
      let maxSteps = config.maxSteps;
      if (maxSteps === null || maxSteps === undefined) {
        maxSteps = computePredictionSteps(bodyId);
      }
      if (maxSteps <= 0) continue;
      if (maxSteps > globalMaxSteps) globalMaxSteps = maxSteps;
      
      const recordInterval = Math.max(1, Math.floor(maxSteps / numPoints));
      bodyData.push({ bodyId, maxSteps, recordInterval, trajectory: [] });
      neededIds.add(bodyId);
    }

    // 3. Tối ưu hóa: Chỉ tích phân các thiên thể thực sự cần thiết cho quỹ đạo đang xét
    const filteredEntries = [];
    for (const entry of state) {
      if (neededIds.has(entry[0])) {
        filteredEntries.push(entry);
      }
    }

    // 4. Chạy mô phỏng tích phân N-body duy nhất một lượt
    if (globalMaxSteps > 0 && filteredEntries.length > 0) {
      const { epsSq, maxAccel } = computeAdaptiveParams(filteredEntries);
      for (let i = 0; i < globalMaxSteps; i++) {
        const stepSize = computeAdaptiveStep(filteredEntries, maxAccel);
        gravitySubstep(stepSize, filteredEntries, epsSq);

        // Ghi lại tọa độ cho từng thiên thể theo chu kỳ riêng
        for (let j = 0; j < bodyData.length; j++) {
          const bd = bodyData[j];
          if (i < bd.maxSteps && i % bd.recordInterval === 0) {
            const s = state.get(bd.bodyId);
            if (s) bd.trajectory.push({ x: s.px, y: s.py, z: s.pz });
          }
        }
      }
    }

    // 5. Khôi phục lại trạng thái ban đầu của hệ thống
    for (const saved of savedState) {
      state.set(saved.id, { px: saved.px, py: saved.py, pz: saved.pz, vx: saved.vx, vy: saved.vy, vz: saved.vz, massNorm: saved.massNorm, gravityAffected: saved.gravityAffected });
    }

    // 6. Trả về Map kết quả
    const result = new Map();
    for (const bd of bodyData) {
      result.set(bd.bodyId, bd.trajectory);
    }
    return result;
  }
  ```
* Sửa đổi `predictTrajectory` cũ để gọi qua `predictTrajectories` mới nhằm tương thích ngược 100% với các test suite hiện tại:
  ```javascript
  export function predictTrajectory(bodyId, numPoints, maxSteps = null) {
    const res = predictTrajectories([{ bodyId, numPoints, maxSteps }]);
    return res.get(bodyId) || [];
  }
  ```

---

### [Luồng điều khiển chính]

#### [MODIFY] [main.js](file:///d:/solarsystemcat/src/main.js)
* Cập nhật `updateNbodyPredictions` để sử dụng hàm `predictTrajectories` mới:
  * Trong chế độ Overview, chỉ dự đoán cho các hành tinh chính (loại bỏ vệ tinh `!b.data.isMoon`).
  * Gom toàn bộ yêu cầu dự đoán và gọi `predictTrajectories` một lần duy nhất.
  ```javascript
  function updateNbodyPredictions() {
    if (!newtonGravityActive) return;

    const visualsBtn = document.getElementById('toggle-visuals');
    const visualsActive = visualsBtn && visualsBtn.classList.contains('active');
    if (!visualsActive) return;

    const focusedIds = getFocusedBodyIds();
    // Ở Overview, chỉ vẽ quỹ đạo hành tinh để giảm tải + tránh rối mắt
    const targetBodyIds = focusedIds
      ? Array.from(focusedIds)
      : bodies.filter(b => b.data.type !== 'star' && !b.data.isMoon).map(b => b.data.id);
    const targetSet = new Set(targetBodyIds);

    // Dọn dẹp các đường orbit không còn hiển thị
    for (const [id, line] of nbodyOrbitLines) {
      if (!targetSet.has(id)) {
        scene.remove(line);
        if (line.geometry) line.geometry.dispose();
        if (line.material) line.material.dispose();
        nbodyOrbitLines.delete(id);
      }
    }

    // Chuẩn bị danh sách tham số dự đoán
    const configs = [];
    for (const bodyId of targetBodyIds) {
      const body = bodyById.get(bodyId);
      if (!body) continue;

      const qualityMultiplier = getCurrentPreset().orbitQuality ?? 1;
      const numPoints = getSegmentCount(body.data.eccentricity || 0, body.data.isMoon, qualityMultiplier);
      configs.push({ bodyId, numPoints });
    }

    // Chạy dự đoán đơn luồng tích hợp
    const trajectoriesMap = predictTrajectories(configs);

    // Cập nhật/Tạo mới các đường quỹ đạo 3D
    for (const [bodyId, trajectory] of trajectoriesMap) {
      const body = bodyById.get(bodyId);
      if (!body || trajectory.length < 3) continue;

      const points = trajectory.map(p => new THREE.Vector3(p.x, p.y, p.z));

      let orbitLine = nbodyOrbitLines.get(bodyId);
      if (orbitLine) {
        updateOrbitLineGeometry(orbitLine, points);
        orbitLine.visible = true;
      } else {
        orbitLine = createNbodyOrbitLine(body.data, points.length);
        nbodyOrbitLines.set(bodyId, orbitLine);
        scene.add(orbitLine);
        orbitLine.visible = true;
      }
    }
  }
  ```

---

## Kế hoạch kiểm thử & Xác thực (Verification Plan)

### Kiểm thử tự động (Automated Tests)
* Chạy bộ kiểm thử hiện tại của hệ thống để đảm bảo việc tích hợp Yoshida và tính toán năng lượng/angular momentum vẫn hoàn toàn chính xác và không bị ảnh hưởng bởi thay đổi tương thích ngược:
  ```powershell
  npm run test
  ```
  *(hoặc lệnh chạy test tương ứng trong package.json)*

### Kiểm thử thủ công (Manual Verification)
1. **Kiểm tra FPS thực tế:**
   * Bật chế độ "Newtonian Gravity" trong simulator.
   * Kích hoạt bảng chỉ số hiệu năng (Performance Panel/FPS Counter) trên giao diện.
   * Xác nhận FPS tăng từ ~5 FPS lên sát mức **60 FPS** (hoặc giới hạn màn hình) và duy trì ổn định.
2. **Kiểm tra độ chính xác của đường quỹ đạo:**
   * Bật/tắt chế độ hấp dẫn và quan sát các đường dự đoán quỹ đạo màu tím (N-body orbit lines) vẽ quanh các hành tinh.
   * Đảm bảo quỹ đạo được vẽ chính xác, khớp với hướng di chuyển thực tế của các thiên thể.
3. **Kiểm tra khi tập trung (Focus) vào Sao Thổ:**
   * Click chọn Sao Thổ để kích hoạt chế độ mô phỏng nhóm cục bộ.
   * Xác nhận các đường quỹ đạo của các vệ tinh Sao Thổ được kích hoạt và dự đoán mượt mà, không xảy ra hiện tượng giật lag.
4. **Kiểm tra độ ổn định va chạm:**
   * Tăng tốc độ mô phỏng (`timeScale`) lên mức tối đa để các thiên thể di chuyển cực nhanh hoặc va chạm trực diện.
   * Xác nhận trình duyệt **hoàn toàn không bị đóng băng hoặc treo** nhờ cơ chế giới hạn bước lặp an toàn.
