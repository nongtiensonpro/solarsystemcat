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
      <select id="time-select" class="time-select" title="Tốc độ thời gian">
        <option value="1">1x (Thực)</option>
        <option value="60">1 Phút/s</option>
        <option value="3600">1 Giờ/s</option>
        <option value="86400" selected>1 Ngày/s</option>
        <option value="604800">1 Tuần/s</option>
        <option value="2592000">1 Tháng/s</option>
        <option value="31536000">1 Năm/s</option>
      </select>
    </div>
    <button class="btn-icon" id="btn-visuals-toggle" title="Quỹ đạo & Nhãn tên">◎</button>
    <button class="btn-icon" id="btn-slice-toggle" title="Tự động Cắt lớp">🔬</button>
    <button class="btn-icon" id="btn-cinematic-toggle" title="Chế độ Điện ảnh (Tự do)">🎥</button>
    <button class="btn-hud-icon btn-icon" id="btn-hud-toggle" title="Radar & Zoom HUD">📡</button>
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
      <button class="btn-action" id="btn-screenshot" title="Chụp ảnh màn hình">📸</button>
    </div>
  `;
  container.appendChild(infoPanel);

  // ═══ Layer Tooltip ═══
  const layerTooltip = document.createElement('div');
  layerTooltip.id = 'layer-tooltip';
  layerTooltip.innerHTML = `
    <div class="layer-name"></div>
    <div class="layer-desc"></div>
  `;
  document.body.appendChild(layerTooltip);

  // ═══ Minimap ═══
  const minimapContainer = document.createElement('div');
  minimapContainer.id = 'minimap-container';
  minimapContainer.innerHTML = `
    <canvas id="minimap-canvas" width="150" height="150"></canvas>
    <div id="minimap-label">Hệ Mặt Trời</div>
  `;
  container.appendChild(minimapContainer);

  // ═══ Zoom Indicator ═══
  const zoomIndicator = document.createElement('div');
  zoomIndicator.id = 'zoom-indicator';
  zoomIndicator.innerHTML = `
    <div class="zoom-level" data-level="overview">Toàn hệ</div>
    <div class="zoom-level" data-level="approach">Tiếp cận</div>
    <div class="zoom-level" data-level="slice">Cắt lớp</div>
    <div id="zoom-pointer"></div>
  `;
  container.appendChild(zoomIndicator);

  // ═══ Cinematic Panel ═══
  const cinematicPanel = document.createElement('div');
  cinematicPanel.className = 'glass-panel cinematic-panel';
  cinematicPanel.id = 'cinematic-panel';
  cinematicPanel.style.display = 'none';
  cinematicPanel.innerHTML = `
    <div class="cinematic-header">
      <h3>Đạo diễn hình ảnh</h3>
      <button class="btn-close-cinematic" id="btn-close-cinematic">✕</button>
    </div>
    
    <div class="cinematic-section">
      <div class="cinematic-label">Cú máy (Shot)</div>
      <div class="cinematic-controls grid-3" id="cine-shot-group">
        <button class="cine-btn active" data-shot="free">Tự do</button>
        <button class="cine-btn" data-shot="targetLock">Khóa mục tiêu</button>
        <button class="cine-btn" data-shot="orbit">Bay vòng</button>
        <button class="cine-btn" data-shot="flyBy">Lướt qua</button>
        <button class="cine-btn" data-shot="chase">Bám đuổi</button>
      </div>
    </div>

    <div class="cinematic-section">
      <div class="cinematic-label">Ống kính (Lens)</div>
      <div class="cinematic-controls grid-5" id="cine-lens-group">
        <button class="cine-btn" data-lens="24">24mm</button>
        <button class="cine-btn active" data-lens="35">35mm</button>
        <button class="cine-btn" data-lens="50">50mm</button>
        <button class="cine-btn" data-lens="85">85mm</button>
        <button class="cine-btn" data-lens="135">135m</button>
      </div>
    </div>

    <div class="cinematic-section">
      <button class="cine-btn full-width" id="btn-cine-auto" style="margin-bottom: 8px; background: rgba(255, 211, 106, 0.15); border-color: rgba(255, 211, 106, 0.4); color: #ffd36a; font-weight: 600;">✨ Đạo diễn Tự động</button>
      <button class="cine-btn full-width" id="btn-cine-clean-ui">Ẩn giao diện (Clean UI)</button>
    </div>
  `;
  container.appendChild(cinematicPanel);

  // ═══ Restore UI Button ═══
  const btnRestoreUI = document.createElement('button');
  btnRestoreUI.id = 'btn-restore-ui';
  btnRestoreUI.innerHTML = 'Hiển thị Giao diện (Show UI)';
  btnRestoreUI.style.cssText = 'position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); z-index: 1000; padding: 10px 20px; background: rgba(20, 30, 50, 0.7); color: #fff; border: 1px solid rgba(100, 140, 255, 0.3); border-radius: 20px; cursor: pointer; font-size: 12px; display: none; backdrop-filter: blur(5px); transition: all 0.2s;';
  btnRestoreUI.addEventListener('mouseover', () => btnRestoreUI.style.background = 'rgba(40, 60, 100, 0.9)');
  btnRestoreUI.addEventListener('mouseout', () => btnRestoreUI.style.background = 'rgba(20, 30, 50, 0.7)');
  document.body.appendChild(btnRestoreUI);

  // ═══ Saturn Camera Presets Panel ═══
  const saturnCameraPanel = document.createElement('div');
  saturnCameraPanel.className = 'glass-panel saturn-camera-panel';
  saturnCameraPanel.id = 'saturn-camera-panel';
  saturnCameraPanel.style.display = 'none'; // Chỉ hiển thị khi chọn Sao Thổ
  saturnCameraPanel.innerHTML = `
    <div class="saturn-panel-header">
      <span>🎯 Góc nhìn tối ưu</span>
      <button class="btn-close-saturn-panel" id="btn-close-saturn-panel">✕</button>
    </div>
    <div class="saturn-panel-body">
      <button class="preset-btn active" data-preset="default" title="Phím 1">🪐 Mặc định</button>
      <button class="preset-btn" data-preset="edge" title="Phím 2">↔ Ngang vành</button>
      <button class="preset-btn" data-preset="pole" title="Phím 3">⬆ Cực</button>
      <button class="preset-btn" data-preset="close" title="Phím 4">🔍 Gần</button>
    </div>
  `;
  container.appendChild(saturnCameraPanel);

  document.getElementById('btn-close-saturn-panel').addEventListener('click', () => {
    saturnCameraPanel.style.display = 'none';
  });

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

  // Time Select
  const timeSelect = document.getElementById('time-select');

  function updateTimeDisplay() {
    const scale = parseFloat(timeSelect.value);
    if (callbacks.onTimeScaleChange) callbacks.onTimeScaleChange(scale);
  }

  timeSelect.addEventListener('change', updateTimeDisplay);
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

  // Visuals (Orbits & Labels) Toggle
  const btnVisualsToggle = document.getElementById('btn-visuals-toggle');
  btnVisualsToggle.addEventListener('click', () => {
    const isActive = btnVisualsToggle.classList.toggle('active');
    if (callbacks.onToggleOrbits) callbacks.onToggleOrbits(isActive);
    if (callbacks.onToggleLabels) callbacks.onToggleLabels(isActive);
  });

  // Auto Slice Toggle
  const btnSliceToggle = document.getElementById('btn-slice-toggle');
  btnSliceToggle.addEventListener('click', () => {
    const isActive = btnSliceToggle.classList.toggle('active');
    if (callbacks.onToggleSlice) callbacks.onToggleSlice(isActive);
  });

  const btnHudToggle = document.getElementById('btn-hud-toggle');
  btnHudToggle.addEventListener('click', () => {
    const isActive = btnHudToggle.classList.toggle('active');
    if (callbacks.onToggleMinimap) callbacks.onToggleMinimap(isActive);
    if (callbacks.onToggleZoomIndicator) callbacks.onToggleZoomIndicator(isActive);
  });
  
  // Cinematic Toggle
  const btnCinematicToggle = document.getElementById('btn-cinematic-toggle');
  const cinematicPanelDOM = document.getElementById('cinematic-panel');
  const btnCloseCinematic = document.getElementById('btn-close-cinematic');

  function toggleCinematicPanel(show) {
    cinematicPanelDOM.style.display = show ? 'flex' : 'none';
    if (show) {
      if (window.innerWidth < 768) {
        infoPanel.classList.remove('visible'); // Đóng info panel trên mobile để nhường chỗ
      }
    }
  }

  btnCinematicToggle.addEventListener('click', () => {
    const isActive = btnCinematicToggle.classList.toggle('active');
    toggleCinematicPanel(isActive);
    if (callbacks.onToggleCinematic) callbacks.onToggleCinematic(isActive);
  });

  btnCloseCinematic.addEventListener('click', () => {
    btnCinematicToggle.classList.remove('active');
    toggleCinematicPanel(false);
    if (callbacks.onToggleCinematic) callbacks.onToggleCinematic(false);
  });

  window.addEventListener('cinematic-disabled', () => {
    // Handler moved below
  });

  // Cinematic Panel Controls
  const shotBtns = cinematicPanelDOM.querySelectorAll('#cine-shot-group .cine-btn');
  shotBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      shotBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (callbacks.onCinematicShotChange) callbacks.onCinematicShotChange(btn.dataset.shot);
    });
  });

  const lensBtns = cinematicPanelDOM.querySelectorAll('#cine-lens-group .cine-btn');
  lensBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      lensBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (callbacks.onCinematicLensChange) callbacks.onCinematicLensChange(parseFloat(btn.dataset.lens));
    });
  });

  const btnCleanUI = document.getElementById('btn-cine-clean-ui');
  let isCleanUI = false;

  function setCleanUI(clean) {
    isCleanUI = clean;
    btnCleanUI.classList.toggle('active', isCleanUI);
    btnRestoreUI.style.display = isCleanUI ? 'block' : 'none';
    cinematicPanelDOM.style.display = isCleanUI ? 'none' : 'flex';
    if (callbacks.onCinematicCleanUIToggle) callbacks.onCinematicCleanUIToggle(isCleanUI);
  }

  btnCleanUI.addEventListener('click', () => setCleanUI(!isCleanUI));
  btnRestoreUI.addEventListener('click', () => setCleanUI(false));

  const btnAutoDirector = document.getElementById('btn-cine-auto');
  let isAutoDirector = false;
  btnAutoDirector.addEventListener('click', () => {
    isAutoDirector = !isAutoDirector;
    btnAutoDirector.classList.toggle('active', isAutoDirector);
    if (callbacks.onCinematicAutoDirectorToggle) callbacks.onCinematicAutoDirectorToggle(isAutoDirector);
    
    // Tự động bật Clean UI nếu đang kích hoạt Đạo diễn
    if (isAutoDirector && !isCleanUI) {
      btnCleanUI.click();
    }
  });

  window.addEventListener('cinematic-disabled', () => {
    btnCinematicToggle.classList.remove('active');
    toggleCinematicPanel(false);
    
    if (isAutoDirector) btnAutoDirector.click();
    if (isCleanUI) setCleanUI(false);
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
    }
    
    // Hiện panel preset camera nếu là Sao Thổ
    if (bodyId === 'saturn') {
      saturnCameraPanel.style.display = 'flex';
      saturnCameraPanel.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      saturnCameraPanel.querySelector('[data-preset="default"]').classList.add('active');
    } else {
      saturnCameraPanel.style.display = 'none';
    }
  }

  // Handle Saturn Camera Presets
  const saturnPresetBtns = saturnCameraPanel.querySelectorAll('.preset-btn');
  saturnPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      saturnPresetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (callbacks.onSaturnCameraPreset) {
        callbacks.onSaturnCameraPreset(btn.dataset.preset);
      }
    });
  });

  // Handle keyboard shortcuts for Saturn presets
  window.addEventListener('keydown', (e) => {
    if (saturnCameraPanel.style.display === 'flex') {
      let preset = null;
      if (e.key === '1') preset = 'default';
      else if (e.key === '2') preset = 'edge';
      else if (e.key === '3') preset = 'pole';
      else if (e.key === '4') preset = 'close';
      
      if (preset) {
        const btn = saturnCameraPanel.querySelector(`[data-preset="${preset}"]`);
        if (btn) btn.click();
      }
    }
  });

  // Close Info Panel
  function closeInfoPanel() {
    infoPanel.classList.remove('visible');
    infoPanel.style.transform = ''; // Reset inline transform từ swipe
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

  const btnScreenshot = document.getElementById('btn-screenshot');
  btnScreenshot.addEventListener('click', () => {
    if (callbacks.onScreenshot) callbacks.onScreenshot();
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

    // Phase 5: Hiển thị danh sách vệ tinh nhanh (nếu có)
    let moonListHtml = '';
    if (moonCount > 0) {
      const moons = planetData.filter(p => p.parentId === data.id && p.isMoon);
      moonListHtml = `
        <div class="info-section-title">🛰️ Các vệ tinh chính</div>
        <div class="moon-chips-container" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px;">
          ${moons.map(m => `<button class="moon-chip" data-id="${m.id}" style="padding: 4px 8px; font-size: 11px; background: rgba(110, 198, 255, 0.15); border: 1px solid rgba(110, 198, 255, 0.3); border-radius: 4px; color: #6ec6ff; cursor: pointer; transition: all 0.2s;">${m.name}</button>`).join('')}
        </div>
      `;
    }

    // Phase 7: Chi tiết hệ thống vành đai cho Saturn
    let ringsInfoHtml = '';
    if (data.id === 'saturn') {
      ringsInfoHtml = `
        <div class="info-section-title">🪐 Hệ thống Vành đai</div>
        <div class="info-layer" style="border-left-color: #ffd36a; background: rgba(255, 211, 106, 0.05);">
          <div class="info-row sub"><span class="label">Tổng đường kính</span><span class="value">282,000 km</span></div>
          <div class="info-row sub"><span class="label">Độ dày trung bình</span><span class="value">Chỉ 10 - 100 mét</span></div>
          <div class="info-row sub"><span class="label">Thành phần</span><span class="value">99% Băng nước nguyên chất</span></div>
          <p style="font-size: 10px; color: #8899bb; margin-top: 6px; font-style: italic;">
            * Mẹo: Rê chuột lên vành đai 3D để xem tên từng vùng!
          </p>
        </div>
      `;
    }

    // Phase 5.1: Hiển thị thông tin Ghost Moons cho Saturn
    let ghostMoonsHtml = '';
    if (data.id === 'saturn') {
      ghostMoonsHtml = `
        <div class="info-section-title">🌑 Vùng vệ tinh bất quy tắc</div>
        <div class="info-layer" style="border-left-color: #6ec6ff; background: rgba(110, 198, 255, 0.05);">
          <p style="font-size: 11px; color: #aab5c5; line-height: 1.4; margin: 0;">
            Bên ngoài 24 vệ tinh chính, Sao Thổ còn hơn 260 "mảnh vỡ" bất quy tắc. Đây là tàn dư từ thời sơ khai của Hệ Mặt Trời bị lực hấp dẫn bắt giữ.
          </p>
        </div>
      `;
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
    ).join('') + moonListHtml + ringsInfoHtml + ghostMoonsHtml + interiorHtml + summaryHtml;

    // Listeners cho moon chips (Phase 5)
    content.querySelectorAll('.moon-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (callbacks.onPlanetSelect) {
          callbacks.onPlanetSelect(id);
        }
      });
      // Hover effect
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(110, 198, 255, 0.3)';
        btn.style.borderColor = 'rgba(110, 198, 255, 0.6)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(110, 198, 255, 0.15)';
        btn.style.borderColor = 'rgba(110, 198, 255, 0.3)';
      });
    });

    infoPanel.classList.add('visible');
  }
}

// Notification System (Phase 6)
let notificationTimeout = null;
export function showNotification(text, duration = 3000) {
  let notification = document.getElementById('discovery-notification');
  if (!notification) {
    notification = document.createElement('div');
    notification.id = 'discovery-notification';
    notification.className = 'glass-panel';
    notification.style.cssText = `
      position: absolute;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      padding: 10px 24px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 500;
      color: #6ec6ff;
      opacity: 0;
      transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 1000;
      pointer-events: none;
      display: flex;
      align-items: center;
      gap: 10px;
      border: 1px solid rgba(110, 198, 255, 0.4);
      background: rgba(10, 15, 30, 0.85);
    `;
    document.body.appendChild(notification);
  }

  notification.innerHTML = `<span>✨</span> ${text}`;
  
  // Reset previous state
  clearTimeout(notificationTimeout);
  notification.style.opacity = '1';
  notification.style.transform = 'translateX(-50%) translateY(0)';

  notificationTimeout = setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(-50%) translateY(20px)';
  }, duration);
}

let layerTooltipInstance = null;

export function updateLayerTooltip(visible, x, y, name, desc) {
  if (!layerTooltipInstance) {
    layerTooltipInstance = document.getElementById('layer-tooltip');
  }
  if (!layerTooltipInstance) return;

  if (visible) {
    layerTooltipInstance.classList.add('visible');
    layerTooltipInstance.style.left = `${x}px`;
    layerTooltipInstance.style.top = `${y}px`;
    const nameEl = layerTooltipInstance.querySelector('.layer-name');
    const descEl = layerTooltipInstance.querySelector('.layer-desc');
    if (nameEl) nameEl.textContent = name || '';
    if (descEl) descEl.innerHTML = desc || '';
  } else {
    layerTooltipInstance.classList.remove('visible');
  }
}
