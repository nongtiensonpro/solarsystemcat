// Data Loader — Tải và xác thực dữ liệu thiên thể từ JSON
// Thay thế dữ liệu hardcode trong planetData.js
import { AU } from './constants.js';

/**
 * Kiểm tra khoảng cách an toàn của vệ tinh so với hành tinh mẹ (Phòng chống lỗi Phase 6).
 * Cảnh báo nếu vệ tinh có nguy cơ đè lên mesh của hành tinh do orbitScale quá nhỏ.
 * @param {Object[]} bodies - Danh sách bodies đã chuẩn hóa
 */
function validateMoonDistances(bodies) {
  const bodyMap = new Map(bodies.map(b => [b.id, b]));
  const safetyMargin = 4.0; // Margin an toàn theo thiết kế

  for (const body of bodies) {
    if (body.isMoon && body.parentId) {
      const parent = bodyMap.get(body.parentId);
      if (!parent) continue;

      // Tính bán kính hiển thị thực tế
      const a = body.displayOrbitRadius ?? (body.semiMajorAxis * AU * body.orbitScale);
      const pericenter = a * (1 - body.eccentricity);
      const minSafeDistance = parent.radius + safetyMargin;

      if (pericenter <= minSafeDistance) {
        console.warn(
          `[DataLoader] Cảnh báo layout: Vệ tinh "${body.id}" (pericenter: ${pericenter.toFixed(2)}) ` +
          `quá gần hành tinh mẹ "${parent.id}" (radius + margin: ${minSafeDistance.toFixed(2)}). ` +
          `Vệ tinh có nguy cơ nằm trong hoặc đè lên bề mặt hành tinh.`
        );
      }
    }
  }
}

/**
 * Chuyển đổi hex color string "#RRGGBB" sang số 0xRRGGBB.
 * Giữ nguyên nếu đã là number.
 * @param {string|number|null} color
 * @returns {number|null}
 */
function normalizeColor(color) {
  if (color === null || color === undefined) return null;
  if (typeof color === 'number') return color;
  if (typeof color === 'string' && color.startsWith('#')) {
    return parseInt(color.slice(1), 16);
  }
  return null;
}

/**
 * Xác thực một body object theo schema tối thiểu.
 * Log cảnh báo rõ ràng trong console nếu có lỗi.
 * @param {Object} body
 * @param {number} index
 * @returns {string[]} Mảng lỗi (rỗng = hợp lệ)
 */
function validateBody(body, index) {
  const errors = [];
  const prefix = `[DataLoader] Body #${index}`;

  if (!body.id || typeof body.id !== 'string') {
    errors.push(`${prefix}: thiếu hoặc sai "id" (phải là string)`);
  }

  if (!body.type || typeof body.type !== 'string') {
    errors.push(`${prefix} (${body.id || '?'}): thiếu "type"`);
  }

  // Phải có physical.radius hoặc render.radiusScale
  const hasRadius = body.physical && typeof body.physical.radius === 'number';
  const hasRadiusScale = body.render && typeof body.render.radiusScale === 'number';
  if (!hasRadius && !hasRadiusScale) {
    errors.push(`${prefix} (${body.id || '?'}): thiếu "physical.radius" hoặc "render.radiusScale"`);
  }

  // Kiểm tra texture paths
  if (body.textures) {
    for (const [key, path] of Object.entries(body.textures)) {
      if (path && typeof path === 'string' && !path.startsWith('/textures/')) {
        errors.push(`${prefix} (${body.id}): texture "${key}" path phải bắt đầu bằng "/textures/", nhận: "${path}"`);
      }
    }
  }

  return errors;
}

/**
 * Xác thực tham chiếu parentId — mỗi body có parentId phải trỏ tới id tồn tại.
 * @param {Object[]} bodies
 * @returns {string[]}
 */
function validateParentRefs(bodies) {
  const errors = [];
  const idSet = new Set(bodies.map(b => b.id));

  for (const body of bodies) {
    if (body.parentId && !idSet.has(body.parentId)) {
      errors.push(`[DataLoader] Body "${body.id}": parentId "${body.parentId}" không tồn tại trong danh sách bodies`);
    }
  }

  return errors;
}

/**
 * Chuẩn hóa body từ schema JSON sang format flat tương thích với code hiện tại.
 * Giữ nguyên tất cả thông tin gốc nhưng flatten các trường thường dùng.
 *
 * @param {Object} raw - Body data từ JSON
 * @returns {Object} - Normalized body data
 */
function normalizeBody(raw) {
  const body = {
    // ─── Identity ───
    id: raw.id,
    parentId: raw.parentId || null,
    name: raw.name?.vi || raw.id, // Fallback tên tiếng Việt
    nameEn: raw.name?.en || raw.id,
    type: raw.type,

    // ─── Physical (flatten) ───
    radius: raw.physical?.radius ?? raw.render?.radiusScale ?? 1,

    // ─── Orbit (flatten) ───
    semiMajorAxis: raw.orbit?.semiMajorAxis ?? 0,
    orbitalPeriod: raw.orbit?.orbitalPeriod ?? 1,
    eccentricity: raw.orbit?.eccentricity ?? 0,
    inclination: raw.orbit?.inclination ?? 0,

    // ─── Rotation (flatten) ───
    axialTilt: raw.rotation?.axialTilt ?? 0,
    rotationPeriod: raw.rotation?.rotationPeriod ?? 0,
    oblateness: raw.rotation?.oblateness ?? 0,

    // ─── Textures (giữ nguyên) ───
    textures: raw.textures || null,

    // ─── Atmosphere (normalize color + multi-layer support) ───
    atmosphere: raw.atmosphere ? (raw.atmosphere.layers ? {
      layers: raw.atmosphere.layers.map(l => ({
        color: normalizeColor(l.color),
        opacity: l.opacity,
        power: l.power,
        scale: l.scale,
        side: l.side || 'back',
        scatterStrength: l.scatterStrength ?? 0.4,
      })),
    } : {
      color: normalizeColor(raw.atmosphere.color),
      opacity: raw.atmosphere.opacity,
      power: raw.atmosphere.power,
    }) : null,

    // ─── Rings (giữ nguyên) ───
    rings: raw.rings || null,

    // ─── Render (fallback color + orbit scale for moons) ───
    fallbackColor: normalizeColor(raw.render?.fallbackColor) ?? 0xaaaaaa,
    orbitScale: raw.render?.orbitScale ?? 1,
    displayOrbitRadius: raw.render?.displayOrbitRadius ?? null,
    initialPhaseDeg: raw.render?.initialPhaseDeg ?? 0,
    orbitPlane: raw.render?.orbitPlane ?? null,

    // ─── Derived flags ───
    isMoon: raw.type === 'moon',

    // ─── Image quality flag ───
    hasHighQualityImage: !!(raw.textures?.albedo) || raw.saturnMoon?.lodTier === 'hero',

    // ─── Info (giữ nguyên cho info panel) ───
    info: raw.info || null,

    // ─── Physical raw (cho info panel nâng cao) ───
    physical: raw.physical || null,

    // ─── Giữ reference tới raw data gốc ───
    _raw: raw,
  };

  return body;
}

/**
 * Tải dữ liệu hệ mặt trời từ JSON.
 * @returns {Promise<Object[]>} Mảng bodies đã chuẩn hóa
 */
export async function loadSolarSystemData() {
  const baseUrl = import.meta.env.BASE_URL || '/';
  const url = `${baseUrl}data/solar-system.json`;

  console.log(`[DataLoader] Đang tải dữ liệu từ ${url}...`);

  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    console.error(`[DataLoader] Lỗi mạng khi tải ${url}:`, err);
    throw new Error(`Không thể tải dữ liệu hệ mặt trời: ${err.message}`);
  }

  if (!response.ok) {
    throw new Error(`[DataLoader] HTTP ${response.status} khi tải ${url}`);
  }

  let json;
  try {
    json = await response.json();
  } catch (err) {
    throw new Error(`[DataLoader] JSON parse error: ${err.message}`);
  }

  if (!json.bodies || !Array.isArray(json.bodies)) {
    throw new Error('[DataLoader] Schema error: thiếu trường "bodies" (phải là mảng)');
  }

  // Load thêm saturn-moons catalog
  const catalogUrl = `${baseUrl}data/saturn-moons.catalog.json`;
  try {
    const catalogRes = await fetch(catalogUrl);
    if (catalogRes.ok) {
      const catalogJson = await catalogRes.json();
      if (catalogJson.bodies && Array.isArray(catalogJson.bodies)) {
        json.bodies.push(...catalogJson.bodies);
        console.log(`[DataLoader] Đã merge thêm ${catalogJson.bodies.length} moons từ catalog.`);
      }
    } else {
      console.warn(`[DataLoader] HTTP ${catalogRes.status} khi tải ${catalogUrl}`);
    }
  } catch (err) {
    console.warn(`[DataLoader] Lỗi khi tải catalog: ${err.message}`);
  }

  // Xác thực từng body
  const allErrors = [];
  for (let i = 0; i < json.bodies.length; i++) {
    const errors = validateBody(json.bodies[i], i);
    allErrors.push(...errors);
  }

  // Xác thực parent references
  const parentErrors = validateParentRefs(json.bodies);
  allErrors.push(...parentErrors);

  // Log tất cả lỗi
  if (allErrors.length > 0) {
    console.warn(`[DataLoader] Phát hiện ${allErrors.length} lỗi trong dữ liệu:`);
    for (const err of allErrors) {
      console.warn(`  ⚠ ${err}`);
    }
  }

  // Chuẩn hóa tất cả bodies
  const bodies = json.bodies.map(normalizeBody);

  // Kiểm tra khoảng cách vệ tinh (Phase 6)
  validateMoonDistances(bodies);

  // Kiểm tra duplicate ids
  const ids = bodies.map(b => b.id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicates.length > 0) {
    console.warn(`[DataLoader] ID trùng lặp: ${[...new Set(duplicates)].join(', ')}`);
  }

  console.log(`[DataLoader] Đã tải ${bodies.length} thiên thể thành công.`);

  return bodies;
}

/**
 * Tải cấu hình Ghost Moon System cho Sao Thổ
 */
export async function loadSaturnGhostConfig() {
  const baseUrl = import.meta.env.BASE_URL || '/';
  const url = `${baseUrl}data/saturn-moons.ghost-config.json`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.warn(`[DataLoader] Không thể tải cấu hình Ghost Moons: ${err.message}`);
    return null;
  }
}
