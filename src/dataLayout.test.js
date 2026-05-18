import { describe, expect, it } from 'vitest';
import solarSystem from '../public/data/solar-system.json';

describe('solar system display layout data', () => {
  it('keeps moons outside the parent forbidden zone at pericenter', () => {
    const bodiesById = new Map(solarSystem.bodies.map(body => [body.id, body]));
    const unsafeMoons = [];

    for (const body of solarSystem.bodies) {
      if (body.type !== 'moon' || !body.parentId) continue;

      const parent = bodiesById.get(body.parentId);
      if (!parent) continue;

      const displayOrbitRadius = body.render?.displayOrbitRadius;
      const eccentricity = body.orbit?.eccentricity ?? 0;
      if (typeof displayOrbitRadius !== 'number') continue;

      const pericenter = displayOrbitRadius * (1 - eccentricity);
      const minSafeDistance = (parent.physical?.radius ?? parent.render?.radiusScale ?? 0)
        + (body.physical?.radius ?? body.render?.radiusScale ?? 0)
        + 4;

      if (pericenter <= minSafeDistance) {
        unsafeMoons.push({
          id: body.id,
          parentId: parent.id,
          pericenter,
          minSafeDistance,
        });
      }
    }

    expect(unsafeMoons).toEqual([]);
  });
});
