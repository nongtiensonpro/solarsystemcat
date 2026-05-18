import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { applyOrbitSafety } from './orbitSafety.js';

function makeBody(data) {
  const pivot = new THREE.Object3D();
  const tiltGroup = new THREE.Group();
  pivot.add(tiltGroup);
  return { pivot, tiltGroup, data };
}

describe('applyOrbitSafety', () => {
  it('pushes a moon out of its parent forbidden zone', () => {
    const scene = new THREE.Scene();
    const mars = makeBody({
      id: 'mars',
      type: 'terrestrial',
      radius: 0.532,
      semiMajorAxis: 1.52,
      orbitalPeriod: 687,
      eccentricity: 0,
    });
    const phobos = makeBody({
      id: 'phobos',
      type: 'moon',
      isMoon: true,
      parentId: 'mars',
      radius: 0.273,
      semiMajorAxis: 0.0000627,
      orbitalPeriod: 0.3189,
      eccentricity: 0,
      displayOrbitRadius: 5.5,
      orbitPlane: 'parentEquator',
    });

    scene.add(mars.pivot);
    mars.pivot.position.set(100, 0, 0);
    mars.tiltGroup.add(phobos.pivot);
    phobos.pivot.position.set(0, 0, 0);

    const bodyById = new Map([
      ['mars', mars],
      ['phobos', phobos],
    ]);

    applyOrbitSafety([mars, phobos], bodyById, 0, { scene });

    scene.updateMatrixWorld(true);
    const marsWorld = new THREE.Vector3();
    const phobosWorld = new THREE.Vector3();
    mars.pivot.getWorldPosition(marsWorld);
    phobos.pivot.getWorldPosition(phobosWorld);

    const minDistance = mars.data.radius + phobos.data.radius + 4;
    expect(phobosWorld.distanceTo(marsWorld)).toBeGreaterThanOrEqual(minDistance - 1e-8);
  });

  it('snaps a planet back into its solar orbital band', () => {
    const scene = new THREE.Scene();
    const sun = makeBody({ id: 'sun', type: 'star', radius: 10 });
    const earth = makeBody({
      id: 'earth',
      parentId: 'sun',
      type: 'terrestrial',
      radius: 1,
      semiMajorAxis: 1,
      orbitalPeriod: 365.25,
      eccentricity: 0,
    });
    const mars = makeBody({
      id: 'mars',
      parentId: 'sun',
      type: 'terrestrial',
      radius: 0.532,
      semiMajorAxis: 1.52,
      orbitalPeriod: 687,
      eccentricity: 0,
    });

    scene.add(sun.pivot);
    scene.add(earth.pivot);
    scene.add(mars.pivot);
    earth.pivot.position.set(900, 0, 0);
    mars.pivot.position.set(608, 0, 0);

    const bodyById = new Map([
      ['sun', sun],
      ['earth', earth],
      ['mars', mars],
    ]);

    applyOrbitSafety([sun, earth, mars], bodyById, 0, { scene });

    expect(earth.pivot.position.x).toBeCloseTo(400, 8);
  });

  it('syncs corrected positions back to Newton gravity state', () => {
    const scene = new THREE.Scene();
    const parent = makeBody({
      id: 'jupiter',
      type: 'gas-giant',
      radius: 11.21,
      semiMajorAxis: 5.203,
      orbitalPeriod: 4331,
      eccentricity: 0,
    });
    const moon = makeBody({
      id: 'io',
      type: 'moon',
      isMoon: true,
      parentId: 'jupiter',
      radius: 0.29,
      semiMajorAxis: 0.00282,
      orbitalPeriod: 1.769,
      eccentricity: 0,
      displayOrbitRadius: 22,
      orbitPlane: 'parentEquator',
    });
    const syncGravityBodyState = vi.fn();

    scene.add(parent.pivot);
    parent.tiltGroup.add(moon.pivot);
    moon.pivot.position.set(0, 0, 0);

    const bodyById = new Map([
      ['jupiter', parent],
      ['io', moon],
    ]);

    applyOrbitSafety([parent, moon], bodyById, 0, {
      scene,
      newtonGravityActive: true,
      syncGravityBodyState,
    });

    expect(syncGravityBodyState).toHaveBeenCalledWith(
      'io',
      expect.any(THREE.Vector3),
      expect.objectContaining({ dampenVelocity: true })
    );
  });
});
