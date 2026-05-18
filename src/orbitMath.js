import { AU } from './constants.js';

export function getDisplayOrbitRadius(data) {
  if (!data) return 0;
  return data.displayOrbitRadius ?? (data.semiMajorAxis * AU * (data.orbitScale || 1));
}

export function getDisplayPericenter(data) {
  return getDisplayOrbitRadius(data) * (1 - (data.eccentricity || 0));
}
