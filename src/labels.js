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

  // Vệ tinh dùng font nhỏ hơn và mờ hơn
  const isMoon = data.isMoon || data.type === 'moon';
  const fontSize = isMoon ? '9px' : '11px';
  const color = isMoon ? 'rgba(160, 180, 220, 0.55)' : 'rgba(180, 200, 240, 0.7)';

  el.style.cssText = `
    position: absolute;
    color: ${color};
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: ${fontSize};
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

    // Tính khoảng cách tới camera
    const distToCam = camera.position.distanceTo(worldPos);
    
    // Auto-hide logic theo distance
    let opacity = 1.0;
    if (label.data.isMoon || label.data.type === 'comet') {
      // Ẩn vệ tinh và sao chổi khi ở xa (ví dụ: xa hơn 80 units)
      if (distToCam > 120) {
        label.el.style.display = 'none';
        continue;
      } else if (distToCam > 80) {
        // Fade out
        opacity = 1.0 - ((distToCam - 80) / 40);
      }
    } else {
      // Ẩn các hành tinh nhỏ nếu cực xa (VD: > 400)
      if (distToCam > 500 && label.data.radius < 0.5) {
        label.el.style.display = 'none';
        continue;
      }
    }

    // Project 3D → 2D screen coordinates
    const projected = worldPos.clone().project(camera);

    // Kiểm tra nằm trước camera
    if (projected.z > 1) {
      label.el.style.display = 'none';
      continue;
    }

    const x = (projected.x * halfW) + halfW;
    const y = -(projected.y * halfH) + halfH;

    // Cập nhật vị trí và opacity
    label.el.style.left = `${x}px`;
    label.el.style.top = `${y + label.data.radius * 2 + 14}px`;
    label.el.style.opacity = opacity.toFixed(2);
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
