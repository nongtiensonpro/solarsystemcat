# Kế hoạch triển khai (Cập nhật): Hệ thống Đánh giá Hiệu năng Thiết bị (Benchmark) & Báo cáo Chi tiết

Kế hoạch này đề xuất thiết kế và triển khai một tính năng **Đánh giá hiệu năng (Benchmark)** toàn diện, giúp người dùng stress-test phần cứng (CPU & GPU) trực tiếp trên môi trường đồ họa Three.js của simulator. Theo ý kiến phản hồi từ người dùng, giai đoạn tính toán lực hấp dẫn N-body tương đối không ổn định nên sẽ được chuyển thành một **tùy chọn mở rộng (không bắt buộc và tắt theo mặc định)**.

## User Review Required

> [!IMPORTANT]
> **Thay đổi cấu trúc Benchmark và Tính tùy chọn:**
> - **Cấu trúc mặc định (3 giai đoạn - 15 giây)**: Tập trung hoàn toàn vào độ ổn định của hệ thống đồ họa và hạt, giúp đo đạc hiệu năng GPU/CPU Dựng hình một cách cực kỳ ổn định.
> - **Tùy chọn mở rộng (N-body Physics Stress - Thêm 5 giây)**: Người dùng có thể bật/tắt tùy chọn "Bao gồm kiểm tra vật lý N-body (Không khuyến nghị vì kém ổn định)" trước khi bắt đầu. Nếu bật, hệ thống sẽ thêm một Giai đoạn kiểm tra CPU riêng biệt.

> [!TIP]
> **Khôi phục cấu hình gốc:**
> Trước khi bắt đầu chạy benchmark, hệ thống sẽ tự động lưu lại toàn bộ cấu hình hiện tại của người dùng (chất lượng đồ họa, các hiệu ứng đang bật/tắt). Khi benchmark hoàn tất (hoặc bị hủy bỏ giữa chừng), toàn bộ thiết lập ban đầu sẽ được khôi phục 100%, đảm bảo trải nghiệm của người dùng không bị thay đổi sau đợt kiểm tra.

## Proposed Changes

Để triển khai hệ thống Benchmark, chúng ta sẽ thực hiện các chỉnh sửa và bổ sung như sau:

---

### [Component: UI & Giao diện Đánh giá]

Tích hợp nút bắt đầu Benchmark, tùy chọn bật/tắt kiểm tra N-body vào Settings Panel, và thiết kế Overlay đếm ngược sang trọng, tiếp theo là Dashboard hiển thị kết quả trực quan (Glassmorphism).

#### [MODIFY] [ui.js](file:///d:/solarsystemcat/src/ui.js)
- Thêm phần "Đánh giá hiệu năng" vào dưới cùng của `settingsPanel` trong hàm `initUI`.
- Thêm một checkbox hoặc toggle-row tùy chọn:
  - Tên: `Kiểm tra vật lý N-body (Không ổn định)`
  - ID: `#benchmark-include-nbody` (mặc định là **tắt**).
- Thêm nút `🚀 Chạy Đánh giá (Benchmark)` với ID `#btn-run-benchmark`.
- Đăng ký sự kiện click cho nút và liên kết với callback `onRunBenchmark(includeNbody)`.
- Triển khai các thành phần UI động để hiển thị quá trình benchmark:
  - **Benchmark Overlay (`#benchmark-overlay`)**: Hiển thị trạng thái đang chạy, thanh tiến trình (progress bar), tên giai đoạn hiện tại và đếm ngược thời gian.
  - **Benchmark Report Modal (`#benchmark-report`)**: Bảng kết quả thiết kế sang trọng dạng glassmorphic với:
    - Điểm số tổng quát (Overall Hardware Score).
    - Phân hạng hiệu năng (Hardware Tier): Cấp Thấp (Entry), Cấp Trung (Mid-Range), Cấp Cao (High-End), hoặc Siêu Khủng (Enthusiast).
    - Biểu đồ thanh (CSS flex-bars) so sánh FPS trung bình giữa các Giai đoạn stress-test đã thực hiện.
    - Phân tích chi tiết: FPS trung bình, FPS tối thiểu, Chỉ số Trơn tru (1% Low FPS - đại diện cho hiện tượng giật hình/stuttering), Độ lệch chuẩn thời gian vẽ khung hình (Frame pacing stability).
    - Khuyến nghị cấu hình tối ưu cho thiết bị của họ.
    - Nút tải báo cáo chi tiết `.md` và nút đóng báo cáo.

---

### [Component: Động cơ Đánh giá & Stress-test]

Xây dựng logic điều phối stress-test, thu thập mẫu hiệu năng và tính toán điểm số.

#### [MODIFY] [main.js](file:///d:/solarsystemcat/src/main.js)
- Đăng ký callback `onRunBenchmark` trong `initUI`.
- Thiết lập logic stress-test gồm các Phase liên tục (5 giây mỗi Phase):
  1. **Phase 1: Đo tải cơ sở (Baseline Load - Bắt buộc)**: Chạy ở chế độ Kepler mặc định, các hiệu ứng bổ trợ tắt, nhằm đo hiệu suất dựng hình cơ bản.
  2. **Phase 2: Tải nặng CPU (N-body Gravity Stress - Tùy chọn, mặc định Bỏ qua)**: Chỉ chạy nếu `includeNbody === true`. Bật chế độ Hấp dẫn Newton (N-body) và đường dự đoán quỹ đạo phức tạp cho toàn bộ 15+ thiên thể. Đo khả năng xử lý vật lý nặng của CPU.
  3. **Phase 3: Tải nặng Hạt & GPU (Particle Stress - Bắt buộc)**: Tăng mật độ Asteroids trong vành đai lên tối đa (10,000 hạt), kích hoạt toàn bộ đường ánh sáng Mặt Trời (sunlight paths), đuôi bụi ion sao chổi. Đo khả năng xử lý hạt/chùm đa giác của GPU.
  4. **Phase 4: Tải cực đại Đồ họa & Post-processing (Cinematic Ultra Stress - Bắt buộc)**: Chuyển cấu hình chất lượng lên Extreme/Cinematic, bật đồng thời Mây thể tích, Từ trường, Cực quang cho mọi hành tinh, kích hoạt chế độ Đạo diễn Điện ảnh Tự động (Cinematic Auto Director). Đo sức chịu đựng tối đa của GPU khi xử lý shader hậu kỳ phức tạp.
- Triển khai bộ thu thập mẫu (Profiler):
  - Đo `frameTime` (thời gian vẽ) và `fps` thực tế của từng khung hình.
  - Tính toán chỉ số **1% Low FPS**: Tìm ra 1% các khung hình chậm nhất để đánh giá độ trơn tru và phát hiện micro-stuttering.
  - Tính toán **Độ lệch chuẩn (Standard Deviation)** của frame times để đánh giá độ ổn định của dòng khung hình (Frame pacing stability).
- Công thức tính điểm phần cứng:
  - `Overall Score = (Average_FPS * 0.7 + 1%_Low_FPS * 0.3) * (Screen_Resolution_Factor) * 100`
  - *Trong đó Screen_Resolution_Factor tăng tỷ lệ thuận với số pixel thực tế (ví dụ: Full HD = 1.0, 4K = 4.0), đảm bảo thiết bị gánh độ phân giải siêu cao được thưởng điểm tương xứng.*
- Logic xuất báo cáo Markdown: tạo file chứa thông số phần cứng, mô tả chi tiết từng Phase đã tham gia đo đạc, phân tích độ trơn tru, và khuyến nghị thiết lập phù hợp nhất cho người dùng.

---

### [Component: CSS Styles cho Benchmark]

Định nghĩa giao diện hiển thị Benchmark sang trọng và bắt mắt, đồng bộ với thiết kế hiện tại của dự án.

#### [MODIFY] [style.css](file:///d:/solarsystemcat/src/style.css)
- Thêm styles cho `#benchmark-overlay` (nền tối mờ nhẹ, kính mờ blur, vòng tròn tiến trình chạy động).
- Thêm styles cho `#benchmark-report` (layout responsive, các huy hiệu màu sắc phân hạng rực rỡ sử dụng màu HSL cao cấp, biểu đồ thanh FPS tối giản bóng bẩy).
- Căn chỉnh tối ưu hiển thị cho cả Desktop và Mobile.

---

## Verification Plan

### Automated Tests
- Chạy bộ test hiện tại để đảm bảo không có regressions:
  ```powershell
  powershell -ExecutionPolicy Bypass -Command "npm run test"
  ```
- Biên dịch production để đảm bảo không có lỗi cú pháp hoặc đóng gói:
  ```powershell
  powershell -ExecutionPolicy Bypass -Command "npm run build"
  ```

### Manual Verification
- Người dùng kích hoạt tính năng bằng cách mở **Cài đặt** -> chọn **Chạy Đánh giá (Benchmark)**.
- Kiểm tra tính ổn định của simulator khi đi qua các Phase liên tiếp (màn hình chuyển đổi mượt mà, khóa tương tác chuột, thanh tiến trình cập nhật chính xác).
- Kiểm tra xem Phase N-body có bị bỏ qua mặc định hay không và hoạt động chính xác khi chọn bật.
- Kiểm tra bảng báo cáo kết quả hiện lên ở cuối quy trình:
  - Hiển thị đầy đủ điểm số, phân loại tier phần cứng, biểu đồ FPS, và khuyến nghị.
  - Nhấp nút **Tải Báo cáo (.md)** và mở tệp xem nội dung báo cáo có đầy đủ và định dạng đẹp mắt hay không.
  - Nhấp nút **Đóng báo cáo** để khôi phục hoàn toàn cấu hình ban đầu và mở khóa tương tác chuột/bàn phím.
