# Kế hoạch khắc phục lỗi hiển thị khi chuyển đổi các hành tinh/vệ tinh

## 1. Phân tích nguyên nhân (Root Cause)

Vấn đề "có thiên thể thấy rõ, có thiên thể/vệ tinh không thấy gì" khi chuyển camera xuất phát từ sự chênh lệch tỷ lệ kích thước quá lớn trong `solar-system.json`.
- Mặt Trời có bán kính `25`, Trái Đất là `1.0`, nhưng Mặt Trăng chỉ là `0.273` và Sao Chổi Halley là `0.05`.
- Trong hàm `selectPlanet` (`src/main.js`), khoảng cách camera khi bấm chọn một thiên thể đang bị chặn ở một giới hạn cứng:
  ```javascript
  const zoomDist = Math.max(trackedBody.data.radius * 5, 10);
  ```
- **Hệ quả:** Đối với các thiên thể nhỏ (nhỏ hơn 2), biến `zoomDist` luôn bị ép thành `10`. Một thiên thể cỡ `0.05` ở khoảng cách `10` sẽ chỉ trông như 1 chấm nhỏ (hoặc biến mất khỏi màn hình), dẫn đến hiện tượng người dùng không thể nhìn thấy các vệ tinh và sao chổi nhỏ khi focus vào.

## 2. Giải pháp đề xuất (Proposed Solutions)

Để giải quyết vấn đề này, ta cần thực hiện các điều chỉnh ở các module điều khiển camera:

### Bước 1: Sửa logic focus camera trong `src/main.js`
Loại bỏ giới hạn khoảng cách cứng (`10`) và thay bằng một tỷ lệ tương đối mềm theo bán kính của thiên thể, với một giới hạn an toàn tối thiểu dựa trên `camera.near` (0.1) để tránh lỗi render.
**Thay đổi:**
```javascript
// Trước đây: 
const zoomDist = Math.max(trackedBody.data.radius * 5, 10);

// Sửa thành:
const zoomDist = Math.max(trackedBody.data.radius * 5, 0.25); 
// 0.25 đảm bảo camera không bị lỗi clipping (gần hơn 0.1) nhưng vẫn đủ gần cho các vật thể bé.
```

### Bước 2: Tinh chỉnh hàm nội suy `flyProgress` (Tùy chọn nâng cao)
Hiện tại khi chuyển từ thiên thể khổng lồ sang nhỏ, tốc độ bay đang là cố định (`flyProgress += 0.02`). 
Nếu muốn mượt hơn cho những khoảng cách lớn, ta có thể áp dụng tốc độ nội suy biến thiên dựa trên cự ly bay, hoặc thêm zoom lùi (Pull-back) rồi mới bay đến mục tiêu để tránh đi xuyên qua các bề mặt.
- *Hành động:* Tạm thời giữ nguyên Ease function (`1 - Math.pow(1 - flyProgress, 3)`) vì nó đã có gia tốc, nhưng chỉnh `flyProgress += 0.015` để chuyến bay có thời gian phản hồi nhịp nhàng hơn.

### Bước 3: Cập nhật Cinematic Camera (`src/cinematicCamera.js`)
Kiểm tra các preset như `orbit`, `chase`, và `dollyZoom` để đảm bảo chúng không dùng các tham số tĩnh khiến vệ tinh bị rớt khỏi khung hình.
- Ví dụ trong `chase`: `const offset = shotParams.offset || new THREE.Vector3(0, 50, 150);` - Cần đổi thành một vector phụ thuộc vào tỷ lệ của `targetBody.data.radius` thay vì fixed vector.

### Bước 4: Điều chỉnh Min Distance của OrbitControls (`src/scene.js`)
OrbitControls hiện tại không có giới hạn zoom in (`controls.minDistance`). Cần thiết lập `controls.minDistance = 0.2` để người dùng không thể cuộn chuột xuyên qua các vệ tinh quá nhỏ.

## 3. Các bước triển khai

1. Chỉnh sửa hàm `selectPlanet()` trong `src/main.js`.
2. Sửa lỗi hardcode offset trong `src/cinematicCamera.js` ở shot `chase` (nếu có).
3. Bổ sung `controls.minDistance` vào `src/scene.js`.

Bạn xem qua kế hoạch này, nếu đồng ý thì tôi sẽ bắt đầu chỉnh sửa mã nguồn nhé!
