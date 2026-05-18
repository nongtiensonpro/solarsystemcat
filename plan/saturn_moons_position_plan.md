# Kế Hoạch Nâng Vị Trí Vệ Tinh Sao Thổ

> Dự án: Solar System 3D  
> Ngày lập: 2026-05-16  
> Mục tiêu: sắp xếp lại hệ vệ tinh của Sao Thổ để không nằm trong Sao Thổ, không đè lên bề mặt/vành đai, và nhìn có trật tự khi quan sát gần.

---

## 1. Hiện trạng

Dữ liệu hiện tại chỉ có một vệ tinh của Sao Thổ là `titan` trong `public/data/solar-system.json`.

Thông số đang gây lỗi hiển thị:

| Hạng mục | Giá trị hiện tại |
| --- | ---: |
| Bán kính Sao Thổ | `9.45` units |
| Vành ngoài Sao Thổ | `9.45 * 2.34 = 22.11` units |
| Titan `semiMajorAxis` | `0.00817 AU` |
| Hệ số `orbitScale` của Titan | `4` |
| Bán kính quỹ đạo hiển thị của Titan | `0.00817 * 400 * 4 = 13.07` units |
| Cận điểm Titan hiển thị | `13.07 * (1 - 0.0288) = 12.70` units |

Kết luận: Titan đang quay ở khoảng 12.7-13.1 units tính từ tâm Sao Thổ, trong khi vành ngoài Sao Thổ đã tới 22.11 units. Vì vậy vệ tinh có thể bị nhìn như nằm trong vùng Sao Thổ/vành đai, hoặc đè lên bề mặt khi camera ở góc gần.

Code liên quan:

- `public/data/solar-system.json`: dữ liệu `parentId`, `orbit`, `render.orbitScale`.
- `src/dataLoader.js`: chuẩn hóa `orbitScale`.
- `src/kepler.js`: tính vị trí bằng `semiMajorAxis * AU * orbitScale`.
- `src/orbits.js`: vẽ đường quỹ đạo bằng cùng công thức.
- `src/main.js`: gắn pivot vệ tinh vào `parentBody.pivot`.
- `src/rings.js`: tạo vành đai Sao Thổ bằng `radius * rings.outerRadius`.

---

## 2. Nguyên nhân kỹ thuật

1. **Tỷ lệ vật lý và tỷ lệ hiển thị bị trộn chung.** Bán kính hành tinh đang tính theo bán kính Trái Đất, còn khoảng cách quỹ đạo tính theo AU đã nén mạnh. Với vệ tinh, `orbitScale: 4` chưa đủ lớn để đưa Titan ra ngoài bán kính Sao Thổ và vành đai.

2. **Không có khoảng an toàn riêng cho hành tinh có vành đai.** Công thức hiện tại chỉ nhân `semiMajorAxis * AU * orbitScale`, không kiểm tra `parent.radius`, `parent.rings.outerRadius`, hay kích thước label/mesh của vệ tinh.

3. **Mặt phẳng quỹ đạo vệ tinh chưa tham chiếu đúng theo xích đạo của Sao Thổ.** Vành đai nằm trong `tiltGroup` của Sao Thổ, còn vệ tinh gắn vào `parentBody.pivot`. Điều này làm quỹ đạo vệ tinh gần theo mặt phẳng riêng, có thể cắt qua vành đai ở góc nhìn gần.

4. **Tất cả vệ tinh sẽ khởi tạo cùng pha nếu bổ sung thêm vệ tinh.** `computeOrbitalPosition()` hiện bắt đầu từ cùng mean anomaly, nên các vệ tinh mới có thể xếp thành một đường, đè lên nhau trên màn hình và tạo cảm giác hỗn loạn.

---

## 3. Nguyên tắc sắp xếp mới

1. **Tách "khoảng cách vật lý" và "khoảng cách hiển thị".** Giữ `orbit.semiMajorAxis` và `orbit.orbitalPeriod` để phục vụ thông tin khoa học, nhưng dùng thêm trường render riêng cho bán kính quỹ đạo hiển thị.

2. **Đặt mọi vệ tinh ngoài vùng cấm.** Vùng cấm của Sao Thổ là:

   ```text
   forbiddenRadius = saturn.radius * saturn.rings.outerRadius
   ```

   Với dữ liệu hiện tại:

   ```text
   forbiddenRadius = 22.11 units
   ```

   Vệ tinh gần nhất phải có cận điểm hiển thị lớn hơn:

   ```text
   forbiddenRadius + 4..6 units
   ```

3. **Vệ tinh Sao Thổ nên nằm gần mặt phẳng vành đai.** Mặc định dùng mặt phẳng xích đạo của parent cho các vệ tinh chính của Sao Thổ, sau đó chỉ thêm `inclination` nhỏ theo từng vệ tinh.

4. **Mỗi vệ tinh cần có slot riêng.** Nếu bổ sung hệ vệ tinh chính, dùng các bán kính hiển thị có khoảng cách tối thiểu 4-8 units để không đè lên nhau khi nhìn gần.

5. **Thêm pha ban đầu để tránh xếp hàng.** Mỗi vệ tinh nên có `render.initialPhaseDeg` khác nhau.

---

## 4. Thiết kế dữ liệu đề xuất

Bổ sung các trường tùy chọn trong `render`:

```json
{
  "render": {
    "fallbackColor": "#D4A840",
    "orbitScale": 4,
    "displayOrbitRadius": 52,
    "initialPhaseDeg": 210,
    "orbitPlane": "parentEquator"
  }
}
```

Ý nghĩa:

| Trường | Mục đích |
| --- | --- |
| `displayOrbitRadius` | Bán kính quỹ đạo hiển thị tính bằng world/local units, ưu tiên hơn `semiMajorAxis * AU * orbitScale` khi có mặt. |
| `initialPhaseDeg` | Lệch pha ban đầu để vệ tinh không khởi tạo cùng một vị trí. |
| `orbitPlane` | `"parentEquator"` cho vệ tinh Sao Thổ để quỹ đạo gần mặt phẳng vành đai. |

Lý do không chỉ tăng `orbitScale`: hệ số scale chung sẽ làm các vệ tinh xa như Titan/Iapetus bị đẩy quá xa nếu dùng chung cho cả nhóm. `displayOrbitRadius` rõ ràng hơn, dễ test hơn, và không phá thông tin vật lý.

---

## 5. Slot vị trí đề xuất cho hệ vệ tinh Sao Thổ

Nếu chỉ sửa Titan trước, đặt Titan ra `displayOrbitRadius: 52`.

Nếu bổ sung nhóm vệ tinh chính của Sao Thổ, dùng layout sau:

| Vệ tinh | Bán kính hiển thị đề xuất | Pha ban đầu | Ghi chú |
| --- | ---: | ---: | --- |
| Mimas | `28` | `20deg` | Vệ tinh trong cùng, nằm ngoài vành ngoài `22.11` với margin gần 6 units. |
| Enceladus | `32` | `75deg` | Tách khỏi Mimas để không chạm label/mesh. |
| Tethys | `36` | `135deg` | Slot trung gian gần Sao Thổ. |
| Dione | `41` | `190deg` | Bắt đầu vùng ngoài của cụm vệ tinh gần. |
| Rhea | `46` | `260deg` | Cách Dione đủ để quan sát khi zoom. |
| Titan | `52` | `210deg` | Vệ tinh lớn nhất, cần slot rõ ràng ngoài vành đai. |
| Iapetus | `68` | `315deg` | Xa hơn nhưng vẫn nằm trong tầm nhìn khi theo dõi Sao Thổ. |

Khoảng cách này là tỷ lệ hiển thị, không phải tỷ lệ vật lý tuyệt đối. Mục tiêu ưu tiên là tránh chồng lấp và để người dùng quan sát được hệ Sao Thổ.

---

## 6. Kế hoạch triển khai

### Phase 1: Sửa dữ liệu Titan

- Cập nhật `public/data/solar-system.json`.
- Thêm `render.displayOrbitRadius: 52`.
- Thêm `render.initialPhaseDeg: 210`.
- Thêm `render.orbitPlane: "parentEquator"`.
- Giữ nguyên `semiMajorAxis`, `orbitalPeriod`, `eccentricity`, `inclination` để không mất thông tin khoa học.

### Phase 2: Cập nhật data loader

- Trong `src/dataLoader.js`, chuẩn hóa thêm:
  - `displayOrbitRadius`
  - `initialPhaseDeg`
  - `orbitPlane`
- Nếu thiếu các trường mới thì fallback về logic cũ.

### Phase 3: Cập nhật engine quỹ đạo

- Trong `src/kepler.js`, ưu tiên:

  ```js
  const a = data.displayOrbitRadius ?? data.semiMajorAxis * AU * orbitScale;
  const phase = (data.initialPhaseDeg || 0) * Math.PI / 180;
  const M = (2 * Math.PI / periodSeconds) * timeElapsed + phase;
  ```

### Phase 4: Cập nhật đường quỹ đạo

- Trong `src/orbits.js`, dùng cùng logic tính `a` với `kepler.js`.
- Đường quỹ đạo phải trùng với chuyển động thực tế của vệ tinh.
- Đổi màu/opacity riêng cho vệ tinh Sao Thổ nếu cần để dễ nhìn trên nền vành đai.

### Phase 5: Căn lại mặt phẳng hệ Sao Thổ

Có hai hướng triển khai:

1. **Nhanh, ít rủi ro:** Khi `data.orbitPlane === "parentEquator"`, tạo một `satelliteSystemGroup` dưới `parentBody.pivot`, xoay group theo `parentBody.data.axialTilt`, rồi gắn pivot vệ tinh và orbit line vào group này.

2. **Đầy đủ hơn:** Tạo hàm `createSatelliteOrbitGroup(parentBody, moonData)` để quản lý mặt phẳng quỹ đạo theo parent, hỗ trợ cả Sao Thổ, Sao Mộc, Sao Thiên Vương về sau.

Đề xuất chọn hướng 1 cho bản sửa đầu tiên.

### Phase 6: Bổ sung các vệ tinh Sao Thổ khác

- Thêm dữ liệu Mimas, Enceladus, Tethys, Dione, Rhea, Iapetus nếu muốn có "hệ vệ tinh Sao Thổ" đầy đủ hơn.
- Dùng slot ở mục 5 cho `displayOrbitRadius`.
- Đặt texture sau; ban đầu có thể dùng `fallbackColor` để ưu tiên sửa layout.

### Phase 7: Kiểm thử và tinh chỉnh

- Chạy app bằng `npm run dev`.
- Mở Sao Thổ, bật hiển thị quỹ đạo và nhãn.
- Kiểm tra ở các góc:
  - Camera gần Sao Thổ.
  - Camera nhìn dọc mặt phẳng vành đai.
  - Camera nhìn ngang vành đai.
  - Time scale cao để xem vệ tinh có cắt qua bề mặt/vành đai không.

---

## 7. Tiêu chí hoàn thành

- Titan không bao giờ có cận điểm hiển thị nhỏ hơn `saturn.radius * saturn.rings.outerRadius + 4`.
- Không có vệ tinh Sao Thổ nằm trong mesh Sao Thổ.
- Không có vệ tinh Sao Thổ nằm đè lên bề mặt Sao Thổ khi bắt đầu scene.
- Đường quỹ đạo trùng với chuyển động thực tế của vệ tinh.
- Khi bổ sung nhiều vệ tinh, mỗi vệ tinh có slot và pha riêng, không khởi tạo thành một cụm hỗn loạn.
- Khi camera follow Titan, camera không bị đưa vào trong vành đai hoặc sát bề mặt Sao Thổ.

---

## 8. Đề xuất thay đổi nhỏ nhất

Nếu cần sửa nhanh trong một lần commit, làm 4 việc sau:

1. Thêm `displayOrbitRadius`, `initialPhaseDeg`, `orbitPlane` cho Titan trong `public/data/solar-system.json`.
2. Chuẩn hóa 3 trường mới trong `src/dataLoader.js`.
3. Dùng `displayOrbitRadius` và `initialPhaseDeg` trong `src/kepler.js`.
4. Dùng `displayOrbitRadius` trong `src/orbits.js`.

Sau đó mới mở rộng sang nhiều vệ tinh Sao Thổ khác.
