import * as THREE from 'three';

const SOLAR_MASS = 1.989e30;
const RESOLUTION = 64;
const EXTENT = 1800;
const AMPLITUDE = 14;
const MIN_MASS = 1e20;

let enabled = false;
let gridGroup = null;
let posAttr = null;
let colorAttr = null;
let geometry = null;

export function isSpacetimeGridEnabled() {
  return enabled;
}

export function initSpacetimeGrid(scene) {
  if (gridGroup) return;

  gridGroup = new THREE.Group();
  gridGroup.name = 'spacetime_grid';

  const seg = RESOLUTION;
  const half = EXTENT / 2;
  const verts = [];
  const cols = [];
  const indices = [];

  for (let i = 0; i <= seg; i++) {
    for (let j = 0; j <= seg; j++) {
      verts.push(-half + (i / seg) * EXTENT, 0, -half + (j / seg) * EXTENT);
      cols.push(0.27, 0.53, 1.0);
    }
  }

  for (let i = 0; i <= seg; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const b = i * (seg + 1) + j + 1;
      indices.push(a, b);
    }
  }

  for (let j = 0; j <= seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = i * (seg + 1) + j;
      const b = (i + 1) * (seg + 1) + j;
      indices.push(a, b);
    }
  }

  geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geometry.setIndex(indices);

  posAttr = geometry.attributes.position;
  colorAttr = geometry.attributes.color;

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const lines = new THREE.LineSegments(geometry, material);
  gridGroup.add(lines);

  scene.add(gridGroup);
  gridGroup.visible = false;
}

export function setSpacetimeGridEnabled(scene, value, bodies) {
  if (!gridGroup) initSpacetimeGrid(scene);
  enabled = value;
  if (gridGroup) gridGroup.visible = value;
  if (value && bodies) {
    updateSpacetimeGrid(bodies);
  }
}

export function updateSpacetimeGrid(bodies) {
  if (!enabled || !posAttr || !colorAttr) return;

  const pos = posAttr.array;
  const col = colorAttr.array;
  const seg = RESOLUTION;
  const half = EXTENT / 2;

  const massive = bodies.filter(b => {
    const m = b.data.physical?.massKg;
    return m && m > MIN_MASS;
  });

  const tempVec = new THREE.Vector3();
  let maxDisp = 0;
  const disps = new Float32Array((seg + 1) * (seg + 1));

  let idx = 0;
  for (let i = 0; i <= seg; i++) {
    for (let j = 0; j <= seg; j++) {
      const x = -half + (i / seg) * EXTENT;
      const z = -half + (j / seg) * EXTENT;

      let disp = 0;
      for (const body of massive) {
        body.pivot.getWorldPosition(tempVec);
        const dx = x - tempVec.x;
        const dz = z - tempVec.z;
        const dist = Math.sqrt(dx * dx + dz * dz + 0.5);
        const massNorm = body.data.physical.massKg / SOLAR_MASS;
        disp -= (massNorm / dist) * AMPLITUDE;
      }

      disps[idx] = disp;
      if (disp < maxDisp) maxDisp = disp;
      idx++;
    }
  }

  const invMax = maxDisp < 0 ? -1 / maxDisp : 1;

  idx = 0;
  for (let i = 0; i <= seg; i++) {
    for (let j = 0; j <= seg; j++) {
      const d = Math.max(-AMPLITUDE * 5, disps[idx]);
      pos[idx * 3 + 1] = d;

      const t = Math.min(1, d * invMax);
      col[idx * 3]     = 0.27 * (1 - t) + 0.6 * t;
      col[idx * 3 + 1] = 0.53 * (1 - t) + 0.1 * t;
      col[idx * 3 + 2] = 1.0  * (1 - t) + 0.3 * t;

      idx++;
    }
  }

  posAttr.needsUpdate = true;
  colorAttr.needsUpdate = true;
}
