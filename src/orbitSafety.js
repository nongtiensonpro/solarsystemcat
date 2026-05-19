import * as THREE from 'three';
import { computeOrbitalPositionInto } from './kepler.js';
import { getDisplayOrbitRadius } from './orbitMath.js';

const SOLAR_PLANET_TYPES = new Set(['terrestrial', 'gas-giant', 'ice-giant']);

const DEFAULTS = {
  moonSafetyMargin: 4,
  moonMaxDriftFactor: 0.5,
  planetMaxDriftFactor: 0.35,
  planetMinSeparation: 25,
  velocityDamping: 0.2,
  warningIntervalMs: 5000,
};

const _world = new THREE.Vector3();
const _parentWorld = new THREE.Vector3();
const _relative = new THREE.Vector3();
const _target = new THREE.Vector3();
const _local = new THREE.Vector3();
const _otherWorld = new THREE.Vector3();
const lastWarningAt = new Map();
const expectedById = new Map();
const expectedVectorById = new Map();
let cachedBodiesRef = null;
let cachedSolarOrbiters = null;
let cachedSolarBands = null;

function hasOrbit(data) {
  return getDisplayOrbitRadius(data) > 0;
}

function warnThrottled(key, message, intervalMs) {
  const now = globalThis.performance?.now ? globalThis.performance.now() : Date.now();
  const last = lastWarningAt.get(key) || 0;
  if (now - last < intervalMs) return;
  lastWarningAt.set(key, now);
  console.warn(message);
}

function getCurrentWorldPosition(body, out) {
  body.pivot.getWorldPosition(out);
  return out;
}

function setWorldPosition(body, worldPosition, options) {
  if (body.pivot.parent) {
    body.pivot.parent.updateMatrixWorld(true);
    _local.copy(worldPosition);
    body.pivot.parent.worldToLocal(_local);
    body.pivot.position.copy(_local);
  } else {
    body.pivot.position.copy(worldPosition);
  }

  body.pivot.updateMatrixWorld(true);

  if (options.newtonGravityActive && options.syncGravityBodyState) {
    options.syncGravityBodyState(body.data.id, worldPosition, {
      dampenVelocity: true,
      velocityDamping: options.velocityDamping,
    });
  }
}

function getOrbitFrame(body, bodyById) {
  const parentBody = body.data.parentId ? bodyById.get(body.data.parentId) : null;
  if (!parentBody) return body.pivot.parent || null;

  if (body.data.isMoon && body.data.orbitPlane === 'parentEquator') {
    return parentBody.tiltGroup || parentBody.pivot;
  }

  return parentBody.pivot || body.pivot.parent || null;
}

function getExpectedWorldPosition(body, bodyById, simulationTime, out) {
  if (!hasOrbit(body.data)) return null;

  computeOrbitalPositionInto(body.data, simulationTime, out);

  const frame = getOrbitFrame(body, bodyById);
  if (frame) {
    frame.updateMatrixWorld(true);
    frame.localToWorld(out);
  }

  return out;
}

function getSafeDirection(currentWorld, expectedWorld, parentWorld, out) {
  out.subVectors(expectedWorld, parentWorld);
  if (out.lengthSq() < 1e-8) {
    out.subVectors(currentWorld, parentWorld);
  }
  if (out.lengthSq() < 1e-8) {
    out.set(1, 0, 0);
  }
  return out.normalize();
}

function guardMoon(body, bodyById, expectedWorld, options, config) {
  const parentBody = bodyById.get(body.data.parentId);
  if (!parentBody || !expectedWorld) return 0;

  getCurrentWorldPosition(body, _world);
  getCurrentWorldPosition(parentBody, _parentWorld);

  const displayRadius = getDisplayOrbitRadius(body.data);
  const minDistance = (parentBody.data.radius || 0) + (body.data.radius || 0) + config.moonSafetyMargin;
  const currentDistance = _relative.subVectors(_world, _parentWorld).length();
  const drift = _world.distanceTo(expectedWorld);
  const maxDrift = Math.max(displayRadius * config.moonMaxDriftFactor, minDistance * 0.5, 2);

  if (currentDistance >= minDistance && drift <= maxDrift) return 0;

  if (currentDistance < minDistance) {
    getSafeDirection(_world, expectedWorld, _parentWorld, _relative);
    _target.copy(_parentWorld).addScaledVector(_relative, minDistance);
  } else {
    _target.copy(expectedWorld);
  }

  setWorldPosition(body, _target, options);
  warnThrottled(
    `moon:${body.data.id}`,
    `[OrbitSafety] Reset moon "${body.data.id}" near parent "${parentBody.data.id}".`,
    config.warningIntervalMs
  );
  return 1;
}

function getSolarOrbiters(bodies) {
  if (cachedBodiesRef === bodies && cachedSolarOrbiters) {
    return cachedSolarOrbiters;
  }

  cachedBodiesRef = bodies;
  cachedSolarBands = null;
  cachedSolarOrbiters = bodies
    .filter(body => SOLAR_PLANET_TYPES.has(body.data.type) && hasOrbit(body.data))
    .sort((a, b) => getDisplayOrbitRadius(a.data) - getDisplayOrbitRadius(b.data));
  return cachedSolarOrbiters;
}

function buildSolarBands(solarOrbiters) {
  if (cachedSolarBands) return cachedSolarBands;

  const bands = new Map();
  for (let i = 0; i < solarOrbiters.length; i++) {
    const body = solarOrbiters[i];
    const orbitRadius = getDisplayOrbitRadius(body.data);
    const prev = solarOrbiters[i - 1] ? getDisplayOrbitRadius(solarOrbiters[i - 1].data) : 0;
    const next = solarOrbiters[i + 1] ? getDisplayOrbitRadius(solarOrbiters[i + 1].data) : null;

    bands.set(body.data.id, {
      min: i === 0 ? Math.max(0, orbitRadius * 0.25) : (prev + orbitRadius) * 0.5,
      max: next === null ? orbitRadius + Math.max(orbitRadius * 0.8, 1000) : (orbitRadius + next) * 0.5,
    });
  }
  cachedSolarBands = bands;
  return bands;
}

function guardSolarBand(body, expectedWorld, band, options, config) {
  if (!expectedWorld || !band) return 0;

  getCurrentWorldPosition(body, _world);
  const currentRadius = _world.length();
  const orbitRadius = getDisplayOrbitRadius(body.data);
  const drift = _world.distanceTo(expectedWorld);
  const maxDrift = Math.max(orbitRadius * config.planetMaxDriftFactor, 40);

  if (currentRadius >= band.min && currentRadius <= band.max && drift <= maxDrift) return 0;

  setWorldPosition(body, expectedWorld, options);
  warnThrottled(
    `planet-band:${body.data.id}`,
    `[OrbitSafety] Reset planet "${body.data.id}" to its orbital band.`,
    config.warningIntervalMs
  );
  return 1;
}

function guardPlanetSpacing(solarOrbiters, expectedById, options, config) {
  let corrections = 0;

  for (let i = 0; i < solarOrbiters.length; i++) {
    const a = solarOrbiters[i];
    getCurrentWorldPosition(a, _world);

    for (let j = i + 1; j < solarOrbiters.length; j++) {
      const b = solarOrbiters[j];
      getCurrentWorldPosition(b, _otherWorld);

      const minDistance = Math.max(
        (a.data.radius || 0) + (b.data.radius || 0) + config.planetMinSeparation,
        config.planetMinSeparation
      );

      if (_world.distanceTo(_otherWorld) >= minDistance) continue;

      const expectedA = expectedById.get(a.data.id);
      const expectedB = expectedById.get(b.data.id);
      if (expectedA) setWorldPosition(a, expectedA, options);
      if (expectedB) setWorldPosition(b, expectedB, options);

      warnThrottled(
        `planet-spacing:${a.data.id}:${b.data.id}`,
        `[OrbitSafety] Separated planets "${a.data.id}" and "${b.data.id}".`,
        config.warningIntervalMs
      );
      corrections += 1;
    }
  }

  return corrections;
}

export function applyOrbitSafety(bodies, bodyById, simulationTime, options = {}) {
  const config = { ...DEFAULTS, ...options.config };
  const runtimeOptions = {
    ...options,
    velocityDamping: options.velocityDamping ?? config.velocityDamping,
  };

  if (options.scene) {
    options.scene.updateMatrixWorld(true);
  }

  expectedById.clear();
  for (const body of bodies) {
    if (body.data.type === 'star' || !hasOrbit(body.data)) continue;
    let expected = expectedVectorById.get(body.data.id);
    if (!expected) {
      expected = new THREE.Vector3();
      expectedVectorById.set(body.data.id, expected);
    }
    if (getExpectedWorldPosition(body, bodyById, simulationTime, expected)) {
      expectedById.set(body.data.id, expected);
    }
  }

  let corrections = 0;

  for (const body of bodies) {
    if (!body.data.isMoon || !body.data.parentId) continue;
    corrections += guardMoon(body, bodyById, expectedById.get(body.data.id), runtimeOptions, config);
  }

  const solarOrbiters = getSolarOrbiters(bodies);
  const bands = buildSolarBands(solarOrbiters);
  for (const body of solarOrbiters) {
    corrections += guardSolarBand(body, expectedById.get(body.data.id), bands.get(body.data.id), runtimeOptions, config);
  }

  corrections += guardPlanetSpacing(solarOrbiters, expectedById, runtimeOptions, config);

  return { corrections };
}
