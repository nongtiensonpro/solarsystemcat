# Kế Hoạch Khắc Phục "Onion Rings" — Unified Corona Shader

## 1. Chẩn Đoán

### 1.1. Phân Tích Alpha Curve Hiện Tại

Mỗi corona layer là một `SphereGeometry(1, 64, 64)` BackSide riêng, với alpha peak tại rìa hình học:
- Layer 0 (scale=1.35): alpha = `pow(fresnel, 2.2) * 0.88` → ring tại R×1.35
- Layer 1 (scale=1.75): alpha = `pow(fresnel, 2.2) * 0.22` → ring tại R×1.75
- Outer Glow (scale=2.0): alpha = `pow(t, 0.6) * 0.2` → ring tại R×2.0

Trong screen space, 3 alpha peak xuất hiện tại 3 bán kính khác nhau → 3 vòng tròn đồng tâm riêng biệt ("onion rings").

### 1.2. Tại Sao Multi-Layer Không Thể Khắc Phục

| Cách tiếp cận | Vấn đề |
|---|---|
| Giảm opacity layer ngoài | Vẫn còn peak riêng, chỉ mờ hơn |
| Tăng số layer | Nhiều ring hơn, khó đồng bộ |
| Điều chỉnh falloff exponent | Dịch chuyển vị trí peak nhưng không xóa peak |

---

## 2. Giải Pháp: Unified Corona Shader (Single Sphere + Multi-Exponential Falloff)

### 2.1. Kiến Trúc Mới

```
Trước (cũ):                  Sau (mới):
┌──────────────────────┐    ┌──────────────────────┐
│ Surface (1.0x)       │    │ Surface (1.0x)       │
│ Chromosphere (1.005x)│    │ Chromosphere (1.005x)│
│ Corona Layer 0 (1.35)│ →  │ Corona Unified (2.5x)│ ← thay thế cả 3
│ Corona Layer 1 (1.75)│    │ Sprite               │
│ Outer Glow (2.0x)    │    └──────────────────────┘
│ Sprite               │
└──────────────────────┘
```

### 2.2. Shader: Multi-Exponential Falloff

```glsl
void main() {
    vec3 viewDir = normalize(vViewDir);
    vec3 normal = normalize(vNormal);

    // fresnel: 0 = tâm đĩa mặt trời, 1 = rìa hình cầu unified (2.5x)
    float fresnel = 1.0 - abs(dot(normal, viewDir));

    // Remap: 0 = bề mặt photosphere, 1 = rìa ngoài unified sphere
    // (fresnel ≈ 0.08 tương ứng bán kính 1.0x trên sphere 2.5x)
    float r = (fresnel - 0.08) / (1.0 - 0.08);
    r = clamp(r, 0.0, 1.0);

    // ─── Noise Distortion ───
    vec2 noiseUV = vNormal.xy * 3.5 + uTime * 0.04;
    float n = fbm(noiseUV);
    float edgeMask = smoothstep(0.2, 0.8, r);
    r += (n - 0.5) * 0.18 * edgeMask;
    r = clamp(r, 0.0, 1.0);

    // ─── Multi-Exponential Falloff ───
    // Một curve liên tục, zero discontinuity
    // exp(-5r):  inner corona (sáng, steep drop)
    // exp(-2r):  mid corona (medium falloff)
    // exp(-0.5r): outer corona (long tail)
    float alpha = exp(-5.0 * r) * 0.7
                + exp(-2.0 * r) * 0.3
                + exp(-0.5 * r) * 0.05;
    alpha *= uIntensity;

    // ─── Color Gradient ───
    vec3 color = mix(uInnerColor, uMidColor, smoothstep(0.0, 0.4, r));
    color = mix(color, uOuterColor, smoothstep(0.4, 1.0, r));

    // ─── Streamers ───
    float streamer = fbm(noiseUV * 1.5 + 0.5) * 0.15;
    color += vec3(streamer * 0.9, streamer * 0.4, 0.0);

    gl_FragColor = vec4(color, alpha);
}
```

**Tại sao multi-exponential?**
- `exp(-5r)`: steep drop = inner corona sáng sát bề mặt
- `exp(-2r)`: moderate = mid corona, cấu trúc chính
- `exp(-0.5r)`: long tail = outer corona mờ rộng
- Ba curve này tự động blend mượt không seam, không ring

### 2.3. So Sánh Alpha Profile

```
Alpha
  ▲
1.0│    ┌──┐
   │   ┌┘  └──┐                 CURRENT (3 layers):
   │  ┌┘      └──┐              3 peak riêng biệt
   │ ┌┘          └──┐           → onion rings
   │┌┘              └──┐
   └┴──────────────────┴──► r
   0   1.35  1.75  2.0

Alpha
  ▲
1.0│
   │  ╱╲                                        
   │ ╱  ╲           UNIFIED (single curve):
   │╱    ╲          exp(-5r) + exp(-2r) + exp(-0.5r)
   │      ╲         → một đường cong liên tục
   │       ╲
   └────────╲───────► r
   0        1.0
```

---

## 3. Các File Cần Sửa

### 3.1. `src/sun.js`

| Thay đổi | Chi tiết |
|---|---|
| Xóa `createSunCorona()` | Bỏ 2-layer corona cũ |
| Xóa `createSunOuterGlow()` | Bỏ outer glow riêng |
| Thêm `createUnifiedCorona(radius, oblateness)` | Tạo unified sphere + shader mới |
| Sửa export | Chỉ export surface, chromosphere, unified corona |

**Code mới `createUnifiedCorona()`:**
```js
export function createUnifiedCorona(radius, oblateness = 0) {
    const geometry = new THREE.SphereGeometry(2.5, 64, 64);
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uInnerColor: { value: new THREE.Color(0xfff5cc) },
            uMidColor:   { value: new THREE.Color(0xff8c22) },
            uOuterColor: { value: new THREE.Color(0xe64400) },
            uIntensity:  { value: 0.55 },
            uTime:       { value: 0 },
        },
        vertexShader: unifiedCoronaVertexShader,
        fragmentShader: unifiedCoronaFragmentShader,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'sun_unified_corona';
    mesh.scale.set(radius, radius * (1 - oblateness), radius);
    mesh.userData.isSunUnifiedCorona = true;
    return mesh;
}
```

### 3.2. `src/createPlanet.js`

| Dòng | Thay đổi |
|---|---|
| 257-272 | Thay `createSunCorona()` + `createSunOuterGlow()` bằng `createUnifiedCorona()` |
| Bỏ `outerGlowMesh` | Không cần outer glow riêng |

```js
if (data.type === 'star') {
    lod.layers.enable(BLOOM_LAYER);

    // Unified corona — thay thế corona 2 layer + outer glow
    const coronaMesh = createUnifiedCorona(r, ob);
    coronaMesh.traverse((child) => {
        if (child.isMesh) child.layers.enable(BLOOM_LAYER);
    });
    tiltGroup.add(coronaMesh);

    // Chromosphere — giữ nguyên
    chromosphereMesh = createChromosphere(r, ob);
    chromosphereMesh.layers.enable(BLOOM_LAYER);
    tiltGroup.add(chromosphereMesh);

    // Sun glow sprite — giữ nguyên
    sunGlowSprite = createSunGlowSprite(r);
    tiltGroup.add(sunGlowSprite);
}
```

### 3.3. `src/main.js`

| Dòng | Thay đổi |
|---|---|
| 663-671 | Cập nhật unified corona thay vì multi-layer |
| 678-681 | Bỏ update outer glow |
| 496-508 | Sửa visibility logic |

```js
// Update unified corona
if (body.unifiedCoronaMesh?.material?.userData?.isSunUnifiedCorona) {
    body.unifiedCoronaMesh.material.uniforms.uTime.value += deltaTime;
}

// Chromosphere — giữ nguyên
if (body.chromosphereMesh?.material.userData?.isSunChromosphereShader) {
    body.chromosphereMesh.material.uniforms.uTime.value += deltaTime;
}
```

---

## 4. Thông Số Điều Chỉnh (Tuning Parameters)

### 4.1. Corona Shape

| Parameter | Giá trị | Effect | Ghi chú |
|---|---|---|---|
| Sphere radius | 2.5x | Corona mở rộng đến 2.5 lần bán kính mặt trời | Lớn hơn → outer rộng hơn |
| Inner falloff | exp(-5r) * 0.7 | Độ sáng và độ steep gần bề mặt | Tăng exp → hẹp hơn |
| Mid falloff | exp(-2r) * 0.3 | Corona chính giữa | Tăng exp → ngắn hơn |
| Outer falloff | exp(-0.5r) * 0.05 | Halo mờ xa | Giảm exp → dài hơn |
| uIntensity | 0.55 | Tổng brightness | 0.3-0.8 tùy môi trường |
| Noise amplitude | 0.18 | Mức độ méo rìa ngoài | 0.05-0.35 |
| Noise edge start | 0.2 | Khi nào noise bắt đầu ảnh hưởng | Thấp hơn → irregular sớm hơn |

### 4.2. White Corona / Transition Region

Có thể thêm một region "white corona" (vùng chuyển tiếp giữa chromosphere và corona) bằng cách thêm thành phần thứ 4:
```glsl
float whiteCorona = exp(-15.0 * r) * 0.2; // Rất hẹp, sáng gần bề mặt
```

---

## 5. Kết Quả Mong Đợi

| Trước (Onion Rings) | Sau (Unified Corona) |
|---|---|
| 3 vòng sáng tách biệt | Một corona liên tục, mượt |
| Ranh giới rõ giữa các layer | Zero seam, zero discontinuity |
| Alpha peak tại 3 bán kính | Alpha giảm đơn điệu từ trong ra ngoài |
| 3 draw calls cho corona | 1 draw call cho corona |
| 2 uniform sets cần sync | 1 uniform set duy nhất |

### Performance So Sánh

| Metric | Trước (3 meshes) | Sau (1 mesh) |
|---|---|---|
| Draw calls | 3 | 1 |
| Shader compiles | 3 (corona×2 + glow) | 1 |
| Uniform updates | 3 sets | 1 set |
| Fragment overdraw | Overlap 3 layer | Single layer |

---

## 6. Implementation Steps

```
Step 1: Viết unifiedCoronaVertexShader + unifiedCoronaFragmentShader
Step 2: Thêm createUnifiedCorona() factory function
Step 3: Sửa createPlanet.js — thay 3 mesh cũ bằng 1 mesh mới
Step 4: Sửa main.js — cập nhật animation loop
Step 5: Tuning — điều chỉnh hệ số multi-exponential cho đẹp
Step 6: Xóa code cũ không dùng (createSunCorona, createSunOuterGlow, outerGlowShader)
Step 7: Kiểm tra với các quality preset
```
