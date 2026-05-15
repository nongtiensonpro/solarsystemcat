// Post-processing pipeline — Bloom cho vầng nhật hoa Mặt Trời
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { getCurrentPreset, onPresetChange } from './renderConfig.js';

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

  // 2. UnrealBloomPass — hiệu ứng phát sáng (thông số từ preset)
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    preset.bloomStrength,   // Strength — cường độ bloom
    preset.bloomRadius,     // Radius — bán kính lan tỏa
    preset.bloomThreshold   // Threshold — ngưỡng sáng
  );
  composer.addPass(bloomPass);

  // 3. OutputPass — xử lý color space và tone mapping đúng
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // 4. Lắng nghe thay đổi preset để cập nhật bloom parameters
  onPresetChange((newPreset) => {
    bloomPass.strength = newPreset.bloomStrength;
    bloomPass.radius = newPreset.bloomRadius;
    bloomPass.threshold = newPreset.bloomThreshold;
  });

  return { composer, bloomPass };
}
