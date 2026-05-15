import * as THREE from 'three';

const magneticFieldVertexShader = /* glsl */`
  varying vec2 vUv;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const magneticFieldFragmentShader = /* glsl */`
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uStrength;
  uniform float uIsCrustal;

  varying vec2 vUv;
  varying vec3 vPosition;

  // Simple 3D noise for crustal magnetism
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }

  void main() {
    float alpha = 0.0;
    vec3 finalColor = uColor;

    if (uIsCrustal > 0.5) {
      // Crustal Magnetism (Mars): Localized patches
      float n = noise(normalize(vPosition) * 8.0 + uTime * 0.2);
      float patch = smoothstep(0.6, 0.8, n);
      alpha = patch * uStrength * 0.4;
      // Fade out at poles for Mars specifically to look better
      alpha *= smoothstep(0.8, 0.4, abs(vPosition.y));
    } else {
      // Dipole Magnetism (Earth, Mercury): Field lines
      // Create lines flowing from pole to pole
      float latitude = asin(vPosition.y / length(vPosition)); // -PI/2 to PI/2
      
      // Moving lines
      float flow = fract(vUv.y * 10.0 - uTime * 0.5);
      float lineDist = abs(flow - 0.5) * 2.0; // 0 to 1
      float lineSharpness = smoothstep(0.8, 1.0, lineDist);

      // Fade out near equator to separate the "loops", strongest at poles
      float eqFade = pow(abs(sin(latitude)), 1.5);
      
      // Longitudinal separation
      float longitude = atan(vPosition.z, vPosition.x);
      float longLines = sin(longitude * 12.0) * 0.5 + 0.5;
      longLines = smoothstep(0.7, 0.9, longLines);

      alpha = lineSharpness * longLines * eqFade * uStrength * 0.6;
    }

    // Add a pulsing effect
    alpha *= 0.8 + 0.2 * sin(uTime * 2.0);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

/**
 * Creates a magnetic field visualization mesh.
 * @param {number} radius - Planet radius
 * @param {string} planetId - e.g., 'earth', 'mercury', 'mars'
 * @returns {THREE.Mesh|null}
 */
export function createMagneticField(radius, planetId) {
  let strength = 0;
  let color = new THREE.Color(0x6ec6ff); // Default blueish
  let isCrustal = 0.0;
  let fieldRadius = radius * 1.5; // Dipole is larger

  if (planetId === 'earth') {
    strength = 1.0;
    color = new THREE.Color(0x6ec6ff);
    fieldRadius = radius * 1.6;
  } else if (planetId === 'mercury') {
    strength = 0.15; // Weak (~1%) but boosted for visibility
    color = new THREE.Color(0xffaa66);
    fieldRadius = radius * 1.3;
  } else if (planetId === 'mars') {
    strength = 0.6;
    isCrustal = 1.0;
    color = new THREE.Color(0xff4422);
    fieldRadius = radius * 1.05; // Crustal is very close to surface
  } else if (planetId === 'jupiter' || planetId === 'saturn' || planetId === 'uranus' || planetId === 'neptune') {
    // Will be implemented in Phase 3 & 4, keeping placeholders for now
     strength = 0.0;
  }

  if (strength <= 0.0) return null;

  const geometry = new THREE.SphereGeometry(fieldRadius, 48, 48);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: color },
      uStrength: { value: strength },
      uIsCrustal: { value: isCrustal }
    },
    vertexShader: magneticFieldVertexShader,
    fragmentShader: magneticFieldFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });

  material.userData.isMagneticFieldShader = true;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `${planetId}_magnetic_field`;
  return mesh;
}
