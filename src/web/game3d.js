/**
 * 3D Perspective Renderer & Interactive Client for Đảo Đèn Lồng
 * Uses the exact same deterministic GameWorld (src/sim/world.js) and game.contract.json tuning.
 * Zero external asset dependencies; includes procedural Pentatonic Wind-Chime WebAudio & Sky-Lantern particles.
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
  let camPitchDeg = 28;
  let camDist = 14.5;
  let isDragging = false;
  let lastMouseX = 0;

  // Visual effects (purely presentation — never mutates simulation state)
  const pulseWaves = [];
  const skyLanterns = [];
  const cloudPuffs = [];

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

  // Initialize sea-of-clouds puffs around the island
  for (let i = 0; i < 45; i++) {
    const a = (i / 45) * Math.PI * 2;
    const r = 49 + (i % 4) * 6;
    cloudPuffs.push({
      x: Math.cos(a) * r,
      y: -2.2 + Math.sin(i * 1.7) * 0.8,
      z: Math.sin(a) * r,
      radius: 4.5 + (i % 3) * 1.8,
      phase: i * 0.5
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
  });
  window.addEventListener('mouseup', () => {
    isDragging = false;
  });
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dx = e.clientX - lastMouseX;
    lastMouseX = e.clientX;
    camYawDeg = (camYawDeg + dx * 0.45) % 360;
  });

  function spawnSkyLanterns(originPos) {
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      skyLanterns.push({
        x: originPos[0] + Math.cos(ang) * 1.2,
        y: 2.5 + (i % 2) * 0.5,
        z: originPos[2] + Math.sin(ang) * 1.2,
        vy: 1.2 + (i % 3) * 0.35,
        drift: ang,
        life: 14.0
      });
    }
  }

  function startNewGame() {
    overlay.classList.remove('visible');
    pulseWaves.length = 0;
    skyLanterns.length = 0;
    world = new window.GameWorld(tuning, {
      seed: Date.now() & 0x7fffffff,
      night: 1
    });
    updateHUD();
  }

  btnRestart.addEventListener('click', () => {
    startNewGame();
  });

  // Expose helper for browser automated testing
  window.__DAO_DEN_LONG__ = {
    getWorld: () => world,
    triggerWinDemo: () => {
      if (!world) return;
      for (const l of world.lanterns) {
        l.deposited = tuning.lantern_cost;
        l.lit = true;
        spawnSkyLanterns(l.pos);
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

    // Look-at target slightly above Mây's feet
    const tx = playerPos[0];
    const ty = playerPos[1] + 1.2;
    const tz = playerPos[2];

    // Camera positioned behind player along -forward direction
    const horizDist = camDist * Math.cos(pitchRad);
    const vertDist = camDist * Math.sin(pitchRad);

    const cx = tx - Math.sin(yawRad) * horizDist;
    const cy = ty + vertDist;
    const cz = tz - Math.cos(yawRad) * horizDist;

    // Forward vector (from camera to target)
    let fx = tx - cx;
    let fy = ty - cy;
    let fz = tz - cz;
    const flen = Math.hypot(fx, fy, fz) || 1;
    fx /= flen;
    fy /= flen;
    fz /= flen;

    // Right vector = normalize(cross(forward, worldUp)) or left-handed screen X
    // Notice when yaw=0: forward=(0, *, +1). We want +X world to map to +X screen (right):
    let rx = fz;
    let ry = 0;
    let rz = -fx;
    const rlen = Math.hypot(rx, rz) || 1;
    rx /= rlen;
    rz /= rlen;

    // Up vector = cross(forward, right)
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
        if (zCam <= 0.2) return null;

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

    // 1. Sky gradient (gets warmer & brighter as more lanterns are lit)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    const rTop = Math.round(9 + brightRatio * 28);
    const gTop = Math.round(6 + brightRatio * 22);
    const bTop = Math.round(22 + brightRatio * 42);
    const rBot = Math.round(24 + brightRatio * 65);
    const gBot = Math.round(14 + brightRatio * 42);
    const bBot = Math.round(44 + brightRatio * 35);
    skyGrad.addColorStop(0, `rgb(${rTop},${gTop},${bTop})`);
    skyGrad.addColorStop(1, `rgb(${rBot},${gBot},${bBot})`);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cam = createCamera(world.player.pos);

    // 2. Sea of Clouds around the island
    for (const puff of cloudPuffs) {
      const bobY = puff.y + Math.sin(timeMs * 0.0012 + puff.phase) * 0.45;
      const pr = cam.project(puff.x, bobY, puff.z);
      if (!pr) continue;
      const rad = puff.radius * pr.scale;
      const alpha = 0.16 + brightRatio * 0.18;
      ctx.fillStyle = `rgba(${160 + Math.round(brightRatio * 80)}, ${145 + Math.round(brightRatio * 70)}, 210, ${alpha})`;
      ctx.beginPath();
      ctx.arc(pr.sx, pr.sy, Math.max(2, rad), 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Island Ground Disc (Y = 0, radius = 45m)
    const groundR = Math.round(22 + brightRatio * 40);
    const groundG = Math.round(28 + brightRatio * 48);
    const groundB = Math.round(42 + brightRatio * 25);
    drawCircleGround(
      cam,
      [0, 0, 0],
      world.island_radius,
      48,
      `rgb(${groundR},${groundG},${groundB})`,
      'rgba(255, 190, 95, 0.4)',
      2
    );

    // Subtle concentric stone rings on the island
    for (const r of [12, 25, 38]) {
      drawCircleGround(cam, [0, 0.02, 0], r, 36, null, 'rgba(255, 210, 130, 0.12)', 1);
    }

    // 4. Safe zones & interaction rings around Lanterns
    for (const lantern of world.lanterns) {
      if (lantern.lit) {
        drawCircleGround(
          cam,
          [lantern.pos[0], 0.03, lantern.pos[2]],
          tuning.safe_radius,
          28,
          'rgba(255, 185, 70, 0.16)',
          'rgba(255, 205, 100, 0.65)',
          2
        );
      } else {
        drawCircleGround(
          cam,
          [lantern.pos[0], 0.03, lantern.pos[2]],
          tuning.interact_radius,
          20,
          'rgba(180, 160, 220, 0.06)',
          'rgba(255, 190, 100, 0.28)',
          1
        );
      }
    }

    // 5. Active pulse wave rings
    for (let i = pulseWaves.length - 1; i >= 0; i--) {
      const pw = pulseWaves[i];
      pw.radius += (tuning.pulse_radius / 20);
      pw.alpha -= 0.045;
      if (pw.alpha <= 0) {
        pulseWaves.splice(i, 1);
        continue;
      }
      drawCircleGround(
        cam,
        [pw.x, 0.15, pw.z],
        pw.radius,
        28,
        `rgba(255, 215, 110, ${pw.alpha * 0.25})`,
        `rgba(255, 230, 140, ${pw.alpha})`,
        2.5
      );
    }

    // 6. Collect depth-sorted 3D entities (Lanterns, Motes, Shades, Player, SkyLanterns)
    const drawables = [];

    // Lanterns
    for (const l of world.lanterns) {
      const pr = cam.project(l.pos[0], 0, l.pos[2]);
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
        draw: () => {
          const r = Math.max(3, 0.38 * pr.scale);
          const grad = ctx.createRadialGradient(pr.sx, pr.sy, r * 0.2, pr.sx, pr.sy, r * 2.5);
          grad.addColorStop(0, 'rgba(255, 245, 190, 0.95)');
          grad.addColorStop(0.5, 'rgba(255, 165, 50, 0.65)');
          grad.addColorStop(1, 'rgba(255, 120, 20, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(pr.sx, pr.sy, r * 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // Player (Mây)
    const pProj = cam.project(world.player.pos[0], world.player.pos[1], world.player.pos[2]);
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
  }

  function drawGreatLantern(cam, lantern, timeMs) {
    const base = cam.project(lantern.pos[0], 0, lantern.pos[2]);
    const top = cam.project(lantern.pos[0], 3.6, lantern.pos[2]);
    const roofTip = cam.project(lantern.pos[0], 4.5, lantern.pos[2]);
    if (!base || !top || !roofTip) return;

    const s = top.scale;

    // Pillar
    ctx.strokeStyle = lantern.lit ? '#ffd280' : '#4a3d60';
    ctx.lineWidth = Math.max(3, 0.28 * base.scale);
    ctx.beginPath();
    ctx.moveTo(base.sx, base.sy);
    ctx.lineTo(top.sx, top.sy);
    ctx.stroke();

    // Glow halo if lit
    if (lantern.lit) {
      const pulse = 1 + Math.sin(timeMs * 0.005) * 0.08;
      const haloR = Math.max(12, 3.2 * s * pulse);
      const grad = ctx.createRadialGradient(top.sx, top.sy, haloR * 0.1, top.sx, top.sy, haloR);
      grad.addColorStop(0, 'rgba(255, 245, 190, 0.95)');
      grad.addColorStop(0.4, 'rgba(255, 175, 55, 0.55)');
      grad.addColorStop(1, 'rgba(255, 140, 20, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(top.sx, top.sy, haloR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Lantern cage body
    const boxW = Math.max(8, 0.95 * s);
    const boxH = Math.max(10, 1.15 * s);
    ctx.fillStyle = lantern.lit ? '#ffcf6e' : '#261e38';
    ctx.strokeStyle = lantern.lit ? '#fff2c2' : '#6c5a8a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(top.sx - boxW / 2, top.sy - boxH / 2, boxW, boxH, 4);
    ctx.fill();
    ctx.stroke();

    // Conical roof
    ctx.fillStyle = lantern.lit ? '#d47a22' : '#3a2d52';
    ctx.beginPath();
    ctx.moveTo(roofTip.sx, roofTip.sy);
    ctx.lineTo(top.sx - boxW * 0.85, top.sy - boxH * 0.45);
    ctx.lineTo(top.sx + boxW * 0.85, top.sy - boxH * 0.45);
    ctx.closePath();
    ctx.fill();

    // Label & progress pips
    ctx.fillStyle = '#fff5e0';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    const statusText = lantern.lit
      ? `${lantern.id} ★`
      : `${lantern.id} (${lantern.deposited}/${tuning.lantern_cost})`;
    ctx.fillText(statusText, roofTip.sx, roofTip.sy - 8);
  }

  function drawMote(cam, mote, timeMs) {
    const phase = parseInt(mote.id.replace(/\D/g, ''), 10) || 1;
    const bobY = 0.65 + Math.sin(timeMs * 0.005 + phase) * 0.25;
    const pr = cam.project(mote.pos[0], bobY, mote.pos[2]);
    if (!pr) return;

    const r = Math.max(3.5, 0.35 * pr.scale);
    const grad = ctx.createRadialGradient(pr.sx, pr.sy, r * 0.15, pr.sx, pr.sy, r * 2.6);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.35, '#ffe07d');
    grad.addColorStop(0.7, 'rgba(255, 168, 38, 0.6)');
    grad.addColorStop(1, 'rgba(255, 140, 0, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pr.sx, pr.sy, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawShade(cam, shade, timeMs) {
    const isStunned = shade.state === 'stunned';
    const bobY = 0.85 + Math.sin(timeMs * 0.006 + shade.pos[0]) * 0.15;
    const pr = cam.project(shade.pos[0], bobY, shade.pos[2]);
    if (!pr) return;

    const r = Math.max(8, 0.9 * pr.scale);

    // Dark ink aura
    const grad = ctx.createRadialGradient(pr.sx, pr.sy, r * 0.2, pr.sx, pr.sy, r * 1.7);
    if (isStunned) {
      grad.addColorStop(0, '#7c6b9e');
      grad.addColorStop(0.6, 'rgba(130, 110, 180, 0.6)');
      grad.addColorStop(1, 'rgba(90, 70, 140, 0)');
    } else {
      grad.addColorStop(0, '#12081f');
      grad.addColorStop(0.6, 'rgba(72, 22, 115, 0.82)');
      grad.addColorStop(1, 'rgba(40, 10, 70, 0)');
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pr.sx, pr.sy, r * 1.7, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    const eyeOffset = r * 0.32;
    ctx.fillStyle = isStunned ? '#ffd27f' : '#d442ff';
    ctx.beginPath();
    ctx.arc(pr.sx - eyeOffset, pr.sy - r * 0.1, Math.max(2, r * 0.15), 0, Math.PI * 2);
    ctx.arc(pr.sx + eyeOffset, pr.sy - r * 0.1, Math.max(2, r * 0.15), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayerMay(cam, player, timeMs) {
    const [px, py, pz] = player.pos;
    const feet = cam.project(px, py, pz);
    const bodyMid = cam.project(px, py + 0.95, pz);
    const head = cam.project(px, py + 1.55, pz);
    const hatTip = cam.project(px, py + 2.15, pz);
    if (!feet || !bodyMid || !head || !hatTip) return;

    // Blink when invulnerable
    if (player.invuln_ticks > 0 && Math.floor(player.invuln_ticks / 4) % 2 === 1) {
      return;
    }

    const s = bodyMid.scale;

    // Warm personal lantern glow around Mây
    const glowR = Math.max(18, (2.2 + player.carried * 0.45) * s);
    const grad = ctx.createRadialGradient(head.sx, head.sy, glowR * 0.1, head.sx, head.sy, glowR);
    grad.addColorStop(0, 'rgba(255, 225, 140, 0.55)');
    grad.addColorStop(0.5, 'rgba(255, 165, 50, 0.22)');
    grad.addColorStop(1, 'rgba(255, 130, 20, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(head.sx, head.sy, glowR, 0, Math.PI * 2);
    ctx.fill();

    // Shadow on island ground
    const groundShadow = cam.project(px, 0.02, pz);
    if (groundShadow) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.beginPath();
      ctx.ellipse(
        groundShadow.sx,
        groundShadow.sy,
        Math.max(4, 0.5 * groundShadow.scale),
        Math.max(2, 0.25 * groundShadow.scale),
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Cloak / Body
    const cloakW = Math.max(8, 0.85 * s);
    ctx.fillStyle = '#e89b48';
    ctx.strokeStyle = '#fff0cf';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(head.sx, head.sy);
    ctx.lineTo(feet.sx - cloakW * 0.65, feet.sy);
    ctx.lineTo(feet.sx + cloakW * 0.65, feet.sy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Nón lá (Conical hat)
    const hatW = Math.max(12, 1.35 * s);
    ctx.fillStyle = '#e5c88e';
    ctx.strokeStyle = '#a88444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hatTip.sx, hatTip.sy);
    ctx.lineTo(head.sx - hatW * 0.75, head.sy + 2);
    ctx.lineTo(head.sx + hatW * 0.75, head.sy + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Small lantern hanging from Mây's Nón lá brim (PRD-0 requirement)
    const brimX = px + Math.sin(player.facing_yaw_rad) * 0.62;
    const brimZ = pz + Math.cos(player.facing_yaw_rad) * 0.62;
    const miniLantern = cam.project(brimX, py + 1.48 + Math.sin(timeMs * 0.008) * 0.04, brimZ);
    if (miniLantern) {
      const mr = Math.max(3.5, 0.24 * miniLantern.scale);
      ctx.fillStyle = '#fff6b3';
      ctx.shadowColor = '#ffaa22';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(miniLantern.sx, miniLantern.sy, mr, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
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

    // Smooth camera rotation with Q / R keys
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
            if (litLantern) spawnSkyLanterns(litLantern.pos);
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
