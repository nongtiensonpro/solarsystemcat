// Post-processing pipeline — Bloom cho vầng nhật hoa Mặt Trời
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Khởi tạo EffectComposer với UnrealBloomPass
 * - Mặt Trời dùng MeshBasicMaterial → luôn full brightness → vượt bloom threshold
 * - Các hành tinh dùng MeshStandardMaterial → tối hơn → không bị bloom
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @returns {EffectComposer}
 */
export function initPostProcessing(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);

  // 1. RenderPass — kết xuất scene gốc
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // 2. UnrealBloomPass — hiệu ứng phát sáng
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    2.5,   // Strength — cường độ bloom mạnh cho hiệu ứng nhật hoa rõ ràng
    0.8,   // Radius — bán kính lan tỏa rộng
    0.15   // Threshold — ngưỡng thấp để chỉ Sun vượt qua
  );
  composer.addPass(bloomPass);

  // 3. OutputPass — xử lý color space và tone mapping đúng
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  return { composer, bloomPass };
}
