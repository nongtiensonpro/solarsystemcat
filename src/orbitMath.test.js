import { describe, expect, it } from 'vitest';
import { getDisplayOrbitRadius, getDisplayPericenter } from './orbitMath.js';
import { AU } from './constants.js';

describe('orbitMath', () => {
  it('uses displayOrbitRadius when present', () => {
    const data = {
      semiMajorAxis: 0.0000627,
      orbitScale: 1,
      displayOrbitRadius: 5.5,
      eccentricity: 0.0151,
    };

    expect(getDisplayOrbitRadius(data)).toBe(5.5);
    expect(getDisplayPericenter(data)).toBeCloseTo(5.5 * (1 - 0.0151), 10);
  });

  it('falls back to physical AU scaling', () => {
    const data = {
      semiMajorAxis: 1,
      orbitScale: 2,
      eccentricity: 0.1,
    };

    expect(getDisplayOrbitRadius(data)).toBe(2 * AU);
    expect(getDisplayPericenter(data)).toBeCloseTo(2 * AU * 0.9, 10);
  });
});
