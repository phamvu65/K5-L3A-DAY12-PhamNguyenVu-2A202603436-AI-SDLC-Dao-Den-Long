/**
 * Enhanced 3D Fairy-Tale Renderer & Interactive Client for Đảo Đèn Lồng
 * Uses the exact same deterministic GameWorld (src/sim/world.js) and game.contract.json tuning.
 * Zero external asset dependencies; includes rich 3D architecture, dynamic shadows, lighting bloom,
 * bamboo groves, central courtyard shrine, firefly trails, ink tentacles, and Pentatonic WebAudio.
 */

(function () {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  const hudFlames = document.getElementById('hud-flames');
  const hudCarried = document.getElementById('hud-carried');
  const hudLanterns = document.getElementById('hud-lanterns');
  const hudTime = document.getElementById('hud-time');
  const hudScore = document.getElementById('hud-score');
  const hudCreative = document.getElementById('hud-creative-status');
  const islandLightBar = document.getElementById('island-light-bar');
  const btnSoundToggle = document.getElementById('btn-sound-toggle');
  const btnSoundLabel = document.getElementById('btn-sound-label');
  const soundWavesIcon = document.getElementById('sound-waves-icon');
  const promptBanner = document.getElementById('prompt-banner');
  const overlay = document.getElementById('overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalDesc = document.getElementById('modal-desc');
  const modalScore = document.getElementById('modal-score');
  const btnRestart = document.getElementById('btn-restart');

  let tuning = null;
  let world = null;

  // Camera state (3D third-person orbit camera)
  let camYawDeg = 0;
  let camPitchDeg = 26;
  let camDist = 15.0;
  let isDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  // Visual effects & Decorative 3D props (purely presentation — never mutates simulation state)
  const pulseWaves = [];
  const skyLanterns = [];
  const cloudPuffs = [];
  const stars = [];
  const bambooClusters = [];
  const grassTufts = [];
  const playerTrail = [];

  // Procedural Pentatonic WebAudio (Wind chimes)
  let audioCtx = null;
  let soundEnabled = true;
  // Vietnamese pentatonic scale (Ngũ cung: Hò - Xự - Xang - Xê - Cống)
  const PENTATONIC_HZ = [261.63, 293.66, 349.23, 392.00, 440.00, 523.25, 587.33, 698.46];

  function playChime(noteIndex = 0, duration = 0.45, type = 'sine', gainLevel = 0.12) {
    if (!soundEnabled) return;
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
      }
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      const freq = PENTATONIC_HZ[noteIndex % PENTATONIC_HZ.length];
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

      gain.gain.setValueAtTime(gainLevel, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (_) {
      // Ignore audio errors when autoplay is blocked
    }
  }

  function playChord(indices) {
    indices.forEach((idx, i) => {
      setTimeout(() => playChime(idx, 0.7, 'triangle', 0.14), i * 90);
    });
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // Initialize starry night sky
  for (let i = 0; i < 120; i++) {
    stars.push({
      u: ((i * 73) % 1000) / 1000,
      v: ((i * 197) % 520) / 1000,
      r: 0.7 + (i % 3) * 0.65,
      phase: i * 0.9
    });
  }

  // Initialize sea-of-clouds puffs around the island
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const r = 47 + (i % 5) * 5.5;
    cloudPuffs.push({
      x: Math.cos(a) * r,
      y: -2.0 + Math.sin(i * 1.7) * 0.9,
      z: Math.sin(a) * r,
      radius: 4.8 + (i % 4) * 1.9,
      phase: i * 0.45
    });
  }

  // Initialize decorative bamboo & stone clusters on the island (visual only)
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 + 0.31;
    const r = i % 2 === 0 ? 15.5 : 34.0;
    bambooClusters.push({
      x: Math.cos(angle) * r,
      z: Math.sin(angle) * r,
      height: 3.4 + (i % 3) * 0.85,
      stalks: 3 + (i % 2),
      seed: i
    });
  }

  // Initialize glowing grass blades on the island
  for (let i = 0; i < 75; i++) {
    const a = i * 2.39996; // Golden angle
    const r = 4.5 + Math.sqrt(i / 75) * 37.0;
    grassTufts.push({
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      h: 0.38 + (i % 3) * 0.14,
      phase: i * 0.7
    });
  }

  // Input tracking
  const keys = {};
  const edgeQueue = { jump: false, interact: false, pulse: false };

  window.addEventListener('keydown', e => {
    const code = e.code;
    if (!keys[code]) {
      if (code === 'Space') edgeQueue.jump = true;
      if (code === 'KeyE') edgeQueue.interact = true;
      if (code === 'KeyF') edgeQueue.pulse = true;
      if (code === 'KeyM') soundEnabled = !soundEnabled;
    }
    keys[code] = true;
  });

  window.addEventListener('keyup', e => {
    keys[e.code] = false;
  });

  canvas.addEventListener('mousedown', e => {
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });
  window.addEventListener('mouseup', () => {
    isDragging = false;
  });
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    camYawDeg = (camYawDeg + dx * 0.45) % 360;
    camPitchDeg = Math.max(12, Math.min(55, camPitchDeg + dy * 0.25));
  });

  function spawnSkyLanterns(originPos, count = 7) {
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      skyLanterns.push({
        x: originPos[0] + Math.cos(ang) * 1.3,
        y: 2.8 + (i % 3) * 0.45,
        z: originPos[2] + Math.sin(ang) * 1.3,
        vy: 1.1 + (i % 3) * 0.35,
        drift: ang,
        life: 16.0
      });
    }
  }

  function startNewGame() {
    overlay.classList.remove('visible');
    pulseWaves.length = 0;
    skyLanterns.length = 0;
    playerTrail.length = 0;
    world = new window.GameWorld(tuning, {
      seed: Date.now() & 0x7fffffff,
      night: 1
    });
    // Ambient initial sky lanterns rising far away
    spawnSkyLanterns([0, 0, 0], 4);
    updateHUD();
  }

  btnRestart.addEventListener('click', () => {
    startNewGame();
  });

  if (btnSoundToggle) {
    btnSoundToggle.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      updateHUD();
    });
  }

  window.__DAO_DEN_LONG__ = {
    getWorld: () => world,
    triggerWinDemo: () => {
      if (!world) return;
      for (const l of world.lanterns) {
        l.deposited = tuning.lantern_cost;
        l.lit = true;
        spawnSkyLanterns(l.pos, 8);
      }
      world._finishGame('won', 'all_lit');
      showEndModal('won', 'all_lit');
    }
  };

  function showEndModal(result, reason) {
    overlay.classList.add('visible');
    modalScore.textContent = String(world.score);
    if (result === 'won') {
      modalTitle.textContent = 'Đảo Bến Rực Sáng!';
      modalDesc.textContent =
        'Mây đã thắp sáng cả 5 Đèn Lồng Lớn, xua tan màn sương đen và đón bình minh ấm áp trên biển mây!';
      playChord([0, 2, 4, 5, 7]);
    } else {
      modalTitle.textContent = 'Sương Đen Bao Phủ...';
      modalDesc.textContent =
        reason === 'dawn'
          ? 'Đêm đã tàn trước khi Mây kịp thắp sáng toàn bộ Đèn Lồng Lớn.'
          : 'Ngọn lửa hộ mệnh của Mây đã tắt trước Bóng Mực. Hãy thử lại nhé!';
      playChord([4, 2, 0]);
    }
    setTimeout(() => {
      if (btnRestart) btnRestart.focus();
    }, 50);
  }

  function updateHUD() {
    if (!world) return;
    const maxFlames = tuning.flames || 3;
    let pipsHtml = '';
    for (let i = 0; i < maxFlames; i++) {
      const lost = i >= world.player.flames ? 'lost' : '';
      pipsHtml += `<span class="flame-pip ${lost}"></span>`;
    }
    hudFlames.innerHTML = pipsHtml;
    hudCarried.textContent = `${world.player.carried} / ${tuning.carry_capacity}`;

    const litCount = world.lanterns.filter(l => l.lit).length;
    hudLanterns.textContent = `${litCount} / ${world.lanterns.length}`;

    const totalSec = Math.max(0, Math.ceil(world.time_left_s));
    const mins = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const secs = String(totalSec % 60).padStart(2, '0');
    hudTime.textContent = `${mins}:${secs}`;
    hudScore.textContent = String(world.score);

    const pct = Math.round((litCount / Math.max(1, world.lanterns.length)) * 100);
    hudCreative.textContent = `Độ sáng đảo: ${pct}% · Chuông gió: ${soundEnabled ? 'Bật' : 'Tắt'}`;
    if (islandLightBar) {
      islandLightBar.style.width = `${pct}%`;
    }
    if (btnSoundLabel) {
      btnSoundLabel.textContent = `Chuông: ${soundEnabled ? 'Bật' : 'Tắt'}`;
    }
    if (soundWavesIcon) {
      soundWavesIcon.style.display = soundEnabled ? 'inline' : 'none';
    }

    // Check proximity to unlit lantern for prompt banner
    let nearLantern = null;
    for (const l of world.lanterns) {
      if (l.lit) continue;
      const d = Math.hypot(world.player.pos[0] - l.pos[0], world.player.pos[2] - l.pos[2]);
      if (d <= tuning.interact_radius) {
        nearLantern = l;
        break;
      }
    }

    if (nearLantern && world.state === 'playing') {
      const rem = tuning.lantern_cost - nearLantern.deposited;
      promptBanner.style.display = 'block';
      promptBanner.textContent =
        world.player.carried > 0
          ? `Nhấn [E] để nạp đom đóm vào ${nearLantern.id} (Cần thêm ${rem})`
          : `${nearLantern.id}: Cần thêm ${rem} đom đóm để thắp sáng`;
    } else {
      promptBanner.style.display = 'none';
    }
  }

  // 3D Perspective Camera Math
  function createCamera(playerPos) {
    const yawRad = (camYawDeg * Math.PI) / 180;
    const pitchRad = (camPitchDeg * Math.PI) / 180;

    const tx = playerPos[0];
    const ty = playerPos[1] + 1.25;
    const tz = playerPos[2];

    const horizDist = camDist * Math.cos(pitchRad);
    const vertDist = camDist * Math.sin(pitchRad);

    const cx = tx - Math.sin(yawRad) * horizDist;
    const cy = ty + vertDist;
    const cz = tz - Math.cos(yawRad) * horizDist;

    let fx = tx - cx;
    let fy = ty - cy;
    let fz = tz - cz;
    const flen = Math.hypot(fx, fy, fz) || 1;
    fx /= flen;
    fy /= flen;
    fz /= flen;

    let rx = fz;
    let ry = 0;
    let rz = -fx;
    const rlen = Math.hypot(rx, rz) || 1;
    rx /= rlen;
    rz /= rlen;

    const ux = fy * rz - fz * ry;
    const uy = fz * rx - fx * rz;
    const uz = fx * ry - fy * rx;

    const fovScale = Math.min(canvas.width, canvas.height) * 0.92;

    return {
      cx, cy, cz,
      fx, fy, fz,
      rx, ry, rz,
      ux, uy, uz,
      fovScale,
      project(wx, wy, wz) {
        const dx = wx - cx;
        const dy = wy - cy;
        const dz = wz - cz;

        const zCam = dx * fx + dy * fy + dz * fz;
        if (zCam <= 0.25) return null;

        const xCam = dx * rx + dy * ry + dz * rz;
        const yCam = dx * ux + dy * uy + dz * uz;

        const sx = canvas.width * 0.5 + (xCam / zCam) * fovScale;
        const sy = canvas.height * 0.5 - (yCam / zCam) * fovScale;
        const scale = fovScale / zCam;
        return { sx, sy, zCam, scale };
      }
    };
  }

  function drawPolygon3D(cam, pts3D, fillStyle, strokeStyle, lineWidth = 1) {
    const projected = [];
    for (const p of pts3D) {
      const pr = cam.project(p[0], p[1], p[2]);
      if (!pr) return;
      projected.push(pr);
    }
    ctx.beginPath();
    ctx.moveTo(projected[0].sx, projected[0].sy);
    for (let i = 1; i < projected.length; i++) {
      ctx.lineTo(projected[i].sx, projected[i].sy);
    }
    ctx.closePath();
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  function drawPolyline3D(cam, pts3D, strokeStyle, lineWidth = 2) {
    const projected = [];
    for (const p of pts3D) {
      const pr = cam.project(p[0], p[1], p[2]);
      if (!pr) return;
      projected.push(pr);
    }
    ctx.beginPath();
    ctx.moveTo(projected[0].sx, projected[0].sy);
    for (let i = 1; i < projected.length; i++) {
      ctx.lineTo(projected[i].sx, projected[i].sy);
    }
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  function drawCircleGround(cam, center, radius, segments, fillStyle, strokeStyle, lineWidth = 1.5) {
    const pts = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push([
        center[0] + Math.cos(a) * radius,
        center[1],
        center[2] + Math.sin(a) * radius
      ]);
    }
    drawPolygon3D(cam, pts, fillStyle, strokeStyle, lineWidth);
  }

  function renderScene(timeMs) {
    if (!world) return;

    const litCount = world.lanterns.filter(l => l.lit).length;
    const brightRatio = litCount / Math.max(1, world.lanterns.length);

    // 1. Fairy-tale Night Sky & Horizon Glow
    const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    const rTop = Math.round(7 + brightRatio * 26);
    const gTop = Math.round(6 + brightRatio * 22);
    const bTop = Math.round(24 + brightRatio * 48);

    const rMid = Math.round(18 + brightRatio * 55);
    const gMid = Math.round(14 + brightRatio * 38);
    const bMid = Math.round(44 + brightRatio * 45);

    const rBot = Math.round(35 + brightRatio * 110);
    const gBot = Math.round(22 + brightRatio * 68);
    const bBot = Math.round(58 + brightRatio * 25);

    skyGrad.addColorStop(0, `rgb(${rTop},${gTop},${bTop})`);
    skyGrad.addColorStop(0.55, `rgb(${rMid},${gMid},${bMid})`);
    skyGrad.addColorStop(1, `rgb(${rBot},${gBot},${bBot})`);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Twinkling stars & crescent moon
    for (const st of stars) {
      const sx = ((st.u * canvas.width - camYawDeg * 3.5) % canvas.width + canvas.width) % canvas.width;
      const sy = st.v * canvas.height * 0.65;
      const twinkle = 0.35 + 0.65 * Math.sin(timeMs * 0.003 + st.phase);
      ctx.fillStyle = `rgba(255, 245, 215, ${twinkle * 0.85})`;
      ctx.beginPath();
      ctx.arc(sx, sy, st.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crescent Moon in the sky
    const moonX = ((canvas.width * 0.78 - camYawDeg * 2.2) % canvas.width + canvas.width) % canvas.width;
    const moonY = canvas.height * 0.14;
    const moonGlow = ctx.createRadialGradient(moonX, moonY, 8, moonX, moonY, 95);
    moonGlow.addColorStop(0, 'rgba(255, 244, 200, 0.95)');
    moonGlow.addColorStop(0.3, 'rgba(255, 210, 130, 0.32)');
    moonGlow.addColorStop(1, 'rgba(255, 180, 90, 0)');
    ctx.fillStyle = moonGlow;
    ctx.beginPath();
    ctx.arc(moonX, moonY, 95, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff7d6';
    ctx.beginPath();
    ctx.arc(moonX, moonY, 22, 0, Math.PI * 2);
    ctx.fill();

    const cam = createCamera(world.player.pos);

    // 2. Sea of Clouds around the island
    for (const puff of cloudPuffs) {
      const bobY = puff.y + Math.sin(timeMs * 0.0012 + puff.phase) * 0.55;
      const pr = cam.project(puff.x, bobY, puff.z);
      if (!pr) continue;
      const rad = puff.radius * pr.scale;
      if (rad < 2) continue;
      const alpha = 0.14 + brightRatio * 0.22;
      const cGrad = ctx.createRadialGradient(pr.sx, pr.sy - rad * 0.2, rad * 0.1, pr.sx, pr.sy, rad);
      cGrad.addColorStop(0, `rgba(${195 + Math.round(brightRatio * 60)}, ${175 + Math.round(brightRatio * 60)}, 235, ${alpha})`);
      cGrad.addColorStop(1, 'rgba(40, 25, 70, 0)');
      ctx.fillStyle = cGrad;
      ctx.beginPath();
      ctx.arc(pr.sx, pr.sy, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. 3D Floating Island Cliff Rim (underneath Y=0) & Top Grass/Stone Surface
    drawCircleGround(
      cam,
      [0, -2.2, 0],
      world.island_radius * 0.93,
      48,
      '#120e24',
      'rgba(90, 70, 130, 0.35)',
      2
    );
    drawCircleGround(
      cam,
      [0, -1.0, 0],
      world.island_radius * 0.97,
      48,
      '#1a1630',
      null,
      1
    );

    const groundR = Math.round(24 + brightRatio * 38);
    const groundG = Math.round(35 + brightRatio * 52);
    const groundB = Math.round(48 + brightRatio * 28);
    drawCircleGround(
      cam,
      [0, 0, 0],
      world.island_radius,
      56,
      `rgb(${groundR},${groundG},${groundB})`,
      'rgba(255, 200, 110, 0.55)',
      2.5
    );

    // Decorative inner courtyard & stone pathways connecting origin to the 5 Great Lanterns
    drawCircleGround(
      cam,
      [0, 0.02, 0],
      5.5,
      32,
      'rgba(255, 205, 125, 0.10)',
      'rgba(255, 215, 140, 0.38)',
      1.8
    );
    drawCircleGround(
      cam,
      [0, 0.03, 0],
      2.4,
      24,
      'rgba(255, 185, 90, 0.16)',
      'rgba(255, 225, 150, 0.5)',
      1.5
    );

    // Radial stone paths from center courtyard to each Great Lantern
    for (const lantern of world.lanterns) {
      const steps = 7;
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const sx = lantern.pos[0] * t;
        const sz = lantern.pos[2] * t;
        drawCircleGround(
          cam,
          [sx, 0.02, sz],
          0.95,
          10,
          lantern.lit ? 'rgba(255, 205, 120, 0.24)' : 'rgba(160, 150, 190, 0.12)',
          lantern.lit ? 'rgba(255, 220, 140, 0.45)' : 'rgba(200, 190, 230, 0.18)',
          1
        );
      }
    }

    // Concentric ancient rune rings on the island
    for (const r of [14, 25, 38]) {
      drawCircleGround(cam, [0, 0.02, 0], r, 44, null, 'rgba(255, 215, 140, 0.16)', 1.2);
    }

    // 4. Safe zones & interaction rings around Lanterns
    for (const lantern of world.lanterns) {
      if (lantern.lit) {
        const pulseR = tuning.safe_radius + Math.sin(timeMs * 0.004) * 0.12;
        drawCircleGround(
          cam,
          [lantern.pos[0], 0.04, lantern.pos[2]],
          pulseR,
          36,
          'rgba(255, 185, 65, 0.20)',
          'rgba(255, 225, 130, 0.85)',
          2.2
        );
        drawCircleGround(
          cam,
          [lantern.pos[0], 0.05, lantern.pos[2]],
          tuning.safe_radius * 0.55,
          24,
          'rgba(255, 215, 110, 0.15)',
          null,
          1
        );
      } else {
        drawCircleGround(
          cam,
          [lantern.pos[0], 0.03, lantern.pos[2]],
          tuning.interact_radius,
          24,
          'rgba(180, 160, 220, 0.07)',
          'rgba(255, 195, 110, 0.35)',
          1.4
        );
      }
    }

    // 5. Active pulse wave rings
    for (let i = pulseWaves.length - 1; i >= 0; i--) {
      const pw = pulseWaves[i];
      pw.radius += tuning.pulse_radius / 18;
      pw.alpha -= 0.04;
      if (pw.alpha <= 0) {
        pulseWaves.splice(i, 1);
        continue;
      }
      drawCircleGround(
        cam,
        [pw.x, 0.15, pw.z],
        pw.radius,
        32,
        `rgba(255, 220, 120, ${pw.alpha * 0.28})`,
        `rgba(255, 240, 170, ${pw.alpha})`,
        3.0
      );
    }

    // 6. Collect depth-sorted 3D entities
    const drawables = [];

    // Grass tufts
    for (const g of grassTufts) {
      const pr = cam.project(g.x, 0, g.z);
      if (!pr || pr.zCam > 45) continue;
      drawables.push({
        zCam: pr.zCam,
        draw: () => {
          const sway = Math.sin(timeMs * 0.003 + g.phase) * 0.18;
          const top = cam.project(g.x + sway, g.h, g.z);
          if (!top) return;
          ctx.strokeStyle = brightRatio > 0.5 ? 'rgba(130, 210, 135, 0.55)' : 'rgba(85, 145, 120, 0.45)';
          ctx.lineWidth = Math.max(1, 0.08 * pr.scale);
          ctx.beginPath();
          ctx.moveTo(pr.sx, pr.sy);
          ctx.lineTo(top.sx, top.sy);
          ctx.stroke();
        }
      });
    }

    // Bamboo clusters
    for (const b of bambooClusters) {
      const pr = cam.project(b.x, 1.5, b.z);
      if (!pr) continue;
      drawables.push({
        zCam: pr.zCam,
        draw: () => drawBambooCluster(cam, b, timeMs, brightRatio)
      });
    }

    // Player footstep light trail
    for (const pt of playerTrail) {
      const pr = cam.project(pt.x, pt.y, pt.z);
      if (!pr) continue;
      drawables.push({
        zCam: pr.zCam,
        draw: () => {
          const r = Math.max(1.5, 0.16 * pr.scale * pt.life);
          ctx.fillStyle = `rgba(255, 215, 120, ${pt.life * 0.65})`;
          ctx.beginPath();
          ctx.arc(pr.sx, pr.sy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // Lanterns
    for (const l of world.lanterns) {
      const pr = cam.project(l.pos[0], 1.5, l.pos[2]);
      if (!pr) continue;
      drawables.push({
        zCam: pr.zCam,
        draw: () => drawGreatLantern(cam, l, timeMs)
      });
    }

    // Motes (fireflies)
    for (const m of world.motes) {
      const pr = cam.project(m.pos[0], 0.6, m.pos[2]);
      if (!pr) continue;
      drawables.push({
        zCam: pr.zCam,
        draw: () => drawMote(cam, m, timeMs)
      });
    }

    // Shades (Bóng Mực)
    for (const s of world.shades) {
      const pr = cam.project(s.pos[0], 0.8, s.pos[2]);
      if (!pr) continue;
      drawables.push({
        zCam: pr.zCam,
        draw: () => drawShade(cam, s, timeMs)
      });
    }

    // Floating Sky Lanterns (Creative feature)
    for (const sl of skyLanterns) {
      const pr = cam.project(sl.x, sl.y, sl.z);
      if (!pr) continue;
      drawables.push({
        zCam: pr.zCam,
        draw: () => drawSkyLantern(pr)
      });
    }

    // Player (Mây)
    const pProj = cam.project(world.player.pos[0], world.player.pos[1] + 0.8, world.player.pos[2]);
    if (pProj) {
      drawables.push({
        zCam: pProj.zCam,
        draw: () => drawPlayerMay(cam, world.player, timeMs)
      });
    }

    // Painter's algorithm: far to near
    drawables.sort((a, b) => b.zCam - a.zCam);
    for (const item of drawables) {
      item.draw();
    }

    // 7. Cinematic Atmospheric Vignette
    const vig = ctx.createRadialGradient(
      canvas.width * 0.5,
      canvas.height * 0.5,
      canvas.height * 0.35,
      canvas.width * 0.5,
      canvas.height * 0.5,
      canvas.width * 0.75
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(6, 3, 16, ${0.42 - brightRatio * 0.2})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawBambooCluster(cam, cluster, timeMs, brightRatio) {
    const sway = Math.sin(timeMs * 0.002 + cluster.seed) * 0.22;
    // Decorative rock at base
    const rockPr = cam.project(cluster.x, 0.25, cluster.z);
    if (rockPr) {
      const rw = Math.max(4, 0.75 * rockPr.scale);
      const rh = Math.max(3, 0.45 * rockPr.scale);
      ctx.fillStyle = '#29253e';
      ctx.strokeStyle = 'rgba(255, 210, 140, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(rockPr.sx, rockPr.sy, rw, rh, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    for (let s = 0; s < cluster.stalks; s++) {
      const ox = ((s - 1) * 0.35);
      const oz = ((s % 2) * 0.3);
      const h = cluster.height - s * 0.45;
      const base = cam.project(cluster.x + ox, 0, cluster.z + oz);
      const mid = cam.project(cluster.x + ox + sway * 0.4, h * 0.5, cluster.z + oz);
      const top = cam.project(cluster.x + ox + sway, h, cluster.z + oz);
      if (!base || !mid || !top) continue;

      ctx.strokeStyle = brightRatio > 0.4 ? '#4d8a6a' : '#2d564c';
      ctx.lineWidth = Math.max(2, 0.13 * base.scale);
      ctx.beginPath();
      ctx.moveTo(base.sx, base.sy);
      ctx.quadraticCurveTo(mid.sx, mid.sy, top.sx, top.sy);
      ctx.stroke();

      // Glowing canopy leaves at top
      const leafR = Math.max(4, 0.65 * top.scale);
      ctx.fillStyle = brightRatio > 0.4 ? 'rgba(95, 175, 125, 0.55)' : 'rgba(45, 95, 85, 0.5)';
      ctx.beginPath();
      ctx.arc(top.sx, top.sy, leafR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSkyLantern(pr) {
    const r = Math.max(3.5, 0.42 * pr.scale);
    const grad = ctx.createRadialGradient(pr.sx, pr.sy, r * 0.2, pr.sx, pr.sy, r * 3.0);
    grad.addColorStop(0, 'rgba(255, 250, 210, 0.98)');
    grad.addColorStop(0.45, 'rgba(255, 170, 55, 0.72)');
    grad.addColorStop(1, 'rgba(255, 110, 15, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pr.sx, pr.sy, r * 3.0, 0, Math.PI * 2);
    ctx.fill();

    // Paper lantern silhouette
    ctx.fillStyle = '#ffdf8e';
    ctx.strokeStyle = '#d96b18';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(pr.sx - r * 0.55, pr.sy - r * 0.7, r * 1.1, r * 1.4, 3);
    ctx.fill();
    ctx.stroke();
  }

  function drawGreatLantern(cam, lantern, timeMs) {
    const [lx, , lz] = lantern.pos;
    const base = cam.project(lx, 0, lz);
    const pedestalTop = cam.project(lx, 0.65, lz);
    const top = cam.project(lx, 3.8, lz);
    const roofEave = cam.project(lx, 4.35, lz);
    const roofTip = cam.project(lx, 5.15, lz);
    if (!base || !top || !roofTip || !roofEave || !pedestalTop) return;

    const s = top.scale;

    // 1. Stone Pedestal Base
    drawCircleGround(
      cam,
      [lx, 0.05, lz],
      1.15,
      12,
      lantern.lit ? '#5e4b3e' : '#2b243d',
      lantern.lit ? '#ffb95e' : '#584b78',
      1.5
    );

    // 2. Wooden / Stone Pillar with warm rim
    ctx.strokeStyle = lantern.lit ? '#d88b38' : '#3d3154';
    ctx.lineWidth = Math.max(4, 0.34 * base.scale);
    ctx.beginPath();
    ctx.moveTo(base.sx, base.sy);
    ctx.lineTo(top.sx, top.sy);
    ctx.stroke();

    // Decorative crossbar at top of pillar
    const crossW = Math.max(12, 1.45 * s);
    ctx.strokeStyle = lantern.lit ? '#ffcf75' : '#5c4c7d';
    ctx.lineWidth = Math.max(2.5, 0.18 * s);
    ctx.beginPath();
    ctx.moveTo(top.sx - crossW * 0.5, top.sy - 0.35 * s);
    ctx.lineTo(top.sx + crossW * 0.5, top.sy - 0.35 * s);
    ctx.stroke();

    // 3. Multi-layered Volumetric Glow Halo if lit
    if (lantern.lit) {
      const pulse = 1 + Math.sin(timeMs * 0.005) * 0.09;
      const haloR = Math.max(18, 4.2 * s * pulse);
      const grad = ctx.createRadialGradient(top.sx, top.sy, haloR * 0.08, top.sx, top.sy, haloR);
      grad.addColorStop(0, 'rgba(255, 252, 220, 0.98)');
      grad.addColorStop(0.32, 'rgba(255, 190, 70, 0.65)');
      grad.addColorStop(0.68, 'rgba(255, 130, 25, 0.25)');
      grad.addColorStop(1, 'rgba(255, 100, 10, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(top.sx, top.sy, haloR, 0, Math.PI * 2);
      ctx.fill();
    } else if (lantern.deposited > 0) {
      // Partial deposited glow
      const partR = Math.max(10, 1.8 * s);
      const grad = ctx.createRadialGradient(top.sx, top.sy, 2, top.sx, top.sy, partR);
      grad.addColorStop(0, 'rgba(255, 210, 110, 0.65)');
      grad.addColorStop(1, 'rgba(255, 150, 40, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(top.sx, top.sy, partR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Hexagonal Pagoda Lantern Cage Body
    const boxW = Math.max(10, 1.15 * s);
    const boxH = Math.max(12, 1.35 * s);
    ctx.fillStyle = lantern.lit ? '#ffe28a' : '#211934';
    ctx.strokeStyle = lantern.lit ? '#fff6d1' : '#736096';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(top.sx - boxW / 2, top.sy - boxH / 2, boxW, boxH, 5);
    ctx.fill();
    ctx.stroke();

    // Inner lattice ribs on lantern glass
    ctx.strokeStyle = lantern.lit ? 'rgba(210, 105, 20, 0.65)' : 'rgba(115, 96, 150, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(top.sx, top.sy - boxH / 2);
    ctx.lineTo(top.sx, top.sy + boxH / 2);
    ctx.moveTo(top.sx - boxW / 2, top.sy);
    ctx.lineTo(top.sx + boxW / 2, top.sy);
    ctx.stroke();

    // Red tassel hanging underneath the lantern cage
    ctx.strokeStyle = lantern.lit ? '#ff5238' : '#6e354b';
    ctx.lineWidth = Math.max(1.5, 0.1 * s);
    ctx.beginPath();
    ctx.moveTo(top.sx, top.sy + boxH * 0.5);
    ctx.lineTo(top.sx + Math.sin(timeMs * 0.004) * 2, top.sy + boxH * 0.9);
    ctx.stroke();

    // 5. Curved Pagoda Roof with upturned eaves
    const roofW = boxW * 1.15;
    ctx.fillStyle = lantern.lit ? '#d86c1e' : '#35284d';
    ctx.strokeStyle = lantern.lit ? '#ffcf70' : '#6e5c91';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(roofTip.sx, roofTip.sy);
    ctx.quadraticCurveTo(top.sx - roofW * 0.5, roofEave.sy, top.sx - roofW, top.sy - boxH * 0.48);
    ctx.lineTo(top.sx + roofW, top.sy - boxH * 0.48);
    ctx.quadraticCurveTo(top.sx + roofW * 0.5, roofEave.sy, roofTip.sx, roofTip.sy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 6. Floating Status Badge & Deposit Progress Orbs
    const badgeY = roofTip.sy - 14;
    ctx.fillStyle = 'rgba(15, 10, 28, 0.78)';
    ctx.strokeStyle = lantern.lit ? '#ffb84d' : 'rgba(180, 160, 220, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(roofTip.sx - 34, badgeY - 13, 68, 20, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = lantern.lit ? '#ffe28a' : '#e6dcf5';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    const statusText = lantern.lit
      ? `${lantern.id} ★ SÁNG`
      : `${lantern.id} (${lantern.deposited}/${tuning.lantern_cost})`;
    ctx.fillText(statusText, roofTip.sx, badgeY + 1);
  }

  function drawMote(cam, mote, timeMs) {
    const phase = parseInt(mote.id.replace(/\D/g, ''), 10) || 1;
    const bobY = 0.65 + Math.sin(timeMs * 0.0055 + phase) * 0.25;
    const pr = cam.project(mote.pos[0], bobY, mote.pos[2]);
    if (!pr) return;

    const r = Math.max(3.5, 0.36 * pr.scale);

    // Ground light reflection
    const groundPr = cam.project(mote.pos[0], 0.03, mote.pos[2]);
    if (groundPr) {
      ctx.fillStyle = 'rgba(255, 195, 70, 0.22)';
      ctx.beginPath();
      ctx.ellipse(
        groundPr.sx,
        groundPr.sy,
        Math.max(3, 0.42 * groundPr.scale),
        Math.max(1.5, 0.22 * groundPr.scale),
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Flapping translucent fairy wings
    const wingSpread = (0.7 + Math.sin(timeMs * 0.025 + phase) * 0.35) * r * 1.9;
    ctx.fillStyle = 'rgba(255, 245, 200, 0.45)';
    ctx.beginPath();
    ctx.ellipse(pr.sx - wingSpread * 0.55, pr.sy - r * 0.2, wingSpread * 0.6, r * 0.42, -0.35, 0, Math.PI * 2);
    ctx.ellipse(pr.sx + wingSpread * 0.55, pr.sy - r * 0.2, wingSpread * 0.6, r * 0.42, 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Warm golden glow orb
    const grad = ctx.createRadialGradient(pr.sx, pr.sy, r * 0.15, pr.sx, pr.sy, r * 2.8);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.32, '#ffe680');
    grad.addColorStop(0.68, 'rgba(255, 170, 35, 0.65)');
    grad.addColorStop(1, 'rgba(255, 130, 0, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pr.sx, pr.sy, r * 2.8, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawShade(cam, shade, timeMs) {
    const isStunned = shade.state === 'stunned';
    const bobY = 0.85 + Math.sin(timeMs * 0.006 + shade.pos[0]) * 0.16;
    const pr = cam.project(shade.pos[0], bobY, shade.pos[2]);
    if (!pr) return;

    const r = Math.max(8, 0.92 * pr.scale);

    // Dark ink puddle on the ground
    const groundPr = cam.project(shade.pos[0], 0.03, shade.pos[2]);
    if (groundPr) {
      ctx.fillStyle = isStunned ? 'rgba(110, 90, 160, 0.32)' : 'rgba(18, 6, 36, 0.68)';
      ctx.beginPath();
      ctx.ellipse(
        groundPr.sx,
        groundPr.sy,
        Math.max(6, 0.85 * groundPr.scale),
        Math.max(3, 0.42 * groundPr.scale),
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Animated swirling ink wisps / tendrils around Bóng Mực
    for (let w = 0; w < 5; w++) {
      const ang = timeMs * 0.004 * (isStunned ? 0.3 : 1) + (w * Math.PI * 2) / 5;
      const wx = pr.sx + Math.cos(ang) * r * 0.95;
      const wy = pr.sy + Math.sin(ang * 1.3) * r * 0.65 + r * 0.35;
      ctx.fillStyle = isStunned ? 'rgba(140, 120, 195, 0.42)' : 'rgba(42, 12, 78, 0.72)';
      ctx.beginPath();
      ctx.arc(wx, wy, r * 0.48, 0, Math.PI * 2);
      ctx.fill();
    }

    // Core dark ink aura
    const grad = ctx.createRadialGradient(pr.sx, pr.sy, r * 0.2, pr.sx, pr.sy, r * 1.75);
    if (isStunned) {
      grad.addColorStop(0, '#8573ab');
      grad.addColorStop(0.6, 'rgba(135, 115, 190, 0.65)');
      grad.addColorStop(1, 'rgba(90, 70, 140, 0)');
    } else {
      grad.addColorStop(0, '#0b0414');
      grad.addColorStop(0.55, 'rgba(68, 18, 112, 0.88)');
      grad.addColorStop(1, 'rgba(35, 8, 65, 0)');
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pr.sx, pr.sy, r * 1.75, 0, Math.PI * 2);
    ctx.fill();

    // Glowing menacing eyes (or dizzy stars when stunned)
    const eyeOffset = r * 0.32;
    ctx.fillStyle = isStunned ? '#ffd875' : '#e048ff';
    ctx.shadowColor = isStunned ? '#ffd875' : '#d422ff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(pr.sx - eyeOffset, pr.sy - r * 0.1, Math.max(2.2, r * 0.16), 0, Math.PI * 2);
    ctx.arc(pr.sx + eyeOffset, pr.sy - r * 0.1, Math.max(2.2, r * 0.16), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Orbiting stun halo stars when stunned
    if (isStunned) {
      for (let k = 0; k < 3; k++) {
        const a = timeMs * 0.008 + (k * Math.PI * 2) / 3;
        const sx = pr.sx + Math.cos(a) * r * 0.85;
        const sy = pr.sy - r * 0.95 + Math.sin(a) * r * 0.22;
        ctx.fillStyle = '#ffe58f';
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(2, r * 0.13), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawPlayerMay(cam, player, timeMs) {
    const [px, py, pz] = player.pos;
    const feet = cam.project(px, py, pz);
    const bodyMid = cam.project(px, py + 0.95, pz);
    const head = cam.project(px, py + 1.52, pz);
    const hatBrim = cam.project(px, py + 1.62, pz);
    const hatTip = cam.project(px, py + 2.22, pz);
    if (!feet || !bodyMid || !head || !hatTip || !hatBrim) return;

    // Blink when invulnerable
    if (player.invuln_ticks > 0 && Math.floor(player.invuln_ticks / 4) % 2 === 1) {
      return;
    }

    const s = bodyMid.scale;

    // 1. Warm personal lantern glow around Mây
    const glowR = Math.max(22, (2.5 + player.carried * 0.5) * s);
    const grad = ctx.createRadialGradient(head.sx, head.sy, glowR * 0.08, head.sx, head.sy, glowR);
    grad.addColorStop(0, 'rgba(255, 235, 165, 0.62)');
    grad.addColorStop(0.45, 'rgba(255, 175, 55, 0.26)');
    grad.addColorStop(1, 'rgba(255, 130, 20, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(head.sx, head.sy, glowR, 0, Math.PI * 2);
    ctx.fill();

    // 2. Ground Shadow
    const groundShadow = cam.project(px, 0.02, pz);
    if (groundShadow) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.46)';
      ctx.beginPath();
      ctx.ellipse(
        groundShadow.sx,
        groundShadow.sy,
        Math.max(5, 0.55 * groundShadow.scale),
        Math.max(2.5, 0.28 * groundShadow.scale),
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // 3. Flowing Scarf fluttering behind Mây
    const backX = px - Math.sin(player.facing_yaw_rad) * 0.55;
    const backZ = pz - Math.cos(player.facing_yaw_rad) * 0.55;
    const scarfEnd = cam.project(
      backX + Math.sin(timeMs * 0.01) * 0.18,
      py + 1.15 + Math.cos(timeMs * 0.012) * 0.1,
      backZ
    );
    if (scarfEnd) {
      ctx.strokeStyle = '#ff6b4a';
      ctx.lineWidth = Math.max(3, 0.22 * s);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(head.sx, head.sy + 2);
      ctx.quadraticCurveTo((head.sx + scarfEnd.sx) * 0.5, head.sy + 6, scarfEnd.sx, scarfEnd.sy);
      ctx.stroke();
    }

    // 4. Layered Golden-Amber Rain Cloak (Áo tơi / Áo choàng giữ đèn)
    const cloakW = Math.max(9, 0.92 * s);
    const cloakGrad = ctx.createLinearGradient(head.sx, head.sy, feet.sx, feet.sy);
    cloakGrad.addColorStop(0, '#f5b056');
    cloakGrad.addColorStop(0.65, '#d97a2b');
    cloakGrad.addColorStop(1, '#8c3f14');

    ctx.fillStyle = cloakGrad;
    ctx.strokeStyle = '#ffeac2';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(head.sx, head.sy - 2);
    ctx.quadraticCurveTo(bodyMid.sx - cloakW * 0.5, bodyMid.sy, feet.sx - cloakW * 0.7, feet.sy);
    ctx.quadraticCurveTo(feet.sx, feet.sy + 4, feet.sx + cloakW * 0.7, feet.sy);
    ctx.quadraticCurveTo(bodyMid.sx + cloakW * 0.5, bodyMid.sy, head.sx, head.sy - 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 5. Orbiting Carried Fireflies around Mây
    for (let c = 0; c < player.carried; c++) {
      const a = timeMs * 0.0045 + (c * Math.PI * 2) / Math.max(1, player.carried);
      const ox = px + Math.cos(a) * 0.95;
      const oz = pz + Math.sin(a) * 0.95;
      const oy = py + 1.05 + Math.sin(timeMs * 0.008 + c) * 0.18;
      const orbPr = cam.project(ox, oy, oz);
      if (orbPr) {
        const or = Math.max(2.5, 0.18 * orbPr.scale);
        ctx.fillStyle = '#fff5b8';
        ctx.shadowColor = '#ffaa22';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(orbPr.sx, orbPr.sy, or, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // 6. Nón lá (Vietnamese Conical Hat with woven bamboo ribs)
    const hatW = Math.max(14, 1.5 * s);
    const hatGrad = ctx.createLinearGradient(hatTip.sx, hatTip.sy, head.sx, head.sy + 4);
    hatGrad.addColorStop(0, '#fff0c4');
    hatGrad.addColorStop(0.6, '#e2be7e');
    hatGrad.addColorStop(1, '#b58946');

    ctx.fillStyle = hatGrad;
    ctx.strokeStyle = '#8c652c';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(hatTip.sx, hatTip.sy);
    ctx.lineTo(hatBrim.sx - hatW * 0.78, hatBrim.sy + 2);
    ctx.quadraticCurveTo(hatBrim.sx, hatBrim.sy + 7, hatBrim.sx + hatW * 0.78, hatBrim.sy + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Woven ribs on Nón lá
    ctx.strokeStyle = 'rgba(130, 90, 38, 0.45)';
    ctx.lineWidth = 1;
    for (const f of [-0.45, -0.15, 0.15, 0.45]) {
      ctx.beginPath();
      ctx.moveTo(hatTip.sx, hatTip.sy);
      ctx.lineTo(hatBrim.sx + hatW * f, hatBrim.sy + 4);
      ctx.stroke();
    }

    // 7. Small Lantern hanging from Mây's Nón lá brim (PRD-0 signature feature)
    const brimX = px + Math.sin(player.facing_yaw_rad) * 0.68;
    const brimZ = pz + Math.cos(player.facing_yaw_rad) * 0.68;
    const stringTop = cam.project(brimX, py + 1.62, brimZ);
    const miniLantern = cam.project(
      brimX,
      py + 1.42 + Math.sin(timeMs * 0.008) * 0.04,
      brimZ
    );
    if (stringTop && miniLantern) {
      // Hanging cord
      ctx.strokeStyle = '#ffd27f';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(stringTop.sx, stringTop.sy);
      ctx.lineTo(miniLantern.sx, miniLantern.sy);
      ctx.stroke();

      const mr = Math.max(4, 0.28 * miniLantern.scale);
      const miniGlow = ctx.createRadialGradient(
        miniLantern.sx,
        miniLantern.sy,
        mr * 0.2,
        miniLantern.sx,
        miniLantern.sy,
        mr * 3.2
      );
      miniGlow.addColorStop(0, '#ffffff');
      miniGlow.addColorStop(0.35, '#ffe885');
      miniGlow.addColorStop(0.7, 'rgba(255, 165, 35, 0.65)');
      miniGlow.addColorStop(1, 'rgba(255, 130, 0, 0)');
      ctx.fillStyle = miniGlow;
      ctx.beginPath();
      ctx.arc(miniLantern.sx, miniLantern.sy, mr * 3.2, 0, Math.PI * 2);
      ctx.fill();

      // Core mini lantern body
      ctx.fillStyle = '#fff9cc';
      ctx.beginPath();
      ctx.arc(miniLantern.sx, miniLantern.sy, mr * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Fixed 60Hz timestep accumulator loop
  let lastTime = performance.now();
  let accumulator = 0;
  const STEP_MS = 1000 / 60;

  function loop(now) {
    const dtMs = Math.min(100, now - lastTime);
    lastTime = now;
    accumulator += dtMs;

    if (keys['KeyQ']) camYawDeg = (camYawDeg - 1.8) % 360;
    if (keys['KeyR']) camYawDeg = (camYawDeg + 1.8) % 360;

    while (accumulator >= STEP_MS) {
      accumulator -= STEP_MS;
      if (world && world.state === 'playing') {
        let mx = 0;
        let mz = 0;
        if (keys['KeyW'] || keys['ArrowUp']) mz += 1;
        if (keys['KeyS'] || keys['ArrowDown']) mz -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;

        if ((mx !== 0 || mz !== 0) && world.tick % 4 === 0) {
          playerTrail.push({
            x: world.player.pos[0],
            y: world.player.pos[1] + 0.12,
            z: world.player.pos[2],
            life: 1.0
          });
        }

        for (let i = playerTrail.length - 1; i >= 0; i--) {
          playerTrail[i].life -= 0.035;
          if (playerTrail[i].life <= 0) playerTrail.splice(i, 1);
        }

        const events = world.step({
          move: [mx, mz],
          cam_yaw_deg: camYawDeg,
          jump: edgeQueue.jump,
          interact: edgeQueue.interact,
          pulse: edgeQueue.pulse
        });

        edgeQueue.jump = false;
        edgeQueue.interact = false;
        edgeQueue.pulse = false;

        for (const ev of events) {
          if (ev.name === 'mote_picked') {
            playChime(ev.data.carried + 1, 0.35, 'sine', 0.12);
          } else if (ev.name === 'deposit') {
            playChime(4, 0.45, 'triangle', 0.14);
          } else if (ev.name === 'lantern_lit') {
            playChord([0, 2, 4, 5]);
            const litLantern = world.lanterns.find(l => l.id === ev.data.lantern_id);
            if (litLantern) spawnSkyLanterns(litLantern.pos, 8);
          } else if (ev.name === 'pulse') {
            pulseWaves.push({
              x: world.player.pos[0],
              z: world.player.pos[2],
              radius: 0.6,
              alpha: 0.95
            });
            playChord([5, 3, 1]);
          } else if (ev.name === 'player_hit') {
            playChime(0, 0.6, 'sawtooth', 0.15);
          } else if (ev.name === 'game_over') {
            showEndModal(ev.data.result, ev.data.reason);
          }
        }

        // Update floating sky lanterns
        for (let i = skyLanterns.length - 1; i >= 0; i--) {
          const sl = skyLanterns[i];
          sl.y += sl.vy / 60;
          sl.x += Math.cos(sl.drift + now * 0.001) * 0.015;
          sl.z += Math.sin(sl.drift + now * 0.001) * 0.015;
          sl.life -= 1 / 60;
          if (sl.life <= 0) skyLanterns.splice(i, 1);
        }

        updateHUD();
      }
    }

    renderScene(now);
    requestAnimationFrame(loop);
  }

  // Load contract tuning so web client & headless always share 100% identical numbers
  fetch('/game.contract.json')
    .then(r => r.json())
    .then(contract => {
      tuning = contract.tuning;
      startNewGame();
      requestAnimationFrame(loop);
    })
    .catch(err => {
      console.error('Failed to load game.contract.json:', err);
    });
})();
