# Kế Hoạch Nâng Vị Trí Vệ Tinh Sao Mộc

> Dự án: Solar System 3D  
> Ngày lập: 2026-05-16  
> Mục tiêu: đưa các vệ tinh Galilei của Sao Mộc ra khỏi thân Sao Mộc, tách chúng thành các quỹ đạo hiển thị rõ ràng, và tránh trạng thái khởi tạo chồng lấn/hỗn loạn.

---

## 1. Hiện trạng

Dữ liệu hiện tại có 4 vệ tinh chính của Sao Mộc trong `public/data/solar-system.json`:

- `io`
- `europa`
- `ganymede`
- `callisto`

Tất cả đang dùng `render.orbitScale: 4`. Engine hiện tính bán kính quỹ đạo hiển thị theo công thức:

```text
displayedSemiMajorAxis = semiMajorAxis * AU * orbitScale
```

Trong đó `AU = 400` theo `src/constants.js`.

Với Sao Mộc:

```text
jupiter.radius = 11.21 units
```

Thông số hiện tại:

| Vệ tinh | `semiMajorAxis` | `eccentricity` | Bán kính quỹ đạo hiển thị hiện tại | Cận điểm hiển thị hiện tại | Đánh giá |
| --- | ---: | ---: | ---: | ---: | --- |
| Io | `0.00282 AU` | `0.0041` | `4.51` | `4.49` | Nằm sâu trong Sao Mộc. |
| Europa | `0.00449 AU` | `0.0090` | `7.18` | `7.12` | Nằm trong Sao Mộc. |
| Ganymede | `0.00716 AU` | `0.0013` | `11.46` | `11.44` | Gần sát bề mặt, dễ bị nhìn như đè lên Sao Mộc. |
| Callisto | `0.01259 AU` | `0.0074` | `20.14` | `19.99` | Ra ngoài Sao Mộc nhưng vẫn chưa có khoảng cách thị giác tốt với các vệ tinh còn lại. |

Kết luận: `orbitScale: 4` không đủ lớn cho hệ vệ tinh Sao Mộc. Io và Europa chắc chắn nằm trong mesh Sao Mộc, Ganymede gần như dính vào bề mặt, còn Callisto tách ra nhưng không có quy tắc layout chung.

Code liên quan:

- `public/data/solar-system.json`: dữ liệu `parentId`, `orbit`, `render.orbitScale`.
- `src/dataLoader.js`: chuẩn hóa dữ liệu render hiện chỉ có `fallbackColor` và `orbitScale`.
- `src/kepler.js`: tính vị trí bằng `semiMajorAxis * AU * orbitScale`.
- `src/orbits.js`: vẽ đường quỹ đạo bằng cùng công thức.
- `src/main.js`: gắn pivot vệ tinh vào `parentBody.pivot`.

---

## 2. Nguyên nhân kỹ thuật

1. **Bán kính hành tinh và khoảng cách vệ tinh đang bị nén theo hai logic khác nhau.** Sao Mộc có bán kính hiển thị lớn (`11.21 units`), trong khi các quỹ đạo vệ tinh lấy khoảng cách AU rất nhỏ rồi chỉ nhân `orbitScale: 4`.

2. **Không có vùng cấm quanh hành tinh mẹ.** Engine không kiểm tra cận điểm vệ tinh so với `parent.radius`, nên dữ liệu vẫn hợp lệ về mặt schema nhưng sai về mặt hiển thị.

3. **Tất cả vệ tinh thiếu pha khởi tạo riêng.** `computeOrbitalPosition()` hiện bắt đầu từ cùng mean anomaly, khiến nhiều vệ tinh dễ xuất hiện thành một cụm hoặc một hàng khó đọc khi vừa mở scene.

4. **Không có layout slot cho hệ vệ tinh.** Sao Mộc có nhiều vệ tinh gần nhau về thị giác; nếu chỉ tăng một hệ số chung, vệ tinh trong có thể vừa ra ngoài nhưng vệ tinh ngoài lại bị đẩy quá xa.

5. **Mặt phẳng quỹ đạo chưa gắn với xích đạo hành tinh mẹ.** Vệ tinh đang được gắn vào `parentBody.pivot`, còn độ nghiêng trục của Sao Mộc nằm trong `tiltGroup`. Với Sao Mộc góc nghiêng nhỏ hơn Sao Thổ, nhưng vẫn nên thống nhất để hệ vệ tinh nhìn có trật tự.

---

## 3. Nguyên tắc sắp xếp mới

1. **Không nâng vệ tinh bằng offset Y cố định.** Cách đó chỉ làm vệ tinh trông như bị treo phía trên Sao Mộc. Sửa đúng là tăng bán kính quỹ đạo hiển thị quanh Sao Mộc.

2. **Tách dữ liệu vật lý khỏi layout hiển thị.** Giữ `orbit.semiMajorAxis`, `orbit.orbitalPeriod`, `eccentricity`, `inclination` để phục vụ thông tin khoa học, nhưng thêm trường render riêng cho bán kính quỹ đạo hiển thị.

3. **Đặt mọi vệ tinh ngoài vùng cấm của Sao Mộc.** Vùng cấm tối thiểu:

```text
forbiddenRadius = jupiter.radius + safetyMargin
forbiddenRadius = 11.21 + 4.00 = 15.21 units
```

Vệ tinh trong cùng phải có cận điểm hiển thị lớn hơn `15.21 units`.

4. **Mỗi vệ tinh có một slot riêng.** Slot phải đủ xa để mesh, nhãn, đường quỹ đạo và camera follow không tạo cảm giác chồng lấn.

5. **Mỗi vệ tinh có pha khởi tạo riêng.** Dùng `initialPhaseDeg` để Io, Europa, Ganymede, Callisto không khởi tạo cùng một hướng.

6. **Ưu tiên mặt phẳng xích đạo của Sao Mộc.** Các vệ tinh Galilei nên nằm gần mặt phẳng xích đạo của parent, sau đó áp dụng `inclination` nhỏ riêng cho từng vệ tinh.

---

## 4. Thiết kế dữ liệu đề xuất

Bổ sung các trường tùy chọn trong `render`:

```json
{
  "render": {
    "fallbackColor": "#E8C84A",
    "orbitScale": 4,
    "displayOrbitRadius": 18,
    "initialPhaseDeg": 20,
    "orbitPlane": "parentEquator"
  }
}
```

Ý nghĩa:

| Trường | Mục đích |
| --- | --- |
| `displayOrbitRadius` | Bán kính quỹ đạo hiển thị tính bằng world/local units, ưu tiên hơn `semiMajorAxis * AU * orbitScale` khi có mặt. |
| `initialPhaseDeg` | Pha khởi tạo để các vệ tinh không bắt đầu cùng một vị trí. |
| `orbitPlane` | `"parentEquator"` để quỹ đạo vệ tinh đi theo mặt phẳng xích đạo của hành tinh mẹ. |

Lý do không chỉ tăng `orbitScale`: nếu dùng một hệ số chung đủ lớn để Io ra ngoài Sao Mộc, Callisto sẽ bị đẩy ra quá xa so với khung quan sát gần. `displayOrbitRadius` cho phép layout có chủ đích, dễ kiểm thử và không phá thông tin vật lý.

---

## 5. Slot vị trí đề xuất cho Sao Mộc

| Vệ tinh | Bán kính hiển thị đề xuất | Cận điểm sau khi áp dụng | Pha ban đầu | Ghi chú |
| --- | ---: | ---: | ---: | --- |
| Io | `18` | `17.93` | `20deg` | Vệ tinh trong cùng, vượt vùng cấm `15.21` với margin an toàn. |
| Europa | `24` | `23.78` | `115deg` | Tách rõ khỏi Io, vẫn đủ gần Sao Mộc khi quan sát. |
| Ganymede | `31` | `30.96` | `225deg` | Vệ tinh lớn nhất, cần slot dễ nhìn và không chạm label của Europa. |
| Callisto | `41` | `40.70` | `310deg` | Xa nhất trong nhóm Galilei, vẫn nằm trong khung follow Sao Mộc hợp lý. |

Các bán kính này là tỷ lệ hiển thị, không phải mô phỏng tỷ lệ vật lý tuyệt đối. Mục tiêu ưu tiên là sửa lỗi vệ tinh nằm trong Sao Mộc và tạo bố cục rõ ràng cho người dùng.

---

## 6. Kế hoạch triển khai

### Phase 1: Sửa dữ liệu layout cho 4 vệ tinh Sao Mộc

- Cập nhật `public/data/solar-system.json`.
- Thêm `render.displayOrbitRadius` cho `io`, `europa`, `ganymede`, `callisto`.
- Thêm `render.initialPhaseDeg` cho từng vệ tinh.
- Thêm `render.orbitPlane: "parentEquator"`.
- Giữ nguyên `orbit.semiMajorAxis`, `orbitalPeriod`, `eccentricity`, `inclination`.

Giá trị đề xuất:

```json
{
  "io": { "displayOrbitRadius": 18, "initialPhaseDeg": 20 },
  "europa": { "displayOrbitRadius": 24, "initialPhaseDeg": 115 },
  "ganymede": { "displayOrbitRadius": 31, "initialPhaseDeg": 225 },
  "callisto": { "displayOrbitRadius": 41, "initialPhaseDeg": 310 }
}
```

### Phase 2: Cập nhật data loader

Trong `src/dataLoader.js`, chuẩn hóa thêm:

- `displayOrbitRadius`
- `initialPhaseDeg`
- `orbitPlane`

Fallback:

- Nếu thiếu `displayOrbitRadius`, dùng logic cũ `semiMajorAxis * AU * orbitScale`.
- Nếu thiếu `initialPhaseDeg`, dùng `0`.
- Nếu thiếu `orbitPlane`, giữ cách gắn hiện tại.

### Phase 3: Cập nhật Kepler engine

Trong `src/kepler.js`, ưu tiên bán kính hiển thị mới:

```js
const orbitScale = data.orbitScale || 1;
const a = data.displayOrbitRadius ?? data.semiMajorAxis * AU * orbitScale;
const phase = (data.initialPhaseDeg || 0) * Math.PI / 180;
const M = (2 * Math.PI / periodSeconds) * timeElapsed + phase;
```

Điều này giữ chu kỳ quỹ đạo và độ lệch tâm hiện tại, chỉ thay đổi khoảng cách hiển thị và vị trí khởi tạo.

### Phase 4: Cập nhật đường quỹ đạo

Trong `src/orbits.js`, dùng cùng logic tính `a` với `src/kepler.js`:

```js
const a = data.displayOrbitRadius ?? data.semiMajorAxis * AU * orbitScale;
```

Đường quỹ đạo phải trùng với chuyển động thực tế của vệ tinh. Nếu không cập nhật `orbits.js`, vệ tinh sẽ chạy một nơi còn đường quỹ đạo nằm một nơi.

### Phase 5: Chuẩn hóa mặt phẳng hệ vệ tinh

Triển khai nhỏ nhất:

- Khi `data.orbitPlane === "parentEquator"`, tạo hoặc dùng một group vệ tinh dưới `parentBody.pivot`.
- Xoay group theo `parentBody.data.axialTilt`.
- Gắn cả `body.pivot` và `orbitLine` của vệ tinh vào group đó.

Với Sao Mộc, `axialTilt` chỉ `3.1deg`, nên thay đổi này ít rủi ro nhưng giúp hệ vệ tinh có cùng quy ước với các hành tinh có vệ tinh khác.

### Phase 6: Thêm kiểm tra dữ liệu chống tái lỗi

Thêm cảnh báo phát triển trong `src/dataLoader.js` hoặc helper riêng:

```text
Nếu body.isMoon và parent tồn tại:
  minDistance = displayOrbitRadius ?? semiMajorAxis * AU * orbitScale
  pericenter = minDistance * (1 - eccentricity)
  nếu pericenter <= parent.radius + safetyMargin:
    cảnh báo moon có nguy cơ nằm trong parent
```

Không cần chặn app chạy; chỉ cần cảnh báo rõ trong console để phát hiện lỗi layout sớm.

### Phase 7: Kiểm thử trực quan

- Chạy `npm run dev`.
- Mở cảnh Sao Mộc.
- Bật đường quỹ đạo và nhãn.
- Kiểm tra khi:
  - vừa load scene;
  - camera follow Sao Mộc;
  - camera follow từng vệ tinh;
  - tăng time scale;
  - nhìn từ trên xuống mặt phẳng quỹ đạo;
  - nhìn ngang qua Sao Mộc.

---

## 7. Tiêu chí hoàn thành

- Không có vệ tinh Sao Mộc nào có cận điểm hiển thị nhỏ hơn `15.21 units`.
- Io và Europa không còn nằm trong mesh Sao Mộc.
- Ganymede không còn chạm hoặc đè lên bề mặt Sao Mộc ở trạng thái khởi tạo.
- Callisto vẫn nhìn thấy trong khung quan sát gần Sao Mộc, không bị đẩy ra quá xa.
- 4 vệ tinh có pha khởi tạo khác nhau, không xuất hiện thành một cụm hỗn loạn.
- Đường quỹ đạo trùng với chuyển động thực tế của vệ tinh.
- Camera follow từng vệ tinh không đưa camera vào trong Sao Mộc hoặc sát bề mặt Sao Mộc.

---

## 8. Đề xuất thay đổi nhỏ nhất

Nếu cần sửa nhanh trong một lần commit, làm 4 việc sau:

1. Thêm `displayOrbitRadius`, `initialPhaseDeg`, `orbitPlane` cho 4 vệ tinh Sao Mộc trong `public/data/solar-system.json`.
2. Chuẩn hóa 3 trường mới trong `src/dataLoader.js`.
3. Dùng `displayOrbitRadius` và `initialPhaseDeg` trong `src/kepler.js`.
4. Dùng `displayOrbitRadius` trong `src/orbits.js`.

Sau đó mới mở rộng sang kiểm tra dữ liệu tự động hoặc nhóm quỹ đạo theo `parentEquator`.
