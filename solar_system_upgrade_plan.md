# Ke Hoach Nang Cap Mo Phong He Mat Troi 3D

> Du an: Solar System 3D  
> Muc tieu: Mo rong mo phong thanh mot cong cu kham pha he mat troi day du hon, co nhieu thien the, du lieu de bao tri, tuong tac tot hon va van giu duoc hieu nang tren web.  
> Ghi chu deploy: Phan deploy se duoc thuc hien thu cong boi chu so huu tai khoan/quyen truy cap.

---

## 1. Tom Tat Dieu Huong

File danh gia `Danh gia va Ke hoach Nang cap Mo phong He Mat Troi 3D.md` de xuat ba nhom nang cap lon:

- Mo rong noi dung: ve tinh tu nhien, vanh dai tieu hanh tinh, sao choi.
- Nang cao vat ly va tuong tac: panel thong tin chi tiet, camera modes, mo phong nhieu goc nhin.
- Toi uu va mo rong cong nghe: data JSON, preset hieu nang, web worker/LOD/instancing.

Thu tu thuc hien khuyen nghi:

1. Lam sach nen tang hien tai va them quality preset.
2. Chuyen du lieu sang schema co the mo rong.
3. Ho tro hierarchy parent-child cho ve tinh.
4. Them asteroid belt va comet.
5. Mo rong UX kham pha.
6. Toi uu hieu nang sau khi so luong object tang.
7. Chi nghien cuu advanced physics sau cung.

Ly do: Neu them ngay ve tinh/tieu hanh tinh vao `planetData.js`, code se nhanh chong cong kenh. Can co data schema va hierarchy truoc de cac phase sau khong pha cau truc.

---

## 2. Trang Thai Nen Hien Tai

### Da co

- Three.js + Vite.
- He thong module rieng: `scene.js`, `main.js`, `createPlanet.js`, `kepler.js`, `ui.js`, `labels.js`, `orbits.js`, `rings.js`, `textureLoader.js`.
- 10 thien the chinh: Sun, Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto.
- PBR textures cho hanh tinh.
- Earth multi-layer: albedo, normal, specular, night, clouds, atmosphere.
- Sun shader + corona + bloom.
- Saturn/Uranus rings.
- Loading progress cho texture.
- Attribution Solar System Scope.
- GitHub Pages base path `/solarsystemcat/`.

### Gioi han hien tai

- Du lieu hardcode trong `src/planetData.js`.
- `createPlanet.js` dang gan nhieu trach nhiem: material, rings, atmosphere, clouds, sun shader hook.
- Kepler orbit hien gan voi orbit quanh Sun, chua tong quat cho thien the co parent nhu Moon.
- UI select hien chi phu hop so luong thien the nho.
- Labels se de roi khi them nhieu object.
- Chua co quality preset cho mobile/low-end device.

---

## 3. Nguyen Tac Thuc Hien

- Uu tien giu app chay tot sau tung phase.
- Moi phase phai co acceptance criteria ro rang.
- Khong dua N-body/Runge-Kutta vao som vi rui ro cao va gia tri thi giac ban dau thap hon ve tinh/tieu hanh tinh/comet.
- Moi feature them object so luong lon phai dung instancing hoac points, khong tao hang nghin mesh rieng le.
- Khong deploy tu dong trong ke hoach nay.
- Sau moi phase can chay:
  - `npm run build`
  - smoke test bang browser/Playwright neu co thay doi render/UI.
  - kiem tra console khong co loi texture/font/resource.

---

## 4. Phase 0: Baseline Va Quality Preset

### Muc tieu

Tao mot baseline on dinh truoc khi mo rong noi dung. Them cac tuy chon hieu nang de app chay tot hon tren mobile va may cau hinh thap.

### Cong viec

1. Audit hien trang:
   - Kiem tra build production.
   - Kiem tra texture URL trong `public/textures`.
   - Kiem tra console tren local preview.
   - Kiem tra mobile viewport.

2. Them quality preset:
   - `High`: pixel ratio toi da 2, bloom day du, star count cao, atmosphere/cloud/ring day du.
   - `Balanced`: pixel ratio toi da 1.5, bloom binh thuong, star count trung binh.
   - `Low`: pixel ratio toi da 1, bloom giam/tat, star count thap, co the giam atmosphere/cloud opacity hoac tat mot so effect nang.

3. Tach cau hinh render:
   - Tao `src/renderConfig.js` hoac `src/settings.js`.
   - Dat cac gia tri nhu `starCount`, `maxPixelRatio`, `bloomStrength`, `bloomRadius`, `bloomThreshold`.

4. UI:
   - Them segmented control hoac select nho cho quality preset trong top bar.
   - Luu preset vao `localStorage`.

### File du kien tac dong

- `src/scene.js`
- `src/postprocessing.js`
- `src/ui.js`
- `src/main.js`
- `src/style.css`
- Them `src/renderConfig.js`

### Acceptance Criteria

- App van render nhu hien tai o preset `High`.
- Chuyen preset khong reload page hoac reload co kiem soat.
- Mobile co preset `Low`/`Balanced` mac dinh neu `devicePixelRatio` cao hoac viewport nho.
- `npm run build` thanh cong.
- Console khong co resource error.

---

## 5. Phase 1: Data Architecture

### Muc tieu

Chuyen du lieu thien the tu hardcode trong JS sang schema JSON de de mo rong, them ve tinh/tieu hanh tinh/comet ma khong sua logic core qua nhieu.

### Schema de xuat

Tao file:

```text
public/data/solar-system.json
```

Dang du lieu:

```json
{
  "bodies": [
    {
      "id": "earth",
      "parentId": "sun",
      "name": { "vi": "Trai Dat", "en": "Earth" },
      "type": "terrestrial",
      "physical": {
        "radius": 1.0,
        "massKg": 5.972e24,
        "density": 5.51,
        "meanTemperatureC": 15
      },
      "orbit": {
        "semiMajorAxis": 1.0,
        "orbitalPeriod": 365.2,
        "eccentricity": 0.0167,
        "inclination": 0.0
      },
      "rotation": {
        "axialTilt": 23.4,
        "rotationPeriod": 23.93,
        "oblateness": 0.00335
      },
      "render": {
        "radiusScale": 1.0,
        "fallbackColor": "#2266AA"
      },
      "textures": {
        "albedo": "/textures/planets/earth/albedo.jpg",
        "normal": "/textures/planets/earth/normal.jpg",
        "specular": "/textures/planets/earth/specular.jpg",
        "night": "/textures/planets/earth/night.jpg",
        "clouds": "/textures/planets/earth/clouds.jpg"
      },
      "atmosphere": {
        "color": "#3B5B89",
        "opacity": 0.6,
        "power": 4.0
      },
      "info": {
        "summaryVi": "Hanh tinh co su song duy nhat duoc biet den.",
        "compositionVi": "Nitrogen, oxygen, argon..."
      }
    }
  ]
}
```

### Cong viec

1. Tao JSON data tu `planetData.js` hien tai.
2. Tao module loader:
   - `src/dataLoader.js`
   - Load JSON bang `fetch(import.meta.env.BASE_URL + 'data/solar-system.json')`.
   - Normalize color hex string sang number khi can.
3. Them validate nhe:
   - Moi body phai co `id`, `type`, `physical.radius` hoac `render.radiusScale`.
   - Body co `parentId` phai tham chieu body ton tai.
   - Texture path neu co phai theo `/textures/...`.
4. Giu `planetData.js` lam adapter tam thoi neu can de giam pham vi thay doi.

### File du kien tac dong

- Them `public/data/solar-system.json`
- Them `src/dataLoader.js`
- Sua `src/main.js`
- Sua hoac thay `src/planetData.js`
- Sua `src/ui.js` va `src/labels.js` de xu ly `name.vi`

### Acceptance Criteria

- 10 thien the hien tai van render dung.
- Data lay tu JSON.
- Loi schema hien ro trong console neu sai data.
- Build production van copy JSON vao `dist/data`.

---

## 6. Phase 2: Hierarchy Cho Ve Tinh Tu Nhien

### Muc tieu

Them ve tinh quay quanh hanh tinh me, bat dau tu Moon, sau do mo rong sang Galilean moons va Titan.

### Danh sach thien the de them

Batch 1:

- Moon cua Earth.

Batch 2:

- Io, Europa, Ganymede, Callisto cua Jupiter.
- Titan cua Saturn.

Batch 3 optional:

- Enceladus, Rhea, Iapetus.
- Triton cua Neptune.

### Kien truc

Hierarchy de xuat:

```text
Sun pivot
Planet orbital pivot around Sun
  Planet tilt group
    Planet mesh/layers/rings
  Moon orbital pivot around Planet
    Moon tilt group
      Moon mesh
```

Can luu y: Moon orbit phai theo parent planet position, khong theo Sun truc tiep.

### Cong viec

1. Doi logic tao body:
   - Tao tat ca body vao map `bodyById`.
   - Gan body vao scene neu khong co parent.
   - Gan body vao parent pivot/group neu co `parentId`.

2. Tong quat hoa orbit:
   - `computeOrbitalPosition(body.orbit, simulationTime)`.
   - Orbit position duoc ap dung vao pivot tuong doi voi parent.

3. Orbit line:
   - Orbit line cua moon nam trong coordinate space cua parent.
   - Scale de orbit khong qua nho so voi planet.

4. Textures:
   - Neu chua co texture, dung fallback material co bump/noise nhe.
   - Uu tien Moon texture neu co the them asset nhe.

5. UI:
   - Planet selector can ho tro nested group hoac filter.
   - Info panel hien parent/body type.

### File du kien tac dong

- `src/main.js`
- `src/createPlanet.js` hoac tao `src/createBody.js`
- `src/kepler.js`
- `src/orbits.js`
- `src/ui.js`
- `src/labels.js`
- `public/data/solar-system.json`

### Acceptance Criteria

- Moon quay quanh Earth trong khi Earth quay quanh Sun.
- Camera fly-to Moon hoat dong.
- Label Moon co the bat/tat.
- Orbit line Moon hien dung quanh Earth.
- Khong anh huong quỹ đạo 10 thien the hien tai.

---

## 7. Phase 3: Asteroid Belt Va Comets

### Muc tieu

Them cam giac he mat troi co nhieu vat the nho ma van giu hieu nang.

### Asteroid Belt

#### Cach tiep can

- Dung `THREE.InstancedMesh` voi geometry don gian nhu `DodecahedronGeometry` hoac `IcosahedronGeometry`.
- So luong ban dau:
  - High: 2500-5000 instances.
  - Balanced: 1000-2000 instances.
  - Low: 300-800 instances hoac Points.
- Phan bo ngau nhien co seed giua Mars va Jupiter.
- Moi asteroid co:
  - radius nho ngau nhien.
  - orbital speed gan dung theo semi-major axis.
  - inclination nhe.
  - eccentricity nhe.

#### Module de xuat

- `src/asteroidBelt.js`

### Comets

#### Danh sach de xuat

- Halley.
- 67P/Churyumov-Gerasimenko optional.

#### Render

- Nucleus: small mesh fallback.
- Tail: transparent cone/particle trail, chi ro khi comet gan Sun.
- Orbit: ellipse eccentricity cao.

#### Module de xuat

- `src/comets.js` hoac dung chung body system neu data schema da du.

### Acceptance Criteria

- Asteroid belt nhin thay giua Mars va Jupiter.
- Khong tao hang nghin draw calls rieng le.
- Comet co orbit rat det va tail thay doi theo khoang cach den Sun.
- Preset Low giam so luong asteroid.

---

## 8. Phase 4: UX Kham Pha

### Muc tieu

Mo rong UI tu dieu khien co ban thanh trai nghiem kham pha co thong tin va nhieu goc nhin.

### Info Panel Nang Cao

Them cac truong:

- Loai thien the.
- Parent body.
- Ban kinh that.
- Khoi luong.
- Mat do.
- Nhiet do trung binh.
- Chu ky quy dao.
- Chu ky tu quay.
- Do nghieng truc.
- Thanh phan khi quyen.
- So ve tinh.
- Tom tat ngan.

### Camera Modes

1. Overview:
   - Goc nhin tong quat he mat troi.

2. Follow Body:
   - Camera target bam theo body da chon.
   - Body van tiep tuc di chuyen.

3. Orbit View:
   - Camera quanh body o khoang cach ty le voi radius.

4. Surface/Near-Surface View:
   - Ap dung truoc cho Earth, Mars, Moon.
   - Vi tri camera gan be mat, nhin ra ngoai khong gian.

### Search/Navigation

- Khi co nhieu body, bottom selector khong con du.
- Them search box hoac command palette nho.
- Filter theo type: Planets, Moons, Small Bodies, Comets.

### Labels

- Auto-hide label theo zoom/distance.
- Chi hien label cho selected body va nearby bodies neu so luong qua lon.
- Label grouping cho moon system.

### Acceptance Criteria

- Chon duoc planet/moon/comet bang search.
- Info panel khong bi qua tai tren mobile.
- Follow mode bam body muot.
- Surface mode co nut thoat ve overview.

---

## 9. Phase 5: Performance Pass

### Muc tieu

Dam bao app van muot sau khi them nhieu thien the va effect.

### Cong viec

1. Instancing:
   - Asteroid belt bat buoc dung instancing/points.

2. LOD:
   - Distant moons dung geometry segment thap.
   - Small bodies dung Points/InstancedMesh khi xa.

3. Render tuning:
   - Cap pixel ratio theo preset.
   - Bloom strength/radius theo preset.
   - Star count theo preset.
   - Tat/tang giam atmosphere/cloud effects theo preset.

4. Label update optimization:
   - Chi update khi labels bat.
   - Co the throttle update labels moi 2-3 frame.
   - Auto-hide objects qua xa/qua nho.

5. Memory:
   - Texture cache da co, tiep tuc giu.
   - Neu sau nay co scene modes nang, can dispose geometry/material khi unload dataset.

6. Worker optional:
   - Neu so luong comet/asteroid co orbit rieng tang cao, tinh orbit trong Web Worker.

### Acceptance Criteria

- Desktop High van muot voi asteroid belt va moons.
- Mobile Low render duoc khong crash.
- Khong co texture/resource error.
- Bundle warning neu con do Three.js thi chap nhan, nhung can theo doi.

---

## 10. Phase 6: Advanced Physics Optional

### Muc tieu

Cai thien do chinh xac vat ly neu project can tro thanh cong cu mo phong nghiem tuc hon.

### Khuyen nghi

Khong lam phase nay truoc. Hien tai Kepler orbit la du tot cho visualization. N-body se:

- Tang do phuc tap lon.
- Can timestep/integrator/collision/units nghiem ngat.
- De gay sai so neu khong co validation.
- Co the lam kho viec giu app muot tren mobile.

### Huong tiep can neu lam

1. Giu `physicsMode: "kepler"` lam default.
2. Them `physicsMode: "nbody-lite"` cho subset thien the.
3. Dung Web Worker.
4. Dung integrator:
   - Leapfrog/Verlet cho on dinh nang luong.
   - RK4 chi nen dung neu can demo ngan, vi chi phi cao hon.
5. So sanh ket qua voi Kepler baseline.

### Acceptance Criteria

- Co toggle physics mode.
- Khong anh huong default Kepler.
- Worker khong block UI thread.
- Co test/validation vi tri gan dung sau khoang thoi gian ngan.

---

## 11. Thu Tu Implement Chi Tiet

### Milestone A: Nen tang sach

1. Them `renderConfig.js`.
2. Them quality preset vao UI.
3. Chay build/smoke test.

### Milestone B: Data schema

1. Tao `public/data/solar-system.json`.
2. Tao `dataLoader.js`.
3. Chuyen 10 body hien tai sang JSON.
4. Sua UI/labels de dung `name.vi`.
5. Chay build/smoke test.

### Milestone C: Moon

1. Them `parentId`.
2. Sua body hierarchy.
3. Them Moon data.
4. Them Moon orbit line.
5. Sua fly-to cho nested body.
6. Chay build/smoke test.

### Milestone D: Moons batch 2

1. Them Io, Europa, Ganymede, Callisto.
2. Them Titan.
3. Them group/filter trong UI.
4. Toi uu labels.

### Milestone E: Asteroid belt

1. Tao `asteroidBelt.js`.
2. Them instancing.
3. Gan so luong asteroid theo quality preset.
4. Chay performance smoke test.

### Milestone F: Comets

1. Them comet data.
2. Render nucleus.
3. Render tail theo khoang cach Sun.
4. Them orbit line eccentricity cao.

### Milestone G: UX advanced

1. Info panel rich data.
2. Search/navigation.
3. Camera modes.
4. Mobile polish.

### Milestone H: Performance final

1. LOD.
2. Label throttling.
3. Optional worker.
4. Build final.

---

## 12. Rui Ro Va Cach Giam Thieu

| Rui ro | Tac dong | Giam thieu |
|---|---:|---|
| Data schema qua lon ngay tu dau | Cham tien do | Bat dau voi schema du cho 10 body, mo rong dan |
| Them qua nhieu moon lam UI roi | UX kem | Them search/filter truoc khi batch lon |
| Asteroid belt tao qua nhieu mesh | FPS giam manh | Bat buoc dung InstancedMesh/Points |
| Advanced physics gay sai so | Kho debug | De sau, giu Kepler default |
| Mobile qua tai bloom/texture | Crash/FPS thap | Quality preset va cap pixel ratio |
| Labels day man hinh | Roi mat | Auto-hide/throttle/group labels |

---

## 13. Kiem Thu Sau Moi Phase

### Build

```bash
npm run build
```

### Preview production

```bash
npm run preview
```

### Checklist

- Trang load duoc tai `/solarsystemcat/`.
- Console khong co 404 texture/font.
- Loading screen fade out.
- Sun shader + bloom hien dung.
- Earth clouds/night/atmosphere van hoat dong.
- Saturn/Uranus rings van render.
- Mobile viewport khong bi cat UI.
- Build output khong chua asset cu khong dung.

---

## 14. Dinh Nghia Hoan Thanh

Mot phase duoc xem la hoan thanh khi:

- Code da duoc implement theo acceptance criteria.
- `npm run build` thanh cong.
- Neu co thay doi render/UI, da smoke test bang browser.
- Khong them resource error trong console.
- Khong pha tinh nang da co.
- Tai lieu/ghi chu duoc cap nhat neu thay doi kien truc.

---

## 15. De Xuat Bat Dau

Nen bat dau voi:

```text
Phase 0 + Phase 1
```

Ly do:

- Phase 0 giu app on dinh va tao preset cho cac phase nang hon.
- Phase 1 tao nen du lieu dung de them Moon, asteroid va comet ma khong lam `planetData.js` phinh to.
- Sau hai phase nay, Phase 2 them Moon se nhanh va it rui ro hon.
