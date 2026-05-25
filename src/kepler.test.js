import { describe, it, expect } from 'vitest';
import {
  solveKepler,
  solveKeplerSinCos,
  scratchSinCos,
  computeOrbitalPositionInto,
  sampleOrbitPath,
} from './kepler.js';

const AU = 149597870.7;

function keplerResidual(M, e, E) {
  return E - e * Math.sin(E) - M;
}

describe('solveKepler fast-path', () => {
  const cases = [
    { M: 1.2, e: 0.0068, label: 'Earth-like' },
    { M: 0.5, e: 0.0934, label: 'Mars' },
    { M: 2.1, e: 0.0167, label: 'Venus' },
    { M: 4.0, e: 0.0542, label: 'Jupiter' },
    { M: 0.8, e: 0.0472, label: 'Saturn' },
    { M: 3.3, e: 0.0086, label: 'Uranus' },
  ];

  for (const { M, e, label } of cases) {
    it(`residual < 1e-10 for ${label} (e=${e})`, () => {
      const E = solveKepler(M, e);
      expect(Math.abs(keplerResidual(M, e, E))).toBeLessThan(1e-10);
    });
  }
});

describe('solveKeplerSinCos linear update', () => {
  it('sin/cos khớp Math.sin/cos tại E sau fast-path', () => {
    const M = 1.7;
    const e = 0.054;
    solveKeplerSinCos(M, e);
    const E = solveKepler(M, e);
    expect(scratchSinCos.sinE).toBeCloseTo(Math.sin(E), 8);
    expect(scratchSinCos.cosE).toBeCloseTo(Math.cos(E), 8);
  });
});

describe('computeOrbitalPositionInto', () => {
  it('vị trí hợp lý cho Trái Đất mô phỏng', () => {
    const data = {
      semiMajorAxis: 1,
      eccentricity: 0.0167,
      inclination: 0,
      longitudeAscending: 0,
      argumentPeriapsis: 0,
      orbitalPeriod: 365.25,
      initialPhaseDeg: 0,
      displayOrbitRadius: AU,
    };
    const out = { x: 0, y: 0, z: 0 };
    computeOrbitalPositionInto(data, 0, out);
    const r = Math.hypot(out.x, out.y, out.z);
    expect(r).toBeGreaterThan(AU * 0.98);
    expect(r).toBeLessThan(AU * 1.02);
  });
});

describe('sampleOrbitPath', () => {
  it('điểm đầu và cuối gần nhau trên quỹ đạo đóng (e nhỏ)', () => {
    const data = {
      semiMajorAxis: 1,
      eccentricity: 0.01,
      inclination: 7,
      longitudeAscending: 10,
      argumentPeriapsis: 20,
      orbitalPeriod: 365,
      displayOrbitRadius: 100,
    };
    const buf = sampleOrbitPath(data, 64);
    const n = 65;
    const dx = buf[0] - buf[(n - 1) * 3];
    const dy = buf[1] - buf[(n - 1) * 3 + 1];
    const dz = buf[2] - buf[(n - 1) * 3 + 2];
    expect(Math.hypot(dx, dy, dz)).toBeLessThan(0.5);
  });
});
