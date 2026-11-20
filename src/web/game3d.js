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
  const screenResult = document.getElementById('screen-result');

  // Settings
  const SETTINGS_KEY = 'dao_den_long_settings_v1';
  let settings = { volume: 0.7, mouseSens: 1.0 };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (saved) settings = { ...settings, ...saved };
  } catch (_) {}

  const optVolume = document.getElementById('opt-volume');
  const optVolVal = document.getElementById('opt-vol-val');
  const optSens = document.getElementById('opt-sens');
  const optSensVal = document.getElementById('opt-sens-val');

  optVolume.value = Math.round(settings.volume * 100);
  optVolVal.textContent = `${optVolume.value}%`;
  optSens.value = Math.round(settings.mouseSens * 10);
  optSensVal.textContent = `${settings.mouseSens.toFixed(1)}x`;

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
    [screenMenu, screenIntro, screenPause, screenSettings, screenResult].forEach(el => el.classList.remove('visible'));
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
    if (!keys[code]) {
      if (code === 'Space') edgeQueue.jump = true;
      if (code === 'KeyE') edgeQueue.interact = true;
      if (code === 'KeyF') edgeQueue.pulse = true;
      if (code === 'ShiftLeft' || code === 'ShiftRight') edgeQueue.dash = true;
      if (code === 'Escape' || code === 'KeyP') togglePause();
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

  function showResult(result, reason) {
    inGameplay = false;
    hideAllScreens();
    screenResult.classList.add('visible');
    const titleEl = document.getElementById('result-title');
    const descEl = document.getElementById('result-desc');
    const btnNext = document.getElementById('btn-next-or-retry');

    if (result === 'won') {
      totalCampaignScore += world.score;
      playChord([0, 2, 4, 5, 7]);
      if (currentNight < 3) {
        titleEl.textContent = `Đêm ${currentNight} Hoàn Thành!`;
        descEl.textContent = `Mây đã thắp sáng toàn bộ Đèn Lồng Lớn của ${world.map.name}.`;
        btnNext.textContent = `Sang Đêm ${currentNight + 1}`;
        btnNext.onclick = () => showIntro(currentNight + 1);
      } else {
        titleEl.textContent = 'BÌNH MINH ĐÃ LÊN!';
        descEl.textContent = 'Chúc mừng! Mây đã thắp sáng cả ba hòn đảo và xua tan hoàn toàn sương đen!';
        btnNext.textContent = 'Chơi Lại Từ Đêm 1';
        btnNext.onclick = () => {
          totalCampaignScore = 0;
          showIntro(1);
        };
      }
    } else {
      playChord([4, 2, 0]);
      titleEl.textContent = 'Sương Đen Bao Phủ...';
      descEl.textContent = reason === 'dawn' ? 'Đã hết thời gian trước khi thắp đủ đèn.' : 'Ngọn lửa hộ mệnh của Mây đã tắt.';
      btnNext.textContent = `Chơi Lại Đêm ${currentNight}`;
      btnNext.onclick = () => startNight(currentNight);
    }
    document.getElementById('result-night-score').textContent = String(world.score);
    document.getElementById('result-total-score').textContent = String(totalCampaignScore);
  }

  let lastCountdownSec = -1;
  function updateHUD() {
    if (!world) return;
    hudNightLabel.textContent = `Đêm ${world.night} · ${world.map.name}`;

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

    // 10-slot Firefly Bar
    const cap = tuning.carry_capacity || 10;
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

    // Prompt banner near unlit lantern
    let nearL = null;
    for (const l of world.lanterns) {
      if (l.lit) continue;
      if (Math.hypot(world.player.pos[0] - l.pos[0], world.player.pos[2] - l.pos[2]) <= tuning.interact_radius) {
        nearL = l;
        break;
      }
    }
    if (nearL && world.state === 'playing') {
      promptBanner.style.display = 'block';
      promptBanner.textContent = `E — Nạp ánh sáng (${nearL.deposited}/${tuning.lantern_cost})`;
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

    // Sky #0E1430 -> #1B2350 brightened by ambient
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, '#0E1430');
    sky.addColorStop(1, ambient > 0.45 ? '#26336B' : '#1B2350');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const st of stars) {
      const sx = ((st.u * canvas.width - camYawDeg * 3.0) % canvas.width + canvas.width) % canvas.width;
      const sy = st.v * canvas.height * 0.55;
      ctx.fillStyle = `rgba(245,241,230,${0.4 + 0.5 * Math.sin(now * 0.003 + st.phase)})`;
      ctx.beginPath(); ctx.arc(sx, sy, st.r, 0, Math.PI * 2); ctx.fill();
    }

    // Sea of clouds backdrop tint (#12384A)
    ctx.fillStyle = 'rgba(18, 56, 74, 0.35)';
    ctx.fillRect(0, canvas.height * 0.55, canvas.width, canvas.height * 0.45);

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

    // Lanterns
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
          ctx.strokeStyle = l.lit ? '#FFB347' : '#5B5F6E';
          ctx.lineWidth = Math.max(3, 0.3 * base.scale);
          ctx.beginPath(); ctx.moveTo(base.sx, base.sy); ctx.lineTo(top.sx, top.sy); ctx.stroke();

          if (l.lit) {
            const g = ctx.createRadialGradient(top.sx, top.sy, 2, top.sx, top.sy, Math.max(18, 3.5 * s));
            g.addColorStop(0, '#FFE9B0');
            g.addColorStop(0.45, 'rgba(255,179,71,0.55)');
            g.addColorStop(1, 'rgba(255,179,71,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(top.sx, top.sy, Math.max(18, 3.5 * s), 0, Math.PI * 2); ctx.fill();
          }

          const bw = Math.max(9, 1.0 * s), bh = Math.max(11, 1.2 * s);
          ctx.fillStyle = l.lit ? '#FFB347' : '#5B5F6E';
          ctx.strokeStyle = l.lit ? '#FFE9B0' : '#8FA3B8';
          ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.roundRect(top.sx - bw / 2, top.sy - bh / 2, bw, bh, 4); ctx.fill(); ctx.stroke();

          ctx.fillStyle = '#F5F1E6';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(l.lit ? `${l.id} ★` : `${l.id} (${l.deposited}/10)`, top.sx, top.sy - bh * 0.8);
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

    // Shades (#120A1A body, #7A3CFF rim, #3A3450 stunned)
    for (const s of world.shades) {
      const pr = cam.project(s.pos[0], s.pos[1] + 0.85, s.pos[2]);
      if (!pr) continue;
      drawables.push({
        zCam: pr.zCam,
        draw: () => {
          const stunned = s.state === 'stunned';
          const r = Math.max(8, 0.9 * pr.scale);
          ctx.fillStyle = stunned ? '#3A3450' : '#120A1A';
          ctx.strokeStyle = stunned ? '#8FA3B8' : '#7A3CFF';
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(pr.sx, pr.sy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = stunned ? '#FFE58A' : '#7A3CFF';
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

    // Player Mây (#E8E2D0 outfit, #C8102E scarf, conical hat + mini lantern)
    const pPr = cam.project(world.player.pos[0], world.player.pos[1] + 0.8, world.player.pos[2]);
    if (pPr) {
      drawables.push({
        zCam: pPr.zCam,
        draw: () => {
          const [px, py, pz] = world.player.pos;
          const feet = cam.project(px, py, pz);
          const head = cam.project(px, py + 1.5, pz);
          const tip = cam.project(px, py + 2.15, pz);
          if (!feet || !head || !tip) return;
          if (world.player.invuln_ticks > 0 && Math.floor(world.player.invuln_ticks / 4) % 2 === 1) return;
          const s = head.scale;
          const cw = Math.max(9, 0.9 * s);
          ctx.fillStyle = '#E8E2D0';
          ctx.strokeStyle = '#C8102E';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(head.sx, head.sy);
          ctx.lineTo(feet.sx - cw * 0.7, feet.sy);
          ctx.lineTo(feet.sx + cw * 0.7, feet.sy);
          ctx.closePath();
          ctx.fill(); ctx.stroke();

          // Nón lá
          const hw = Math.max(13, 1.4 * s);
          ctx.fillStyle = '#C9B48A';
          ctx.beginPath();
          ctx.moveTo(tip.sx, tip.sy);
          ctx.lineTo(head.sx - hw * 0.75, head.sy + 3);
          ctx.lineTo(head.sx + hw * 0.75, head.sy + 3);
          ctx.closePath();
          ctx.fill();

          // Mini lantern on brim
          const mini = cam.project(px + Math.sin(world.player.facing_yaw_rad) * 0.65, py + 1.4, pz + Math.cos(world.player.facing_yaw_rad) * 0.65);
          if (mini) {
            ctx.fillStyle = '#FFE9B0';
            ctx.beginPath(); ctx.arc(mini.sx, mini.sy, Math.max(3, 0.25 * mini.scale), 0, Math.PI * 2); ctx.fill();
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
        if (keys['KeyW'] || keys['ArrowUp']) mz += 1;
        if (keys['KeyS'] || keys['ArrowDown']) mz -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;

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
