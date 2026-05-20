# Kế hoạch sửa lỗi Chế độ Chụp ảnh Độ phân giải Cực cao (High-Res Screenshot)

Chế độ chụp ảnh độ phân giải cực cao (nút 📷 ở thanh công cụ góc trên bên phải) hiện đang gặp sự cố: hình ảnh chụp ra hoàn toàn bị đen hoặc không hoạt động. Tài liệu này phân tích nguyên nhân gốc rễ và đề xuất kế hoạch khắc phục triệt để.

## Nguyên Nhân Gặp Sự Cố

1. **Thiếu Callback Kết Nối:**
   - Trong file [ui.js](file:///d:/solarsystemcat/src/ui.js#L922-L925), sự kiện click nút `btn-imaging` ("Chụp ảnh độ phân giải cực cao") được lập trình để gọi `callbacks.onHighResScreenshot()`.
   - Tuy nhiên, trong file [main.js](file:///d:/solarsystemcat/src/main.js#L379), khi khởi tạo UI bằng `initUI({...})`, callback `onHighResScreenshot` **hoàn toàn bị bỏ trống** (chưa được khai báo). Vì vậy, khi người dùng click vào nút chụp ảnh độ phân giải cực cao, không có hành động nào được thực thi.

2. **Sử Dụng Sai Công Cụ Render (Lỗi Ảnh Đen & Mất Hiệu Ứng):**
   - Trong hàm chụp ảnh thông thường `takeScreenshot()` của [main.js](file:///d:/solarsystemcat/src/main.js#L1602-L1609), mã nguồn đang gọi trực tiếp `renderer.render(scene, camera)`.
   - Khi ứng dụng sử dụng bộ xử lý hậu kỳ `EffectComposer` (để tạo hiệu ứng Bloom cho Mặt Trời, Depth of Field, Vignette, Film Grain), việc gọi trực tiếp `renderer.render` sẽ bỏ qua toàn bộ pipeline hậu kỳ này. Kết quả là ảnh chụp ra bị mất hết các hiệu ứng ánh sáng lung linh (bloom) của Mặt Trời, trông rất đơn điệu.
   - Hơn nữa, việc gọi `renderer.render` thủ công ngoài luồng loop vẽ thông thường (animate loop) trong một số trạng thái WebGL hoặc trình duyệt có thể dẫn đến việc vẽ sai buffer, gây ra hiện tượng ảnh chụp ra bị đen hoàn toàn (`preserveDrawingBuffer` mặc định là `false`).

---

## Giải Pháp Đề Xuất

Chúng ta sẽ nâng cấp hệ thống chụp ảnh màn hình của ứng dụng:

1. **Kết nối Callback:** Khai báo `onHighResScreenshot` trong `initUI` của `main.js` để liên kết nút bấm với hàm xử lý chụp ảnh chất lượng cao.
2. **Sử dụng Composer để chụp ảnh:** Cả chế độ chụp ảnh thường (`takeScreenshot`) và chụp ảnh cực cao (`takeHighResScreenshot`) sẽ được vẽ thông qua `composer.render()` thay vì `renderer.render()`. Việc này đảm bảo giữ nguyên 100% hiệu ứng Bloom, DOF, Vignette và Grain cực kỳ đẹp mắt của mô phỏng.
3. **Cơ chế Chụp ảnh Cực cao (High-Res) không gây giật lag hoặc méo giao diện:**
   - Sử dụng hệ số phóng đại **3.0x** so với kích thước cửa sổ hiện tại (Ví dụ: màn hình Full HD 1920x1080 sẽ chụp ra ảnh 5760x3240 cực kỳ sắc nét).
   - Tạm thời thay đổi kích thước của `renderer` và `composer` lên kích thước cực cao. Lưu ý: Sử dụng tham số `updateStyle = false` trong `renderer.setSize(width, height, false)` để kích thước hiển thị trên màn hình của thẻ canvas không bị thay đổi, tránh làm vỡ giao diện người dùng.
   - Cập nhật tỷ lệ khung hình (`camera.aspect`) và ma trận chiếu của camera tương ứng với độ phân giải mới để ảnh chụp không bị méo.
   - Sử dụng `try...catch...finally` để đảm bảo hệ thống luôn khôi phục lại độ phân giải màn hình ban đầu ngay cả khi quá trình chụp ảnh độ phân giải cực cao gặp lỗi (ví dụ: tràn bộ nhớ GPU).
   - Đưa quá trình xử lý vào `setTimeout` khoảng 100ms để trình duyệt kịp hiển thị thông báo HUD *"Đang chuẩn bị chụp ảnh..."* trước khi luồng chính (main thread) bị khóa nhẹ để render ảnh cực lớn.

---

## User Review Required

> [!IMPORTANT]
> **Hệ số phóng đại độ phân giải:**
> Hiện tại đề xuất hệ số scale là **3.0x** so với độ phân giải màn hình người dùng. Với màn hình thông thường (Full HD), ảnh chụp ra sẽ có độ phân giải khoảng **5.7K** vô cùng chi tiết. Nếu người dùng sử dụng màn hình 4K, ảnh chụp ra sẽ ở mức **12K**. Chúng tôi khuyên dùng mức 3.0x để đảm bảo cân bằng tốt nhất giữa chất lượng siêu nét và hiệu năng của GPU (tránh bị crash WebGL do tràn bộ nhớ trên các máy cấu hình thấp).

---

## Open Questions

> [!NOTE]
> Không có câu hỏi mở nào cần làm rõ. Phương án kỹ thuật này hoàn toàn khả thi và giải quyết triệt để cả hai vấn đề: chụp ảnh không hoạt động/ảnh đen và chất lượng ảnh bị giảm do mất hiệu ứng Bloom/Cinematic.

---

## Proposed Changes

### Core Solar System Simulation

***

#### [MODIFY] [main.js](file:///d:/solarsystemcat/src/main.js)
- Thêm callback `onHighResScreenshot` vào lời gọi `initUI({...})` ở line 379.
- Refactor hàm `takeScreenshot()` hiện tại để sử dụng `composer.render()` giúp giữ nguyên hiệu ứng Bloom và chống đen màn hình.
- Viết mới hàm `takeHighResScreenshot()` áp dụng thuật toán thay đổi kích thước ảo (virtual resize), render qua composer ở độ phân giải cao 3.0x, xuất file và khôi phục trạng thái cũ.

---

## Verification Plan

### Automated Tests
- Chạy lệnh kiểm tra linter hoặc chạy test suite hiện tại để đảm bảo không phát sinh lỗi cú pháp:
  ```powershell
  npm run test
  ```

### Manual Verification
- Khởi động dev server bằng lệnh:
  ```powershell
  powershell -ExecutionPolicy Bypass -Command "npm run dev"
  ```
- Mở trình duyệt tại `http://localhost:5174/solarsystemcat/` (hoặc port tương ứng).
- Kiểm tra tính năng **Chụp ảnh màn hình thường (📸)** ở Info Panel và trong các settings: hình ảnh tải xuống phải đầy đủ hiệu ứng Bloom Mặt Trời, không bị đen.
- Kiểm tra tính năng **Chụp ảnh độ phân giải cực cao (📷)** ở thanh công cụ phía trên bên phải:
  - Khi click vào, thông báo *"Đang chuẩn bị chụp ảnh độ phân giải cực cao..."* xuất hiện trên HUD.
  - Sau khoảng 1-2 giây, trình duyệt tự động tải xuống file ảnh PNG chất lượng siêu nét (kích thước gấp 3 lần màn hình).
  - Giao diện 3D trên màn hình không bị giật lag, co giãn hay méo mó sau khi hoàn thành.
  - Hình ảnh chụp ra giữ nguyên đầy đủ hiệu ứng Bloom, DoF, Vignette và Film Grain cực đẹp.
