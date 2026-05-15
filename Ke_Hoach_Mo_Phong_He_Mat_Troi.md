# 🪐 Kế Hoạch Triển Khai: Mô Phỏng Hệ Mặt Trời Tương Tác
> **Dựa trên:** Báo cáo Khoa học chi tiết về Cấu trúc Nội hàm Thiên thể  
> **Tính năng trọng tâm:** Chế độ xem "Cắt Dưa Hấu" (Watermelon Slice View) khi phóng to  
> **Phạm vi:** Web Application — Three.js + React + TypeScript

---

## MỤC LỤC

1. [Tổng Quan Dự Án](#1-tổng-quan-dự-án)
2. [Kiến Trúc Kỹ Thuật](#2-kiến-trúc-kỹ-thuật)
3. [Hệ Thống Dữ Liệu Lõi](#3-hệ-thống-dữ-liệu-lõi)
4. [Tính Năng Cắt Dưa Hấu — Thiết Kế Chi Tiết](#4-tính-năng-cắt-dưa-hấu--thiết-kế-chi-tiết)
5. [Kế Hoạch Phát Triển Theo Giai Đoạn](#5-kế-hoạch-phát-triển-theo-giai-đoạn)
6. [Đặc Tả Kỹ Thuật Từng Thiên Thể](#6-đặc-tả-kỹ-thuật-từng-thiên-thể)
7. [Shader & Rendering Pipeline](#7-shader--rendering-pipeline)
8. [Tối Ưu Hiệu Năng](#8-tối-ưu-hiệu-năng)
9. [Cấu Trúc Thư Mục Dự Án](#9-cấu-trúc-thư-mục-dự-án)

---

## 1. Tổng Quan Dự Án

### 1.1 Mục Tiêu

Xây dựng ứng dụng web mô phỏng Hệ Mặt Trời tương tác, trong đó **khi người dùng phóng to (zoom) vào bất kỳ thiên thể nào**, hệ thống sẽ tự động chuyển sang chế độ **xem mặt cắt ngang dạng "cắt dưa hấu"** — hiển thị rõ ràng cấu trúc phân lớp nội hàm với màu sắc và chú thích khoa học chính xác.

### 1.2 Tính Năng Cốt Lõi

| Tính năng | Mô tả | Độ ưu tiên |
|-----------|-------|------------|
| **Cắt Dưa Hấu** | Mặt cắt bán cầu xuất hiện khi zoom vượt ngưỡng | 🔴 P0 |
| Quỹ đạo N-Body | Vật lý tương tác hấp dẫn thực giữa các thiên thể | 🔴 P0 |
| Tự quay & nghiêng trục | Mỗi hành tinh có chu kỳ và góc nghiêng riêng | 🟠 P1 |
| Shader phân lớp | GLSL gradient chính xác theo dữ liệu khoa học | 🟠 P1 |
| Panel thông tin | Tooltip hiển thị T/P/ρ khi hover vào từng lớp | 🟡 P2 |
| Hiệu ứng đặc biệt | Mưa heli Sao Thổ, tuyết sắt Sao Thủy, mưa kim cương Sao Hải Vương | 🟡 P2 |
| So sánh thiên thể | Đặt hai thiên thể cạnh nhau, cùng chế độ cắt | 🟢 P3 |

### 1.3 Ngưỡng Zoom Kích Hoạt Chế Độ Cắt

```
Toàn hệ (overview) ──► Tiếp cận ──► Ngưỡng kích hoạt ──► Mặt cắt đầy đủ
     zoom = 1.0           zoom = 5.0      zoom = 8.0           zoom ≥ 12.0

[Sphere bình thường]  [Bắt đầu clip] [Bán cầu lộ ra]    [Dưa hấu hoàn toàn]
```

---

## 2. Kiến Trúc Kỹ Thuật

### 2.1 Tech Stack

```
Frontend Framework  : React 18 + TypeScript 5
3D Engine           : Three.js r165 + @react-three/fiber + @react-three/drei
Physics             : @react-three/rapier (N-body, quỹ đạo)
Shader              : GLSL (custom vertex + fragment shaders)
State Management    : Zustand (camera state, zoom level, selected body)
Animation           : GSAP 3 (transition cắt dưa hấu)
UI Components       : Tailwind CSS + shadcn/ui
Build Tool          : Vite 5
Deployment          : GitHub Pages / Vercel
```

### 2.2 Sơ Đồ Kiến Trúc Module

```
src/
├── core/
│   ├── SolarSystemScene.tsx      # Canvas Three.js chính
│   ├── CameraController.tsx      # Quản lý zoom + phát sự kiện ngưỡng
│   └── PhysicsEngine.ts          # N-body gravitational simulation
│
├── bodies/
│   ├── CelestialBody.tsx         # Component gốc: sphere + orbit
│   ├── WatermelonSlice.tsx       # ⭐ Tính năng cắt dưa hấu
│   ├── LayerMesh.tsx             # Mesh từng lớp nội hàm
│   └── SpecialEffects.tsx        # Particle systems (mưa heli, tuyết sắt...)
│
├── data/
│   ├── bodies.config.ts          # Dữ liệu khoa học từng thiên thể
│   ├── layers.config.ts          # Cấu trúc lớp nội hàm
│   └── shaders/
│       ├── slice.vert.glsl       # Vertex shader mặt cắt
│       ├── slice.frag.glsl       # Fragment shader gradient lớp
│       └── atmosphere.frag.glsl  # Shader khí quyển
│
├── ui/
│   ├── InfoPanel.tsx             # Bảng thông tin T/P/ρ
│   ├── ZoomIndicator.tsx         # Thanh zoom + nhãn chế độ
│   └── LayerTooltip.tsx          # Tooltip khi hover vào lớp
│
└── hooks/
    ├── useZoomLevel.ts           # Hook theo dõi zoom camera
    ├── useSliceTransition.ts     # Hook animate mặt cắt
    └── useBodyData.ts            # Hook lấy dữ liệu thiên thể
```

---

## 3. Hệ Thống Dữ Liệu Lõi

### 3.1 Interface TypeScript

```typescript
// types/CelestialBody.ts

interface LayerSpec {
  name: string;               // "Lõi trong rắn", "Lõi ngoài lỏng", v.v.
  radiusFraction: number;     // 0.0 (tâm) → 1.0 (bề mặt)
  colorHex: string;           // Màu hiển thị lớp trong chế độ cắt
  colorGlow?: string;         // Màu phát sáng (plasma, hydro kim loại)
  temperatureK: number;       // Nhiệt độ trung tâm lớp (Kelvin)
  pressureGPa: number;        // Áp suất (GPa)
  densityGcm3: number;        // Mật độ (g/cm³)
  composition: string[];      // Thành phần hóa học chính
  state: PhysicalState;       // 'solid' | 'liquid' | 'gas' | 'plasma' | 'superionic'
  specialMechanism?: string;  // "iron_snow" | "helium_rain" | "diamond_rain" | "metallic_hydrogen"
}

type PhysicalState = 'solid' | 'liquid' | 'gas' | 'plasma' | 'superionic' | 'metallic_liquid';

interface CelestialBodyConfig {
  id: string;
  name: string;
  namePronounce: string;      // Phiên âm tiếng Việt
  radiusKm: number;
  massKg: number;
  densityGcm3: number;
  orbitalRadiusAU: number;
  orbitalPeriodYears: number;
  rotationPeriodHours: number;
  axialTiltDeg: number;
  hasMagneticField: boolean;
  magneticFieldType?: 'dipole' | 'multipole' | 'asymmetric';
  layers: LayerSpec[];        // Xếp từ ngoài vào trong (index 0 = bề mặt)
  atmosphereSpec?: AtmosphereSpec;
  specialEffects?: SpecialEffect[];
}
```

### 3.2 Dữ Liệu Mẫu — Trái Đất

```typescript
// data/bodies/earth.config.ts

const EARTH: CelestialBodyConfig = {
  id: 'earth',
  name: 'Trái Đất',
  radiusKm: 6371,
  massKg: 5.972e24,
  densityGcm3: 5.514,
  orbitalRadiusAU: 1.0,
  orbitalPeriodYears: 1.0,
  rotationPeriodHours: 23.93,
  axialTiltDeg: 23.44,
  hasMagneticField: true,
  magneticFieldType: 'dipole',

  layers: [
    {
      name: 'Vỏ Đại dương / Lục địa',
      radiusFraction: 1.0,
      colorHex: '#4a8f47',      // Xanh lục đất liền / xanh dương đại dương
      temperatureK: 288,
      pressureGPa: 0.0001,
      densityGcm3: 2.7,
      composition: ['SiO₂', 'Al₂O₃', 'H₂O'],
      state: 'solid',
    },
    {
      name: 'Lớp Phủ trên (Upper Mantle)',
      radiusFraction: 0.988,    // ~6371 - 80km vỏ
      colorHex: '#c27b3a',      // Nâu cam
      temperatureK: 1000,
      pressureGPa: 3,
      densityGcm3: 3.4,
      composition: ['Olivine', 'Pyroxene', 'Garnet'],
      state: 'solid',
    },
    {
      name: 'Lớp Phủ dưới (Lower Mantle)',
      radiusFraction: 0.896,    // ~5701km
      colorHex: '#b05020',      // Đỏ cam đậm
      temperatureK: 3000,
      pressureGPa: 136,
      densityGcm3: 5.1,
      composition: ['Bridgmanite', 'Ferropericlase'],
      state: 'solid',           // Rắn dưới áp suất cực lớn
    },
    {
      name: 'Lõi Ngoài (Outer Core)',
      radiusFraction: 0.545,    // ~3471km
      colorHex: '#ff6600',      // Cam rực — sắt lỏng
      colorGlow: '#ff8822',
      temperatureK: 4500,
      pressureGPa: 136,
      densityGcm3: 10.5,
      composition: ['Fe-Ni (lỏng)', 'S', 'O', 'Si'],
      state: 'liquid',
      specialMechanism: 'dynamo_convection',
    },
    {
      name: 'Lõi Trong (Inner Core)',
      radiusFraction: 0.192,    // ~1221km
      colorHex: '#ffdd00',      // Vàng rực — sắt rắn siêu đặc
      colorGlow: '#ffffaa',
      temperatureK: 5400,
      pressureGPa: 360,
      densityGcm3: 12.8,
      composition: ['Fe-Ni (rắn)', 'Si'],
      state: 'solid',
    },
  ],
};
```

---

## 4. Tính Năng Cắt Dưa Hấu — Thiết Kế Chi Tiết

### 4.1 Nguyên Lý Hoạt Động

Tính năng "cắt dưa hấu" sử dụng kỹ thuật **Clipping Plane** của Three.js kết hợp với **nhiều lớp SphereGeometry đồng tâm**, mỗi lớp là một lớp nội hàm riêng biệt. Khi camera zoom vượt ngưỡng, một mặt phẳng cắt (clip plane) trượt từ bên phải sang trái, dần dần lộ ra tiết diện ngang của tất cả các lớp — giống y như dùng dao cắt một quả dưa hấu.

```
Nhìn từ trên: Thiên thể trước/sau khi cắt

TRƯỚC CẮT:                    SAU CẮT (Dưa Hấu):
   ___                            ___
  /   \                          /   \  ←── Khí quyển (xanh nhạt)
 | ●   |                        |  ○--| ←── Vỏ (nâu xám)
  \___/                         | ●  | ←── Lớp phủ (cam nâu)
                                 |  ◉ | ←── Lõi ngoài (cam đỏ)
                                 | ⬤  | ←── Lõi trong (vàng)
                                  \__|
                                     ↑ Mặt phẳng cắt
```

### 4.2 Logic Kích Hoạt Theo Zoom

```typescript
// hooks/useSliceTransition.ts

const ZOOM_THRESHOLDS = {
  OVERVIEW: 1,          // Toàn hệ mặt trời
  APPROACH: 5,          // Tiếp cận hành tinh
  SLICE_BEGIN: 8,       // Bắt đầu clip plane trượt vào
  SLICE_FULL: 12,       // Mặt cắt hoàn toàn + hiện nhãn lớp
  INTERIOR_VIEW: 20,    // Xoay góc camera vào bên trong lõi
};

function useSliceTransition(zoom: number) {
  const sliceProgress = useMemo(() => {
    if (zoom < ZOOM_THRESHOLDS.SLICE_BEGIN) return 0;
    if (zoom > ZOOM_THRESHOLDS.SLICE_FULL) return 1;
    return (zoom - ZOOM_THRESHOLDS.SLICE_BEGIN) /
           (ZOOM_THRESHOLDS.SLICE_FULL - ZOOM_THRESHOLDS.SLICE_BEGIN);
  }, [zoom]);

  // sliceProgress: 0.0 = sphere hoàn chỉnh, 1.0 = cắt đúng nửa
  const clipPlaneX = THREE.MathUtils.lerp(
    planetRadius * 1.5,   // Ở ngoài sphere (chưa cắt)
    0,                    // Tại tâm (cắt nửa sphere)
    sliceProgress
  );

  return { sliceProgress, clipPlaneX };
}
```

### 4.3 Kiến Trúc Component WatermelonSlice

```tsx
// bodies/WatermelonSlice.tsx

function WatermelonSlice({ body, sliceProgress }: Props) {
  const clipPlane = useRef(new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0));

  useFrame(() => {
    // Cập nhật vị trí mặt phẳng cắt theo tiến trình zoom
    clipPlane.current.constant = THREE.MathUtils.lerp(
      body.radiusScene * 1.5,
      0,
      sliceProgress
    );
  });

  return (
    <group>
      {/* ① Render từng lớp, từ lớp ngoài vào trong */}
      {body.layers.map((layer, index) => (
        <LayerSphere
          key={layer.name}
          layer={layer}
          clipPlane={clipPlane}
          renderOrder={index}      // Đảm bảo lớp trong render trên lớp ngoài
        />
      ))}

      {/* ② Mặt phẳng tiết diện (Cross-section face) */}
      {sliceProgress > 0.1 && (
        <CrossSectionFace
          layers={body.layers}
          clipProgress={sliceProgress}
        />
      )}

      {/* ③ Nhãn lớp nổi trong 3D space */}
      {sliceProgress > 0.7 && (
        <LayerLabels layers={body.layers} />
      )}

      {/* ④ Hiệu ứng đặc biệt (mưa heli, tuyết sắt...) */}
      {body.specialEffects?.map(fx => (
        <SpecialEffect key={fx.type} effect={fx} sliceProgress={sliceProgress} />
      ))}
    </group>
  );
}
```

### 4.4 Mặt Cắt Ngang — CrossSection Face

Đây là phần quan trọng nhất tạo ra "cảm giác dưa hấu": một đĩa tròn 2D lộ ra tại mặt phẳng cắt, hiển thị các vòng đồng tâm màu sắc tương ứng từng lớp.

```typescript
// bodies/CrossSectionFace.tsx

function CrossSectionFace({ layers }: { layers: LayerSpec[] }) {
  // Tạo CircleGeometry với nhiều segment để có gradient mượt
  const geometry = useMemo(() => {
    const geo = new THREE.CircleGeometry(1, 128);

    // Tô màu vertex theo bán kính (tạo vòng màu đồng tâm)
    const positions = geo.attributes.position;
    const colors = new Float32Array(positions.count * 3);

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const r = Math.sqrt(x * x + y * y); // Khoảng cách từ tâm (0→1)

      // Xác định lớp tại bán kính r
      const layer = getLayerAtRadius(r, layers);
      const color = new THREE.Color(layer.colorHex);

      colors[i * 3]     = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [layers]);

  return (
    <mesh geometry={geometry} rotation={[0, Math.PI / 2, 0]}>
      <meshBasicMaterial vertexColors side={THREE.FrontSide} />
    </mesh>
  );
}

function getLayerAtRadius(r: number, layers: LayerSpec[]): LayerSpec {
  // layers đã sắp xếp từ ngoài vào trong (radiusFraction giảm dần)
  for (const layer of layers) {
    if (r >= layer.radiusFraction) return layer;
  }
  return layers[layers.length - 1]; // Lớp trong cùng
}
```

### 4.5 Hiệu Ứng Viền Lớp (Layer Edge Glow)

Tại ranh giới giữa các lớp (ví dụ: ranh giới lõi ngoài - lõi trong Trái Đất), thêm hiệu ứng phát sáng để nhấn mạnh sự chuyển pha vật chất:

```glsl
// shaders/layer_edge.frag.glsl

uniform float uLayerRadius;  // Bán kính ranh giới lớp (0–1)
uniform vec3  uGlowColor;    // Màu phát sáng
uniform float uGlowWidth;    // Độ rộng vùng phát sáng

varying float vRadius;

void main() {
  float dist = abs(vRadius - uLayerRadius);
  float glow = 1.0 - smoothstep(0.0, uGlowWidth, dist);
  vec3 finalColor = mix(baseColor, uGlowColor, glow * 0.8);
  gl_FragColor = vec4(finalColor, 1.0);
}
```

---

## 5. Kế Hoạch Phát Triển Theo Giai Đoạn

### GIAI ĐOẠN 0 — Khởi Tạo & Scaffold (Tuần 1)

**Mục tiêu:** Có môi trường chạy được với canvas Three.js cơ bản.

```
✅ Checklist Giai Đoạn 0:
□ Khởi tạo dự án: npm create vite@latest solar-system -- --template react-ts
□ Cài đặt: three, @react-three/fiber, @react-three/drei, @react-three/rapier
□ Cài đặt: zustand, gsap, tailwindcss
□ Scene cơ bản: Camera + OrbitControls + Stars background
□ Render 1 sphere (Trái Đất) tại vị trí cố định
□ Hook useZoomLevel theo dõi camera.position.length()
□ Console log zoom level khi di chuyển camera
```

**Deliverable:** `http://localhost:5173` hiện 1 sphere + background sao + zoom được.

---

### GIAI ĐOẠN 1 — Hệ Thống Phân Lớp Cơ Bản (Tuần 2–3)

**Mục tiêu:** Hiển thị được mặt cắt dưa hấu của Trái Đất khi zoom.

```
✅ Checklist Giai Đoạn 1:
□ Triển khai LayerSphere component (nhiều sphere đồng tâm)
□ Triển khai THREE.Plane clipping với WebGLRenderer.clippingPlanes
□ Triển khai CrossSectionFace với vertex color (các vòng màu đồng tâm)
□ Hook useSliceTransition kết nối zoom → sliceProgress
□ Animation GSAP: clipPlane.constant lerp mượt mà khi zoom
□ Dữ liệu đầy đủ cho Trái Đất (5 lớp: vỏ/lớp phủ trên/lớp phủ dưới/lõi ngoài/lõi trong)
□ Test: Zoom vào → lộ mặt cắt; Zoom ra → sphere lại

Kết quả kỳ vọng: Trái Đất zoom vào trông như dưa hấu bị cắt đôi,
lộ ra các vòng màu: xanh → nâu → đỏ cam → vàng rực
```

---

### GIAI ĐOẠN 2 — Dữ Liệu & Shader Khoa Học (Tuần 4–5)

**Mục tiêu:** Thêm toàn bộ 8 hành tinh + Mặt Trời với dữ liệu chính xác.

```
✅ Checklist Giai Đoạn 2:
□ File bodies.config.ts đầy đủ 9 thiên thể (Mặt Trời + 8 hành tinh)
□ GLSL shader gradient temperature-based (lõi đỏ rực → ngoài tối)
□ Shader đặc biệt cho Mặt Trời: plasma flickering + corona glow
□ Shader hydro kim loại lỏng Sao Mộc/Sao Thổ: ánh kim loại xanh tím
□ Shader băng siêu ion Sao Thiên Vương/Sao Hải Vương: lấp lánh tinh thể
□ Layer tooltip: hover vào từng lớp → hiện tên lớp + T/P/ρ
□ Label 3D nổi trong không gian khi sliceProgress > 0.7
```

---

### GIAI ĐOẠN 3 — Quỹ Đạo & Vật Lý (Tuần 6–7)

**Mục tiêu:** Các hành tinh chuyển động đúng theo vật lý.

```
✅ Checklist Giai Đoạn 3:
□ Kepler orbit: tính vị trí (x,y,z) theo thời gian mô phỏng
□ Điều khiển tốc độ mô phỏng (1x, 100x, 10000x, dừng)
□ Tự quay hành tinh theo rotationPeriodHours
□ Nghiêng trục đúng góc (axialTiltDeg): Sao Thiên Vương 97.77°
□ Vệ tinh: Mặt Trăng orbit quanh Trái Đất
□ Vành đai Sao Thổ: ring geometry + shader băng đá
□ LOD (Level of Detail): sphere geometry giảm segment khi ở xa
```

---

### GIAI ĐOẠN 4 — Hiệu Ứng Đặc Biệt (Tuần 8–9)

**Mục tiêu:** Các cơ chế vật lý đặc thù của từng thiên thể.

```
✅ Checklist Giai Đoạn 4:

□ Sao Thủy: "Iron Snow" particle system
  - Spawn hạt sắt tại ranh giới lõi ngoài (r = 0.75)
  - Hạt rơi xuống tâm theo gia tốc trọng lực mô phỏng
  - Màu: trắng xám → vàng đồng khi chìm sâu

□ Sao Mộc / Sao Thổ: "Helium Rain"
  - Mưa heli màu trắng ngọc, particle rơi từ lớp khí → hydro kim loại
  - Particle system emit từ bán kính 0.7 → 0.5
  - Kèm hiệu ứng nhiệt phát sáng tại vùng va chạm

□ Sao Hải Vương: "Diamond Rain"
  - Hạt kim cương lấp lánh, rơi qua lớp băng siêu ion
  - Hiệu ứng prismatic light scatter khi hạt kim cương đi qua

□ Mặt Trời: Solar Granulation
  - Rayleigh-Bénard convection cell trên quang quyển
  - Shader animated noise pattern mô phỏng sôi sục plasma
  - Coronal loop particles tại bề mặt

□ Sao Kim: "Stagnant Lid"
  - Không có dynamo: disable magnetic field visualization
  - Vỏ dày bất động, không tectonics, màu vàng mờ đục (H₂SO₄)
```

---

### GIAI ĐOẠN 5 — UI & UX Hoàn Thiện (Tuần 10)

```
✅ Checklist Giai Đoạn 5:
□ Zoom indicator sidebar: thanh dọc hiện chế độ (Toàn hệ / Tiếp cận / Cắt lớp)
□ Minimap góc dưới: vị trí camera trong toàn hệ
□ Info panel: click thiên thể → panel bên phải hiện thông số
□ Layer legend: bảng màu các lớp khi ở chế độ cắt
□ Responsive mobile: touch pinch zoom kích hoạt chế độ cắt
□ Screenshot export: chụp và tải ảnh mặt cắt
□ Onboarding: hint "Scroll để phóng to và khám phá bên trong"
```

---

### GIAI ĐOẠN 6 — Tối Ưu & Deploy (Tuần 11–12)

```
✅ Checklist Giai Đoạn 6:
□ LOD system: giảm polygon khi zoom ra xa
□ Frustum culling: ẩn thiên thể ngoài viewport
□ WebWorker cho physics calculation
□ Lazy load shader code
□ Lighthouse score ≥ 85
□ Deploy GitHub Pages với GitHub Actions CI/CD
□ Domain custom (tùy chọn)
```

---

## 6. Đặc Tả Kỹ Thuật Từng Thiên Thể

### 6.1 ☀️ Mặt Trời

| Lớp | Bán kính (R☉) | Màu Dưa Hấu | Nhiệt độ | Trạng thái | Đặc điểm kỹ thuật |
|-----|---------------|-------------|----------|-----------|-------------------|
| Nhật hoa (Corona) | >1.0 | `#ffffff` mờ | 1–3×10⁶ K | Plasma loãng | Shader bloom cực mạnh |
| Quang quyển | 1.0 | `#fff3a3` vàng trắng | 5,778 K | Plasma | Animated granulation shader |
| Vùng Đối lưu | 0.85–1.0 | `#ff9900` cam | ~2×10⁶ K | Plasma sôi | Rayleigh-Bénard cells |
| Vùng Bức xạ | 0.25–0.85 | `#ff5500` đỏ cam | 2–7×10⁶ K | Plasma đặc | Opacity gradient shader |
| **Lõi** | **0.0–0.25** | **`#ff0000` đỏ rực** | **1.57×10⁷ K** | **Plasma siêu đặc** | **p-p chain glow effect** |

**Shader Đặc biệt Mặt Trời:**
```glsl
// Animated solar granulation — fragment shader
uniform float uTime;

float fbm(vec2 uv) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 6; i++) {
    value += amplitude * noise(uv);
    uv *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = vUv * 8.0;
  float granule = fbm(uv + vec2(uTime * 0.02));
  vec3 hotColor  = vec3(1.0, 0.9, 0.6);  // Đỉnh granule
  vec3 coolColor = vec3(0.8, 0.4, 0.0);  // Rãnh giữa granule
  gl_FragColor = vec4(mix(coolColor, hotColor, granule), 1.0);
}
```

---

### 6.2 🔴 Sao Thủy

| Lớp | Bán kính (R_Hg) | Màu Dưa Hấu | Đặc điểm kỹ thuật |
|-----|-----------------|-------------|-------------------|
| Vỏ + lớp phủ mỏng | 1.0–0.75 | `#8c8c8c` xám tro | Rất mỏng, texture crater |
| **Lõi sắt lỏng ngoài** | **0.75–0.15** | **`#cc4400` đỏ sắt** | **Iron snow particles rơi** |
| Lõi sắt rắn trong | 0.15–0.0 | `#886600` vàng nâu | Chứa Si + S |

**Cơ chế Iron Snow:**
- Spawn hạt tại r = 0.75 (ranh giới lõi)
- Physics: `velocity_y -= gravity * density_ratio * dt`
- Màu gradient: `#ffffff` → `#886600` khi chìm xuống
- Khi hạt chạm đáy (r < 0.15): trigger convection vector ngược chiều

---

### 6.3 🟡 Sao Kim

| Lớp | Bán kính | Màu | Ghi chú |
|-----|----------|-----|---------|
| Khí quyển CO₂ | 1.0 | `#d4a900` vàng mù | H₂SO₄ clouds, dày đặc |
| Vỏ silicate | 0.98 | `#8b6914` nâu vàng | Stagnant lid — không có plates |
| Lớp phủ | 0.85 | `#993300` đỏ nâu | Không đối lưu (diffusion only) |
| **Lõi Fe-Ni lỏng đồng nhất** | **0.50** | **`#cc5500` cam đỏ** | **Không có dynamo → No magnetic field** |

**Lưu ý quan trọng:** Dynamo module = OFF. Không render field lines từ trường.

---

### 6.4 🔵 Trái Đất *(Xem mục 3.2)*

---

### 6.5 🔴 Sao Hỏa

| Lớp | Bán kính | Màu | Ghi chú |
|-----|----------|-----|---------|
| Vỏ bazan | 1.0 | `#c1440e` đỏ gỉ sắt | Dày ~50km |
| Lớp phủ | 0.88 | `#8b2800` đỏ sẫm | Silicate, nguội hơn Trái Đất |
| **Lõi Fe-S** | **0.50** | **`#664400` nâu đồng** | **Nhỏ, nguội, không dynamo hiện tại** |

---

### 6.6 🟠 Sao Mộc

| Lớp | Bán kính | Màu | Đặc điểm |
|-----|----------|-----|----------|
| Khí quyển H₂/He | 1.0 | `#c88b3a` nâu cam줄 | Bão đỏ lớn (animated texture) |
| H₂ phân tử lỏng | 0.90 | `#aa6622` | Siêu tới hạn |
| **Hydro kim loại lỏng** | **0.77** | **`#4422aa` xanh tím kim loại** | **Trigger tại 1–4 Mbar — Dẫn điện** |
| **Lõi mờ (Fuzzy core)** | **0.20** | **`#221166` tím đen** | **Gauss distribution — không có biên cứng** |

**Lưu ý đặc biệt:** Lõi Sao Mộc KHÔNG có ranh giới sắc nét. Dùng Gaussian blur transition:
```typescript
// Thay vì sphere cứng, dùng volume fog shader
const fuzzyCoreShader = {
  uniforms: { uCoreRadius: 0.20, uFuzziness: 0.15 },
  // Opacity = Gaussian(r, center=0.20, sigma=0.15)
};
```

---

### 6.7 🪐 Sao Thổ

Tương tự Sao Mộc nhưng thêm:
- **Vành đai**: Ring geometry từ 1.2R đến 2.3R, shader băng đá mờ
- **Helium rain mạnh hơn**: particle rate x3 so với Sao Mộc
- Màu lõi nhạt hơn (ít đặc hơn): `#3333aa`

---

### 6.8 🩵 Sao Thiên Vương

| Lớp | Bán kính | Màu | Đặc điểm |
|-----|----------|-----|----------|
| Khí quyển H₂/He/CH₄ | 1.0 | `#7de8e8` lam ngọc | CH₄ hấp thụ đỏ → xanh lam |
| Lớp khí/lỏng | 0.85 | `#55aacc` xanh dương | Siêu tới hạn |
| **Manti Băng Siêu Ion** | **0.70** | **`#aaddff` trắng xanh lấp lánh** | **Superionic water — O cố định, H+ di động** |
| Lõi đá/sắt | 0.20 | `#554433` nâu xám | Nguội, ít tản nhiệt |

**Shader Băng Siêu Ion:**
```glsl
// Crystal lattice sparkle effect
float sparkle = step(0.97, noise(vPosition * 50.0 + uTime));
vec3 iceColor = vec3(0.67, 0.87, 1.0);
gl_FragColor = vec4(iceColor + sparkle * 0.5, 1.0);
```

**Nghiêng trục 97.77°:** `rotation.z = THREE.MathUtils.degToRad(97.77)`

---

### 6.9 🔵 Sao Hải Vương

Tương tự Sao Thiên Vương nhưng:
- Màu sậm hơn (xanh đậm): `#1155aa`
- **Diamond rain** particles mạnh hơn, lớp manti dày hơn
- Lõi kim loại nóng hơn: phát sáng nhiều hơn (nhiệt bức xạ gấp 2.6× hấp thụ)
- `internalHeatMultiplier: 2.6` → ambient glow mạnh từ lõi ra

---

## 7. Shader & Rendering Pipeline

### 7.1 Pipeline Tổng Quan

```
Input Data          Geometry            Shader              Output
(layers.config) → (LayerSpheres) → (GLSL Programs) → (WebGL Canvas)
                         ↓
                   ClipPlane(x=t)   ← useSliceTransition(zoom)
                         ↓
                   CrossSectionFace (vertex colors)
                         ↓
                   LayerLabels (CSS3DObject)
```

### 7.2 Kỹ Thuật Clipping Plane

```typescript
// SolarSystemScene.tsx — thiết lập clipping planes
const renderer = useThree(state => state.gl);

useEffect(() => {
  renderer.localClippingEnabled = true;
}, [renderer]);

// Mỗi LayerSphere nhận clip plane:
<mesh>
  <sphereGeometry args={[layer.radiusFraction * bodyRadius, 64, 64]} />
  <meshStandardMaterial
    color={layer.colorHex}
    clippingPlanes={[clipPlane]}
    clipShadows={true}
    side={THREE.FrontSide}
  />
</mesh>
```

### 7.3 Thứ Tự Render (renderOrder)

Để các lớp trong hiển thị đúng lên trên lớp ngoài:
```typescript
layers.forEach((layer, index) => {
  mesh.renderOrder = layers.length - index; // Lớp ngoài = renderOrder thấp
});
crossSectionFace.renderOrder = 0; // Mặt cắt render sau cùng (trên tất cả)
```

---

## 8. Tối Ưu Hiệu Năng

### 8.1 LOD (Level of Detail)

```typescript
// Giảm polygon count theo khoảng cách camera
const LOD_LEVELS = [
  { minZoom: 0,  maxZoom: 3,  segments: 8  },   // Rất xa: low poly
  { minZoom: 3,  maxZoom: 7,  segments: 32 },   // Trung: medium
  { minZoom: 7,  maxZoom: 15, segments: 64 },   // Gần: high
  { minZoom: 15, maxZoom: Infinity, segments: 128 }, // Rất gần: ultra
];
```

### 8.2 Instanced Mesh cho Particles

Với Iron Snow, Helium Rain, Diamond Rain — dùng `InstancedMesh` thay vì tạo riêng từng mesh:
```typescript
const instancedMesh = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.01, 4, 4),
  particleMaterial,
  MAX_PARTICLES  // Pool tối đa 2000 hạt
);
```

### 8.3 WebWorker cho Physics

```typescript
// workers/physicsWorker.ts — tính quỹ đạo trong background thread
self.onmessage = ({ data: { bodies, dt } }) => {
  const updated = integrateNBody(bodies, dt);
  self.postMessage(updated);
};
```

### 8.4 Performance Budget

| Thành phần | Target FPS | Max GPU Time |
|-----------|------------|-------------|
| Scene tổng thể | 60fps | 16ms |
| Chế độ cắt (1 hành tinh) | 60fps | 16ms |
| Particle systems | ≥ 30fps | 33ms |
| Chế độ so sánh (2 hành tinh) | ≥ 30fps | 33ms |

---

## 9. Cấu Trúc Thư Mục Dự Án

```
solar-system/
├── public/
│   ├── textures/
│   │   ├── earth_surface.jpg
│   │   ├── jupiter_surface.jpg
│   │   └── ...
│   └── fonts/
│       └── SpaceMono.woff2
│
├── src/
│   ├── core/
│   │   ├── SolarSystemScene.tsx
│   │   ├── CameraController.tsx
│   │   └── PhysicsEngine.ts
│   │
│   ├── bodies/
│   │   ├── CelestialBody.tsx        # Wrapper component
│   │   ├── WatermelonSlice.tsx      # ⭐ Core feature
│   │   ├── LayerSphere.tsx          # Một lớp nội hàm
│   │   ├── CrossSectionFace.tsx     # Mặt cắt đĩa tròn
│   │   ├── LayerLabels.tsx          # Nhãn 3D
│   │   └── effects/
│   │       ├── IronSnow.tsx         # Sao Thủy
│   │       ├── HeliumRain.tsx       # Sao Mộc / Sao Thổ
│   │       ├── DiamondRain.tsx      # Sao Hải Vương
│   │       └── SolarGranulation.tsx # Mặt Trời
│   │
│   ├── data/
│   │   ├── bodies/
│   │   │   ├── sun.config.ts
│   │   │   ├── mercury.config.ts
│   │   │   ├── venus.config.ts
│   │   │   ├── earth.config.ts
│   │   │   ├── mars.config.ts
│   │   │   ├── jupiter.config.ts
│   │   │   ├── saturn.config.ts
│   │   │   ├── uranus.config.ts
│   │   │   └── neptune.config.ts
│   │   └── index.ts                 # Export tất cả
│   │
│   ├── shaders/
│   │   ├── slice.vert.glsl
│   │   ├── plasma.frag.glsl         # Mặt Trời
│   │   ├── metallic_hydrogen.frag.glsl  # Sao Mộc/Thổ
│   │   ├── superionic_ice.frag.glsl     # Sao Thiên Vương/Hải Vương
│   │   └── atmosphere.frag.glsl
│   │
│   ├── hooks/
│   │   ├── useZoomLevel.ts
│   │   ├── useSliceTransition.ts
│   │   └── useBodySelection.ts
│   │
│   ├── stores/
│   │   └── solarSystemStore.ts      # Zustand store
│   │
│   ├── ui/
│   │   ├── InfoPanel.tsx
│   │   ├── ZoomIndicator.tsx
│   │   ├── LayerLegend.tsx
│   │   └── Onboarding.tsx
│   │
│   └── App.tsx
│
├── .github/
│   └── workflows/deploy.yml         # CI/CD GitHub Pages
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## PHỤ LỤC: Bảng Màu Chuẩn Dưa Hấu Toàn Hệ

| Thiên thể | Màu vỏ ngoài | Màu lớp phủ | Màu lõi ngoài | Màu lõi trong | Đặc trưng |
|-----------|-------------|------------|--------------|--------------|-----------|
| ☀️ Mặt Trời | `#fff3a3` | `#ff9900` | `#ff5500` | `#ff0000` | Plasma flickering |
| 🪐 Sao Thủy | `#8c8c8c` | *(không có)* | `#cc4400` | `#886600` | Iron snow ↓ |
| 🟡 Sao Kim | `#d4a900` | `#8b6914` | `#993300` | `#cc5500` | No dynamo |
| 🔵 Trái Đất | `#4a8f47` | `#c27b3a` | `#ff6600` | `#ffdd00` | Dynamo mạnh |
| 🔴 Sao Hỏa | `#c1440e` | `#8b2800` | `#664400` | *(nhỏ)* | Nguội |
| 🟠 Sao Mộc | `#c88b3a` | `#aa6622` | `#4422aa` | `#221166` | Fuzzy core |
| 🪐 Sao Thổ | `#e8c97d` | `#c8a855` | `#3344cc` | `#2233aa` | Helium rain |
| 🩵 Sao Thiên Vương | `#7de8e8` | `#55aacc` | `#aaddff` | `#554433` | Superionic, lạnh |
| 🔵 Sao Hải Vương | `#1a6bd4` | `#1155aa` | `#88bbff` | `#443322` | Diamond rain |

---

*Tài liệu kỹ thuật này được xây dựng dựa trên "Báo cáo Khoa học chi tiết về Cấu trúc Nội hàm Thiên thể" — nguồn dữ liệu từ các sứ mệnh Juno, Cassini, MESSENGER, InSight và các mô hình địa vật lý hiện đại.*
