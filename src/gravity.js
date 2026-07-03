import * as THREE from 'three';
import { AU } from './constants.js';
import { computeOrbitalVelocity } from './kepler.js';

const SOLAR_MASS = 1.989e30;
const YEAR_SECONDS = 31557600;
const G_NORM = (4 * Math.PI * Math.PI * AU * AU * AU) / (YEAR_SECONDS * YEAR_SECONDS);
const MAX_SUBSTEP = 3600;
const MAX_SIM_PER_FRAME = 86400;
const SOFTENING = 0.01;

// ── Adaptive Timestep ──
const MIN_SUBSTEP = 1;
const ADAPTIVE_SAFETY_FACTOR = 0.25;
const SUBSTEP_MOON_REDUCTION = 0.5;

// ── Post-Newtonian 1PN ──
const C_LIGHT = 0.801585;
const C_LIGHT_SQ = C_LIGHT * C_LIGHT;
let usePostNewtonian = false;

export function setPostNewtonianEnabled(enabled) {
  usePostNewtonian = enabled;
}

// ── Collision Detection ──
const COLLISION_OVERLAP_FRACTION = 0.5;

// ── Yoshida 4th-Order Symplectic Integrator ──
// S₄(h) = S₂(w₁·h) ∘ S₂(w₀·h) ∘ S₂(w₁·h) where w₁ = 1/(2-∛2), w₀ = -∛2/(2-∛2)
// Combined 7-stage coefficients: kick(cᵢ·dt), drift(dᵢ·dt)
const YOSHIDA_C1 = 0.6756035959798289;
const YOSHIDA_D1 = 1.3512071919596578;
const YOSHIDA_C2 = -0.17560359597982885;
const YOSHIDA_D2 = -1.7024143839193155;

// ── Diagnostics & Adaptive Step Tracking ──
let initialTotalEnergy = null;
let energyLogCount = 0;
const ENERGY_LOG_INTERVAL = 60;
const ENERGY_DRIFT_WARNING_THRESHOLD = 1e-6;

let enabled = false;
let focusedBodyId = null;
let bodyByIdRef = null;
const state = new Map();
const savedParents = new Map();

// ── Pre-allocated work areas (zero GC) ──
const _accelMap = new Map();
const _entriesCache = [];
const _savedStatePool = [];
const _filteredEntriesCache = [];
const _pointPool = [];
let _pointPoolIdx = 0;

function getPointFromPool(x, y, z) {
  if (_pointPoolIdx >= _pointPool.length) {
    _pointPool.push({ x: 0, y: 0, z: 0 });
  }
  const p = _pointPool[_pointPoolIdx++];
  p.x = x; p.y = y; p.z = z;
  return p;
}

export function isNewtonGravityEnabled() {
  return enabled;
}

export function setFocusedBodyId(id) {
  focusedBodyId = id;
}

export function getFocusedBodyIds() {
  if (!focusedBodyId || !bodyByIdRef) return null;
  return getFocusedGroupSet(focusedBodyId);
}

function getFocusedGroupSet(bodyId) {
  const group = new Set();
  const body = bodyByIdRef.get(bodyId);
  if (!body) return group;

  group.add(bodyId);

  if (body.data.type === 'star') {
    for (const [id, b] of bodyByIdRef) {
      if (b.data.type !== 'star') group.add(id);
    }
    return group;
  }

  if (body.data.isMoon && body.data.parentId) {
    group.add(body.data.parentId);
    group.add('sun');
    return group;
  }

  if (body.data.parentId) {
    group.add(body.data.parentId);
  }
  group.add('sun');
  for (const [id, b] of bodyByIdRef) {
    if (b.data.parentId === bodyId && b.data.isMoon) group.add(id);
  }

  return group;
}

export function initNewtonGravity(bodies, scene, simulationTime, bodyById) {
  enabled = true;
  bodyByIdRef = bodyById;
  state.clear();
  savedParents.clear();

  for (const body of bodies) {
    const data = body.data;
    const worldPos = new THREE.Vector3();
    body.pivot.getWorldPosition(worldPos);

    const massNorm = (data.physical && data.physical.massKg) ? data.physical.massKg / SOLAR_MASS : 0;
    const gravityAffected = data.type !== 'star';

    let vx = 0, vy = 0, vz = 0;
    if (gravityAffected && data.semiMajorAxis > 0) {
      const v = computeOrbitalVelocity(data, simulationTime);
      vx = v.vx; vy = v.vy; vz = v.vz;
    }

    state.set(data.id, {
      px: worldPos.x, py: worldPos.y, pz: worldPos.z,
      vx, vy, vz,
      massNorm,
      gravityAffected
    });

    if (data.parentId) {
      savedParents.set(data.id, body.pivot.parent);
      scene.add(body.pivot);
      body.pivot.position.copy(worldPos);
    }
  }

  const initEnergy = computeSystemEnergy();
  initialTotalEnergy = initEnergy.total;
  energyLogCount = 0;

  console.log(`[Gravity] Newton engine initialized for ${bodies.length} bodies ` +
    `(E=${initEnergy.total.toExponential(6)}, K=${initEnergy.kinetic.toExponential(6)}, U=${initEnergy.potential.toExponential(6)})`);
}

export function updateNewtonGravity(bodies, deltaTime) {
  if (!enabled) return;

  const entries = getRelevantEntries();
  const { epsSq, maxAccel } = computeAdaptiveParams(entries);

  let remaining = Math.min(deltaTime, MAX_SIM_PER_FRAME);
  const MAX_ITERATIONS = 300;
  let iterationCount = 0;

  while (remaining > 0 && iterationCount < MAX_ITERATIONS) {
    let maxStep = computeAdaptiveStep(entries, maxAccel);
    
    // Safety cap: adjust step size if it's too small to prevent browser freeze
    const minStepAllowed = remaining / (MAX_ITERATIONS - iterationCount);
    if (maxStep < minStepAllowed) {
      maxStep = minStepAllowed;
    }

    const step = Math.min(remaining, maxStep);
    gravitySubstep(step, entries, epsSq);
    remaining -= step;
    iterationCount++;
  }

  energyLogCount++;
  if (initialTotalEnergy !== null && energyLogCount % ENERGY_LOG_INTERVAL === 0) {
    const energy = computeSystemEnergy();
    const relativeDrift = Math.abs((energy.total - initialTotalEnergy) / initialTotalEnergy);
    if (relativeDrift > ENERGY_DRIFT_WARNING_THRESHOLD) {
      console.warn(
        `[Gravity] Energy drift: ${(relativeDrift * 100).toExponential(3)}% ` +
        `(E=${energy.total.toExponential(6)}, ΔE=${(energy.total - initialTotalEnergy).toExponential(6)})`
      );
    }
  }

  const activeIds = focusedBodyId && bodyByIdRef ? getFocusedGroupSet(focusedBodyId) : null;

  for (const body of bodies) {
    if (activeIds && !activeIds.has(body.data.id)) continue;
    const s = state.get(body.data.id);
    if (s) {
      body.pivot.position.set(s.px, s.py, s.pz);
    }
  }

  // Chỉ kiểm tra va chạm 15 frames một lần ở main loop thay vì mỗi substep
  if (energyLogCount % 15 === 0) {
    checkCollisions(entries);
  }
}

export function syncGravityBodyState(bodyId, position, options = {}) {
  const s = state.get(bodyId);
  if (!s || !position) return false;

  s.px = position.x;
  s.py = position.y;
  s.pz = position.z;

  if (options.velocity) {
    s.vx = options.velocity.x;
    s.vy = options.velocity.y;
    s.vz = options.velocity.z;
  } else if (options.dampenVelocity) {
    const damping = options.velocityDamping ?? 0.25;
    s.vx *= damping;
    s.vy *= damping;
    s.vz *= damping;
  }

  return true;
}

function getRelevantEntries() {
  if (focusedBodyId && bodyByIdRef) {
    const group = getFocusedGroupSet(focusedBodyId);
    _entriesCache.length = 0;
    for (const entry of state) {
      if (group.has(entry[0])) _entriesCache.push(entry);
    }
    return _entriesCache;
  }
  _entriesCache.length = 0;
  for (const entry of state) {
    _entriesCache.push(entry);
  }
  return _entriesCache;
}

// ── Energy & Angular Momentum Diagnostics ──

export function _computeKineticFromEntries(entries) {
  let kinetic = 0;
  for (const [, s] of entries) {
    if (s.gravityAffected && s.massNorm > 0) {
      const v2 = s.vx * s.vx + s.vy * s.vy + s.vz * s.vz;
      kinetic += 0.5 * s.massNorm * v2;
    }
  }
  return kinetic;
}

export function _computePotentialFromEntries(entries) {
  let potential = 0;
  for (let i = 0; i < entries.length; i++) {
    const [, s_i] = entries[i];
    if (s_i.massNorm === 0) continue;
    for (let j = i + 1; j < entries.length; j++) {
      const [, s_j] = entries[j];
      if (s_j.massNorm === 0) continue;
      const dx = s_j.px - s_i.px;
      const dy = s_j.py - s_i.py;
      const dz = s_j.pz - s_i.pz;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > 0) {
        potential -= G_NORM * s_i.massNorm * s_j.massNorm / dist;
      }
    }
  }
  return potential;
}

export function computeSystemEnergy() {
  const entries = getRelevantEntries();
  const kinetic = _computeKineticFromEntries(entries);
  const potential = _computePotentialFromEntries(entries);
  return { kinetic, potential, total: kinetic + potential };
}

export function computeSystemAngularMomentum() {
  const entries = getRelevantEntries();
  let Lx = 0, Ly = 0, Lz = 0;
  for (const [, s] of entries) {
    if (s.gravityAffected && s.massNorm > 0) {
      Lx += s.massNorm * (s.py * s.vz - s.pz * s.vy);
      Ly += s.massNorm * (s.pz * s.vx - s.px * s.vz);
      Lz += s.massNorm * (s.px * s.vy - s.py * s.vx);
    }
  }
  const magnitude = Math.sqrt(Lx * Lx + Ly * Ly + Lz * Lz);
  return { x: Lx, y: Ly, z: Lz, magnitude };
}

export function getDiagnostics() {
  const energy = computeSystemEnergy();
  const angMom = computeSystemAngularMomentum();
  return {
    energy,
    angularMomentum: angMom,
    relativeDrift: initialTotalEnergy !== null
      ? Math.abs((energy.total - initialTotalEnergy) / initialTotalEnergy)
      : null,
    bodyCount: state.size
  };
}

// ── Adaptive Timestep ──

export function computeMaxPairwiseAccel(entries) {
  let maxAccel = 0;
  for (let i = 0; i < entries.length; i++) {
    const [, s_i] = entries[i];
    if (s_i.massNorm === 0) continue;
    for (let j = i + 1; j < entries.length; j++) {
      const [, s_j] = entries[j];
      if (s_j.massNorm === 0) continue;
      const dx = s_j.px - s_i.px;
      const dy = s_j.py - s_i.py;
      const dz = s_j.pz - s_i.pz;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < 1e-12) continue;
      const totalMass = s_i.massNorm + s_j.massNorm;
      const accel = G_NORM * totalMass / distSq;
      if (accel > maxAccel) maxAccel = accel;
    }
  }
  return maxAccel;
}

function hasActiveMoons(entries) {
  if (!bodyByIdRef) return false;
  for (const [id] of entries) {
    const body = bodyByIdRef.get(id);
    if (body && (body.data.isMoon || body.data.type === 'moon')) return true;
  }
  return false;
}

// ── Combined single-pass: computes both maxAccel and epsSq ──
function computeAdaptiveParams(entries) {
  let maxAccel = 0;
  let minDistSq = Infinity;
  for (let i = 0; i < entries.length; i++) {
    const [, s_i] = entries[i];
    if (s_i.massNorm === 0) continue;
    for (let j = i + 1; j < entries.length; j++) {
      const [, s_j] = entries[j];
      if (s_j.massNorm === 0) continue;
      const dx = s_j.px - s_i.px;
      const dy = s_j.py - s_i.py;
      const dz = s_j.pz - s_i.pz;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < 1e-12) continue;
      if (distSq < minDistSq) minDistSq = distSq;
      const totalMass = s_i.massNorm + s_j.massNorm;
      const accel = G_NORM * totalMass / distSq;
      if (accel > maxAccel) maxAccel = accel;
    }
  }
  const baseEpsSq = SOFTENING;
  const epsSq = minDistSq === Infinity
    ? baseEpsSq
    : Math.max(baseEpsSq, 0.01 * minDistSq);
  return { epsSq, maxAccel };
}

function computeAdaptiveStep(entries, maxAccel) {
  let maxStep = MAX_SUBSTEP;

  if (maxAccel > 0) {
    maxStep = Math.max(MIN_SUBSTEP, Math.min(maxStep, ADAPTIVE_SAFETY_FACTOR * Math.sqrt(SOFTENING / maxAccel)));
  }

  if (hasActiveMoons(entries)) {
    maxStep = Math.max(MIN_SUBSTEP, maxStep * SUBSTEP_MOON_REDUCTION);
  }

  return maxStep;
}

// ── Force computation helpers ──

function initAccelerations(entries, acc) {
  for (const [id, s] of entries) {
    if (s.gravityAffected) {
      const existing = acc.get(id);
      if (existing) {
        existing.ax = 0; existing.ay = 0; existing.az = 0;
      } else {
        acc.set(id, { ax: 0, ay: 0, az: 0 });
      }
    }
  }
}

function resetAccelerations(acc) {
  for (const [, a] of acc) {
    a.ax = 0; a.ay = 0; a.az = 0;
  }
}

function computeAccelerations(entries, acc, epsSq) {
  for (let i = 0; i < entries.length; i++) {
    const [id_i, s_i] = entries[i];
    if (s_i.massNorm === 0) continue;
    const ai = s_i.gravityAffected ? acc.get(id_i) : null;
    const px_i = s_i.px, py_i = s_i.py, pz_i = s_i.pz;

    for (let j = i + 1; j < entries.length; j++) {
      const [id_j, s_j] = entries[j];
      if (s_j.massNorm === 0) continue;

      const dx = s_j.px - px_i;
      const dy = s_j.py - py_i;
      const dz = s_j.pz - pz_i;
      const distSq = dx * dx + dy * dy + dz * dz;
      const dist = Math.sqrt(distSq);
      if (dist < 1e-15) continue;
      const invDist = 1 / dist;

      // Gia tốc cho i do j gây ra
      const force_i = G_NORM * s_j.massNorm / (distSq + epsSq);
      if (ai) {
        ai.ax += force_i * dx * invDist;
        ai.ay += force_i * dy * invDist;
        ai.az += force_i * dz * invDist;
      }

      // Gia tốc cho j do i gây ra (Định luật 3 Newton)
      if (s_j.gravityAffected) {
        const aj = acc.get(id_j);
        if (aj) {
          const force_j = G_NORM * s_i.massNorm / (distSq + epsSq);
          aj.ax -= force_j * dx * invDist;
          aj.ay -= force_j * dy * invDist;
          aj.az -= force_j * dz * invDist;
        }
      }

      if (usePostNewtonian) {
        const vx = s_i.vx - s_j.vx;
        const vy = s_i.vy - s_j.vy;
        const vz = s_i.vz - s_j.vz;
        const v2 = vx * vx + vy * vy + vz * vz;
        const rDotV = dx * vx + dy * vy + dz * vz;

        if (ai) {
          const termA_i = 4 * G_NORM * s_j.massNorm / (dist * C_LIGHT_SQ) - v2 / C_LIGHT_SQ;
          const termB = 4 * rDotV / (dist * C_LIGHT_SQ);
          ai.ax += force_i * (termA_i * dx * invDist + termB * vx);
          ai.ay += force_i * (termA_i * dy * invDist + termB * vy);
          ai.az += force_i * (termA_i * dz * invDist + termB * vz);
        }

        if (s_j.gravityAffected) {
          const aj = acc.get(id_j);
          if (aj) {
            const force_j = G_NORM * s_i.massNorm / (distSq + epsSq);
            const termA_j = 4 * G_NORM * s_i.massNorm / (dist * C_LIGHT_SQ) - v2 / C_LIGHT_SQ;
            const termB = 4 * rDotV / (dist * C_LIGHT_SQ);
            aj.ax -= force_j * (termA_j * dx * invDist + termB * vx);
            aj.ay -= force_j * (termA_j * dy * invDist + termB * vy);
            aj.az -= force_j * (termA_j * dz * invDist + termB * vz);
          }
        }
      }
    }
  }
}

function applyVelocityKick(entries, acc, kickDt) {
  for (const [id, s] of entries) {
    if (!s.gravityAffected) continue;
    const a = acc.get(id);
    if (!a) continue;
    s.vx += a.ax * kickDt;
    s.vy += a.ay * kickDt;
    s.vz += a.az * kickDt;
  }
}

function applyPositionDrift(entries, driftDt) {
  for (const [, s] of entries) {
    if (!s.gravityAffected) continue;
    s.px += s.vx * driftDt;
    s.py += s.vy * driftDt;
    s.pz += s.vz * driftDt;
  }
}

function checkCollisions(entries) {
  if (!bodyByIdRef) return;
  for (let i = 0; i < entries.length; i++) {
    const [id_i, s_i] = entries[i];
    if (s_i.massNorm === 0) continue;
    const body_i = bodyByIdRef.get(id_i);
    if (!body_i) continue;
    const r_i = body_i.data.radius || 0;
    if (r_i <= 0) continue;

    for (let j = i + 1; j < entries.length; j++) {
      const [id_j, s_j] = entries[j];
      if (s_j.massNorm === 0) continue;
      const body_j = bodyByIdRef.get(id_j);
      if (!body_j) continue;
      const r_j = body_j.data.radius || 0;
      if (r_j <= 0) continue;

      const dx = s_j.px - s_i.px;
      const dy = s_j.py - s_i.py;
      const dz = s_j.pz - s_i.pz;
      const distSq = dx * dx + dy * dy + dz * dz;
      const overlapDist = (r_i + r_j) * COLLISION_OVERLAP_FRACTION;

      if (distSq < overlapDist * overlapDist) {
        const dist = Math.sqrt(distSq);
        console.warn(
          `[Collision] ${id_i} ↔ ${id_j}: ` +
          `dist=${dist.toFixed(4)}, r_sum=${(r_i + r_j).toFixed(4)}`
        );
      }
    }
  }
}

function gravitySubstep(dt, entries, epsSq) {
  const acc = _accelMap;
  initAccelerations(entries, acc);

  // Yoshida 4th-order symplectic: S₄(h) = S₂(w₁·h) ∘ S₂(w₀·h) ∘ S₂(w₁·h)
  // 7-stage composition: kick(c₁), drift(d₁), kick(c₂), drift(d₂),
  //                      kick(c₂), drift(d₁), kick(c₁)

  computeAccelerations(entries, acc, epsSq);
  applyVelocityKick(entries, acc, YOSHIDA_C1 * dt);
  applyPositionDrift(entries, YOSHIDA_D1 * dt);

  resetAccelerations(acc);
  computeAccelerations(entries, acc, epsSq);
  applyVelocityKick(entries, acc, YOSHIDA_C2 * dt);
  applyPositionDrift(entries, YOSHIDA_D2 * dt);

  resetAccelerations(acc);
  computeAccelerations(entries, acc, epsSq);
  applyVelocityKick(entries, acc, YOSHIDA_C2 * dt);
  applyPositionDrift(entries, YOSHIDA_D1 * dt);

  resetAccelerations(acc);
  computeAccelerations(entries, acc, epsSq);
  applyVelocityKick(entries, acc, YOSHIDA_C1 * dt);
}

export function disableNewtonGravity(bodies, scene) {
  enabled = false;
  state.clear();
  initialTotalEnergy = null;

  for (const body of bodies) {
    const origParent = savedParents.get(body.data.id);
    if (origParent) {
      body.pivot.position.set(0, 0, 0);
      origParent.add(body.pivot);
    }
  }

  savedParents.clear();
  console.log('[Gravity] Newton engine disabled, reverted to Kepler');
}

// ── N-body Trajectory Prediction ──
// D? ?oán qu? ??o t??ng lai b?ng cách tích phân forward,
// sau ?ó khôi ph?c l?i tr?ng thái g?c.

const PREDICT_MAX_STEPS = 1200;
const PREDICT_MAX_STEPS_LONG = 3000;

/**
* T?nh s? b??c tích phân c?n thi?t ?? d? ?oán ?úng 1 chu k? qu? ??o.
* Dùng cho thiên th? có chu k? dài (Halley 75 n?m).
*/
function computePredictionSteps(bodyId) {
  if (!bodyByIdRef) return PREDICT_MAX_STEPS;
  const body = bodyByIdRef.get(bodyId);
  if (!body?.data?.orbitalPeriod || body.data.orbitalPeriod <= 1000) {
    return PREDICT_MAX_STEPS;
  }
  const periodSeconds = body.data.orbitalPeriod * 86400;
  const estimatedStep = 1800;
  const needed = Math.ceil(periodSeconds / estimatedStep);
  return Math.min(PREDICT_MAX_STEPS_LONG, Math.max(PREDICT_MAX_STEPS, needed));
}

/**
* Tích phân forward đơn luồng tích hợp song song cho nhiều thiên thể cần dự đoán.
* @param {Array<{bodyId: string, numPoints: number, maxSteps?: number}>} configs
* @returns {Map<string, Array<{x:number, y:number, z:number}>>} Map chứa tọa độ dự đoán
*/
export function predictTrajectories(configs) {
  if (configs.length === 0) return new Map();

  _pointPoolIdx = 0;

  // 1. Lưu trạng thái hiện tại của toàn bộ hệ thống (dùng pool để tránh allocation)
  let savedIdx = 0;
  for (const [id, s] of state) {
    let saved = _savedStatePool[savedIdx];
    if (!saved) {
      saved = { id: '', px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, massNorm: 0, gravityAffected: false };
      _savedStatePool.push(saved);
    }
    saved.id = id;
    saved.px = s.px; saved.py = s.py; saved.pz = s.pz;
    saved.vx = s.vx; saved.vy = s.vy; saved.vz = s.vz;
    saved.massNorm = s.massNorm;
    saved.gravityAffected = s.gravityAffected;
    savedIdx++;
  }
  const savedStateLength = savedIdx;

  // 2. Chuẩn bị dữ liệu tích phân riêng cho các thiên thể đích và xác định globalMaxSteps
  let globalMaxSteps = 0;
  const bodyData = [];
  const neededIds = new Set(['sun']); // Luôn bao gồm Mặt Trời

  for (const config of configs) {
    const { bodyId, numPoints } = config;
    if (!state.has(bodyId)) continue;
    
    let maxSteps = config.maxSteps;
    if (maxSteps === null || maxSteps === undefined) {
      maxSteps = computePredictionSteps(bodyId);
    }
    if (maxSteps <= 0) continue;
    if (maxSteps > globalMaxSteps) globalMaxSteps = maxSteps;
    
    const recordInterval = Math.max(1, Math.floor(maxSteps / numPoints));
    bodyData.push({ bodyId, maxSteps, recordInterval, trajectory: [] });
    neededIds.add(bodyId);
  }

  // 3. Tối ưu hóa: Chỉ tích phân các thiên thể thực sự cần thiết cho quỹ đạo đang xét (reuse mảng lọc)
  _filteredEntriesCache.length = 0;
  for (const entry of state) {
    if (neededIds.has(entry[0])) {
      _filteredEntriesCache.push(entry);
    }
  }

  // 4. Chạy mô phỏng tích phân N-body duy nhất một lượt
  if (globalMaxSteps > 0 && _filteredEntriesCache.length > 0) {
    const { epsSq, maxAccel } = computeAdaptiveParams(_filteredEntriesCache);
    for (let i = 0; i < globalMaxSteps; i++) {
      const stepSize = computeAdaptiveStep(_filteredEntriesCache, maxAccel);
      gravitySubstep(stepSize, _filteredEntriesCache, epsSq);

      // Ghi lại tọa độ cho từng thiên thể theo chu kỳ riêng (dùng pool)
      for (let j = 0; j < bodyData.length; j++) {
        const bd = bodyData[j];
        if (i < bd.maxSteps && i % bd.recordInterval === 0) {
          const s = state.get(bd.bodyId);
          if (s) bd.trajectory.push(getPointFromPool(s.px, s.py, s.pz));
        }
      }
    }
  }

  // 5. Khôi phục lại trạng thái ban đầu của hệ thống
  for (let i = 0; i < savedStateLength; i++) {
    const saved = _savedStatePool[i];
    const s = state.get(saved.id);
    if (s) {
      s.px = saved.px; s.py = saved.py; s.pz = saved.pz;
      s.vx = saved.vx; s.vy = saved.vy; s.vz = saved.vz;
      s.massNorm = saved.massNorm;
      s.gravityAffected = saved.gravityAffected;
    }
  }

  // 6. Trả về Map kết quả
  const result = new Map();
  for (const bd of bodyData) {
    result.set(bd.bodyId, bd.trajectory);
  }
  return result;
}

/**
* Tích phân forward t? tr?ng thái hi?n t?i, ghi l?i qu? ??o c?a bodyId.
* @param {string} bodyId - ID c?a thi?n th? c?n d? ?oán
* @param {number} numPoints - S? ?i?m qu? ??o mong mu?n
* @param {number} [maxSteps=null] - S? b??c tích phân t?i ?a (null = t? tính)
* @returns {Array<{x:number,y:number,z:number}>} M?ng t?a ??
*/
export function predictTrajectory(bodyId, numPoints, maxSteps = null) {
  const res = predictTrajectories([{ bodyId, numPoints, maxSteps }]);
  return res.get(bodyId) || [];
}

// ── Test helpers ──
export { gravitySubstep as _gravitySubstep };
