// Nhãn tên hành tinh hiển thị dưới dạng HTML overlay
import * as THREE from 'three';

const labelContainer = document.createElement('div');
labelContainer.id = 'labels-container';
labelContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;overflow:hidden;';
document.body.appendChild(labelContainer);

const labels = [];

/**
 * Tạo nhãn tên cho một thiên thể
 * @param {Object} data - Dữ liệu hành tinh
 * @param {THREE.Object3D} pivot - Pivot object trong scene
 */
export function createLabel(data, pivot) {
  const el = document.createElement('div');
  el.textContent = data.name;
  el.style.cssText = `
    position: absolute;
    color: rgba(180, 200, 240, 0.7);
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.5px;
    text-shadow: 0 0 6px rgba(0,0,0,0.8);
    white-space: nowrap;
    transform: translateX(-50%);
    pointer-events: none;
    display: none;
  `;
  labelContainer.appendChild(el);
  labels.push({ el, pivot, data });
}

/**
 * Cập nhật vị trí tất cả nhãn trên màn hình (gọi mỗi frame)
 * @param {THREE.Camera} camera
 * @param {THREE.WebGLRenderer} renderer
 */
export function updateLabels(camera, renderer) {
  const canvas = renderer.domElement;
  const halfW = canvas.clientWidth / 2;
  const halfH = canvas.clientHeight / 2;

  for (const label of labels) {
    const worldPos = new THREE.Vector3();
    label.pivot.getWorldPosition(worldPos);

    // Project 3D → 2D screen coordinates
    const projected = worldPos.clone().project(camera);

    // Kiểm tra nằm trước camera
    if (projected.z > 1) {
      label.el.style.display = 'none';
      continue;
    }

    const x = (projected.x * halfW) + halfW;
    const y = -(projected.y * halfH) + halfH;

    // Offset xuống dưới hành tinh
    label.el.style.left = `${x}px`;
    label.el.style.top = `${y + label.data.radius * 2 + 14}px`;
    label.el.style.display = 'block';
  }
}

/**
 * Bật/tắt hiển thị nhãn
 * @param {boolean} show
 */
export function toggleLabels(show) {
  for (const label of labels) {
    label.el.style.display = show ? 'block' : 'none';
  }
  labelContainer.dataset.visible = show ? 'true' : 'false';
}

/**
 * Kiểm tra nhãn có đang bật không
 */
export function areLabelsVisible() {
  return labelContainer.dataset.visible === 'true';
}
