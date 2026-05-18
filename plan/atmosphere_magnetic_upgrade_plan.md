# Kế hoạch Nâng cấp Từ trường & Khí quyển Trái Đất

## 1. Hiện trạng

### Từ trường (`magneticField.js`)
- Chỉ hỗ trợ Earth (dipole), Mercury (dipole yếu), Mars (crustal)
- Jupiter, Saturn, Uranus, Neptune: `strength = 0.0` (bị bỏ qua)
- Shader đơn giản: đường field line moving trên mặt cầu, không có cấu trúc từ quyển 3D thực sự
- Không có tương tác với gió Mặt Trời
- Thiếu hiệu ứng cực quang (aurora) liên kết với từ trường

### Khí quyển (`atmosphere.js`)
- Chỉ có Fresnel shader đơn giản (BackSide, additive blending)
- Một lớp duy nhất, không phân tầng
- Không có Rayleigh/Mie scattering
- Không có hiệu ứng hoàng hôn (sunset/sunrise)
- Màu sắc tĩnh, không thay đổi theo góc Mặt Trời

---

## 2. Kế hoạch nâng cấp

### Phase A: Từ trường nâng cao (A1 → A4)

#### A1. Từ quyển 3D động (Earth)
- **Thay thế** shader mặt cầu hiện tại bằng hệ thống **magnetosphere** 3D:
  - Mặt trước (dayside) bị nén bởi gió Mặt Trời — dùng deformation shader
  - Mặt sau (nightside) kéo dài thành đuôi từ (magnetotail)
  - Đường sức từ (field lines) là các đường cong 3D từ cực Bắc → cực Nam
- Dùng `THREE.Line` + `CatmullRomCurve3` để vẽ ~20 đường sức từ động
- Bow shock: mặt cong phía trước dạng paraboloid

#### A2. Aurora (Cực quang) — Liên kết từ trường-khí quyển
- **Aurora Oval**: Vòng tròn phát sáng quanh 2 cực (ring mesh với shader riêng)
- **Aurora Curtain**: Màn sáng động dạng curtain (particle system hoặc thủ tục)
  - Dùng noise 2D + time để tạo hiệu ứng uốn lượn
  - Màu xanh-lục (chủ đạo) + đỏ (cao năng lượng)
  - Phụ thuộc vào cường độ "gió Mặt Trời" (tham số uniform)
- Tầm nhìn: chỉ thấy khi camera ở gần (bán kính ×5)

#### A3. Từ trường cho tất cả hành tinh
| Hành tinh | Loại từ trường | Cường độ (T) | Ghi chú |
|-----------|---------------|-------------|---------|
| Mercury | Dipole yếu | 0.003 | Giống cũ, cải tiến shader |
| Earth | Dipole + Magnetotail + Aurora | 0.05 | **Nâng cấp chính** |
| Jupiter | Dipole mạnh + Aurora UV | 1.5 | Từ trường mạnh nhất |
| Saturn | Dipole + Aurora | 0.4 | Cực quang Hồng ngoại |
| Uranus | Dipole lệch tâm | 0.2 | Trục từ lệch 60° |
| Neptune | Dipole lệch tâm | 0.1 | Trục từ lệch 47° |

#### A4. Hiệu ứng gió Mặt Trời — tương tác từ trường
- Uniform `uSolarWindStrength` (biến thiên theo thời gian)
- Khi mạnh: từ quyển bị nén nhiều hơn, aurora sáng hơn
- Khi yếu: từ quyển giãn nở

---

### Phase B: Khí quyển nâng cao (B1 → B4)

#### B1. Khí quyển phân tầng (Earth)
Thay thế lớp Fresnel đơn bằng **3 lớp khí quyển**:

| Lớp | Tên | Scale | Màu | Opacity | Power |
|-----|-----|-------|------|---------|-------|
| 1 | Troposphere (trong) | ×1.02 | Xanh lam #4488CC | 0.3 | 6.0 |
| 2 | Stratosphere (giữa) | ×1.05 | Xanh nhạt #6699DD | 0.4 | 4.0 |
| 3 | Exosphere (ngoài) | ×1.10 | Xanh tím #4466AA | 0.2 | 2.0 |

- Mỗi lớp là một `THREE.Mesh` riêng với shader Fresnel
- Layer 1 + 2: `BackSide`, Layer 3: `FrontSide` + DoubleSide
- Tổ hợp màu tạo hiệu ứng **khí quyển dày** ở rìa hành tinh

#### B2. Rayleigh & Mie Scattering
- **Rayleigh scattering**: Ánh sáng xanh tán xạ mạnh hơn — khi Mặt Trời ở sau hành tinh, rìa phát sáng xanh
  - Tính toán dựa trên góc giữa `viewDir` và `lightDir`
  - Fragment shader: `scatterIntensity = 1.0 + cos(angle)^power` với màu xanh
- **Mie scattering**: Hạt bụi/aerosol tán xạ ánh sáng trắng vàng quanh Mặt Trời lúc hoàng hôn
  - Hiệu ứng quầng sáng vàng-cam gần đường chân trời
  - `mieIntensity = 1.0 / (1.0 - cos(angle) * 0.9)` (Lorenz-Mie approximation)

#### B3. Hiệu ứng Hoàng hôn & Bình minh
- Khi Mặt Trời ở gần đường chân trời:
  - Màu khí quyển chuyển từ xanh → cam → đỏ → tím
  - Gradients dựa trên góc cao của Mặt Trời so với horizon
- Cần uniform `uSunDirection` và `uSunAltitude` được tính trong `main.js`
- Kết hợp scattering để tạo dải màu chuyển tiếp mượt

#### B4. Đám mây thể tích (Volumetric Clouds)
- Sử dụng **noise 3D** (Simplex/Perlin) trong fragment shader để tạo mây thể tích
  - Không cần texture mây — tạo hoàn toàn thủ tục
  - 2-3 lớp mây với tốc độ trôi khác nhau
- Hiệu ứng **chiếu sáng xuyên qua mây** (cloud translucency)
  - Rìa mây phát sáng (silver lining effect)
- Tùy chọn: thay thế hoặc bổ sung cho texture clouds hiện tại

#### B5. Khí quyển các hành tinh khác (mở rộng)
| Hành tinh | Loại khí quyển | Cải tiến |
|-----------|----------------|----------|
| Venus | CO₂ dày | Tăng opacity, màu cam, thêm scattering vàng |
| Mars | CO₂ loãng | Tăng power, màu đỏ cam, scattering yếu |
| Titan | Haze N₂ | Giữ haze hiện tại, thêm scattering |
| Jupiter/Saturn | H₂/He | Khí quyển khí khổng lồ (mây banded) — khác biệt |

---

## 3. Sửa đổi file

| File | Hành động |
|------|-----------|
| `src/magneticField.js` | Viết lại hoàn toàn — hỗ trợ magnetosphere 3D, field lines, bow shock |
| `src/aurora.js` | **Tạo mới** — Aurora system (oval + curtain) |
| `src/atmosphere.js` | Viết lại hoàn toàn — multi-layer + Rayleigh/Mie scattering |
| `src/cloudsVolumetric.js` | **Tạo mới** — Volumetric cloud shader (thủ tục) |
| `src/createPlanet.js` | Thêm auroraMesh, cập nhật atmosphere creation |
| `src/main.js` | Cập nhật animate loop cho aurora, gió Mặt Trời, scattering uniforms |
| `public/data/solar-system.json` | Mở rộng `atmosphere` config với multi-layer settings |
| `src/dataLoader.js` | Normalize extended atmosphere config |

---

## 4. Thứ tự ưu tiên

Batch 1 (Nền tảng) → Batch 2 (Nâng cao) → Batch 3 (Mở rộng)

| Batch | Task | Phụ thuộc | Thời gian |
|-------|------|-----------|-----------|
| 1 | B1. Multi-layer atmosphere Earth | — | 2 ngày |
| 1 | A1. Magnetosphere 3D + field lines | — | 2 ngày |
| 2 | B2. Rayleigh + Mie scattering | B1 | 2 ngày |
| 2 | A2. Aurora | A1 | 2 ngày |
| 2 | B4. Volumetric clouds | B1 | 2 ngày |
| 3 | A3. Từ trường các hành tinh còn lại | A1 | 1 ngày |
| 3 | B3. Hoàng hôn/Bình minh | B1+B2 | 1 ngày |
| 3 | A4. Gió Mặt Trời tương tác | A1+A2 | 1 ngày |
| 3 | B5. Khí quyển hành tinh khác | B1+B2 | 1 ngày |

**Tổng thời gian ước tính:** ~14 ngày (làm song song có thể rút xuống 10 ngày)
