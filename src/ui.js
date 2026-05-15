// UI Module — Tạo và quản lý giao diện người dùng
import { planetData } from './planetData.js';

// Màu dot cho từng hành tinh
const PLANET_COLORS = {
  sun: '#FFDD33', mercury: '#8C7E6D', venus: '#E8CDA0',
  earth: '#2266AA', mars: '#C1440E', jupiter: '#C8A77A',
  saturn: '#D4BE8D', uranus: '#7EC8C8', neptune: '#3355AA',
  pluto: '#C2B5A0',
};

/**
 * Khởi tạo toàn bộ UI
 * @param {Object} callbacks - { onTimeScaleChange, onPlanetSelect, onToggleOrbits, onToggleLabels, onPauseToggle }
 */
export function initUI(callbacks) {
  const container = document.getElementById('ui-container');

  // ═══ Loading Screen ═══
  const loadingScreen = document.createElement('div');
  loadingScreen.className = 'loading-screen';
  loadingScreen.id = 'loading-screen';
  loadingScreen.innerHTML = `
    <div class="loading-title">Hệ Mặt Trời 3D</div>
    <div class="loading-bar-container">
      <div class="loading-bar" id="loading-bar"></div>
    </div>
    <div class="loading-percent" id="loading-percent">Đang tải...</div>
  `;
  document.body.appendChild(loadingScreen);

  // Auto-hide loading sau 1.5s (vì chưa có textures nặng)
  setTimeout(() => {
    loadingScreen.classList.add('hidden');
  }, 1500);

  // ═══ Top Bar ═══
  const topBar = document.createElement('div');
  topBar.className = 'glass-panel top-bar';
  topBar.innerHTML = `
    <h1>☀️ Hệ Mặt Trời</h1>
    <div class="time-controls">
      <button class="btn-icon" id="btn-pause" title="Tạm dừng">⏸</button>
      <label>Tốc độ</label>
      <input type="range" id="time-slider" min="0" max="6" step="0.1" value="3">
      <span class="time-value" id="time-value">1.2 ngày/s</span>
    </div>
    <button class="btn-icon" id="btn-orbits" title="Đường quỹ đạo">◎</button>
    <button class="btn-icon" id="btn-labels" title="Nhãn tên">Aa</button>
  `;
  container.appendChild(topBar);

  // ═══ Planet Selector ═══
  const selector = document.createElement('div');
  selector.className = 'glass-panel planet-selector';
  
  for (const planet of planetData) {
    const btn = document.createElement('button');
    btn.className = 'planet-btn';
    btn.dataset.id = planet.id;
    btn.innerHTML = `
      <span class="planet-dot" style="background: ${PLANET_COLORS[planet.id]}"></span>
      ${planet.name}
    `;
    selector.appendChild(btn);
  }
  container.appendChild(selector);

  // ═══ Info Panel ═══
  const infoPanel = document.createElement('div');
  infoPanel.className = 'glass-panel info-panel';
  infoPanel.id = 'info-panel';
  infoPanel.innerHTML = `
    <button class="btn-close-info" id="btn-close-info">✕</button>
    <h2 id="info-name">—</h2>
    <div id="info-content"></div>
  `;
  container.appendChild(infoPanel);

  // ═══════ Event Handlers ═══════

  // Time Slider
  const timeSlider = document.getElementById('time-slider');
  const timeValueEl = document.getElementById('time-value');

  // Slider giá trị 0-6 → timeScale theo hàm mũ:
  //   0 = 1x, 1 = 10x, 2 = 100x, 3 = 1000x... 6 = 1,000,000x
  function sliderToTimeScale(val) {
    return Math.pow(10, val);
  }

  function formatTimeScale(scale) {
    const daysPerSec = scale / 86400;
    if (daysPerSec < 1) return `${(daysPerSec * 24).toFixed(1)} giờ/s`;
    if (daysPerSec < 365) return `${daysPerSec.toFixed(1)} ngày/s`;
    return `${(daysPerSec / 365.25).toFixed(1)} năm/s`;
  }

  function updateTimeDisplay() {
    const scale = sliderToTimeScale(parseFloat(timeSlider.value));
    timeValueEl.textContent = formatTimeScale(scale);
    if (callbacks.onTimeScaleChange) callbacks.onTimeScaleChange(scale);
  }

  timeSlider.addEventListener('input', updateTimeDisplay);
  updateTimeDisplay(); // Khởi tạo giá trị ban đầu

  // Pause Button
  const btnPause = document.getElementById('btn-pause');
  let isPaused = false;
  btnPause.addEventListener('click', () => {
    isPaused = !isPaused;
    btnPause.textContent = isPaused ? '▶' : '⏸';
    btnPause.classList.toggle('active', isPaused);
    if (callbacks.onPauseToggle) callbacks.onPauseToggle(isPaused);
  });

  // Orbit Lines Toggle
  const btnOrbits = document.getElementById('btn-orbits');
  btnOrbits.addEventListener('click', () => {
    btnOrbits.classList.toggle('active');
    if (callbacks.onToggleOrbits) callbacks.onToggleOrbits(btnOrbits.classList.contains('active'));
  });

  // Labels Toggle
  const btnLabels = document.getElementById('btn-labels');
  btnLabels.addEventListener('click', () => {
    btnLabels.classList.toggle('active');
    if (callbacks.onToggleLabels) callbacks.onToggleLabels(btnLabels.classList.contains('active'));
  });

  // Planet Selector Buttons
  const planetBtns = selector.querySelectorAll('.planet-btn');
  planetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Toggle active
      planetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const planetId = btn.dataset.id;
      const data = planetData.find(p => p.id === planetId);

      // Hiển thị Info Panel
      showInfoPanel(data);

      if (callbacks.onPlanetSelect) callbacks.onPlanetSelect(planetId);
    });
  });

  // Close Info Panel
  document.getElementById('btn-close-info').addEventListener('click', () => {
    infoPanel.classList.remove('visible');
    planetBtns.forEach(b => b.classList.remove('active'));
  });

  // ═══ Info Panel Content ═══
  function showInfoPanel(data) {
    document.getElementById('info-name').textContent = data.name;
    
    const content = document.getElementById('info-content');
    const rows = [
      ['Loại', data.type === 'star' ? 'Ngôi sao' : data.type === 'terrestrial' ? 'Hành tinh đá' : data.type === 'gas-giant' ? 'Khí khổng lồ' : data.type === 'ice-giant' ? 'Băng khổng lồ' : 'Hành tinh lùn'],
      ['Bán kính', data.type === 'star' ? '696,340 km' : `${(data.radius * 6371).toFixed(0)} km`],
      ['Khoảng cách', data.semiMajorAxis > 0 ? `${data.semiMajorAxis} AU` : 'Tâm hệ'],
      ['Chu kỳ QĐ', data.semiMajorAxis > 0 ? `${data.orbitalPeriod.toFixed(1)} ngày` : '—'],
      ['Độ lệch tâm', data.eccentricity > 0 ? data.eccentricity.toFixed(4) : '—'],
      ['Tự quay', `${Math.abs(data.rotationPeriod).toFixed(1)} giờ`],
      ['Hướng quay', data.rotationPeriod < 0 ? 'Ngược chiều ↺' : 'Thuận chiều ↻'],
      ['Nghiêng trục', `${data.axialTilt}°`],
    ];

    content.innerHTML = rows.map(([label, value]) =>
      `<div class="info-row"><span class="label">${label}</span><span class="value">${value}</span></div>`
    ).join('');

    infoPanel.classList.add('visible');
  }
}
