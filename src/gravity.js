import * as THREE from 'three';
import { AU } from './constants.js';
import { computeOrbitalVelocity } from './kepler.js';

const SOLAR_MASS = 1.989e30;
const YEAR_SECONDS = 31557600;
const G_NORM = (4 * Math.PI * Math.PI * AU * AU * AU) / (YEAR_SECONDS * YEAR_SECONDS);
const MAX_SUBSTEP = 3600;
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

  let remaining = deltaTime;
  while (remaining > 0) {
    const entries = getRelevantEntries();
    const maxStep = computeAdaptiveStep(entries);
    const step = Math.min(remaining, maxStep);
    gravitySubstep(step);
    remaining -= step;
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
}

function getRelevantEntries() {
  if (focusedBodyId && bodyByIdRef) {
    const group = getFocusedGroupSet(focusedBodyId);
    return Array.from(state.entries()).filter(([id]) => group.has(id));
  }
  return Array.from(state.entries());
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
  const entries = Array.from(state.entries());
  const kinetic = _computeKineticFromEntries(entries);
  const potential = _computePotentialFromEntries(entries);
  return { kinetic, potential, total: kinetic + potential };
}

export function computeSystemAngularMomentum() {
  const entries = Array.from(state.entries());
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
      const accel = G_NORM * totalMass / (distSq + SOFTENING);
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

function computeAdaptiveStep(entries) {
  let maxStep = MAX_SUBSTEP;

  const maxAccel = computeMaxPairwiseAccel(entries);
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
      acc.set(id, { ax: 0, ay: 0, az: 0 });
    }
  }
}

function resetAccelerations(acc) {
  for (const [, a] of acc) {
    a.ax = 0; a.ay = 0; a.az = 0;
  }
}

function computeMinDistSq(entries) {
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
      if (distSq > 0 && distSq < minDistSq) minDistSq = distSq;
    }
  }
  return minDistSq;
}

function getEffectiveSoftening(entries) {
  const minDistSq = computeMinDistSq(entries);
  const baseEpsSq = SOFTENING;
  if (minDistSq === Infinity) return baseEpsSq;
  // Adaptive: ensure softening never exceeds 10% of the closest pair distance
  const adaptiveEpsSq = 0.01 * minDistSq;
  return Math.max(baseEpsSq, adaptiveEpsSq);
}

function computeAccelerations(entries, acc, epsSq) {
  for (let i = 0; i < entries.length; i++) {
    const [id_i, s_i] = entries[i];
    if (!s_i.gravityAffected || s_i.massNorm === 0) continue;
    const ai = acc.get(id_i);
    if (!ai) continue;

    for (let j = 0; j < entries.length; j++) {
      if (i === j) continue;
      const [id_j, s_j] = entries[j];
      if (s_j.massNorm === 0) continue;

      const dx = s_j.px - s_i.px;
      const dy = s_j.py - s_i.py;
      const dz = s_j.pz - s_i.pz;
      const distSq = dx * dx + dy * dy + dz * dz;
      const dist = Math.sqrt(distSq);

      const force = G_NORM * s_j.massNorm / (distSq + epsSq);
      const invDist = dist > 0 ? 1 / dist : 0;

      ai.ax += force * dx * invDist;
      ai.ay += force * dy * invDist;
      ai.az += force * dz * invDist;

      if (usePostNewtonian) {
        const vx = s_i.vx - s_j.vx;
        const vy = s_i.vy - s_j.vy;
        const vz = s_i.vz - s_j.vz;
        const v2 = vx * vx + vy * vy + vz * vz;
        const rDotV = dx * vx + dy * vy + dz * vz;
        const termA = 4 * G_NORM * s_j.massNorm / (dist * C_LIGHT_SQ) - v2 / C_LIGHT_SQ;
        const termB = 4 * rDotV / (dist * C_LIGHT_SQ);
        ai.ax += force * (termA * dx * invDist + termB * vx);
        ai.ay += force * (termA * dy * invDist + termB * vy);
        ai.az += force * (termA * dz * invDist + termB * vz);
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

function gravitySubstep(dt) {
  const entries = getRelevantEntries();
  const acc = new Map();
  initAccelerations(entries, acc);

  const currentEpsSq = getEffectiveSoftening(entries);

  // Yoshida 4th-order symplectic: S₄(h) = S₂(w₁·h) ∘ S₂(w₀·h) ∘ S₂(w₁·h)
  // 7-stage composition: kick(c₁), drift(d₁), kick(c₂), drift(d₂),
  //                      kick(c₂), drift(d₁), kick(c₁)

  computeAccelerations(entries, acc, currentEpsSq);
  applyVelocityKick(entries, acc, YOSHIDA_C1 * dt);
  applyPositionDrift(entries, YOSHIDA_D1 * dt);

  resetAccelerations(acc);
  computeAccelerations(entries, acc, currentEpsSq);
  applyVelocityKick(entries, acc, YOSHIDA_C2 * dt);
  applyPositionDrift(entries, YOSHIDA_D2 * dt);

  resetAccelerations(acc);
  computeAccelerations(entries, acc, currentEpsSq);
  applyVelocityKick(entries, acc, YOSHIDA_C2 * dt);
  applyPositionDrift(entries, YOSHIDA_D1 * dt);

  resetAccelerations(acc);
  computeAccelerations(entries, acc, currentEpsSq);
  applyVelocityKick(entries, acc, YOSHIDA_C1 * dt);

  checkCollisions(entries);
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

// ── Test helpers ──
export { gravitySubstep as _gravitySubstep };
