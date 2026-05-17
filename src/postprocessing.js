// Post-processing pipeline — Selective Bloom cho vầng nhật hoa Mặt Trời
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { getCurrentPreset, onPresetChange } from './renderConfig.js';
import { BLOOM_LAYER } from './constants.js';

// Re-export để các module khác dùng
export { BLOOM_LAYER };

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
 * Selective Bloom Pass — Render chỉ objects trên BLOOM_LAYER, áp dụng bloom,
 * rồi blend additive vào scene chính.
 *
 * Cách hoạt động:
 * 1. Render scene (BLOOM_LAYER only) → texture A
 * 2. Áp dụng UnrealBloomPass lên texture A → texture B
 * 3. Blend texture B vào output (additive)
 */
class SelectiveBloomPass {
  constructor(scene, camera, renderer, options = {}) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    // Bloom camera — mirror của main camera, chỉ nhìn BLOOM_LAYER
    this.bloomCamera = new THREE.PerspectiveCamera(
      camera.fov,
      window.innerWidth / window.innerHeight,
      camera.near,
      camera.far
    );
    this.bloomCamera.layers.set(BLOOM_LAYER);

    // Resolution
    this.resolution = new THREE.Vector2(window.innerWidth, window.innerHeight);

    // Bloom params
    this.strength = options.strength ?? 1.5;
    this.radius = options.radius ?? 0.4;
    this.threshold = options.threshold ?? 0.85;
    this.bloomIntensity = options.bloomIntensity ?? 1.0;

    // ── Internal render target cho bloom layer
    this.bloomRenderTarget = new THREE.WebGLRenderTarget(
      this.resolution.x,
      this.resolution.y,
      { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat }
    );

    // ── Bloom composer (render bloom layer → bloom texture)
    this.bloomComposer = new EffectComposer(renderer, this.bloomRenderTarget);
    this.bloomRenderPass = new RenderPass(scene, this.bloomCamera);
    this.bloomComposer.addPass(this.bloomRenderPass);

    this.bloomPass = new UnrealBloomPass(
      this.resolution,
      this.strength,
      this.radius,
      this.threshold
    );
    this.bloomComposer.addPass(this.bloomPass);

    // ── Blend vào output
    // Dùng copyPass để copy bloom result, rồi custom blend trong render()
  }

  syncBloomCamera() {
    // Copy matrix từ main camera để bloom render đúng góc nhìn
    this.bloomCamera.matrixWorld.copy(this.camera.matrixWorld);
    this.bloomCamera.matrixWorldInverse.copy(this.camera.matrixWorldInverse);
    this.bloomCamera.projectionMatrix.copy(this.camera.projectionMatrix);
    this.bloomCamera.projectionMatrixInverse.copy(this.camera.projectionMatrixInverse);
  }

  render(renderer, writeBuffer, readBuffer) {
    // 1. Sync bloom camera với main camera
    this.syncBloomCamera();

    // 2. Render bloom layer → bloom texture
    this.bloomComposer.render();

    // 3. Blend bloom vào output buffer
    // Copy scene từ readBuffer, cộng thêm bloom
    const bloomTexture = this.bloomComposer.readBuffer.texture;

    if (!this._blendMaterial) {
      this._blendMaterial = new THREE.ShaderMaterial({
        uniforms: {
          tScene: { value: null },
          tBloom: { value: bloomTexture },
          uIntensity: { value: this.bloomIntensity }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D tScene;
          uniform sampler2D tBloom;
          uniform float uIntensity;
          varying vec2 vUv;
          void main() {
            vec4 scene = texture2D(tScene, vUv);
            vec4 bloom = texture2D(tBloom, vUv);
            gl_FragColor = vec4(scene.rgb + bloom.rgb * uIntensity, 1.0);
          }
        `,
        depthTest: false,
        depthWrite: false
      });
    }

    this._blendMaterial.uniforms.tBloom.value = bloomTexture;
    this._blendMaterial.uniforms.uIntensity.value = this.bloomIntensity;

    const target = writeBuffer || null;
    renderer.setRenderTarget(target);

    // Render scene từ readBuffer
    if (readBuffer) {
      this._blendMaterial.uniforms.tScene.value = readBuffer.texture;
    }

    const quadScene = this._quadScene || (this._quadScene = new THREE.Scene());
    const quadCamera = this._quadCamera || (this._quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
    quadScene.children = [];
    quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._blendMaterial));

    renderer.render(quadScene, quadCamera);
  }

  setSize(width, height) {
    this.resolution.set(width, height);
    this.bloomRenderTarget.setSize(width, height);
    this.bloomComposer.setSize(width, height);
    this.bloomPass.setSize(width, height);
    this.bloomCamera.aspect = width / height;
    this.bloomCamera.updateProjectionMatrix();
  }

  dispose() {
    this.bloomRenderTarget.dispose();
    this.bloomComposer.dispose();
  }
}

/**
 * Khởi tạo EffectComposer với Selective Bloom
 * - Chỉ Mặt Trời (corona, chromosphere, surface) bị bloom
 * - Các hành tinh, UI, labels, orbit lines KHÔNG bị bloom
 * - Dùng THREE.Layers để tách biệt render
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @returns {EffectComposer}
 */
export function initPostProcessing(renderer, scene, camera) {
  const preset = getCurrentPreset();
  const composer = new EffectComposer(renderer);

  // 1. RenderPass — kết xuất scene gốc (tất cả layers)
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // 2. Selective Bloom Pass — Mặt Trời luôn dùng params chất lượng thấp
  // Hardcoded: strength 0.4, radius 0.3, threshold 1.0
  // Không phụ thuộc preset nào
  const SUN_BLOOM_STRENGTH = 0.4;
  const SUN_BLOOM_RADIUS = 0.3;
  const SUN_BLOOM_THRESHOLD = 1.0;

  const selectiveBloom = new SelectiveBloomPass(scene, camera, renderer, {
    strength: SUN_BLOOM_STRENGTH,
    radius: SUN_BLOOM_RADIUS,
    threshold: SUN_BLOOM_THRESHOLD
  });
  composer.addPass(selectiveBloom);

  // 3. BokehPass (Depth of Field) - Tắt mặc định
  const bokehPass = new BokehPass(scene, camera, {
    focus: 100.0,
    aperture: 0.0001,
    maxblur: 0.01,
    width: window.innerWidth,
    height: window.innerHeight
  });
  bokehPass.enabled = false;
  composer.addPass(bokehPass);

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

  // Lắng nghe thay đổi preset — Mặt Trời KHÔNG thay đổi theo preset
  // Chỉ cập nhật các hiệu ứng khác nếu cần

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

  // Resize handler
  window.addEventListener('resize', () => {
    selectiveBloom.setSize(window.innerWidth, window.innerHeight);
  });

  return { composer, bloomPass: selectiveBloom.bloomPass, bokehPass, vignettePass, grainPass, selectiveBloom };
}
