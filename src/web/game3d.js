/**
 * Phase 2 3D Renderer & Campaign Client for Đảo Đèn Lồng (Contract v1.1)
 * Supports 3 Nights, Gió Lạc, Bùa Gió, Dash, Pause, Settings persistence, and Standard Color Palette.
 */

(function () {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  // HUD elements
  const hudNightLabel = document.getElementById('hud-night-label');
  const hudFlames = document.getElementById('hud-flames');
  const hudTime = document.getElementById('hud-time');
  const hudLanterns = document.getElementById('hud-lanterns');
  const hudScore = document.getElementById('hud-score');
  const hudCarriedNum = document.getElementById('hud-carried-num');
  const moteSlotsEl = document.getElementById('mote-slots');
  const cdDashEl = document.getElementById('cd-dash');
  const cdDashVal = document.getElementById('cd-dash-val');
  const cdPulseEl = document.getElementById('cd-pulse');
  const cdPulseVal = document.getElementById('cd-pulse-val');
  const hudCharmStatus = document.getElementById('hud-charm-status');
  const promptBanner = document.getElementById('prompt-banner');
  const windBanner = document.getElementById('wind-banner');
  const offscreenArrow = document.getElementById('offscreen-arrow');

  // Screens
  const screenMenu = document.getElementById('screen-menu');
  const screenIntro = document.getElementById('screen-intro');
  const screenPause = document.getElementById('screen-pause');
  const screenSettings = document.getElementById('screen-settings');
  const screenLeaderboard = document.getElementById('screen-leaderboard');
  const screenResult = document.getElementById('screen-result');

  const DEFAULT_KEYS = {
    up: 'KeyW',
    down: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    jump: 'Space',
    dash: 'ShiftLeft',
    interact: 'KeyE',
    pulse: 'KeyF',
    pause: 'KeyP'
  };
  const KEY_LABELS = {
    up: 'Tiến',
    down: 'Lùi',
    left: 'Trái',
    right: 'Phải',
    jump: 'Nhảy',
    dash: 'Lướt',
    interact: 'Nạp đèn',
    pulse: 'Tỏa Sáng',
    pause: 'Tạm dừng'
  };

  // Settings
  const SETTINGS_KEY = 'dao_den_long_settings_v1';
  let settings = {
    volume: 0.7,
    mouseSens: 1.0,
    colorblind: false,
    reduceMotion: false,
    largeText: false,
    keybinds: { ...DEFAULT_KEYS }
  };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (saved) settings = { ...settings, ...saved, keybinds: { ...DEFAULT_KEYS, ...(saved.keybinds || {}) } };
  } catch (_) {}

  const optVolume = document.getElementById('opt-volume');
  const optVolVal = document.getElementById('opt-vol-val');
  const optSens = document.getElementById('opt-sens');
  const optSensVal = document.getElementById('opt-sens-val');
  const optColorblind = document.getElementById('opt-colorblind');
  const optReduceMotion = document.getElementById('opt-reduce-motion');
  const optLargeText = document.getElementById('opt-large-text');

  optVolume.value = Math.round(settings.volume * 100);
  optVolVal.textContent = `${optVolume.value}%`;
  optSens.value = Math.round(settings.mouseSens * 10);
  optSensVal.textContent = `${settings.mouseSens.toFixed(1)}x`;
  if (optColorblind) {
    optColorblind.checked = Boolean(settings.colorblind);
    document.body.classList.toggle('colorblind-mode', settings.colorblind);
    optColorblind.addEventListener('change', () => {
      settings.colorblind = optColorblind.checked;
      document.body.classList.toggle('colorblind-mode', settings.colorblind);
    });
  }
  if (optReduceMotion) {
    optReduceMotion.checked = Boolean(settings.reduceMotion);
    optReduceMotion.addEventListener('change', () => { settings.reduceMotion = optReduceMotion.checked; });
  }
  if (optLargeText) {
    optLargeText.checked = Boolean(settings.largeText);
    document.body.classList.toggle('large-text', settings.largeText);
    optLargeText.addEventListener('change', () => {
      settings.largeText = optLargeText.checked;
      document.body.classList.toggle('large-text', settings.largeText);
    });
  }

  let listeningAction = null;
  const keybindListEl = document.getElementById('keybind-list');
  const keybindWarnEl = document.getElementById('keybind-warning');

  function renderKeybinds() {
    if (!keybindListEl) return;
    keybindListEl.innerHTML = '';
    for (const action of Object.keys(DEFAULT_KEYS)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-secondary';
      btn.style.minWidth = 'auto';
      btn.style.minHeight = '36px';
      btn.style.padding = '4px 10px';
      btn.style.fontSize = '13px';
      btn.textContent =
        listeningAction === action
          ? `${KEY_LABELS[action]}: [Nhấn phím...]`
          : `${KEY_LABELS[action]}: ${settings.keybinds[action]}`;
      btn.onclick = () => {
        listeningAction = action;
        keybindWarnEl.textContent = '';
        renderKeybinds();
      };
      keybindListEl.appendChild(btn);
    }
  }
  renderKeybinds();

  const btnResetKeys = document.getElementById('btn-reset-keys');
  if (btnResetKeys) {
    btnResetKeys.addEventListener('click', () => {
      settings.keybinds = { ...DEFAULT_KEYS };
      listeningAction = null;
      keybindWarnEl.textContent = '';
      renderKeybinds();
    });
  }

  optVolume.addEventListener('input', () => {
    settings.volume = Number(optVolume.value) / 100;
    optVolVal.textContent = `${optVolume.value}%`;
  });
  optSens.addEventListener('input', () => {
    settings.mouseSens = Number(optSens.value) / 10;
    optSensVal.textContent = `${settings.mouseSens.toFixed(1)}x`;
  });

  let settingsReturnTo = 'menu';

  let tuning = null;
  let world = null;
  let currentNight = 1;
  let totalCampaignScore = 0;
  let inGameplay = false;

  // Camera
  let camYawDeg = 0;
  let camPitchDeg = 26;
  let camDist = 15.5;
  let isDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  // Visual effects
  const pulseWaves = [];
  const skyLanterns = [];
  const windLeaves = [];
  const stars = [];
  for (let i = 0; i < 90; i++) {
    stars.push({ u: ((i * 73) % 1000) / 1000, v: ((i * 197) % 520) / 1000, r: 0.7 + (i % 3) * 0.6, phase: i * 0.8 });
  }

  // WebAudio
  let audioCtx = null;
  const PENTATONIC = [261.63, 293.66, 349.23, 392.0, 440.0, 523.25, 587.33, 698.46];
  function playTone(freq, dur = 0.25, type = 'sine', gain = 0.14) {
    if (settings.volume <= 0.01) return;
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
      }
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      g.gain.setValueAtTime(gain * settings.volume, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch (_) {}
  }

  function playChord(indices) {
    indices.forEach((idx, i) => setTimeout(() => playTone(PENTATONIC[idx % PENTATONIC.length], 0.55, 'triangle', 0.12), i * 80));
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function hideAllScreens() {
    [screenMenu, screenIntro, screenPause, screenSettings, screenLeaderboard, screenResult].forEach(el => {
      if (el) el.classList.remove('visible');
    });
  }

  function loadLeaderboardUI() {
    const tbl = document.getElementById('leaderboard-table');
    if (!tbl) return;
    tbl.innerHTML = 'Đang tải...';
    fetch('/api/leaderboard')
      .then(r => r.json())
      .then(data => {
        const list = data.entries || [];
        if (list.length === 0) {
          tbl.innerHTML = '<div style="text-align:center;color:var(--color-muted)">Chưa có kỷ lục nào. Hãy chơi để ghi danh!</div>';
          return;
        }
        tbl.innerHTML = list
          .map((e, i) => `<div style="display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.1)"><span>#${i + 1} <strong>${e.name}</strong> (Đêm thắng: ${e.nights_won}/3)</span><span style="color:var(--color-gold);font-weight:700">${e.score}</span></div>`)
          .join('');
      })
      .catch(() => { tbl.innerHTML = 'Không tải được bảng xếp hạng.'; });
  }

  const btnOpenLb = document.getElementById('btn-open-leaderboard');
  if (btnOpenLb) {
    btnOpenLb.addEventListener('click', () => {
      hideAllScreens();
      screenLeaderboard.classList.add('visible');
      loadLeaderboardUI();
    });
  }
  const btnCloseLb = document.getElementById('btn-close-leaderboard');
  if (btnCloseLb) {
    btnCloseLb.addEventListener('click', () => {
      hideAllScreens();
      screenMenu.classList.add('visible');
    });
  }

  function showIntro(night) {
    currentNight = night;
    const m = window.GameMaps.getMap(night);
    hideAllScreens();
    document.getElementById('intro-title').textContent = `Đêm ${night} — ${m.name}`;
    document.getElementById('intro-subtitle').textContent = m.subtitle;
    document.getElementById('intro-quote').textContent = `Lời Ông Đăng: "${m.elderQuote}"`;
    screenIntro.classList.add('visible');
  }

  function startNight(night) {
    hideAllScreens();
    pulseWaves.length = 0;
    skyLanterns.length = 0;
    windLeaves.length = 0;
    currentNight = night;
    world = new window.GameWorld(tuning, {
      seed: (Date.now() & 0x7fffffff) + night,
      night
    });
    inGameplay = true;
    lastCountdownSec = -1;
    updateHUD();
  }

  // UI Button bindings
  document.getElementById('btn-start-campaign').addEventListener('click', () => {
    totalCampaignScore = 0;
    showIntro(1);
  });
  document.querySelectorAll('.btn-switch-night').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetNight = Number(btn.getAttribute('data-night')) || 1;
      startNight(targetNight);
    });
  });
  document.getElementById('btn-begin-night').addEventListener('click', () => startNight(currentNight));
  document.getElementById('btn-open-settings-menu').addEventListener('click', () => {
    settingsReturnTo = 'menu';
    hideAllScreens();
    screenSettings.classList.add('visible');
  });
  document.getElementById('btn-open-settings-pause').addEventListener('click', () => {
    settingsReturnTo = 'pause';
    hideAllScreens();
    screenSettings.classList.add('visible');
  });
  document.getElementById('btn-close-settings').addEventListener('click', () => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
    hideAllScreens();
    if (settingsReturnTo === 'pause') screenPause.classList.add('visible');
    else screenMenu.classList.add('visible');
  });

  function togglePause() {
    if (!inGameplay || !world || world.state === 'won' || world.state === 'lost') return;
    if (world.state === 'playing') {
      world.state = 'paused';
      hideAllScreens();
      screenPause.classList.add('visible');
    } else if (world.state === 'paused') {
      world.state = 'playing';
      hideAllScreens();
    }
  }

  document.getElementById('btn-pause-hud').addEventListener('click', togglePause);
  document.getElementById('btn-resume').addEventListener('click', togglePause);
  document.getElementById('btn-restart-night').addEventListener('click', () => startNight(currentNight));
  document.getElementById('btn-back-menu').addEventListener('click', () => {
    inGameplay = false;
    hideAllScreens();
    screenMenu.classList.add('visible');
  });
  document.getElementById('btn-result-menu').addEventListener('click', () => {
    inGameplay = false;
    hideAllScreens();
    screenMenu.classList.add('visible');
  });

  // Inputs
  const keys = {};
  const edgeQueue = { jump: false, interact: false, pulse: false, dash: false };

  window.addEventListener('keydown', e => {
    const code = e.code;
    if (listeningAction) {
      e.preventDefault();
      const dup = Object.entries(settings.keybinds).find(([act, k]) => act !== listeningAction && k === code);
      if (dup) {
        keybindWarnEl.textContent = `⚠ Phím ${code} đã được gán cho "${KEY_LABELS[dup[0]]}"!`;
      } else {
        settings.keybinds[listeningAction] = code;
        keybindWarnEl.textContent = '';
      }
      listeningAction = null;
      renderKeybinds();
      return;
    }
    if (!keys[code]) {
      const kb = settings.keybinds;
      if (code === kb.jump) edgeQueue.jump = true;
      if (code === kb.interact) edgeQueue.interact = true;
      if (code === kb.pulse) edgeQueue.pulse = true;
      if (code === kb.dash || code === 'ShiftRight') edgeQueue.dash = true;
      if (code === kb.pause || code === 'Escape') togglePause();
    }
    keys[code] = true;
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });

  canvas.addEventListener('mousedown', e => { isDragging = true; lastMouseX = e.clientX; lastMouseY = e.clientY; });
  window.addEventListener('mouseup', () => { isDragging = false; });
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    camYawDeg = (camYawDeg + dx * 0.45 * settings.mouseSens) % 360;
    camPitchDeg = Math.max(12, Math.min(55, camPitchDeg + dy * 0.25 * settings.mouseSens));
  });

  let nightsWonCount = 0;
  function showResult(result, reason) {
    inGameplay = false;
    hideAllScreens();
    screenResult.classList.add('visible');
    const titleEl = document.getElementById('result-title');
    const descEl = document.getElementById('result-desc');
    const btnNext = document.getElementById('btn-next-or-retry');
    const saveBox = document.getElementById('save-score-box');
    const saveMsg = document.getElementById('lb-save-msg');
    if (saveMsg) saveMsg.textContent = '';

    if (result === 'won') {
      totalCampaignScore += world.score;
      nightsWonCount = Math.max(nightsWonCount, currentNight);
      playChord([0, 2, 4, 5, 7]);
      if (currentNight < 3) {
        if (saveBox) saveBox.style.display = 'none';
        titleEl.textContent = `Đêm ${currentNight} Hoàn Thành!`;
        descEl.textContent = `Mây đã giữ sáng đảo tới bình minh trên ${world.map.name}.`;
        btnNext.textContent = `Sang Đêm ${currentNight + 1}`;
        btnNext.onclick = () => showIntro(currentNight + 1);
      } else {
        if (saveBox) saveBox.style.display = 'block';
        titleEl.textContent = 'BÌNH MINH ĐÃ LÊN!';
        descEl.textContent = 'Chúc mừng! Mây đã thắp sáng cả ba hòn đảo và xua tan hoàn toàn sương đen!';
        btnNext.textContent = 'Chơi Lại Từ Đêm 1';
        btnNext.onclick = () => {
          totalCampaignScore = 0;
          nightsWonCount = 0;
          showIntro(1);
        };
      }
    } else {
      playChord([4, 2, 0]);
      if (saveBox) saveBox.style.display = 'block';
      titleEl.textContent = 'Sương Đen Bao Phủ...';
      descEl.textContent = reason === 'dawn' ? 'Đã hết thời gian mà số đèn sáng chưa đạt ngưỡng.' : 'Ngọn lửa hộ mệnh của Mây đã tắt.';
      btnNext.textContent = `Chơi Lại Đêm ${currentNight}`;
      btnNext.onclick = () => startNight(currentNight);
    }
    document.getElementById('result-night-score').textContent = String(world.score);
    document.getElementById('result-total-score').textContent = String(totalCampaignScore);
  }

  const btnSaveScore = document.getElementById('btn-save-score');
  if (btnSaveScore) {
    btnSaveScore.addEventListener('click', () => {
      const nameInput = document.getElementById('lb-name-input');
      const saveMsg = document.getElementById('lb-save-msg');
      const rawName = (nameInput ? nameInput.value : '').trim();
      if (rawName.length < 3 || rawName.length > 12) {
        saveMsg.textContent = '⚠ Tên phải từ 3 đến 12 ký tự!';
        return;
      }
      fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: rawName,
          score: totalCampaignScore,
          nights_won: nightsWonCount,
          achieved_at: new Date().toISOString(),
          seed: world ? world.seed : 1
        })
      })
        .then(r => {
          if (!r.ok) throw new Error('Lỗi lưu');
          saveMsg.textContent = '✅ Đã lưu điểm vào Bảng Xếp Hạng!';
        })
        .catch(() => {
          saveMsg.textContent = '⚠ Không lưu được điểm.';
        });
    });
  }

  let lastCountdownSec = -1;
  function updateHUD() {
    if (!world) return;
    hudNightLabel.textContent = `Đêm ${world.night} · ${world.map.name}`;
    document.querySelectorAll('#hud-top .btn-switch-night').forEach(btn => {
      const n = Number(btn.getAttribute('data-night'));
      btn.style.borderColor = n === world.night ? 'var(--color-gold)' : 'var(--color-border)';
      btn.style.background = n === world.night ? 'rgba(242, 193, 78, 0.28)' : 'rgba(255, 255, 255, 0.08)';
    });

    // Flames
    const maxFlames = tuning.flames || 3;
    let pips = '';
    for (let i = 0; i < maxFlames; i++) {
      pips += `<span class="flame-pip ${i >= world.player.flames ? 'lost' : ''}"></span>`;
    }
    hudFlames.innerHTML = pips;

    // Timer (red & blink <= 30s)
    const sec = Math.max(0, Math.ceil(world.time_left_s));
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    hudTime.textContent = `${mm}:${ss}`;
    if (sec <= 30) hudTime.classList.add('danger-blink');
    else hudTime.classList.remove('danger-blink');

    if (sec <= 10 && sec > 0 && sec !== lastCountdownSec && world.state === 'playing') {
      lastCountdownSec = sec;
      playTone(660, 0.12, 'sine', 0.1);
    }

    // Lanterns & Score
    const litCount = world.lanterns.filter(l => l.lit).length;
    hudLanterns.textContent = `${litCount} / ${world.lanterns.length}`;
    hudScore.textContent = String(totalCampaignScore + world.score);

    // Dynamic Firefly Bar (10..20)
    const cap = world.getCarryCapacity();
    hudCarriedNum.textContent = `${world.player.carried}/${cap}`;
    let slotsHtml = '';
    for (let i = 0; i < cap; i++) {
      slotsHtml += `<div class="mote-slot ${i < world.player.carried ? 'filled' : ''}"></div>`;
    }
    moteSlotsEl.innerHTML = slotsHtml;

    // Cooldowns
    const dashCd = world.player.dash_cd_ticks / 60;
    if (world.player.charm_ticks > 0) {
      cdDashEl.classList.add('ready');
      cdDashVal.textContent = 'Vô hạn!';
    } else if (dashCd > 0) {
      cdDashEl.classList.remove('ready');
      cdDashVal.textContent = `${dashCd.toFixed(1)}s`;
    } else {
      cdDashEl.classList.add('ready');
      cdDashVal.textContent = 'Sẵn sàng';
    }

    const pulseCd = world.player.pulse_cd_ticks / 60;
    if (pulseCd > 0) {
      cdPulseEl.classList.remove('ready');
      cdPulseVal.textContent = `${pulseCd.toFixed(1)}s`;
    } else if (world.player.carried < tuning.pulse_cost) {
      cdPulseEl.classList.remove('ready');
      cdPulseVal.textContent = `Cần ${tuning.pulse_cost}`;
    } else {
      cdPulseEl.classList.add('ready');
      cdPulseVal.textContent = 'Sẵn sàng';
    }

    hudCharmStatus.textContent = world.player.charm_ticks > 0 ? `Bùa Gió: ${(world.player.charm_ticks / 60).toFixed(1)}s` : '';

    // Wind warning
    if (world.wind.warning) {
      windBanner.style.display = 'block';
      windBanner.textContent = '⚠ Gió mạnh sắp thổi!';
    } else if (world.wind.active) {
      windBanner.style.display = 'block';
      windBanner.textContent = '🍃 Gió mạnh đang thổi!';
    } else {
      windBanner.style.display = 'none';
    }

    // Prompt banner near unlit or refuelable lantern
    let nearL = null;
    for (const l of world.lanterns) {
      const canAccept = !l.lit || (l.lit && l.fuel_ticks < world.fuelMaxTicks);
      if (!canAccept) continue;
      if (Math.hypot(world.player.pos[0] - l.pos[0], world.player.pos[2] - l.pos[2]) <= tuning.interact_radius) {
        nearL = l;
        break;
      }
    }
    if (nearL && world.state === 'playing') {
      promptBanner.style.display = 'block';
      if (!nearL.lit) {
        const cost = nearL.ever_lit ? (tuning.relight_cost || 5) : (tuning.lantern_cost || 10);
        promptBanner.textContent = `E — ${nearL.ever_lit ? 'Thắp lại' : 'Nạp ánh sáng'} (${nearL.deposited}/${cost})`;
      } else {
        promptBanner.textContent = `E — Châm dầu ${nearL.id} (${Math.round(nearL.fuel_ticks / 60)}%)`;
      }
    } else {
      promptBanner.style.display = 'none';
    }
  }

  function createCamera(playerPos) {
    const yawRad = (camYawDeg * Math.PI) / 180;
    const pitchRad = (camPitchDeg * Math.PI) / 180;
    const tx = playerPos[0], ty = playerPos[1] + 1.25, tz = playerPos[2];
    const hDist = camDist * Math.cos(pitchRad);
    const vDist = camDist * Math.sin(pitchRad);
    const cx = tx - Math.sin(yawRad) * hDist;
    const cy = ty + vDist;
    const cz = tz - Math.cos(yawRad) * hDist;

    let fx = tx - cx, fy = ty - cy, fz = tz - cz;
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;

    let rx = fz, rz = -fx;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;

    const ux = fy * rz, uy = fz * rx - fx * rz, uz = -fy * rx;
    const fov = Math.min(canvas.width, canvas.height) * 0.92;

    return {
      project(wx, wy, wz) {
        const dx = wx - cx, dy = wy - cy, dz = wz - cz;
        const zCam = dx * fx + dy * fy + dz * fz;
        if (zCam <= 0.25) return null;
        const xCam = dx * rx + dz * rz;
        const yCam = dx * ux + dy * uy + dz * uz;
        return {
          sx: canvas.width * 0.5 + (xCam / zCam) * fov,
          sy: canvas.height * 0.5 - (yCam / zCam) * fov,
          zCam,
          scale: fov / zCam
        };
      }
    };
  }

  function drawCircleGround(cam, center, radius, segs, fill, stroke, lw = 1.5) {
    const pts = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const pr = cam.project(center[0] + Math.cos(a) * radius, center[1], center[2] + Math.sin(a) * radius);
      if (!pr) return;
      pts.push(pr);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].sx, pts[0].sy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }

  function drawQuad3D(cam, pts3D, fill, stroke, lw = 1.2) {
    const pts = [];
    for (const p of pts3D) {
      const pr = cam.project(p[0], p[1], p[2]);
      if (!pr) return;
      pts.push(pr);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].sx, pts[0].sy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }

  function renderScene(now) {
    if (!world) {
      ctx.fillStyle = '#0E1430';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const litCount = world.lanterns.filter(l => l.lit).length;
    const ambient = 0.15 + 0.55 * (litCount / Math.max(1, world.lanterns.length));

    // 1. Fairy-tale Purple-Blue Night Sky & Glowing Full Moon (inspired by reference image 3)
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.68);
    sky.addColorStop(0, '#0E1430');
    sky.addColorStop(0.45, ambient > 0.45 ? '#452C85' : '#2C1F5E');
    sky.addColorStop(0.82, ambient > 0.45 ? '#8748C9' : '#583496');
    sky.addColorStop(1, ambient > 0.45 ? '#D88EE8' : '#7B4EB2');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Twinkling stars
    for (const st of stars) {
      const sx = ((st.u * canvas.width - camYawDeg * 3.0) % canvas.width + canvas.width) % canvas.width;
      const sy = st.v * canvas.height * 0.52;
      ctx.fillStyle = `rgba(255, 248, 225, ${0.4 + 0.55 * Math.sin(now * 0.003 + st.phase)})`;
      ctx.beginPath(); ctx.arc(sx, sy, st.r, 0, Math.PI * 2); ctx.fill();
    }

    // Large Glowing Full Moon with wispy purple clouds
    const moonX = ((canvas.width * 0.62 - camYawDeg * 2.0) % canvas.width + canvas.width) % canvas.width;
    const moonY = canvas.height * 0.19;
    const moonGlow = ctx.createRadialGradient(moonX, moonY, 16, moonX, moonY, 130);
    moonGlow.addColorStop(0, 'rgba(255, 244, 195, 0.96)');
    moonGlow.addColorStop(0.35, 'rgba(255, 200, 145, 0.35)');
    moonGlow.addColorStop(1, 'rgba(180, 110, 230, 0)');
    ctx.fillStyle = moonGlow;
    ctx.beginPath(); ctx.arc(moonX, moonY, 130, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#FFF3C4';
    ctx.beginPath(); ctx.arc(moonX, moonY, 34, 0, Math.PI * 2); ctx.fill();

    // Distant Purple Mountain & Pine Forest Silhouette (parallax with camera yaw)
    const horizonY = canvas.height * 0.54;
    const drawParallaxRidge = (baseY, amp, freq, color, treeFreq) => {
      const offset = (camYawDeg * 4.5) % 400;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height);
      for (let x = 0; x <= canvas.width + 20; x += 18) {
        const wx = x + offset;
        const h = Math.sin(wx * freq) * amp + Math.cos(wx * freq * 2.1) * (amp * 0.45);
        const treeSpike = treeFreq > 0 ? Math.abs(Math.sin(wx * treeFreq)) * 18 : 0;
        ctx.lineTo(x, baseY - h - treeSpike);
      }
      ctx.lineTo(canvas.width, canvas.height);
      ctx.closePath();
      ctx.fill();
    };
    drawParallaxRidge(horizonY + 8, 32, 0.008, '#2C2159', 0);
    drawParallaxRidge(horizonY + 22, 16, 0.012, '#1B1A44', 0.11);
    drawParallaxRidge(horizonY + 34, 10, 0.015, '#121836', 0.16);

    // Sea of clouds / misty valley lake backdrop (#12384A)
    const valleyGrad = ctx.createLinearGradient(0, horizonY + 15, 0, canvas.height);
    valleyGrad.addColorStop(0, 'rgba(72, 65, 140, 0.48)');
    valleyGrad.addColorStop(1, 'rgba(18, 56, 74, 0.88)');
    ctx.fillStyle = valleyGrad;
    ctx.fillRect(0, horizonY + 15, canvas.width, canvas.height - horizonY);

    const cam = createCamera(world.player.pos);

    // Draw Island Geometry per Night
    if (world.night === 1) {
      drawCircleGround(cam, [0, 0, 0], 40, 48, '#2F5D50', '#C9B48A', 2.5);
    } else if (world.night === 2) {
      drawCircleGround(cam, [0, 0, 0], 28, 36, '#2F5D50', '#C9B48A', 2);
      drawCircleGround(cam, [70, 0, 0], 28, 36, '#2F5D50', '#C9B48A', 2);
      // Bamboo bridge x in [26, 44], z in [-2, 2]
      drawQuad3D(cam, [[26, 0.02, -2], [44, 0.02, -2], [44, 0.02, 2], [26, 0.02, 2]], '#6B4A2F', '#F2C14E', 1.5);
    } else if (world.night === 3) {
      drawCircleGround(cam, [0, 0, 0], 45, 48, '#2F5D50', '#C9B48A', 2.5);
      // Tier 1 half-annulus (z > 0, r 12..24, Y=3)
      for (let deg = 0; deg < 180; deg += 15) {
        const a1 = (deg * Math.PI) / 180;
        const a2 = ((deg + 15) * Math.PI) / 180;
        drawQuad3D(cam, [
          [Math.cos(a1) * 12, 3, Math.sin(a1) * 12],
          [Math.cos(a1) * 24, 3, Math.sin(a1) * 24],
          [Math.cos(a2) * 24, 3, Math.sin(a2) * 24],
          [Math.cos(a2) * 12, 3, Math.sin(a2) * 12]
        ], '#376B5C', '#C9B48A', 1);
      }
      // Ramps at 30° and 150°
      for (const deg of [30, 150]) {
        const ang = (deg * Math.PI) / 180;
        const ux = Math.cos(ang), uz = Math.sin(ang);
        const px = -uz * 1.5, pz = ux * 1.5;
        drawQuad3D(cam, [
          [ux * 30 + px, 0.05, uz * 30 + pz],
          [ux * 24 + px, 3.02, uz * 24 + pz],
          [ux * 24 - px, 3.02, uz * 24 - pz],
          [ux * 30 - px, 0.05, uz * 30 - pz]
        ], '#6B4A2F', '#F2C14E', 1.5);
      }
      // Tier 2 center disc r=8 at Y=6
      drawCircleGround(cam, [0, 6, 0], 8, 28, '#3E7A69', '#F2C14E', 2);
    }

    // Jump Pads
    for (const pad of world.map.jumpPads) {
      drawCircleGround(cam, [pad.pos[0], pad.pos[1] + 0.05, pad.pos[2]], pad.radius, 16, 'rgba(242,193,78,0.45)', '#FFE9B0', 2);
    }

    // Safe Zones around lit lanterns
    for (const l of world.lanterns) {
      if (l.lit) {
        drawCircleGround(cam, [l.pos[0], l.pos[1] + 0.04, l.pos[2]], tuning.safe_radius, 28, 'rgba(255,179,71,0.16)', '#FFB347', 1.8);
      }
    }

    // Pulse waves
    for (let i = pulseWaves.length - 1; i >= 0; i--) {
      const pw = pulseWaves[i];
      pw.radius += tuning.pulse_radius / 18;
      pw.alpha -= 0.045;
      if (pw.alpha <= 0) { pulseWaves.splice(i, 1); continue; }
      drawCircleGround(cam, [pw.x, pw.y + 0.1, pw.z], pw.radius, 24, `rgba(255,229,138,${pw.alpha * 0.25})`, `rgba(255,233,176,${pw.alpha})`, 2.5);
    }

    // Depth-sorted entities
    const drawables = [];

    // Bell Tower on Night 3
    if (world.night === 3) {
      const btPr = cam.project(0, 9, 0);
      if (btPr) {
        drawables.push({
          zCam: btPr.zCam,
          draw: () => {
            const b = cam.project(0, 6, 0);
            const t = cam.project(0, 14, 0);
            if (!b || !t) return;
            const w = Math.max(16, 3.6 * b.scale);
            ctx.fillStyle = '#6B4A2F';
            ctx.strokeStyle = '#F2C14E';
            ctx.lineWidth = 2;
            ctx.fillRect(t.sx - w / 2, t.sy, w, b.sy - t.sy);
            ctx.strokeRect(t.sx - w / 2, t.sy, w, b.sy - t.sy);
          }
        });
      }
    }

    // Decorative Pine Trees around island rim (inspired by reference image 3)
    const pineCount = world.night === 2 ? 0 : 14;
    for (let i = 0; i < pineCount; i++) {
      const ang = (i / pineCount) * Math.PI * 2 + 0.18;
      const rad = world.night === 3 ? 41.5 : 37.0;
      const px = Math.cos(ang) * rad;
      const pz = Math.sin(ang) * rad;
      const pr = cam.project(px, 2.0, pz);
      if (!pr) continue;
      drawables.push({
        zCam: pr.zCam,
        draw: () => {
          const base = cam.project(px, 0, pz);
          const mid1 = cam.project(px, 1.5, pz);
          const mid2 = cam.project(px, 3.2, pz);
          const tip = cam.project(px, 5.2, pz);
          if (!base || !mid1 || !mid2 || !tip) return;
          const s = base.scale;
          // Trunk
          ctx.strokeStyle = '#3B2820';
          ctx.lineWidth = Math.max(3, 0.35 * s);
          ctx.beginPath(); ctx.moveTo(base.sx, base.sy); ctx.lineTo(mid1.sx, mid1.sy); ctx.stroke();
          // Layered pine foliage
          ctx.fillStyle = '#182B3A';
          ctx.strokeStyle = '#364A7A';
          ctx.lineWidth = 1;
          for (const [topP, botP, wScale] of [[mid2, mid1, 1.5], [tip, mid2, 1.1]]) {
            const tw = Math.max(8, wScale * topP.scale);
            ctx.beginPath();
            ctx.moveTo(topP.sx, topP.sy);
            ctx.lineTo(botP.sx - tw, botP.sy);
            ctx.lineTo(botP.sx + tw, botP.sy);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        }
      });
    }

    // Lanterns (Japanese Chōchin pleated paper lantern style from reference image 1)
    for (const l of world.lanterns) {
      const pr = cam.project(l.pos[0], l.pos[1] + 1.5, l.pos[2]);
      if (!pr) continue;
      drawables.push({
        zCam: pr.zCam,
        draw: () => {
          const base = cam.project(l.pos[0], l.pos[1], l.pos[2]);
          const top = cam.project(l.pos[0], l.pos[1] + 3.4, l.pos[2]);
          if (!base || !top) return;
          const s = top.scale;

          // Wooden post
          ctx.strokeStyle = l.lit ? '#6B4A2F' : '#3E3B4F';
          ctx.lineWidth = Math.max(3, 0.32 * base.scale);
          ctx.beginPath(); ctx.moveTo(base.sx, base.sy); ctx.lineTo(top.sx, top.sy); ctx.stroke();

          const fuelPct = l.lit ? l.fuel_ticks / world.fuelMaxTicks : 0;
          const isLowFuel = l.lit && fuelPct < 0.3;
          const blinkOff = isLowFuel && Math.floor(now / 500) % 2 === 1;

          // Warm lantern aura
          if (l.lit) {
            const g = ctx.createRadialGradient(top.sx, top.sy, 2, top.sx, top.sy, Math.max(22, 4.0 * s));
            g.addColorStop(0, 'rgba(255, 248, 215, 0.95)');
            g.addColorStop(0.4, 'rgba(255, 185, 75, 0.55)');
            g.addColorStop(1, 'rgba(255, 140, 25, 0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(top.sx, top.sy, Math.max(22, 4.0 * s), 0, Math.PI * 2); ctx.fill();
          }

          // Oval Chōchin paper body (squashed 20% when unlit)
          const rw = Math.max(11, 0.72 * s);
          const rh = Math.max(12, (l.lit ? 1.05 : 0.84) * s);

          // Hanging tassel below lantern
          ctx.strokeStyle = l.lit ? '#8C6538' : '#4E515E';
          ctx.lineWidth = Math.max(1.2, 0.08 * s);
          ctx.beginPath();
          ctx.moveTo(top.sx, top.sy + rh);
          ctx.lineTo(top.sx + Math.sin(now * 0.004) * 2, top.sy + rh + Math.max(6, 0.45 * s));
          ctx.stroke();

          // Paper body gradient
          if (l.lit) {
            const bodyGrad = ctx.createRadialGradient(top.sx, top.sy, rw * 0.15, top.sx, top.sy, rh * 1.1);
            bodyGrad.addColorStop(0, blinkOff ? '#C98A3A' : '#FFFDF0');
            bodyGrad.addColorStop(0.65, blinkOff ? '#9E6520' : '#FFE9B0');
            bodyGrad.addColorStop(1, blinkOff ? '#754712' : '#FFB347');
            ctx.fillStyle = bodyGrad;
          } else {
            ctx.fillStyle = '#5B5F6E';
          }
          ctx.strokeStyle = l.lit ? '#D98829' : '#8FA3B8';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(top.sx, top.sy, rw, rh, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Horizontal bamboo ribs (pleats)
          ctx.strokeStyle = l.lit ? 'rgba(180, 110, 35, 0.35)' : 'rgba(30, 34, 52, 0.35)';
          ctx.lineWidth = 1;
          for (const f of [-0.55, -0.25, 0, 0.25, 0.55]) {
            const yOff = f * rh;
            const xSpan = rw * Math.sqrt(Math.max(0, 1 - f * f));
            ctx.beginPath();
            ctx.moveTo(top.sx - xSpan, top.sy + yOff);
            ctx.lineTo(top.sx + xSpan, top.sy + yOff);
            ctx.stroke();
          }

          // Top & bottom black wooden caps
          const capW = rw * 1.15;
          const capH = Math.max(3, rh * 0.18);
          ctx.fillStyle = '#18131A';
          ctx.fillRect(top.sx - capW * 0.5, top.sy - rh - capH * 0.3, capW, capH);
          ctx.fillRect(top.sx - capW * 0.5, top.sy + rh - capH * 0.7, capW, capH);

          // Vertical calligraphy brush stroke & red seal stamp (like image 1)
          if (rw > 10) {
            ctx.strokeStyle = l.lit ? '#1C1613' : '#2C2F3A';
            ctx.lineWidth = Math.max(1.5, rw * 0.14);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(top.sx, top.sy - rh * 0.52);
            ctx.lineTo(top.sx - rw * 0.12, top.sy);
            ctx.lineTo(top.sx + rw * 0.08, top.sy + rh * 0.52);
            ctx.stroke();
            // Red seal stamp
            ctx.fillStyle = l.lit ? '#C8102E' : '#6A3844';
            ctx.fillRect(top.sx - rw * 0.52, top.sy - rh * 0.1, Math.max(3, rw * 0.22), Math.max(5, rh * 0.32));
          }

          if (!l.lit) {
            // Torn paper zig-zag crack on unlit lantern (non-color cue)
            ctx.strokeStyle = '#1B2350';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(top.sx - rw * 0.25, top.sy - rh * 0.25);
            ctx.lineTo(top.sx + rw * 0.15, top.sy);
            ctx.lineTo(top.sx - rw * 0.15, top.sy + rh * 0.28);
            ctx.stroke();
          } else {
            // Fuel bar above lit lantern
            const barW = Math.max(38, rw * 2.1);
            const barH = 5;
            const bx = top.sx - barW / 2;
            const by = top.sy - rh - 18;
            ctx.fillStyle = 'rgba(14,20,48,0.85)';
            ctx.fillRect(bx, by, barW, barH);
            ctx.fillStyle = isLowFuel ? (blinkOff ? '#FFFFFF' : '#FF5A5F') : '#FFE9B0';
            ctx.fillRect(bx, by, barW * Math.max(0, Math.min(1, fuelPct)), barH);
          }

          ctx.fillStyle = '#F5F1E6';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          const cost = l.ever_lit ? 5 : 10;
          ctx.fillText(l.lit ? `${l.id} (${Math.round(fuelPct * 100)}%)` : `${l.id} (${l.deposited}/${cost})`, top.sx, top.sy - rh - 24);
        }
      });
    }

    // Motes
    for (const m of world.motes) {
      const pr = cam.project(m.pos[0], m.pos[1] + 0.65, m.pos[2]);
      if (!pr) continue;
      drawables.push({
        zCam: pr.zCam,
        draw: () => {
          const r = Math.max(3, 0.32 * pr.scale);
          const g = ctx.createRadialGradient(pr.sx, pr.sy, 1, pr.sx, pr.sy, r * 2.5);
          g.addColorStop(0, '#FFF6C2');
          g.addColorStop(0.45, '#FFE58A');
          g.addColorStop(1, 'rgba(255,229,138,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(pr.sx, pr.sy, r * 2.5, 0, Math.PI * 2); ctx.fill();
        }
      });
    }

    // Wind Charms (Bùa Gió: #C8102E with #F2C14E gold border)
    for (const c of world.charms) {
      if (!c.available) continue;
      const pr = cam.project(c.pos[0], c.pos[1] + 0.9, c.pos[2]);
      if (!pr) continue;
      drawables.push({
        zCam: pr.zCam,
        draw: () => {
          const w = Math.max(10, 0.7 * pr.scale), h = Math.max(14, 1.0 * pr.scale);
          ctx.fillStyle = '#C8102E';
          ctx.strokeStyle = '#F2C14E';
          ctx.lineWidth = 2;
          ctx.fillRect(pr.sx - w / 2, pr.sy - h / 2, w, h);
          ctx.strokeRect(pr.sx - w / 2, pr.sy - h / 2, w, h);
        }
      });
    }

    // Shades (#120A1A body, #7A3CFF or colorblind #00B3FF rim, #3A3450 stunned)
    const shadeAccent = settings.colorblind ? '#00B3FF' : '#7A3CFF';
    for (const s of world.shades) {
      const pr = cam.project(s.pos[0], s.pos[1] + 0.85, s.pos[2]);
      if (!pr) continue;
      drawables.push({
        zCam: pr.zCam,
        draw: () => {
          const stunned = s.state === 'stunned';
          const r = Math.max(8, 0.9 * pr.scale);
          ctx.fillStyle = stunned ? '#3A3450' : '#120A1A';
          ctx.strokeStyle = stunned ? '#8FA3B8' : shadeAccent;
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(pr.sx, pr.sy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = stunned ? '#FFE58A' : shadeAccent;
          ctx.beginPath();
          ctx.arc(pr.sx - r * 0.3, pr.sy - r * 0.1, Math.max(2, r * 0.15), 0, Math.PI * 2);
          ctx.arc(pr.sx + r * 0.3, pr.sy - r * 0.1, Math.max(2, r * 0.15), 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // Gió Lạc (Drifters: #8FA3B8 silk ribbon)
    for (const d of world.drifters) {
      if (d.state === 'removed') continue;
      const pr = cam.project(d.pos[0], d.pos[1] + 1.1, d.pos[2]);
      if (!pr) continue;
      drawables.push({
        zCam: pr.zCam,
        draw: () => {
          const r = Math.max(7, 0.7 * pr.scale);
          ctx.strokeStyle = '#8FA3B8';
          ctx.lineWidth = Math.max(3, 0.25 * pr.scale);
          ctx.beginPath();
          ctx.moveTo(pr.sx - r, pr.sy);
          ctx.quadraticCurveTo(pr.sx, pr.sy - r * 0.8 * Math.sin(now * 0.01), pr.sx + r, pr.sy);
          ctx.stroke();
        }
      });
    }

    // Player Mây — Teru Teru Bozu (Con ma cầu mưa) wearing Nón lá with hanging mini lantern (reference image 2)
    const pPr = cam.project(world.player.pos[0], world.player.pos[1] + 0.8, world.player.pos[2]);
    if (pPr) {
      drawables.push({
        zCam: pPr.zCam,
        draw: () => {
          const [px, py, pz] = world.player.pos;
          const hoverBob = Math.sin(now * 0.005) * 0.06;
          const feet = cam.project(px, py + hoverBob, pz);
          const neck = cam.project(px, py + 1.15 + hoverBob, pz);
          const head = cam.project(px, py + 1.52 + hoverBob, pz);
          const tip = cam.project(px, py + 2.28 + hoverBob, pz);
          if (!feet || !neck || !head || !tip) return;
          if (world.player.invuln_ticks > 0 && Math.floor(world.player.invuln_ticks / 4) % 2 === 1) return;
          const s = head.scale;

          // Flowing white cloth robe (Teru Teru Bozu flared skirt with soft folds)
          const cw = Math.max(12, 1.15 * s);
          const sway = Math.sin(now * 0.006) * (cw * 0.12);
          const robeGrad = ctx.createLinearGradient(neck.sx, neck.sy, feet.sx, feet.sy);
          robeGrad.addColorStop(0, '#FFFFFF');
          robeGrad.addColorStop(0.7, '#F2EFE6');
          robeGrad.addColorStop(1, '#D9D3C5');
          ctx.fillStyle = robeGrad;
          ctx.strokeStyle = '#C9C2B2';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(neck.sx - cw * 0.25, neck.sy);
          ctx.quadraticCurveTo(feet.sx - cw * 0.75, (neck.sy + feet.sy) * 0.55, feet.sx - cw + sway, feet.sy - 2);
          ctx.quadraticCurveTo(feet.sx - cw * 0.45, feet.sy + 6, feet.sx + sway * 0.5, feet.sy - 1);
          ctx.quadraticCurveTo(feet.sx + cw * 0.45, feet.sy + 6, feet.sx + cw + sway, feet.sy - 2);
          ctx.quadraticCurveTo(feet.sx + cw * 0.75, (neck.sy + feet.sy) * 0.55, neck.sx + cw * 0.25, neck.sy);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Red neck ribbon / scarf (#C8102E)
          ctx.strokeStyle = '#C8102E';
          ctx.lineWidth = Math.max(2.5, 0.2 * s);
          ctx.beginPath();
          ctx.moveTo(neck.sx - cw * 0.28, neck.sy);
          ctx.lineTo(neck.sx + cw * 0.28, neck.sy);
          ctx.stroke();

          // Round white Teru Teru Bozu head
          const headR = Math.max(8, 0.52 * s);
          ctx.fillStyle = '#FFFDF9';
          ctx.strokeStyle = '#D8D2C5';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(head.sx, head.sy, headR, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Cute blushing cheeks, black eyes & smile (facing camera or player direction)
          ctx.fillStyle = 'rgba(244, 140, 155, 0.75)';
          ctx.beginPath();
          ctx.arc(head.sx - headR * 0.48, head.sy + headR * 0.16, headR * 0.2, 0, Math.PI * 2);
          ctx.arc(head.sx + headR * 0.48, head.sy + headR * 0.16, headR * 0.2, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#1E1918';
          ctx.beginPath();
          ctx.arc(head.sx - headR * 0.32, head.sy - headR * 0.05, Math.max(1.5, headR * 0.13), 0, Math.PI * 2);
          ctx.arc(head.sx + headR * 0.32, head.sy - headR * 0.05, Math.max(1.5, headR * 0.13), 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#1E1918';
          ctx.lineWidth = Math.max(1.2, headR * 0.09);
          ctx.beginPath();
          ctx.arc(head.sx, head.sy + headR * 0.12, headR * 0.28, 0.15 * Math.PI, 0.85 * Math.PI);
          ctx.stroke();

          // Nón lá on top of Teru Teru Bozu head
          const hw = Math.max(14, 1.35 * s);
          ctx.fillStyle = '#C9B48A';
          ctx.strokeStyle = '#8C6E3F';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(tip.sx, tip.sy);
          ctx.lineTo(head.sx - hw * 0.78, head.sy - headR * 0.42);
          ctx.quadraticCurveTo(head.sx, head.sy - headR * 0.15, head.sx + hw * 0.78, head.sy - headR * 0.42);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Mini hanging lantern on Nón lá brim (PRD-0)
          const mini = cam.project(px + Math.sin(world.player.facing_yaw_rad) * 0.65, py + 1.48 + hoverBob, pz + Math.cos(world.player.facing_yaw_rad) * 0.65);
          if (mini) {
            const mr = Math.max(3.5, 0.26 * mini.scale);
            const mg = ctx.createRadialGradient(mini.sx, mini.sy, 1, mini.sx, mini.sy, mr * 2.5);
            mg.addColorStop(0, '#FFFDF0');
            mg.addColorStop(0.5, '#FFE9B0');
            mg.addColorStop(1, 'rgba(255, 179, 71, 0)');
            ctx.fillStyle = mg;
            ctx.beginPath(); ctx.arc(mini.sx, mini.sy, mr * 2.5, 0, Math.PI * 2); ctx.fill();
          }
        }
      });
    }

    drawables.sort((a, b) => b.zCam - a.zCam);
    for (const d of drawables) d.draw();

    // Offscreen arrow pointing to nearest unlit lantern
    let nearestUnlit = null;
    let bestD = Infinity;
    for (const l of world.lanterns) {
      if (l.lit) continue;
      const d = Math.hypot(l.pos[0] - world.player.pos[0], l.pos[2] - world.player.pos[2]);
      if (d < bestD) { bestD = d; nearestUnlit = l; }
    }
    if (nearestUnlit && inGameplay && world.state === 'playing') {
      const lp = cam.project(nearestUnlit.pos[0], nearestUnlit.pos[1] + 2, nearestUnlit.pos[2]);
      const offscreen = !lp || lp.sx < 40 || lp.sx > canvas.width - 40 || lp.sy < 40 || lp.sy > canvas.height - 40;
      if (offscreen) {
        const dx = nearestUnlit.pos[0] - world.player.pos[0];
        const dz = nearestUnlit.pos[2] - world.player.pos[2];
        const worldAng = Math.atan2(dx, dz);
        const relAng = worldAng - (camYawDeg * Math.PI) / 180;
        const ax = canvas.width * 0.5 + Math.sin(relAng) * (Math.min(canvas.width, canvas.height) * 0.36);
        const ay = canvas.height * 0.5 - Math.cos(relAng) * (Math.min(canvas.width, canvas.height) * 0.36);
        offscreenArrow.style.display = 'block';
        offscreenArrow.style.left = `${ax - 17}px`;
        offscreenArrow.style.top = `${ay - 17}px`;
        offscreenArrow.style.transform = `rotate(${(relAng * 180) / Math.PI}deg)`;
      } else {
        offscreenArrow.style.display = 'none';
      }
    } else {
      offscreenArrow.style.display = 'none';
    }
  }

  let lastTime = performance.now();
  let acc = 0;
  function loop(now) {
    acc += Math.min(100, now - lastTime);
    lastTime = now;

    if (keys['KeyQ']) camYawDeg = (camYawDeg - 1.8) % 360;
    if (keys['KeyR']) camYawDeg = (camYawDeg + 1.8) % 360;

    while (acc >= 1000 / 60) {
      acc -= 1000 / 60;
      if (inGameplay && world && world.state === 'playing') {
        let mx = 0, mz = 0;
        const kb = settings.keybinds;
        if (keys[kb.up] || keys['ArrowUp']) mz += 1;
        if (keys[kb.down] || keys['ArrowDown']) mz -= 1;
        if (keys[kb.right] || keys['ArrowRight']) mx += 1;
        if (keys[kb.left] || keys['ArrowLeft']) mx -= 1;

        if (edgeQueue.jump && world.player.grounded) playTone(440, 0.15, 'sine', 0.1);
        const events = world.step({
          move: [mx, mz],
          cam_yaw_deg: camYawDeg,
          jump: edgeQueue.jump,
          interact: edgeQueue.interact,
          pulse: edgeQueue.pulse,
          dash: edgeQueue.dash
        });
        edgeQueue.jump = edgeQueue.interact = edgeQueue.pulse = edgeQueue.dash = false;

        for (const ev of events) {
          if (ev.name === 'mote_picked') playTone(PENTATONIC[ev.data.carried % 5 + 2], 0.25, 'sine', 0.12);
          else if (ev.name === 'dash') playTone(587, 0.14, 'triangle', 0.12);
          else if (ev.name === 'lantern_lit') playChord([0, 2, 4, 5]);
          else if (ev.name === 'pulse') {
            pulseWaves.push({ x: world.player.pos[0], y: world.player.pos[1], z: world.player.pos[2], radius: 0.5, alpha: 1.0 });
            playChord([5, 3, 1]);
          } else if (ev.name === 'player_hit') playTone(140, 0.4, 'sawtooth', 0.15);
          else if (ev.name === 'shade_spawned') playTone(110, 0.5, 'triangle', 0.1);
          else if (ev.name === 'game_over') showResult(ev.data.result, ev.data.reason);
        }
        updateHUD();
      }
    }
    renderScene(now);
    requestAnimationFrame(loop);
  }

  fetch('/game.contract.json')
    .then(r => r.json())
    .then(c => {
      tuning = c.tuning;
      requestAnimationFrame(loop);
    });
})();
