import * as THREE from 'three';
import { AU } from './constants.js';
import { computeOrbitalPosition } from './kepler.js';

const SOLAR_MASS = 1.989e30;
const YEAR_SECONDS = 31557600;
const G_NORM = (4 * Math.PI * Math.PI * AU * AU * AU) / (YEAR_SECONDS * YEAR_SECONDS);
const MAX_SUBSTEP = 86400;
const SOFTENING = 0.1;

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
      const dt = 60;
      const p1 = computeOrbitalPosition(data, simulationTime - dt);
      const p2 = computeOrbitalPosition(data, simulationTime + dt);
      vx = (p2.x - p1.x) / (2 * dt);
      vy = (p2.y - p1.y) / (2 * dt);
      vz = (p2.z - p1.z) / (2 * dt);
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

  console.log(`[Gravity] Newton engine initialized for ${bodies.length} bodies (G=${G_NORM.toExponential(3)})`);
}

export function updateNewtonGravity(bodies, deltaTime) {
  if (!enabled) return;

  let remaining = deltaTime;
  while (remaining > 0) {
    const step = Math.min(remaining, MAX_SUBSTEP);
    gravitySubstep(step);
    remaining -= step;
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

function gravitySubstep(dt) {
  const entries = getRelevantEntries();
  const acc = new Map();

  for (const [id, s] of entries) {
    if (s.gravityAffected) {
      acc.set(id, { ax: 0, ay: 0, az: 0 });
    }
  }

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

      const force = G_NORM * s_j.massNorm / (distSq + SOFTENING);
      const invDist = dist > 0 ? 1 / dist : 0;

      ai.ax += force * dx * invDist;
      ai.ay += force * dy * invDist;
      ai.az += force * dz * invDist;
    }
  }

  for (const [id, s] of entries) {
    if (!s.gravityAffected) continue;
    const a = acc.get(id);
    if (!a) continue;
    s.vx += a.ax * dt * 0.5;
    s.vy += a.ay * dt * 0.5;
    s.vz += a.az * dt * 0.5;
  }

  for (const [, s] of entries) {
    if (!s.gravityAffected) continue;
    s.px += s.vx * dt;
    s.py += s.vy * dt;
    s.pz += s.vz * dt;
  }

  for (const [, a] of acc) {
    a.ax = 0; a.ay = 0; a.az = 0;
  }

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
      const invDist = dist > 0 ? 1 / dist : 0;

      const force = G_NORM * s_j.massNorm / (distSq + SOFTENING);

      ai.ax += force * dx * invDist;
      ai.ay += force * dy * invDist;
      ai.az += force * dz * invDist;
    }
  }

  for (const [id, s] of entries) {
    if (!s.gravityAffected) continue;
    const a = acc.get(id);
    if (!a) continue;
    s.vx += a.ax * dt * 0.5;
    s.vy += a.ay * dt * 0.5;
    s.vz += a.az * dt * 0.5;
  }
}

export function disableNewtonGravity(bodies, scene) {
  enabled = false;
  state.clear();

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
