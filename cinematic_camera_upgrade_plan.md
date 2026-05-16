# Ke hoach nang cap: Camera dien anh tu do

## 1. Muc tieu

Nang cap mo phong He Mat Troi 3D de co che do camera dien anh tu do, lay cam hung tu cach dieu khien camera tu do trong cac game the gioi mo nhu GTA, nhung duoc dieu chinh cho khong gian vu tru va ty le rat lon cua du an.

Muc tieu chinh:

- Cho phep nguoi dung bay camera tu do quanh He Mat Troi.
- Tao cam giac camera muot, co quan tinh, co tang/giam toc, khong giat.
- Ho tro cac goc quay dien anh nhu fly-by, orbit shot, reveal shot, chase shot va target lock.
- Tang chat luong hinh anh bang lens/FOV, depth of field, vignette, film grain nhe va bloom tinh chinh.
- Co che do an UI de chup anh/quay video sach.
- Giu tuong thich voi che do hien co: overview, follow, cross-section, minimap, labels va quality preset.

## 2. Hien trang code lien quan

Camera hien tai nam chu yeu trong `src/main.js`:

- Dang co `cameraMode = 'overview' | 'follow'`.
- Co `trackedBody` de bam theo thien the.
- Co `startFlyTo(targetPos, targetLookAt)` de bay chuyen canh.
- Vong lap `animate()` dang cap nhat camera tracking truc tiep.

Scene va dieu khien nam trong `src/scene.js`:

- Dung `THREE.PerspectiveCamera`.
- Dung `OrbitControls`.
- Renderer da bat `ACESFilmicToneMapping`, `logarithmicDepthBuffer` va `localClippingEnabled`.

Post-processing nam trong `src/postprocessing.js`:

- Da co `EffectComposer`.
- Da co `UnrealBloomPass`.
- Da co `OutputPass`.

Quality preset nam trong `src/renderConfig.js`:

- Dang quan ly pixel ratio, star count, asteroid count, bloom, atmosphere, clouds, rings, corona va antialias.

UI nam trong `src/ui.js` va `src/style.css`:

- Da co top bar, search, planet selector, info panel, minimap, zoom indicator va nut screenshot.

## 3. Kien truc nang cap de xuat

Them module rieng:

```text
src/cinematicCamera.js
```

Module nay khong nen lam phinh `src/main.js`. No nen dong vai tro controller rieng cho cac che do camera dien anh.

API de xuat:

```js
export function createCinematicCameraController(options) {
  return {
    enable(mode),
    disable(),
    setTarget(body),
    setShotPreset(preset),
    setLens(lens),
    update(deltaTime),
    isActive()
  };
}
```

Trang thai camera nen mo rong thanh:

```js
overview
follow
cinematicFree
cinematicTargetLock
cinematicOrbit
cinematicFlyBy
cinematicPath
```

Khi bat cinematic mode:

- Tam thoi tat `OrbitControls` bang `controls.enabled = false`.
- Camera duoc dieu khien bang controller moi.
- Van giu `trackedBody` de lam muc tieu focus neu co.
- Khi tat cinematic mode, bat lai `OrbitControls` va tra camera ve trang thai hop le.

## 4. Giai doan 1: MVP Freecam

Muc tieu: co camera tu do dieu khien duoc bang ban phim va chuot.

Tinh nang:

- `W/A/S/D`: tien, trai, lui, phai.
- `Q/E`: ha/xuong va nang/len.
- `Shift`: tang toc.
- `Ctrl`: giam toc/precision mode.
- Chuot phai + keo: xoay huong nhin.
- Scroll: dieu chinh toc do bay hoac dolly.
- `Z/C`: roll trai/phai de tao goc nghieng dien anh.
- `R`: reset roll.
- `Esc`: thoat cinematic mode.

Yeu cau ky thuat:

- Dung velocity va damping thay vi set position truc tiep.
- Toc do camera phai scale theo khoang cach toi target hoac toi goc toa do.
- Gioi han min/max speed de khong bi qua cham hoac qua nhanh.

Cong thuc goi y:

```js
const baseSpeed = THREE.MathUtils.clamp(distanceToFocus * 0.08, 2, 2500);
velocity.lerp(desiredVelocity, 1 - Math.exp(-acceleration * deltaTime));
camera.position.addScaledVector(velocity, deltaTime);
```

## 5. Giai doan 2: Target Lock va camera bam muc tieu

Muc tieu: nguoi dung bay tu do nhung camera van nhin vao hanh tinh/vetinh dang chon.

Tinh nang:

- Target lock vao `trackedBody`.
- Camera co the dolly gan/xa target.
- Camera co the orbit quanh target bang chuot/phim.
- Target lock van theo duoc thien the dang di chuyen tren quy dao.
- Khi target mat hoac bi xoa, tu dong fallback ve freecam.

Quan trong:

- Khong duoc khoa cung offset nhu follow hien tai.
- Can tinh target world position moi moi frame bang `pivot.getWorldPosition()`.
- Huong nhin nen dung `Quaternion.slerp` de muot.

## 6. Giai doan 3: Shot preset dien anh

Them cac shot preset dung ngay:

### Free Camera

Bay tu do hoan toan, phu hop de nguoi dung tu canh khung hinh.

### Target Lock

Bay tu do nhung luon nhin vao thien the dang chon.

### Orbit Shot

Camera tu quay quanh target theo ban kinh, do cao va toc do tuy chinh.

Thong so:

- radius
- height
- angularSpeed
- clockwise/counter-clockwise
- lookAhead
- roll

### Fly-by Shot

Camera bay ngang qua target theo duong cong, tao cam giac luot qua hanh tinh.

Nen dung:

```js
new THREE.CatmullRomCurve3(points)
```

### Reveal Shot

Camera bat dau tu sau hanh tinh, mat troi hoac vanh dai, sau do mo ra de lo khung canh lon.

### Chase Shot

Camera bam theo thien the dang di chuyen voi offset dien anh. Khac follow hien tai o cho co damping, look-ahead va framing.

## 7. Giai doan 4: Lens, FOV va framing

Them bo lens:

- 24mm: goc rong, hop canh toan he.
- 35mm: goc dien anh linh hoat.
- 50mm: canh tu nhien.
- 85mm: close-up hanh tinh.
- 135mm: nen xa nen manh, hop voi mat trang/vetinh.

Moi lens map sang FOV rieng.

UI can co:

- Lens selector.
- FOV manual.
- Focus target.
- Focus distance.
- Aperture/DOF strength.
- Roll reset.
- Speed slider.

## 8. Giai doan 5: Post-processing dien anh

Mo rong `src/postprocessing.js`.

Hieu ung de them:

- Depth of field bang `BokehPass`.
- Vignette bang custom `ShaderPass`.
- Film grain nhe bang custom `ShaderPass`.
- Motion blur nhe bang `AfterimagePass` neu FPS cho phep.

Mo rong `src/renderConfig.js`:

```js
cinematic: {
  dofEnabled: true,
  vignetteEnabled: true,
  grainEnabled: true,
  motionBlurEnabled: false,
  maxPixelRatio: 2
}
```

Quy tac preset:

- High: bat DOF, vignette, grain; motion blur tuy chon.
- Balanced: bat vignette va grain nhe; DOF tuy chon.
- Low: tat DOF, tat motion blur, grain rat nhe hoac tat.

## 9. Giai doan 6: UI cinematic

Cap nhat `src/ui.js`:

- Them nut `Cinematic` tren top bar.
- Them panel cinematic rieng.
- Them callbacks:

```js
onToggleCinematic(enabled)
onCinematicModeChange(mode)
onCinematicShotChange(shot)
onCinematicLensChange(lens)
onCinematicSpeedChange(speed)
onCinematicCleanUIToggle(enabled)
```

Panel dieu khien nen gom:

- Mode: Free, Lock, Orbit, Fly-by, Reveal, Chase.
- Lens: 24, 35, 50, 85, 135.
- Speed.
- Focus.
- Aperture.
- Roll.
- Clean UI.
- Screenshot cinematic.

Cap nhat `src/style.css`:

- Cinematic panel nho, khong che khung hinh.
- Tren mobile, panel nen la bottom sheet gon.
- Nut bam toi thieu 44px tren mobile.

## 10. Giai doan 7: Clean UI va capture

Them che do clean UI:

- An top bar.
- An planet selector.
- An info panel.
- An minimap.
- An zoom indicator.
- Tuy chon an labels va orbit lines.

Them screenshot cinematic:

- Tam thoi an UI.
- Render 1 frame.
- Xuat PNG.
- Khoi phuc UI.

Neu sau nay can quay video:

- Co the dung `canvas.captureStream()`.
- Them nut record start/stop.
- Xuat WebM bang `MediaRecorder`.

## 11. Giai doan 8: Keyframe Director Mode

Day la giai doan giup dat chat luong dien anh tot nhat.

Tinh nang:

- Add keyframe tai vi tri camera hien tai.
- Moi keyframe luu:
  - position
  - quaternion/look direction
  - target id
  - FOV/lens
  - roll
  - focus distance
  - aperture
  - duration
  - easing
- Playback camera path.
- Xoa/sua/sap xep keyframe.
- Export/import JSON.

Du lieu goi y:

```json
{
  "name": "Earth reveal shot",
  "duration": 12,
  "keyframes": [
    {
      "time": 0,
      "position": [120, 40, 220],
      "targetId": "earth",
      "lens": 35,
      "roll": 0,
      "focusDistance": 150,
      "aperture": 0.8,
      "easing": "easeInOutCubic"
    }
  ]
}
```

## 12. Giai doan 9: Va cham va gioi han an toan

Can xu ly:

- Khong de camera chui vao mesh hanh tinh neu khong bat cross-section.
- Khi qua gan target, giam toc tu dong.
- Gan Mat Troi can giam exposure hoac tang bloom co kiem soat.
- Camera near/far plane can phu hop khong gian lon.
- Khi doi target, velocity nen duoc damping de khong giat.

## 13. Thu tu trien khai de xuat

1. Tao `src/cinematicCamera.js`.
2. Them cinematic mode vao `src/main.js`.
3. Them nut bat/tat cinematic trong `src/ui.js`.
4. Them Freecam MVP bang WASD/mouse.
5. Them Target Lock.
6. Them Orbit Shot va Fly-by Shot.
7. Them lens/FOV/roll/speed controls.
8. Them Clean UI va screenshot cinematic.
9. Them DOF/vignette/grain vao post-processing.
10. Them Keyframe Director Mode.
11. Kiem tra desktop/mobile.
12. Chay `npm run build`.

## 14. Tieu chi hoan thanh

Tinh nang duoc xem la dat khi:

- Camera bay tu do muot, khong giat, khong mat dieu khien.
- Nguoi dung co the chon hanh tinh va tao shot dien anh quanh hanh tinh do.
- Co it nhat 4 shot dung duoc: Free, Target Lock, Orbit, Fly-by.
- Clean UI hoat dong dung de chup anh/quay video.
- Post-processing co khac biet ro nhung khong pha FPS.
- Preset Low van chay duoc tren thiet bi yeu/mobile.
- `npm run build` thanh cong.

## 15. Rủi ro ky thuat

- Ty le khong gian qua lon co the lam camera speed kho can bang.
- DOF va motion blur co the lam giam FPS manh.
- `OrbitControls` va controller moi co the tranh quyen dieu khien camera neu khong tat/bat ro rang.
- Mobile can input rieng, khong nen ap dung nguyen WASD/mouse.
- Keyframe path can xu ly target dang di chuyen, neu khong camera path co the lech framing theo thoi gian.

## 16. Huong giai quyet rui ro

- Tach controller rieng, khong tron logic camera moi vao giua vong lap `animate()`.
- Bat/tat `controls.enabled` ro rang theo mode.
- Dung delta time va damping cho moi chuyen dong.
- Dung quality preset de tat bot hieu ung nang.
- Viet MVP nho truoc, sau do moi them shot va post-processing.
- Kiem tra bang ca desktop va mobile viewport truoc khi coi la hoan thanh.
