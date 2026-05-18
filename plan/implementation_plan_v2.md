# Kế Hoạch Nâng Cấp Hệ Mặt Trời V2 (Vanilla JS)

Dựa trên tài liệu `Ke_Hoach_Mo_Phong_He_Mat_Troi.md` và hiện trạng của dự án (Vanilla JS + Vite), chúng ta đã hoàn thành xuất sắc hệ thống vật lý nội hàm cơ bản, shader Mặt Trời, mưa Heli/Kim Cương và cơ chế Cắt lớp (Cross-Section) thủ công. 

Dưới đây là kế hoạch Phase tiếp theo để tích hợp các tính năng còn thiếu, đưa mô phỏng lên cấp độ hoàn thiện cao nhất.

---

## 🚀 Giai Đoạn 1: Tự Động Hóa Cắt Lớp Theo Zoom (Auto Watermelon Slice)

**Mục tiêu:** Chuyển đổi từ nút bấm "Cắt" thủ công sang cơ chế cắt tự nhiên khi người dùng cuộn chuột (zoom) sát vào hành tinh.

1. **Theo dõi khoảng cách Camera:** Tính toán `distance = camera.position.distanceTo(trackedBody.position)`.
2. **Ngưỡng kích hoạt (Zoom Thresholds):** 
   - `distance > 5 * radius`: Hiển thị bình thường.
   - `distance < 3 * radius`: Bắt đầu trượt mặt cắt (lerp `clipPlane.constant`).
   - `distance < 1.5 * radius`: Lộ hoàn toàn nửa hành tinh.
3. **Cập nhật `crossSection.js`:** Thay thế `toggleCrossSection` bằng hàm `updateZoomLevel(body, distance)` được gọi liên tục trong `animate()`.

## 🏷️ Giai Đoạn 2: Tương Tác Cắt Lớp (Layer Tooltip & 3D Labels)

**Mục tiêu:** Khi đang ở chế độ mặt cắt, hiển thị tên của từng lớp khi người dùng trỏ chuột vào.

1. **Raycaster Target:** Áp dụng `Raycaster` lên các `nested spheres` của `cross_section_layers`.
2. **Hover Logic:** Do đang dùng `DoubleSide` nên ta cần filter các intersection có normal hướng về phía camera.
3. **Floating UI:** Dùng CSS2DRenderer hoặc HTML Overlay để hiển thị một Tooltip nhỏ (Tên lớp, T, P, ρ) ngay tại tọa độ chuột.

## ❄️ Giai Đoạn 3: Hiệu Ứng Vật Lý Bổ Theo Tài Liệu Mới (Iron Snow & Fuzzy Core)

**Mục tiêu:** Bổ sung các chi tiết vật lý chuyên sâu chưa được implement từ bảng tài liệu mới.

1. **Iron Snow (Sao Thủy):**
   - Tạo module `ironSnow.js` (tương tự `heliumRain.js`).
   - Hạt màu xám trắng rơi ngược từ ranh giới lớp phủ xuống tâm lõi.
2. **Fuzzy Core (Sao Mộc / Sao Thổ):**
   - Bỏ giới hạn cứng của lõi.
   - Thay material lõi bằng ShaderMaterial với hàm opacity Gaussian mờ dần ra biên để mô phỏng sự phân tán vật chất không có ranh giới sắc nét.

## 🗺️ Giai Đoạn 4: Giao Diện Nâng Cao (Minimap & Screenshot)

**Mục tiêu:** Hoàn thiện UI/UX theo tiêu chuẩn ứng dụng giáo dục.

1. **Radar / Minimap:**
   - Một ô nhỏ ở góc dưới bên trái, vẽ các đường tròn đồng tâm (quỹ đạo).
   - Dấu chấm nhấp nháy đại diện cho vị trí hiện tại của các hành tinh và camera.
2. **Thanh Chỉ Báo Zoom (Zoom Indicator):**
   - Một thanh trượt dọc UI bên phải hoặc trái hiển thị: Toàn hệ -> Tiếp cận -> Cắt lớp.
3. **Screenshot Export:**
   - Thêm nút 📸 vào Info Panel.
   - Sử dụng `renderer.domElement.toDataURL('image/png')` để tải ảnh xuống, kết hợp vẽ đè (composite) UI nếu cần.

## ⚡ Giai Đoạn 5: Tối Ưu Hiệu Năng (LOD & Physics Worker)

**Mục tiêu:** Duy trì 60 FPS khi render hàng trăm thành phần và particle.

1. **Level of Detail (LOD):**
   - Thay vì dùng `segments = 64` cố định, sử dụng `THREE.LOD` cho `planet mesh` và `cross_section_layers`.
   - Càng xa camera, số polygon càng giảm (64 -> 32 -> 16).
2. **Frustum Culling Nâng Cao:**
   - Đảm bảo các hệ thống hạt (mưa Heli, kim cương, tuyết sắt) được pause/hide nếu hành tinh không nằm trong tầm nhìn của camera.
3. **WebWorker Physics (Tùy chọn):**
   - Di chuyển thuật toán tính `keplerEngine.js` sang một background thread để giảm tải cho Main Thread khi TimeScale được đẩy lên mức `x10000`.
