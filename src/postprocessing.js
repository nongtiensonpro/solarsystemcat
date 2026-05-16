// Post-processing pipeline — Bloom cho vầng nhật hoa Mặt Trời
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { getCurrentPreset, onPresetChange } from './renderConfig.js';

// --- Custom Shaders ---

const VignetteShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'offset': { value: 1.0 },
    'darkness': { value: 1.5 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: `
    uniform float offset;
    uniform float darkness;
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D( tDiffuse, vUv );
      vec2 uv = ( vUv - 0.5 ) * 2.0;
      float dist = length(uv);
      float vignette = smoothstep(offset, offset - darkness, dist);
      gl_FragColor = vec4( texel.rgb * vignette, texel.a );
    }
  `
};

const FilmGrainShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'amount': { value: 0.05 },
    'time': { value: 0.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: `
    uniform float amount;
    uniform float time;
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    float random(vec2 n) { 
      return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
    }
    void main() {
      vec4 texel = texture2D( tDiffuse, vUv );
      float noise = (random(vUv + time) - 0.5) * amount;
      gl_FragColor = vec4( texel.rgb + noise, texel.a );
    }
  `
};

/**
 * Khởi tạo EffectComposer với UnrealBloomPass
 * - Mặt Trời dùng ShaderMaterial sáng mạnh → vượt bloom threshold
 * - Các hành tinh dùng MeshStandardMaterial → tối hơn → không bị bloom
 * - Thông số bloom lấy từ quality preset
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @returns {EffectComposer}
 */
export function initPostProcessing(renderer, scene, camera) {
  const preset = getCurrentPreset();
  const composer = new EffectComposer(renderer);

  // 1. RenderPass — kết xuất scene gốc
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // 2. BokehPass (Depth of Field) - Tắt mặc định
  const bokehPass = new BokehPass(scene, camera, {
    focus: 100.0,
    aperture: 0.0001,
    maxblur: 0.01,
    width: window.innerWidth,
    height: window.innerHeight
  });
  bokehPass.enabled = false;
  composer.addPass(bokehPass);

  // 3. UnrealBloomPass
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    preset.bloomStrength,
    preset.bloomRadius,
    preset.bloomThreshold
  );
  composer.addPass(bloomPass);

  // 4. VignettePass
  const vignettePass = new ShaderPass(VignetteShader);
  vignettePass.enabled = false;
  composer.addPass(vignettePass);

  // 5. FilmGrainPass
  const grainPass = new ShaderPass(FilmGrainShader);
  grainPass.enabled = false;
  composer.addPass(grainPass);

  // 6. OutputPass
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // 4. Lắng nghe thay đổi preset để cập nhật bloom parameters
  onPresetChange((newPreset) => {
    bloomPass.strength = newPreset.bloomStrength;
    bloomPass.radius = newPreset.bloomRadius;
    bloomPass.threshold = newPreset.bloomThreshold;
  });

  // Listen for cinematic mode changes
  window.addEventListener('cinematic-mode-changed', (e) => {
    const { active, config } = e.detail;
    const p = getCurrentPreset();
    
    bokehPass.enabled = active && p.cinematic?.dofEnabled;
    vignettePass.enabled = active && p.cinematic?.vignetteEnabled;
    grainPass.enabled = active && p.cinematic?.grainEnabled;
    
    if (active && config) {
      bokehPass.uniforms.focus.value = config.focusDistance || 100;
      bokehPass.uniforms.aperture.value = config.aperture || 0.00005;
    }
  });

  // Update loop for time-based uniforms
  const originalRender = composer.render.bind(composer);
  composer.render = (deltaTime) => {
    if (grainPass.enabled) {
      grainPass.uniforms.time.value += 0.01;
    }
    originalRender(deltaTime);
  };

  return { composer, bloomPass, bokehPass, vignettePass, grainPass };
}
