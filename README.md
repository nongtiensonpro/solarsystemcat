# Hệ Mặt Trời 3D — Solar System Simulation

Mô phỏng Hệ Mặt Trời 3D tương tác, độ chính xác cao, được xây dựng bằng **Three.js**. Dự án cho phép khám phá toàn bộ hệ mặt trời với đồ họa sắc nét, hiệu ứng vật lý chân thực, chế độ điện ảnh cinematic, và mặt cắt cấu tạo nội hành tinh.

## 🚀 Tính năng chính

### Thiên thể & Quỹ đạo
- **Mặt Trời** (Sun): Bề mặt quang cầu với shader nhiễu 3D động, vầng nhật hoa (corona), sắc quyển (chromosphere), hiệu ứng phát sáng (bloom) — mô phỏng tự cân bằng nhiệt hạch
- **8 hành tinh**: Sao Thủy, Sao Kim, Trái Đất, Sao Hỏa, Sao Mộc, Sao Thổ, Sao Thiên Vương, Sao Hải Vương — mỗi hành tinh có texture riêng, tỷ lệ kích thước, độ nghiêng trục và chu kỳ tự quay chính xác
- **Vệ tinh (Moons)**: Mặt Trăng (Trái Đất), Phobos & Deimos (Sao Hỏa), các vệ tinh Sao Mộc (Io, Europa, Ganymede, Callisto), hệ thống vệ tinh Sao Thổ (Titan, Enceladus, Mimas, Tethys, Dione, Rhea, Iapetus, Hyperion, Phoebe, v.v.), các vệ tinh Sao Thiên Vương và Sao Hải Vương (Triton)
- **Danh mục vệ tinh Sao Thổ mở rộng**: Hơn 30 vệ tinh với Hệ thống Vệ tinh Ma (Ghost Moon System) cho các vệ tinh nhỏ
- **Sao chổi (Comets)**: Đuôi ion + đuôi bụi với shader động, độ sáng thay đổi theo khoảng cách đến Mặt Trời
- **Vành đai tiểu hành tinh** (Asteroid Belt): InstancedMesh với 5,000+ tiểu hành tinh biến dạng ngẫu nhiên

### Động lực học quỹ đạo
- **Kepler Engine**: Động cơ quỹ đạo Kepler chính xác — giải phương trình Kepler bằng Newton-Raphson, hỗ trợ độ lệch tâm cao (sao chổi)
- **N-body Gravity**: Mô phỏng hấp dẫn Newton với bộ tích phân symplectic Yoshida bậc 4 — hỗ trợ bước thời gian thích ứng, tương tác vệ tinh-chính, và hiệu ứng hấp dẫn giữa các hành tinh
- **1PN Post-Newtonian**: Hiệu chỉnh tương đối tính bậc nhất cho quỹ đạo Sao Thủy 
- **Dự đoán quỹ đạo N-body**: Đường đi dự đoán cho từng thiên thể trong hệ N-body

### Camera & Cinematic
- **Chế độ điện ảnh (Cinematic Mode)**: Điều khiển camera tự do (FPS-style), khóa mục tiêu, nhiều kiểu shot preset (sunOrbit, orbit, flyBy, chase, dollyZoom, planetFocus)
- **Planet Focus Mode**: Chế độ ngắm hành tinh chuyên nghiệp với chọn ống kính (20mm–300mm), Dutch angle, Rule of Thirds, Handheld/shoulder rig
- **Auto Director**: Chế độ đạo diễn tự động — chọn hành tinh, cắt cảnh ngẫu nhiên, điều chỉnh ống kính và kiểu quay theo từng loại thiên thể
- **Cinematic Effects**: Depth of Field (Bokeh), Vignette, Film Grain — kích hoạt khi ở chế độ điện ảnh
- **Fly-to Animation**: Chuyển cảnh mượt với easing easeInOutCubic

### Hiệu ứng hình ảnh
- **Atmosphere (Khí quyển)**: Hiệu ứng tán xạ Rayleigh + Mie, đa lớp, phản ứng theo hướng Mặt Trời
- **Magnetic Field (Từ trường)**: Đường sức từ động với hiệu ứng dòng chảy (flow lines), lá chắn từ quyển (magnetosphere), biến dạng theo gió Mặt Trời
- **Aurora (Cực quang)**: Cực quang GPU shader — dải sáng động, phản ứng gió Mặt Trời, chỉ hiển thị khi camera ở gần
- **Volumetric Clouds (Mây thể tích)**: Mây 3D procedural với hiệu ứng gió, tán xạ ánh sáng
- **Rings (Vành đai)**: Vành Sao Thổ — colormap + alphamap chính xác 4096x1, phân cách Cassini, khe Encke, vành D/C/B/A/F; Vành Sao Thiên Vương — 11 vành (ζ, 6, 5, 4, α, β, η, γ, δ, λ, ε) với tooltip tương tác
- **Post-processing**: Selective Bloom (chỉ Mặt Trời), UnrealBloomPass + ShaderPass tùy chỉnh
- **Spacetime Grid (Lưới không-thời gian)**: Biểu diễn độ cong không-thời gian do khối lượng thiên thể gây ra
- **Sunlight Paths (Đường ánh sáng)**: Đường mờ từ hành tinh về Mặt Trời
- **Starfield**: Bầu trời sao động với phân bố phổ màu (spectral types O–M)

### Cấu tạo nội hành tinh (Cross-section)
- **Mặt cắt động**: Cắt dọc thiên thể để xem cấu trúc bên trong
- **Mặt Trời**: Lõi (Core), Vùng Bức xạ, Vùng Đối lưu, Sắc quyển, Vành nhật hoa
- **Hành tinh đá**: Sao Thủy, Sao Kim, Trái Đất, Sao Hỏa — lõi, manti, vỏ dựa trên dữ liệu khoa học
- **Hành tinh khí**: Sao Mộc, Sao Thổ — lõi mờ (fuzzy core), Hydro kim loại, mưa Heli
- **Hành tinh băng**: Sao Thiên Vương, Sao Hải Vương — lõi đá, manti nước siêu ion, mưa kim cương
- **Tuyết Sắt (Iron Snow)**: Hiệu ứng hạt sắt kết tinh rơi trong lõi Sao Thủy
- **Mưa Heli**: Hiệu ứng hạt Heli ngưng tụ rơi trong lõi Sao Mộc/Sao Thổ
- **Mưa Kim Cương**: Hiệu ứng hạt Carbon kết tinh rơi trong manti Sao Thiên Vương/Sao Hải Vương
- **Enceladus Plume**: Chùm tia nước phun từ vệ tinh Enceladus

### Giao diện & UX
- **UI Glassmorphism**: Giao diện kính mờ với blur, bo góc, hiệu ứng ánh sáng
- **Thanh công cụ trên cùng**: Điều khiển thời gian (từ 1× đến 1 năm/giây), tạm dừng, tìm kiếm, cài đặt
- **Bảng cài đặt (Settings Panel)**: Chất lượng đồ họa (Cao/Cân bằng/Thấp), bật/tắt hiệu ứng (từ trường, cực quang, mây, vành đai, nhãn, quỹ đạo), chụp ảnh màn hình
- **Chọn hành tinh**: Nhấp vào hành tinh 3D hoặc chọn từ danh sách — camera bay tới với hiệu ứng chuyển cảnh
- **Tooltip vành đai**: Di chuột qua vành Sao Thổ/Sao Thiên Vương để xem tên và mô tả
- **Mini-map + Zoom Indicator**: Bản đồ thu nhỏ và chỉ báo khoảng cách zoom
- **Cinematic Panel**: Điều khiển chế độ điện ảnh, preset shot, ống kính, tốc độ quay
- **Discovery Notification**: Thông báo khi lần đầu khám phá một thiên thể mới
- **Mobile hỗ trợ**: Double-tap để chọn hành tinh, touch-action, safe area

### Physics & Kỹ thuật
- **Adaptive Exposure**: Phơi sáng tự động bù đắp suy giảm ánh sáng theo khoảng cách
- **Multi-Layer Sunlight System**: Hệ thống chiếu sáng 2 lớp (PointLight decay=2 + Fill Light decay=0.8) + Hemisphere Light
- **Shadow Map**: Bóng đổ PCSS mềm từ Mặt Trời
- **Logarithmic Depth Buffer**: Chống Z-fighting ở khoảng cách lớn (0.1 → 100,000 units)
- **LOD (Level of Detail)**: Tự động giảm chi tiết mesh khi camera ở xa
- **Adaptive Timestep**: Bước thời gian thích ứng cho N-body simulation
- **Energy Conservation Monitoring**: Giám sát bảo toàn năng lượng cho N-body
- **Collision Detection**: Phát hiện va chạm giữa các thiên thể trong N-body

### Quality Presets
- **Cao (High)**: 5000 ngôi sao, 3000 tiểu hành tinh, bloom, khí quyển, mây, khử răng cưa, hiệu ứng điện ảnh đầy đủ
- **Cân bằng (Balanced)**: 3000 ngôi sao, 1500 tiểu hành tinh, hiệu ứng vừa phải
- **Thấp (Low)**: 800 ngôi sao, 300 tiểu hành tinh, không khí quyển, không mây, không bloom, không khử răng cưa

## 🧠 Phát triển với Vibe Coding

Dự án này được xây dựng bằng phương pháp **Vibe Coding** — quy trình phát triển phần mềm với sự hỗ trợ tối đa từ AI:

- **[Opencode](https://opencode.ai)** — Coding agent CLI tương tác, thực thi lệnh, tìm kiếm mã nguồn, chỉnh sửa file trực tiếp
- **[Antigravity](https://github.com/anomalyco/antigravity)** — Multi-agent orchestration chạy song song nhiều AI agent
- **Gemini Banana** (imagen.googleapis.com) — Tạo ảnh chất lượng cao cho texture và nội dung đồ họa
- **Gemini Deep Research** — Tạo dữ liệu đầu vào khoa học (cấu trúc nội hành tinh, thông số quỹ đạo, v.v.)
- **Manus** — Phân tích kỹ thuật và đề xuất kiến trúc
- **Claude Website** — Phân tích, đánh giá code và tham khảo giải pháp

### Mô hình AI sử dụng
| Công cụ | Mô hình | Vai trò |
|---------|---------|---------|
| Opencode | deepseek-v4-flash-free, ... | Coding agent chính, thực thi đa bước |
| Codex | gpt-5.5,.. | Lập trình module phức tạp (gravity, cinematic camera) |
| Antigravity | orchestration nhiều agents | Song song hóa task |
| Gemini | gemini-3.1-pro, imagen,.. | Nghiên cứu dữ liệu + tạo ảnh |
| Manus | autonomous agent | Phân tích kiến trúc |

## 📦 Công nghệ & Dependencies

| Package | Công dụng |
|---------|-----------|
| `three` (^0.170.0) | Đồ họa 3D WebGL |
| `vite` (^6.0.0) | Build tool |
| `vitest` (^4.1.6) | Unit testing |

## 🛠 Cài đặt & Chạy

```bash
# Cài đặt dependencies
npm install

# Chạy development server
npm run dev

# Build production
npm run build

# Preview build
npm run preview

# Chạy tests
npm test
```

## 📁 Cấu trúc thư mục

```
solarsystemcat/
├── src/                    # Mã nguồn chính (36 modules)
│   ├── main.js             # Entry point — bootstrap, vòng lặp animate
│   ├── scene.js            # Khởi tạo scene, camera, renderer, lighting
│   ├── createPlanet.js     # Factory tạo thiên thể (pivot → tilt → mesh)
│   ├── dataLoader.js       # Tải & chuẩn hóa dữ liệu JSON
│   ├── planetData.js       # Adapter tạm thời cho dữ liệu đồng bộ
│   ├── kepler.js           # Động cơ quỹ đạo Kepler
│   ├── gravity.js          # Mô phỏng N-body Newton (Yoshida 4th-order)
│   ├── orbits.js           # Đường quỹ đạo elip 3D
│   ├── cinematicCamera.js  # Điều khiển camera điện ảnh
│   ├── postprocessing.js   # Selective Bloom, DOF, Vignette, Film Grain
│   ├── sun.js              # Sun surface shader, corona, chromosphere
│   ├── sunInterior.js      # Dữ liệu cấu trúc Mặt Trời (4 vùng)
│   ├── atmosphere.js       # Atmosphere scattering (Rayleigh + Mie)
│   ├── magneticField.js    # Từ trường & từ quyển
│   ├── aurora.js           # Cực quang GPU shader
│   ├── cloudsVolumetric.js # Mây thể tích
│   ├── rings.js            # Vành Sao Thổ & Sao Thiên Vương
│   ├── crossSection.js     # Mặt cắt động + interior layers
│   ├── comet.js            # Sao chổi (đuôi ion, đuôi bụi, quầng)
│   ├── asteroidBelt.js     # Vành đai tiểu hành tinh (InstancedMesh)
│   ├── spacetimeGrid.js    # Lưới không-thời gian
│   ├── ghostMoonSystem.js  # Vệ tinh ma của Sao Thổ (particle system)
│   ├── enceladusPlume.js   # Chùm tia Enceladus
│   ├── diamondRain.js      # Mưa kim cương (Neptune/Uranus)
│   ├── heliumRain.js       # Mưa Heli (Jupiter/Saturn)
│   ├── ironSnow.js         # Tuyết Sắt (Mercury)
│   ├── gasGiantInterior.js # Cấu trúc hành tinh khí
│   ├── iceGiantInterior.js # Cấu trúc hành tinh băng
│   ├── terrestrialInterior.js # Cấu trúc hành tinh đá
│   ├── renderConfig.js     # Quality preset system
│   ├── textureLoader.js    # Quản lý tải texture
│   ├── labels.js           # HTML overlay labels
│   ├── ui.js               # Giao diện người dùng (1211 dòng)
│   ├── style.css           # Stylesheet (1693 dòng)
│   └── constants.js        # Hằng số vật lý (AU, EARTH_RADIUS...)
├── public/
│   ├── data/               # Dữ liệu JSON
│   │   ├── solar-system.json        # Dữ liệu thiên thể chính
│   │   ├── saturn-moons.catalog.json # Danh mục vệ tinh Sao Thổ
│   │   └── saturn-moons.ghost-config.json
│   ├── textures/           # Texture hành tinh
│   ├── favicon.png
│   └── favicon.ico
├── dist/                   # Build output
├── tools/                  # Công cụ tạo texture procedural
│   └── generate_procedural_textures.py
├── scripts/                # Script tiện ích
├── plan/                   # Tài liệu kế hoạch phát triển (23 files)
├── vite.config.js
└── package.json
```

## 🧪 Testing

Dự án sử dụng **Vitest** cho unit tests:

```bash
npm test
```

Tests hiện tại tập trung vào module `gravity.js` — kiểm tra bảo toàn năng lượng động năng trong mô phỏng N-body.

## 🎯 Hướng dẫn sử dụng

### Điều khiển cơ bản
- **Chuột trái kéo**: Xoay camera
- **Chuột phải kéo**: Pan camera
- **Cuộn chuột**: Zoom in/out
- **Click hành tinh**: Bay tới quan sát
- **Space**: Tạm dừng thời gian
- **Escape**: Thoát chế độ điện ảnh

### Phím tắt Cinematic Mode
- **W/A/S/D**: Di chuyển camera
- **Shift**: Tăng tốc
- **L**: Khóa mục tiêu
- **F**: Nhảy đến mục tiêu
- **Mouse + Right-click**: Xoay camera

## 🌐 Credits & Nguồn

### Texture
- [Solar System Scope](https://www.solarsystemscope.com/textures/) — Texture hành tinh (CC BY 4.0)

### Dữ liệu khoa học
- NASA Fact Sheets — Thông số quỹ đạo và vật lý
- JPL Ephemerides — Dữ liệu vệ tinh
- Tài liệu "Cấu trúc Nội hàm Thiên thể" — Cấu tạo nội hành tinh

### Công cụ phát triển
- [Three.js](https://threejs.org/) — Thư viện WebGL 3D
- [Vite](https://vitejs.dev/) — Build tool
- [Vitest](https://vitest.dev/) — Testing framework

## 📄 Giấy phép

MIT License — xem [LICENSE](LICENSE)
