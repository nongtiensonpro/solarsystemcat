// UI Module — Tạo và quản lý giao diện người dùng
import { planetData } from './planetData.js';
import { QUALITY_PRESETS, getCurrentPresetKey, applyPreset } from './renderConfig.js';
import { SUN_LAYERS } from './sunInterior.js';
import { TERRESTRIAL_INTERIORS } from './terrestrialInterior.js';
import { GAS_GIANT_INTERIORS } from './gasGiantInterior.js';
import { ICE_GIANT_INTERIORS } from './iceGiantInterior.js';

/**
 * Chuyển hex number 0xRRGGBB sang CSS hex string "#RRGGBB"
 * @param {number} color
 * @returns {string}
 */
function colorToHex(color) {
  if (typeof color === 'string') return color;
  return '#' + (color & 0xFFFFFF).toString(16).padStart(6, '0');
}

/**
 * Tìm tên parent body
 * @param {string} parentId
 * @returns {string}
 */
function getParentName(parentId) {
  if (!parentId) return '';
  const parent = planetData.find(p => p.id === parentId);
  return parent ? parent.name : parentId;
}

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

  // ═══ Top Bar ═══
  const topBar = document.createElement('div');
  topBar.className = 'glass-panel top-bar';

  const currentPresetKey = getCurrentPresetKey();
  const presetKeys = Object.keys(QUALITY_PRESETS);
  const presetButtonsHTML = presetKeys.map(key => {
    const preset = QUALITY_PRESETS[key];
    const activeClass = key === currentPresetKey ? 'active' : '';
    return `<button class="preset-btn ${activeClass}" data-preset="${key}">${preset.label}</button>`;
  }).join('');

  topBar.innerHTML = `
    <button class="btn-icon" id="btn-search" title="Tìm kiếm">🔍</button>
    <button class="btn-icon" id="btn-home" title="Về Toàn cảnh">🏠</button>
    <div class="time-controls">
      <button class="btn-icon" id="btn-pause" title="Tạm dừng">⏸</button>
      <label>Tốc độ</label>
      <input type="range" id="time-slider" min="0" max="6" step="0.1" value="3">
      <span class="time-value" id="time-value">1.2 ngày/s</span>
    </div>
    <button class="btn-icon" id="btn-orbits" title="Đường quỹ đạo">◎</button>
    <button class="btn-icon" id="btn-labels" title="Nhãn tên">Aa</button>
    <div class="quality-preset-group" title="Chất lượng đồ họa">
      ${presetButtonsHTML}
    </div>
  `;
  container.appendChild(topBar);

  // ═══ Search Panel ═══
  const searchPanel = document.createElement('div');
  searchPanel.className = 'glass-panel search-panel';
  searchPanel.id = 'search-panel';
  searchPanel.style.display = 'none'; // Ẩn mặc định
  searchPanel.innerHTML = `
    <div class="search-header">
      <input type="text" id="search-input" placeholder="Tìm kiếm hành tinh, vệ tinh..." autocomplete="off">
      <button class="btn-close-search" id="btn-close-search">✕</button>
    </div>
    <div class="search-filters">
      <button class="filter-btn active" data-type="all">Tất cả</button>
      <button class="filter-btn" data-type="planet">Hành tinh & Sao</button>
      <button class="filter-btn" data-type="moon">Vệ tinh</button>
      <button class="filter-btn" data-type="other">Khác</button>
    </div>
    <div class="search-results" id="search-results"></div>
  `;
  container.appendChild(searchPanel);

  // ═══ Planet Selector — Vẫn giữ nhưng sẽ mờ đi khi search ═══
  const selector = document.createElement('div');
  selector.className = 'glass-panel planet-selector';
  
  // Tách planets (non-moon) và moons
  const planets = planetData.filter(p => !p.isMoon);
  const moonsByParent = new Map();
  for (const body of planetData) {
    if (body.isMoon && body.parentId) {
      if (!moonsByParent.has(body.parentId)) {
        moonsByParent.set(body.parentId, []);
      }
      moonsByParent.get(body.parentId).push(body);
    }
  }
  
  for (const planet of planets) {
    // Planet button
    const btn = document.createElement('button');
    btn.className = 'planet-btn';
    btn.dataset.id = planet.id;
    const dotColor = colorToHex(planet.fallbackColor || 0xaaaaaa);
    btn.innerHTML = `
      <span class="planet-dot" style="background: ${dotColor}"></span>
      ${planet.name}
    `;
    selector.appendChild(btn);

    // Moon buttons (grouped under parent)
    const moons = moonsByParent.get(planet.id);
    if (moons && moons.length > 0) {
      for (const moon of moons) {
        const moonBtn = document.createElement('button');
        moonBtn.className = 'planet-btn moon-btn';
        moonBtn.dataset.id = moon.id;
        const moonDotColor = colorToHex(moon.fallbackColor || 0x888888);
        moonBtn.innerHTML = `
          <span class="planet-dot moon-dot" style="background: ${moonDotColor}"></span>
          ${moon.name}
        `;
        selector.appendChild(moonBtn);
      }
    }
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
    <div class="info-actions">
      <button class="btn-action" id="btn-overview">🌐 Toàn cảnh</button>
      <button class="btn-action active" id="btn-follow">🎯 Bám sát</button>
      <button class="btn-action" id="btn-cross-section" title="Mặt Cắt">🔬 Cắt</button>
    </div>
  `;
  container.appendChild(infoPanel);

  // ═══════ Event Handlers ═══════

  // Search Panel Toggle & Logic
  const btnSearch = document.getElementById('btn-search');
  const btnHome = document.getElementById('btn-home');
  const btnCloseSearch = document.getElementById('btn-close-search');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const filterBtns = searchPanel.querySelectorAll('.filter-btn');
  let currentSearchFilter = 'all';

  function toggleSearch() {
    const isVisible = searchPanel.style.display === 'flex';
    searchPanel.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) {
      searchInput.focus();
      renderSearchResults();
      // Đóng info panel khi mở search trên mobile để tránh chồng chéo
      // CHỈ ẩn UI, không thay đổi camera mode
      if (window.innerWidth < 720) {
        infoPanel.classList.remove('visible');
      }
    }
  }

  btnSearch.addEventListener('click', toggleSearch);
  btnHome.addEventListener('click', () => {
    if (callbacks.onOverview) callbacks.onOverview();
    // Khi về home thì ẩn luôn info panel và các active planet btn
    infoPanel.classList.remove('visible');
    allBtns.forEach(b => b.classList.remove('active'));
  });
  btnCloseSearch.addEventListener('click', toggleSearch);

  function getBodyCategory(type) {
    if (type === 'star' || type === 'terrestrial' || type === 'gas-giant' || type === 'ice-giant') return 'planet';
    if (type === 'moon') return 'moon';
    return 'other'; // dwarf, comet
  }

  function renderSearchResults() {
    const query = searchInput.value.toLowerCase().trim();
    
    const filtered = planetData.filter(body => {
      // Check category
      const cat = getBodyCategory(body.type);
      if (currentSearchFilter !== 'all' && cat !== currentSearchFilter) return false;
      
      // Check query
      if (!query) return true;
      return body.name.toLowerCase().includes(query) || body.id.toLowerCase().includes(query);
    });

    searchResults.innerHTML = '';
    
    if (filtered.length === 0) {
      searchResults.innerHTML = '<div class="no-results">Không tìm thấy thiên thể nào.</div>';
      return;
    }

    filtered.forEach(body => {
      const el = document.createElement('div');
      el.className = 'search-item';
      
      let typeText = body.type === 'star' ? 'Ngôi sao' : body.isMoon ? 'Vệ tinh' : body.type === 'comet' ? 'Sao chổi' : 'Hành tinh';
      
      el.innerHTML = `
        <div class="search-item-dot" style="background: ${colorToHex(body.fallbackColor)}"></div>
        <div class="search-item-info">
          <div class="search-item-name">${body.name}</div>
          <div class="search-item-type">${typeText}${body.parentId ? ` của ${getParentName(body.parentId)}` : ''}</div>
        </div>
      `;
      
      el.addEventListener('click', () => {
        selectBody(body.id);
        if (window.innerWidth < 768) {
          toggleSearch(); // Ẩn search trên mobile sau khi chọn
        }
      });
      
      searchResults.appendChild(el);
    });
  }

  searchInput.addEventListener('input', renderSearchResults);

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSearchFilter = btn.dataset.type;
      renderSearchResults();
    });
  });

  // Quality Preset Buttons
  const presetBtns = topBar.querySelectorAll('.preset-btn');
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.preset;
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyPreset(key);
    });
  });

  // Time Slider
  const timeSlider = document.getElementById('time-slider');
  const timeValueEl = document.getElementById('time-value');

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
  updateTimeDisplay();

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

  // Planet + Moon Selector Buttons
  const allBtns = selector.querySelectorAll('.planet-btn');
  allBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      selectBody(btn.dataset.id);
    });
  });

  // Share logic for selecting a body
  function selectBody(bodyId) {
    // Update active state in bottom selector
    allBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.id === bodyId);
    });

    const data = planetData.find(p => p.id === bodyId);
    if (data) {
      showInfoPanel(data);
      if (callbacks.onPlanetSelect) callbacks.onPlanetSelect(bodyId);
      
      // Auto switch to Follow mode when selecting a body
      btnFollow.classList.add('active');
      btnOverview.classList.remove('active');

      // Tắt cross section nếu chọn hành tinh mới
      if (isCrossSectionActive) {
        isCrossSectionActive = false;
        btnCrossSection.classList.remove('active');
        // Không gọi callback ở đây vì onPlanetSelect đã reset ở main
      }
    }
  }

  // Close Info Panel
  function closeInfoPanel() {
    infoPanel.classList.remove('visible');
    infoPanel.style.transform = ''; // Reset inline transform từ swipe
    
    // Tắt mặt cắt nếu đang mở
    if (isCrossSectionActive) {
      isCrossSectionActive = false;
      btnCrossSection.classList.remove('active');
      if (callbacks.onToggleCrossSection) callbacks.onToggleCrossSection(false);
    }
  }
  document.getElementById('btn-close-info').addEventListener('click', closeInfoPanel);

  // ═══ Mobile: Swipe-to-dismiss Info Panel (Bottom Sheet) ═══
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    let touchStartY = 0;
    let currentTranslateY = 0;
    let isSwiping = false;

    infoPanel.addEventListener('touchstart', (e) => {
      // Chỉ bắt đầu swipe nếu panel đang ở đầu scroll (scrollTop ≈ 0)
      if (infoPanel.scrollTop > 5) return;
      touchStartY = e.touches[0].clientY;
      isSwiping = true;
      infoPanel.style.transition = 'none';
    }, { passive: true });

    infoPanel.addEventListener('touchmove', (e) => {
      if (!isSwiping) return;
      const deltaY = e.touches[0].clientY - touchStartY;
      if (deltaY > 0) { // Chỉ cho kéo xuống
        currentTranslateY = deltaY;
        infoPanel.style.transform = `translateY(${deltaY}px)`;
      }
    }, { passive: true });

    infoPanel.addEventListener('touchend', () => {
      if (!isSwiping) return;
      isSwiping = false;
      infoPanel.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
      if (currentTranslateY > 100) {
        closeInfoPanel();
      } else {
        infoPanel.style.transform = 'translateY(0)';
      }
      currentTranslateY = 0;
    }, { passive: true });
  }

  // Camera Mode Buttons
  const btnOverview = document.getElementById('btn-overview');
  const btnFollow = document.getElementById('btn-follow');
  const btnCrossSection = document.getElementById('btn-cross-section');
  let isCrossSectionActive = false;
  
  btnOverview.addEventListener('click', () => {
    btnOverview.classList.add('active');
    btnFollow.classList.remove('active');
    if (callbacks.onOverview) callbacks.onOverview();
  });

  btnFollow.addEventListener('click', () => {
    btnFollow.classList.add('active');
    btnOverview.classList.remove('active');
    const activeBtn = Array.from(allBtns).find(b => b.classList.contains('active'));
    if (activeBtn && callbacks.onFollow) {
      callbacks.onFollow(activeBtn.dataset.id);
    }
  });

  btnCrossSection.addEventListener('click', () => {
    isCrossSectionActive = !isCrossSectionActive;
    btnCrossSection.classList.toggle('active', isCrossSectionActive);
    if (callbacks.onToggleCrossSection) {
      callbacks.onToggleCrossSection(isCrossSectionActive);
    }
  });

  // ═══ Info Panel Content ═══
  function showInfoPanel(data) {
    document.getElementById('info-name').textContent = data.name;
    
    const content = document.getElementById('info-content');

    // Loại thiên thể — bao gồm "Vệ tinh" cho moons và "Sao chổi"
    const typeLabel = data.type === 'star' ? 'Ngôi sao'
      : data.type === 'terrestrial' ? 'Hành tinh đá'
      : data.type === 'gas-giant' ? 'Khí khổng lồ'
      : data.type === 'ice-giant' ? 'Băng khổng lồ'
      : data.type === 'moon' ? 'Vệ tinh'
      : data.type === 'comet' ? 'Sao chổi'
      : 'Hành tinh lùn';

    const rows = [
      ['Loại', typeLabel],
    ];

    // Hiển thị parent cho moons
    if (data.isMoon && data.parentId) {
      rows.push(['Hành tinh mẹ', getParentName(data.parentId)]);
    }
    
    // Đếm số vệ tinh
    const moonCount = planetData.filter(p => p.parentId === data.id && p.isMoon).length;
    if (moonCount > 0) {
      rows.push(['Số vệ tinh', moonCount]);
    }

    rows.push(
      ['Bán kính', data.type === 'star' ? '696,340 km' : `${(data.radius * 6371).toFixed(0)} km`],
      ['Khoảng cách', data.semiMajorAxis > 0 ? (data.isMoon ? `${(data.semiMajorAxis * 149597870.7).toFixed(0)} km` : `${data.semiMajorAxis} AU`) : 'Tâm hệ'],
      ['Chu kỳ QĐ', data.semiMajorAxis > 0 ? `${data.orbitalPeriod.toFixed(1)} ngày` : '—'],
      ['Độ lệch tâm', data.eccentricity > 0 ? data.eccentricity.toFixed(4) : '—'],
      ['Tự quay', `${Math.abs(data.rotationPeriod).toFixed(1)} giờ`],
      ['Hướng quay', data.rotationPeriod < 0 ? 'Ngược chiều ↺' : 'Thuận chiều ↻'],
      ['Nghiêng trục', `${data.axialTilt}°`],
    );

    // Thêm thông tin vật lý từ JSON nếu có
    if (data.physical) {
      if (data.physical.massKg) {
        rows.push(['Khối lượng', `${data.physical.massKg.toExponential(2)} kg`]);
      }
      if (data.physical.density) {
        rows.push(['Mật độ', `${data.physical.density} g/cm³`]);
      }
      if (data.physical.meanTemperatureC !== undefined) {
        rows.push(['Nhiệt độ TB', `${data.physical.meanTemperatureC}°C`]);
      }
    }

    // Thêm thành phần từ info
    if (data.info?.compositionVi) {
      rows.push(['Thành phần', data.info.compositionVi]);
    }

    // Thêm mô tả ngắn từ info
    let summaryHtml = '';
    if (data.info?.summaryVi) {
      summaryHtml = `<div class="info-summary">${data.info.summaryVi}</div>`;
    }

    // Thêm thông tin nội hàm Mặt Trời
    let interiorHtml = '';
    if (data.type === 'star') {
      interiorHtml = `
        <div class="info-section-title">🔬 Cấu trúc Nội hàm</div>
        ${SUN_LAYERS.map(layer => `
          <div class="info-layer">
            <div class="info-layer-header">
              <span class="layer-dot" style="background: ${layer.colorHex}"></span>
              <strong>${layer.name}</strong>
              <span class="layer-range">${(layer.radiusMin * 100).toFixed(0)}% → ${(layer.radiusMax * 100).toFixed(0)}% R☉</span>
            </div>
            ${layer.temperatureCenter ? `<div class="info-row sub"><span class="label">Nhiệt độ tâm</span><span class="value">${(layer.temperatureCenter/1e6).toFixed(1)} triệu K</span></div>` : ''}
            ${layer.temperature ? `<div class="info-row sub"><span class="label">Nhiệt độ</span><span class="value">${layer.temperature.toLocaleString()} K</span></div>` : ''}
            ${layer.densityCenter ? `<div class="info-row sub"><span class="label">Mật độ tâm</span><span class="value">${layer.densityCenter} g/cm³</span></div>` : ''}
            ${layer.mechanismVi ? `<div class="info-row sub"><span class="label">Cơ chế</span><span class="value">${layer.mechanismVi}</span></div>` : ''}
          </div>
        `).join('')}
      `;
    } else if (data.type === 'terrestrial' && TERRESTRIAL_INTERIORS[data.id]) {
      const pData = TERRESTRIAL_INTERIORS[data.id];
      interiorHtml = `
        <div class="info-section-title">🔬 Cấu trúc Nội hàm</div>
        <div class="info-layer">
          <div class="info-row sub"><span class="label">Từ trường</span><span class="value">${pData.magneticField}</span></div>
          <div class="info-row sub"><span class="label">Dynamo</span><span class="value">${pData.dynamoMechanism}</span></div>
          <div class="info-row sub"><span class="label">Kết tinh</span><span class="value">${pData.crystallization}</span></div>
        </div>
        ${pData.layers.map(layer => `
          <div class="info-layer">
            <div class="info-layer-header">
              <span class="layer-dot" style="background: ${layer.colorHex}"></span>
              <strong>${layer.name}</strong>
              <span class="layer-range">${(layer.min * 100).toFixed(0)}% → ${(layer.max * 100).toFixed(0)}% R</span>
            </div>
            <div class="info-row sub"><span class="label">Mô tả</span><span class="value">${layer.desc}</span></div>
          </div>
        `).join('')}
      `;
    } else if (data.type === 'gas-giant' && GAS_GIANT_INTERIORS[data.id]) {
      const pData = GAS_GIANT_INTERIORS[data.id];
      interiorHtml = `
        <div class="info-section-title">🔬 Cấu trúc Nội hàm</div>
        <div class="info-layer">
          <div class="info-row sub"><span class="label">Lõi</span><span class="value">${pData.coreType}</span></div>
          <div class="info-row sub"><span class="label">Từ trường</span><span class="value">${pData.magneticField}</span></div>
          <div class="info-row sub"><span class="label">Đặc trưng</span><span class="value">${pData.specialFeature}</span></div>
        </div>
        ${pData.layers.map(layer => `
          <div class="info-layer">
            <div class="info-layer-header">
              <span class="layer-dot" style="background: ${layer.colorHex}"></span>
              <strong>${layer.name}</strong>
              <span class="layer-range">${(layer.min * 100).toFixed(0)}% → ${(layer.max * 100).toFixed(0)}% R</span>
            </div>
            <div class="info-row sub"><span class="label">Mô tả</span><span class="value">${layer.desc}</span></div>
          </div>
        `).join('')}
      `;
    } else if (data.type === 'ice-giant' && ICE_GIANT_INTERIORS[data.id]) {
      const pData = ICE_GIANT_INTERIORS[data.id];
      interiorHtml = `
        <div class="info-section-title">🔬 Cấu trúc Nội hàm</div>
        <div class="info-layer">
          <div class="info-row sub"><span class="label">Lõi</span><span class="value">${pData.coreType}</span></div>
          <div class="info-row sub"><span class="label">Từ trường</span><span class="value">${pData.magneticField}</span></div>
          <div class="info-row sub"><span class="label">Dynamo</span><span class="value">${pData.dynamoMechanism}</span></div>
          <div class="info-row sub"><span class="label">Đặc trưng</span><span class="value">${pData.specialFeature}</span></div>
        </div>
        ${pData.layers.map(layer => `
          <div class="info-layer">
            <div class="info-layer-header">
              <span class="layer-dot" style="background: ${layer.colorHex}"></span>
              <strong>${layer.name}</strong>
              <span class="layer-range">${(layer.min * 100).toFixed(0)}% → ${(layer.max * 100).toFixed(0)}% R</span>
            </div>
            <div class="info-row sub"><span class="label">Mô tả</span><span class="value">${layer.desc}</span></div>
          </div>
        `).join('')}
      `;
    }

    content.innerHTML = rows.map(([label, value]) =>
      `<div class="info-row"><span class="label">${label}</span><span class="value">${value}</span></div>`
    ).join('') + interiorHtml + summaryHtml;

    infoPanel.classList.add('visible');
  }
}
