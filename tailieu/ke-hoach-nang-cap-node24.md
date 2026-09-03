# Kế hoạch nâng cấp solarsystemcat lên Node 24 — Fix GitHub Pages Deploy

**Ngày:** 2026-09-03  
**Nhánh hiện tại:** `update-fps` (HEAD 6381a4c), `main` (fa46221)  
**Tác giả:** Hermes Agent  
**Trạng thái:** Đề xuất — chờ thực thi sau khi lưu plan (theo quy ước `tailieu/*.md` trước khi code)

---

## 1. Bối cảnh & Vấn đề

### Log lỗi người dùng gửi
```
Node 20 is being deprecated. This workflow is running with Node 24 by default.
...
Run actions/deploy-pages@v4
...
Error: Deployment failed, try again later.
artifact_id: 8065192552
pages_build_version: fa462218797feb9af8b7b2a4f04b6b51045fd076
```

### Phân tích gốc rễ
- **GitHub Actions Runner v2.328.0+** đã chuyển **default từ Node 20 → Node 24** từ 16/06/2026 (theo https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/).
- Workflow hiện tại (`D:/solarsystemcat/.github/workflows/deploy.yml`) vẫn cố định `node-version: 20` và dùng các action phiên bản cũ chạy trên Node 20:
  - `actions/checkout@v4` → Node 20 (cần v5+ cho Node 24)
  - `actions/setup-node@v4` → Node 20 (cần v5+ cho Node 24)
  - `actions/deploy-pages@v4`, `upload-pages-artifact@v3`, `configure-pages@v5` — log vẫn báo `Node 20` nhưng thực tế v4/v3 đã có patch Node 24 từ Q1/2025; tuy nhiên kết hợp với runner Node 24 + checkout@v4 gây mismatch.
- **Lỗi `Deployment failed, try again later`** thường là **transient GitHub Pages** (không liên quan Node), nhưng giữ workflow cũ sẽ tiếp tục sinh cảnh báo `Node 20 deprecated` và sẽ **fail cứng sau 23/09/2026** khi Node 20 bị xóa khỏi runner. Vì vậy phải nâng toàn bộ workflow lên Node 24 ngay.
- **Dependencies cũng lỗi thời:**
  - `package.json`: `vite ^6.0.0` (cài thực 6.4.2), `vitest ^4.1.6` (yêu cầu Node ^20||^22||>=24), `three ^0.170.0` (hiện latest 0.185.1). Vite 6.4.2 có `engines: ^18||^20||>=22` → chạy được Node 24 nhưng đã hết hỗ trợ thường xuyên (chỉ còn security patch 6.4.x; Vite hiện tại latest 8.2.2, previous LTS 7.3.6).
  - `package-lock.json` lockfileVersion 3, không có `engines` field → không ràng buộc Node.

### Mục tiêu phiên bản mới
- **Workflow chạy native trên Node 24, không cảnh báo, không cần `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION`.**
- **Dependencies lên bản mới tương thích Node 24**, giữ tương thích Vite config tối giản (`base: '/solarsystemcat/', build.assetsInlineLimit: 0`).
- **Build `vite build` vẫn pass, `dist/` sinh đúng, Pages deploy lại thành công.**

---

## 2. Audit hiện trạng

| File | Hiện tại | Vấn đề |
|---|---|---|
| `.github/workflows/deploy.yml` | `checkout@v4`, `setup-node@v4` + `node-version: 20`, `npm install`, `configure-pages@v5`, `upload-pages-artifact@v3`, `deploy-pages@v4` | checkout/setup-node cũ → Node 20 warning; `npm install` không reproducible |
| `package.json` | `vite ^6.0.0`, `three ^0.170.0`, `vitest ^4.1.6`, không có `engines`, không có `.nvmrc` | Vite 6 đã EOL regular, three lỗi 15 minor |
| `vite.config.js` | `base: '/solarsystemcat/'` | OK, giữ nguyên |
| `node` local | Dự kiến runner `ubuntu-latest` + Node 24 | Cần đồng bộ local nếu có `.nvmrc` |

Bằng chứng đọc file (2026-09-03):
- `package-lock.json`: vite 6.4.2 `node: ^18||^20||>=22`, vitest 4.1.6 `node: ^20||^22||>=24`
- `git branch`: `main`, `update-fps` (HEAD)
- `dist/` đã tồn tại, build cũ còn.

---

## 3. Phương án đề xuất

### 3a. Workflow `.github/workflows/deploy.yml` (ưu tiên số 1)
Cập nhật theo khuyến nghị GitHub Docs + `actions/setup-node` README (2025-2026):

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: ['main']
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: 'pages'
  cancel-in-progress: true
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5          # v4→v5 (Node 24)
      - uses: actions/setup-node@v5        # v4→v5 (Node 24), breaking change note 2025-06
        with:
          node-version: 24
          cache: 'npm'
          cache-dependency-path: package-lock.json
      - run: npm ci                        # thay npm install → reproducible, nhanh hơn + cache
      - run: npm run build
      - uses: actions/configure-pages@v5   # giữ v5 (đã Node 24)
      - uses: actions/upload-pages-artifact@v3
        with:
          path: 'dist'
      - uses: actions/deploy-pages@v4      # giữ v4 (4.0.5 đã Node 24, sửa API error surfacing)
        id: deployment
```

*Lý do không bumping lên checkout@v6/setup-node@v7:* search cho thấy v7 đã tồn tại nhưng là bleeding edge (2026-08); v5 là **LTS Node 24 đầu tiên, ổn định, được GitHub Pages starter workflow khuyến nghị**. Nếu muốn tối đa “mới nhất”, có thể dùng `checkout@v5` + `setup-node@v5` là đủ; bump thêm lên v6/v7 không thêm lợi ích nhưng tăng rủi ro.

*Giữ `configure-pages@v5`, `upload-pages-artifact@v3`, `deploy-pages@v4`*: đã được verify Node 24 compatible (deploy-pages issue #410 đã close). Không cần `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION` hay `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`.

### 3b. `package.json` & tooling Node

**Tối thiểu (an toàn):**
```json
{
  "engines": { "node": ">=22" },
  "devDependencies": {
    "vite": "^6.4.3",
    "vitest": "^4.1.6"
  },
  "dependencies": {
    "three": "^0.185.1"
  }
}
```
- Vite 6.4.3 = security patch cuối của 6.x (hỗ trợ Node 24, không đổi Rollup → zero breaking).
- three 0.185.1 = latest r185 (07/2026), API giữ tương thích với 0.170.

**Đề xuất “phiên bản mới” thực sự (khuyến nghị thực thi):**
```json
{
  "engines": { "node": ">=20" },
  "devDependencies": {
    "vite": "^7.3.6",
    "vitest": "^4.1.6"
  },
  "dependencies": {
    "three": "^0.185.1"
  }
}
```
- Vite 7.3.6 = **previous LTS minor** (theo https://vite.dev/releases: 8.2 là latest, 7.3 là previous, 6.4 là second-to-last security). Vite 7 vẫn dùng Rollup, chưa chuyển Rolldown (Vite 8 mới dùng Rolldown), nên rủi ro thấp, vẫn “mới” (ra 2025). Nếu muốn **latest tuyệt đối** thì `^8.2.2` cũng OK với Node 24, nhưng cần test kỹ hơn.
- Nếu build fail với Vite 7 → fallback về 6.4.3.

**Kèm thêm:**
- Thêm `.nvmrc` chứa `24`
- `package-lock.json` sẽ regenerate sau `npm install`/`npm ci`.
- Cân nhắc thêm `overrides`/`audit` nếu `npm audit` báo vite cũ có CVE.

### 3c. Không đổi
- `vite.config.js`, `index.html`, `src/*` — không chạm.
- `public/textures`, `public/data` — không chạm.

---

## 4. Kế hoạch thực thi chi tiết (từng bước 2–5 phút)

### Giai đoạn 0 — Chuẩn bị (đã làm trước khi code)
- [x] Đọc `deploy.yml`, `package.json`, `vite.config.js`, `package-lock.json`
- [x] Web search xác minh Vite releases, three 0.185.1, setup-node v5 breaking change
- [x] Lưu plan này vào `tailieu/ke-hoach-nang-cap-node24.md` (file hiện tại)

### Giai đoạn 1 — Workflow (bắt buộc, 5 phút)
1. **Backup** `deploy.yml` cũ (git diff sẽ lưu).
2. **Ghi đè** `.github/workflows/deploy.yml` với nội dung §3a (checkout@v5, setup-node@v5, node 24, npm ci).
3. **Verify** đọc lại file, `git diff -- .github/workflows/deploy.yml`.

### Giai đoạn 2 — Dependencies (10 phút)
4. **Đọc** `package.json` hiện tại (đã có).
5. **Patch** `package.json`:
   - Thêm `engines.node >=22` (hoặc >=20 nếu chọn Vite 7/8)
   - `vite ^6.0.0 → ^7.3.6` (khuyến nghị) hoặc `^6.4.3` fallback
   - `three ^0.170.0 → ^0.185.1`
   - Giữ `vitest ^4.1.6`
   - Thêm `packageManager` field nếu muốn (optional): `"packageManager": "npm@10.8.2"`
6. **Tạo** `.nvmrc` với `24`.
7. **Regenerate lockfile**: chạy `npm install` (local) hoặc `npm ci` sau khi push — **thực thi qua Python subprocess** (do Git Bash hỏng ASLR, không dùng terminal tool; dùng `subprocess` với `C:/Users/nongt/AppData/Local/hermes/node/npm.cmd`).
8. **Kiểm tra** `package-lock.json` mới: lockfileVersion 3, vite 7.3.x, three 0.185.x.

### Giai đoạn 3 — Kiểm thử cục bộ (không cần Git Bash)
9. **Build**: `npm run build` qua Python subprocess → phải sinh `dist/index.html`, `dist/assets/*`.
10. **Test**: `npm test` (vitest) → 4 file test (`dataLayout.test.js`, `gravity.test.js`, `kepler.test.js`, `orbitMath.test.js`, `orbitSafety.test.js`) phải pass.
11. Nếu Vite 7 build fail → **rollback vite về 6.4.3**, lặp lại bước 9–10.

### Giai đoạn 4 — Git & Deploy
12. **Git status/diff** (qua Python `git` native, không qua bash): kiểm tra 3 file thay đổi + `.nvmrc` mới + lockfile.
13. **Commit** (soạn sẵn message, không auto-push nếu user tự push):
    ```
    chore: nâng cấp Node 20 → 24, workflow Pages và dependencies

    - workflow: checkout@v4→v5, setup-node@v4→v5, node-version 20→24, npm install→npm ci
    - package: vite 6.0→7.3.6, three 0.170→0.185.1, thêm engines >=22 và .nvmrc 24
    - fix: loại bỏ cảnh báo Node 20 deprecated, sẵn sàng runner Node 24 (EOL 23/09/2026)
    ```
14. **Push** (user tự quyết) → GitHub Actions chạy lại, kiểm tra tab Actions: không còn warning Node 20, deploy thành công. Nếu vẫn `Deployment failed` transient → **Retry** nút “Re-run jobs” (GitHub Pages thỉnh thoảng fail infra).

### Giai đoạn 5 — Hậu kiểm
15. Mở `https://nongtiensonpro.github.io/solarsystemcat/` xác nhận site load.
16. Ghi chú vào `tailieu` hoặc `README` về yêu cầu Node 24.

---

## 5. Files sẽ thay đổi

| File | Hành động |
|---|---|
| `tailieu/ke-hoach-nang-cap-node24.md` | **MỚI** — plan này |
| `.github/workflows/deploy.yml` | Sửa 3 dòng versions + node + npm ci |
| `package.json` | Thêm engines, bump vite/three |
| `package-lock.json` | Regenerate (auto) |
| `.nvmrc` | MỚI — `24` |
| `README.md` | (optional) thêm badge Node 24 |

Không chạm: `src/*`, `public/*`, `vite.config.js`, `plan/*` (cũ).

---

## 6. Rủi ro & Giảm thiểu

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Vite 7 breaking với plugin/config hiện tại | Thấp | Config tối giản; test build fallback 6.4.3 |
| three 0.185 API đổi (ví dụ Addon path) | Thấp | three giữ backward compat 0.170→0.185; test render thủ công |
| `npm ci` fail do lockfile cũ | Trung | Dùng `npm install` local để regen lockfile trước khi commit |
| Git Bash ASLR chặn `terminal` tool | Đã biết | Dùng `execute_code` Python `subprocess` + `Path.write_text` (như lovelyyellowcat § memory) |
| Pages `Deployment failed` vẫn lặp lại | Thấp | Là lỗi infra GitHub, retry; đảm bảo artifact `dist` tồn tại |
| Checkout v5 yêu cầu Node 24 nhưng dev local vẫn Node 20 | Thấp | Thêm `.nvmrc` + `engines` để báo rõ |

---

## 7. Tiêu chí nghiệm thu

- [ ] `actions/checkout@v5` và `setup-node@v5` với `node-version: 24` trong deploy.yml, không còn `v4`/`20`.
- [ ] `npm ci` thay `npm install` trong workflow.
- [ ] `package.json` có `engines` và `vite` >= 7.3 hoặc >= 6.4.3, `three` >= 0.185.
- [ ] `.nvmrc` = `24`.
- [ ] `npm run build` local pass, sinh `dist/`.
- [ ] `npm test` pass.
- [ ] GitHub Actions chạy không cảnh báo Node 20, deploy Pages success (hoặc retry success nếu transient).

---

## 8. Câu hỏi mở

- **Bạn muốn Vite lên 7.3.6 (khuyến nghị, an toàn) hay 8.2.2 (latest, dùng Rolldown, mới nhất nhưng rủi ro hơn)?** Mặc định plan sẽ làm 7.3.6, có thể đổi 1 dòng.
- **Có muốn bump `three` lên 0.185.1 luôn hay giữ 0.170 để tối thiểu thay đổi?** Plan mặc định là bump.
- **Bạn muốn mình auto-commit + push hay chỉ để commit sẵn để bạn tự push thủ công (như thói quen lovelyyellowcat)?**

---

## 9. Tham chiếu

- GitHub Changelog Node 20 deprecation: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
- Vite releases & support policy: https://vite.dev/releases + https://www.npmjs.com/package/vite
- setup-node v5 breaking: https://github.com/actions/setup-node (Upgraded action from node20 to node24)
- deploy-pages issue Node 24: https://github.com/actions/deploy-pages/issues/410
- three r185: https://github.com/mrdoob/three.js/releases/tag/r185

---

*Sau khi bạn duyệt plan này, sẽ thực thi ngay giai đoạn 1–3 và báo kết quả build + diff.*
