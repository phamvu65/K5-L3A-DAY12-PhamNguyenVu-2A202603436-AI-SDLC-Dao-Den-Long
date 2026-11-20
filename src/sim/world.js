// Deterministic 60Hz Game Simulation for Đảo Đèn Lồng — Test Contract v1.1 (Phase 2)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const PRNG = require('./prng');
    const GameMaps = require('./maps');
    module.exports = factory(PRNG, GameMaps);
  } else {
    root.GameWorld = factory(root.PRNG, root.GameMaps);
  }
})(typeof self !== 'undefined' ? self : this, function (PRNG, GameMaps) {
  const TICK_RATE = 60;
  const DT = 1 / TICK_RATE;
  const GRAVITY = 20.0;
  const JUMP_VELOCITY = 7.0;

  function round3(n) {
    const r = Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
    return Object.is(r, -0) ? 0 : r;
  }

  function roundVec3(v) {
    return [round3(v[0]), round3(v[1]), round3(v[2])];
  }

  function distXZ(a, b) {
    return Math.hypot(a[0] - b[0], a[2] - b[2]);
  }

  function dist3D(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }

  function sortIdsAsc(a, b) {
    const na = parseInt(String(a.id).replace(/\D/g, ''), 10);
    const nb = parseInt(String(b.id).replace(/\D/g, ''), 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    return String(a.id).localeCompare(String(b.id));
  }

  class GameWorld {
    constructor(tuning, options = {}) {
      this.tuning = JSON.parse(JSON.stringify(tuning));
      this.seed = options.seed !== undefined ? Number(options.seed) : 1;
      this.night = options.night !== undefined ? Number(options.night) : 1;
      this.rng = new PRNG(this.seed);
      this.map = GameMaps.getMap(this.night);

      this.tick = 0;
      this.sim_tick = 0;
      this.state = 'playing'; // 'playing' | 'paused' | 'won' | 'lost'
      this.score = 0;

      const durationKey =
        this.night === 2
          ? 'night2_duration_s'
          : this.night === 3
          ? 'night3_duration_s'
          : 'night1_duration_s';
      const duration = Number(this.tuning[durationKey]) || 300;
      this.initial_duration_s = duration;
      this.time_left_s = duration;

      this.player = {
        pos: [...this.map.startPos],
        vel: [0, 0, 0],
        grounded: true,
        flames: Number(this.tuning.flames) || 3,
        carried: 0,
        invuln_ticks: 0,
        dash_ticks: 0,
        dash_cd_ticks: 0,
        dash_dir: [0, 1],
        pulse_cd_ticks: 0,
        charm_ticks: 0,
        fall_wait_ticks: 0,
        launch_locked: false,
        facing_yaw_rad: 0 // +Z when 0
      };

      this.prevButtons = {
        jump: false,
        interact: false,
        pulse: false,
        dash: false,
        pause: false
      };

      this.nextMoteId = 1;
      this.nextShadeId = 1;
      this.nextDrifterId = 1;

      this.lanterns = this.map.lanterns.map(l => ({
        id: l.id,
        pos: [...l.pos],
        lit: false,
        deposited: 0
      }));

      this.motes = [];
      this.shades = [];
      this.drifters = [];
      this.charms = this.map.charms.map(c => ({
        id: c.id,
        pos: [...c.pos],
        available: true,
        respawn_ticks: 0
      }));

      this.random_motes = true;
      this.random_shades = true;
      this.random_drifters = this.map.driftersEnabled;
      this.wind_enabled = this.map.windEnabled;

      this.wind = {
        active: false,
        warning: false,
        dir_deg: 0,
        timer_ticks: 0
      };

      this.events = [];

      // Populate initial 20 random motes at 20 distinct spawn points
      this._populateInitialMotes(20);

      if (options.scenario) {
        this.applyScenario(options.scenario);
      }
    }

    _populateInitialMotes(count) {
      this.motes = [];
      const pool = [...this.map.moteSpawns];
      // Deterministic Fisher-Yates shuffle
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng.next() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const n = Math.min(count, pool.length);
      for (let i = 0; i < n; i++) {
        this.motes.push({
          id: `M${this.nextMoteId++}`,
          pos: [...pool[i]],
          kind: 'random',
          ttl_ticks: null,
          spawn_delay: 0
        });
      }
    }

    applyScenario(sc) {
      if (!sc || typeof sc !== 'object' || Array.isArray(sc)) {
        throw new Error('Invalid scenario root object');
      }

      if (sc.random_motes !== undefined) {
        if (typeof sc.random_motes !== 'boolean') throw new Error('random_motes must be boolean');
        this.random_motes = sc.random_motes;
      }
      if (sc.random_shades !== undefined) {
        if (typeof sc.random_shades !== 'boolean') throw new Error('random_shades must be boolean');
        this.random_shades = sc.random_shades;
      }
      if (sc.random_drifters !== undefined) {
        if (typeof sc.random_drifters !== 'boolean') throw new Error('random_drifters must be boolean');
        this.random_drifters = sc.random_drifters;
      }
      if (sc.wind_enabled !== undefined) {
        if (typeof sc.wind_enabled !== 'boolean') throw new Error('wind_enabled must be boolean');
        this.wind_enabled = sc.wind_enabled;
      }

      if (sc.time_left_s !== undefined) {
        if (typeof sc.time_left_s !== 'number' || Number.isNaN(sc.time_left_s) || sc.time_left_s < 0) {
          throw new Error('Invalid time_left_s');
        }
        this.initial_duration_s = sc.time_left_s;
        this.time_left_s = sc.time_left_s;
      }

      if (sc.player !== undefined) {
        if (!sc.player || typeof sc.player !== 'object') throw new Error('Invalid player in scenario');
        if (sc.player.pos !== undefined) {
          if (!Array.isArray(sc.player.pos) || sc.player.pos.length !== 3 || sc.player.pos.some(v => typeof v !== 'number')) {
            throw new Error('Invalid player.pos');
          }
          this.player.pos = [...sc.player.pos];
          const fy = this.map.getFloorY(this.player.pos[0], this.player.pos[2], this.player.pos[1]);
          this.player.grounded = fy !== null && Math.abs(this.player.pos[1] - fy) <= 0.05;
        }
        if (sc.player.carried !== undefined) this.player.carried = Number(sc.player.carried);
        if (sc.player.flames !== undefined) this.player.flames = Number(sc.player.flames);
        if (sc.player.invuln_ticks !== undefined) this.player.invuln_ticks = Number(sc.player.invuln_ticks);
        if (sc.player.dash_cd_ticks !== undefined) this.player.dash_cd_ticks = Number(sc.player.dash_cd_ticks);
        if (sc.player.pulse_cd_ticks !== undefined) this.player.pulse_cd_ticks = Number(sc.player.pulse_cd_ticks);
        if (sc.player.charm_ticks !== undefined) this.player.charm_ticks = Number(sc.player.charm_ticks);
      }

      if (sc.lanterns !== undefined) {
        if (!Array.isArray(sc.lanterns)) throw new Error('scenario.lanterns must be an array');
        for (const lPatch of sc.lanterns) {
          if (!lPatch || typeof lPatch.id !== 'string') throw new Error('Each lantern must have string id');
          let target = this.lanterns.find(l => l.id === lPatch.id);
          if (!target) {
            target = { id: lPatch.id, pos: [0, 0, 25], lit: false, deposited: 0 };
            this.lanterns.push(target);
          }
          if (lPatch.pos !== undefined) target.pos = [...lPatch.pos];
          if (lPatch.deposited !== undefined) target.deposited = Number(lPatch.deposited);
          if (lPatch.lit !== undefined) {
            target.lit = Boolean(lPatch.lit);
          } else if (target.deposited >= this.tuning.lantern_cost) {
            target.lit = true;
          }
        }
      }

      if (sc.motes !== undefined) {
        if (!Array.isArray(sc.motes)) throw new Error('scenario.motes must be an array');
        this.motes = [];
        this.nextMoteId = 1;
        for (const m of sc.motes) {
          if (Array.isArray(m)) {
            this.motes.push({
              id: `M${this.nextMoteId++}`,
              pos: [m[0], m[1], m[2]],
              kind: 'random',
              ttl_ticks: null,
              spawn_delay: 0
            });
          } else if (m && typeof m === 'object' && Array.isArray(m.pos)) {
            const id = m.id ? String(m.id) : `M${this.nextMoteId++}`;
            this.motes.push({
              id,
              pos: [...m.pos],
              kind: m.kind || 'random',
              ttl_ticks: m.ttl_s !== undefined && m.ttl_s !== null ? Math.round(m.ttl_s * TICK_RATE) : null,
              spawn_delay: 0
            });
          } else {
            throw new Error('Invalid mote item');
          }
        }
      } else if (!this.random_motes) {
        this.motes = [];
      }

      if (sc.shades !== undefined) {
        if (!Array.isArray(sc.shades)) throw new Error('scenario.shades must be an array');
        this.shades = [];
        this.nextShadeId = 1;
        for (const s of sc.shades) {
          if (!s || typeof s !== 'object' || !Array.isArray(s.pos)) throw new Error('Invalid shade');
          const id = s.id ? String(s.id) : `S${this.nextShadeId++}`;
          const numMatch = /^S(\d+)$/.exec(id);
          if (numMatch && Number(numMatch[1]) >= this.nextShadeId) {
            this.nextShadeId = Number(numMatch[1]) + 1;
          }
          const st = s.state || 'chase';
          const left = s.state_ticks_left !== undefined ? Number(s.state_ticks_left) : 0;
          this.shades.push({
            id,
            pos: [...s.pos],
            state: st,
            state_ticks_left: left,
            push_ticks: 0,
            push_dir: [1, 0],
            push_per_tick: 0,
            recoil_dir: [1, 0],
            wander_angle: this.rng.range(0, Math.PI * 2),
            spawn_delay: 0
          });
        }
      } else if (!this.random_shades) {
        this.shades = [];
      }

      if (sc.drifters !== undefined) {
        if (!Array.isArray(sc.drifters)) throw new Error('scenario.drifters must be an array');
        this.drifters = [];
        this.nextDrifterId = 1;
        for (const d of sc.drifters) {
          if (!d || typeof d !== 'object' || !Array.isArray(d.pos)) throw new Error('Invalid drifter');
          const id = d.id ? String(d.id) : `D${this.nextDrifterId++}`;
          this.drifters.push({
            id,
            pos: [...d.pos],
            state: d.state || 'idle',
            stolen: Number(d.stolen) || 0,
            has_stolen: Boolean(d.has_stolen),
            flee_ticks: Number(d.flee_ticks) || (d.state === 'flee' ? 240 : 0),
            wander_angle: this.rng.range(0, Math.PI * 2),
            spawn_delay: 0
          });
        }
      }

      if (sc.charms !== undefined) {
        if (!Array.isArray(sc.charms)) throw new Error('scenario.charms must be an array');
        this.charms = sc.charms.map((c, idx) => ({
          id: c.id || `C${idx + 1}`,
          pos: [...c.pos],
          available: c.available !== undefined ? Boolean(c.available) : true,
          respawn_ticks: c.respawn_s ? Math.round(c.respawn_s * TICK_RATE) : 0
        }));
      }
    }

    _emit(name, data = {}) {
      this.events.push({
        type: 'event',
        tick: this.tick,
        name,
        data
      });
    }

    _resolveObstacles(pos) {
      for (const obs of this.map.obstacles) {
        if (obs.type === 'cylinder') {
          if (pos[1] >= obs.minY - 0.5 && pos[1] <= obs.maxY) {
            const dx = pos[0] - obs.pos[0];
            const dz = pos[2] - obs.pos[2];
            const d = Math.hypot(dx, dz);
            if (d < obs.radius) {
              if (d < 1e-6) {
                pos[0] = obs.pos[0] + obs.radius;
              } else {
                const s = obs.radius / d;
                pos[0] = obs.pos[0] + dx * s;
                pos[2] = obs.pos[2] + dz * s;
              }
              return true;
            }
          }
        }
      }
      return false;
    }

    _checkBlockedOrCliff(prevPos, nextPos) {
      // Prevent walking up steep cliff walls in Night 3 (Tier 1 Y=3, Tier 2 Y=6)
      if (this.night === 3) {
        const floorNext = this.map.getFloorY(nextPos[0], nextPos[2], nextPos[1]);
        const floorCheckHigh = this.map.getFloorY(nextPos[0], nextPos[2], 10.0);
        if (floorCheckHigh !== null && floorNext !== null && floorCheckHigh > nextPos[1] + 0.6) {
          // Only allow if stepping onto a ramp smoothly; otherwise block horizontal entry into tier wall
          const prevCheckHigh = this.map.getFloorY(prevPos[0], prevPos[2], 10.0);
          if (prevCheckHigh === floorNext) {
            nextPos[0] = prevPos[0];
            nextPos[2] = prevPos[2];
            return true;
          }
        }
      }
      return this._resolveObstacles(nextPos);
    }

    _clampOutsideSafeZones(pos, margin = 0) {
      const safeR = Number(this.tuning.safe_radius) || 6.0;
      for (const l of this.lanterns) {
        if (!l.lit) continue;
        const dx = pos[0] - l.pos[0];
        const dz = pos[2] - l.pos[2];
        const d = Math.hypot(dx, dz);
        if (d < safeR + margin) {
          if (d < 1e-6) {
            pos[0] = l.pos[0] + safeR + margin;
          } else {
            const s = (safeR + margin) / d;
            pos[0] = l.pos[0] + dx * s;
            pos[2] = l.pos[2] + dz * s;
          }
        }
      }
    }

    step(input = {}) {
      this.events = [];
      if (this.state === 'won' || this.state === 'lost') {
        return this.events;
      }

      this.tick += 1;

      // Step 1: Read input & handle pause first
      const pauseBtn = Boolean(input.pause);
      const pauseTriggered = pauseBtn && !this.prevButtons.pause;
      this.prevButtons.pause = pauseBtn;

      if (pauseTriggered) {
        if (this.state === 'playing') {
          this.state = 'paused';
          this._emit('paused', {});
          return this.events;
        } else if (this.state === 'paused') {
          this.state = 'playing';
          this._emit('resumed', {});
        }
      }

      if (this.state === 'paused') {
        return this.events;
      }

      this.sim_tick += 1;

      // Edge triggers for other buttons
      const jumpBtn = Boolean(input.jump);
      const interactBtn = Boolean(input.interact);
      const pulseBtn = Boolean(input.pulse);
      const dashBtn = Boolean(input.dash);

      const jumpTriggered = jumpBtn && !this.prevButtons.jump;
      const interactTriggered = interactBtn && !this.prevButtons.interact;
      const pulseTriggered = pulseBtn && !this.prevButtons.pulse;
      const dashTriggered = dashBtn && !this.prevButtons.dash;

      this.prevButtons.jump = jumpBtn;
      this.prevButtons.interact = interactBtn;
      this.prevButtons.pulse = pulseBtn;
      this.prevButtons.dash = dashBtn;

      // Clear spawn_delay from previous tick so newly spawned entities become active this tick
      for (const m of this.motes) if (m.spawn_delay > 0) m.spawn_delay -= 1;
      for (const s of this.shades) if (s.spawn_delay > 0) s.spawn_delay -= 1;
      for (const d of this.drifters) if (d.spawn_delay > 0) d.spawn_delay -= 1;

      // Step 2: Decrement counters (time, cooldowns, invuln, stun, charm, dropped mote TTL, charm respawn)
      this.time_left_s = Math.max(0, this.initial_duration_s - this.sim_tick / TICK_RATE);

      if (this.player.invuln_ticks > 0) this.player.invuln_ticks -= 1;
      if (this.player.dash_cd_ticks > 0) this.player.dash_cd_ticks -= 1;
      if (this.player.pulse_cd_ticks > 0) this.player.pulse_cd_ticks -= 1;
      if (this.player.charm_ticks > 0) this.player.charm_ticks -= 1;

      for (const c of this.charms) {
        if (!c.available && c.respawn_ticks > 0) {
          c.respawn_ticks -= 1;
          if (c.respawn_ticks <= 0) {
            c.respawn_ticks = 0;
            c.available = true;
          }
        }
      }

      for (let i = this.motes.length - 1; i >= 0; i--) {
        const m = this.motes[i];
        if (m.ttl_ticks !== null) {
          m.ttl_ticks -= 1;
          if (m.ttl_ticks <= 0) {
            this.motes.splice(i, 1);
          }
        }
      }

      for (const s of this.shades) {
        if (s.state === 'stunned' || s.state === 'recoil') {
          if (s.state_ticks_left > 0) {
            s.state_ticks_left -= 1;
          }
          if (s.push_ticks > 0) {
            s.push_ticks -= 1;
          }
          if (s.state_ticks_left <= 0) {
            s.state = 'wander';
            s.state_ticks_left = 0;
          }
        }
      }

      // Wind cycle on Night 3 (every 30s = 1800 ticks, warn 2s = 120 ticks, active 5s = 300 ticks)
      if (this.wind_enabled) {
        const cycleTick = this.sim_tick % 1800;
        if (cycleTick === 1380) {
          this.wind.warning = true;
          this.wind.dir_deg = round3(this.rng.range(0, 360));
        } else if (cycleTick === 1500) {
          this.wind.warning = false;
          this.wind.active = true;
        } else if (cycleTick === 0 && this.sim_tick > 0) {
          this.wind.active = false;
          this.wind.warning = false;
        }
      } else {
        this.wind.active = false;
        this.wind.warning = false;
      }

      // Step 3: Move Mây (jump, dash, jump pads, wind) & check falling off island
      if (this.player.fall_wait_ticks > 0) {
        this.player.fall_wait_ticks -= 1;
        if (this.player.fall_wait_ticks <= 0) {
          this.player.pos = [...this.map.startPos];
          this.player.vel = [0, 0, 0];
          this.player.grounded = true;
          this.player.launch_locked = false;
          this.player.invuln_ticks = 90;
        }
      } else {
        const move = Array.isArray(input.move) ? input.move : [0, 0];
        const camYawDeg = typeof input.cam_yaw_deg === 'number' ? input.cam_yaw_deg : 0;
        let mx = Math.max(-1, Math.min(1, Number(move[0]) || 0));
        let mz = Math.max(-1, Math.min(1, Number(move[1]) || 0));
        const len = Math.hypot(mx, mz);
        if (len > 1) {
          mx /= len;
          mz /= len;
        }

        const theta = (camYawDeg * Math.PI) / 180;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const wx = mx * cosT + mz * sinT;
        const wz = -mx * sinT + mz * cosT;

        if (len > 1e-4) {
          this.player.facing_yaw_rad = Math.atan2(wx, wz);
        }

        // Dash trigger
        const charmActive = this.player.charm_ticks > 0;
        if (
          dashTriggered &&
          this.player.dash_ticks <= 0 &&
          (charmActive || this.player.dash_cd_ticks <= 0)
        ) {
          const dashDurTicks = Math.round((Number(this.tuning.dash_duration_s) || 0.2) * TICK_RATE);
          const dashCdTicks = Math.round((Number(this.tuning.dash_cooldown_s) || 1.5) * TICK_RATE);
          this.player.dash_ticks = dashDurTicks;
          this.player.dash_cd_ticks = charmActive ? 0 : dashCdTicks;
          if (len > 1e-4) {
            this.player.dash_dir = [wx, wz];
          } else {
            this.player.dash_dir = [Math.sin(this.player.facing_yaw_rad), Math.cos(this.player.facing_yaw_rad)];
          }
          this._emit('dash', {});
        }

        const prevPos = [...this.player.pos];
        const runSpeed = charmActive ? 7.2 : Number(this.tuning.player_speed) || 6.0;
        const dashSpeed = Number(this.tuning.dash_speed) || 14.0;

        if (this.player.dash_ticks > 0) {
          this.player.dash_ticks -= 1;
          this.player.vel[0] = this.player.dash_dir[0] * dashSpeed;
          this.player.vel[2] = this.player.dash_dir[1] * dashSpeed;
          // Keep altitude during air dash
          this.player.vel[1] = 0;
        } else if (!this.player.launch_locked) {
          this.player.vel[0] = wx * runSpeed;
          this.player.vel[2] = wz * runSpeed;
        }

        // Apply wind push (2 m/s)
        let windVx = 0;
        let windVz = 0;
        if (this.wind.active) {
          const wRad = (this.wind.dir_deg * Math.PI) / 180;
          windVx = Math.cos(wRad) * 2.0;
          windVz = Math.sin(wRad) * 2.0;
        }

        this.player.pos[0] += (this.player.vel[0] + windVx) * DT;
        this.player.pos[2] += (this.player.vel[2] + windVz) * DT;
        this._checkBlockedOrCliff(prevPos, this.player.pos);

        // Jump (only when grounded)
        if (jumpTriggered && this.player.grounded && this.player.dash_ticks <= 0) {
          this.player.vel[1] = JUMP_VELOCITY;
          this.player.grounded = false;
        }

        if (this.player.dash_ticks <= 0) {
          this.player.pos[1] += this.player.vel[1] * DT;
          this.player.vel[1] -= GRAVITY * DT;
        }

        const floorY = this.map.getFloorY(this.player.pos[0], this.player.pos[2], this.player.pos[1]);
        if (floorY !== null && this.player.pos[1] <= floorY && this.player.vel[1] <= 0) {
          this.player.pos[1] = floorY;
          this.player.vel[1] = 0;
          this.player.grounded = true;
          this.player.launch_locked = false;
        } else {
          this.player.grounded = false;
        }

        // Check Jump Pads
        for (const pad of this.map.jumpPads) {
          if (
            distXZ(this.player.pos, pad.pos) <= pad.radius &&
            Math.abs(this.player.pos[1] - pad.pos[1]) <= 1.0
          ) {
            let dirX = 0;
            let dirZ = -1;
            if (pad.target) {
              const dx = pad.target[0] - pad.pos[0];
              const dz = pad.target[2] - pad.pos[2];
              const d = Math.hypot(dx, dz) || 1;
              dirX = dx / d;
              dirZ = dz / d;
            } else if (pad.dir) {
              dirX = pad.dir[0];
              dirZ = pad.dir[1];
            }
            this.player.vel[0] = dirX * pad.vHoriz;
            this.player.vel[2] = dirZ * pad.vHoriz;
            this.player.vel[1] = pad.vy;
            this.player.grounded = false;
            this.player.launch_locked = true;
            break;
          }
        }

        // Check fall off island (Y < -10)
        if (this.tuning.fall_enabled && this.player.pos[1] < -10.0) {
          this.player.flames = Math.max(0, this.player.flames - 1);
          const lost = this.player.carried;
          this.player.carried = 0;
          this.player.dash_ticks = 0;
          this.player.launch_locked = false;
          this._emit('player_hit', {
            by: 'fall',
            flames: this.player.flames,
            dropped: 0,
            lost
          });
          if (this.player.flames > 0) {
            this.player.fall_wait_ticks = 60;
          }
        }
      }

      // Step 4: Pickup motes and charms (only if not falling/waiting respawn)
      if (this.player.fall_wait_ticks <= 0) {
        const pickupR = Number(this.tuning.pickup_radius) || 1.0;
        const capacity = Number(this.tuning.carry_capacity) || 10;

        for (let i = 0; i < this.motes.length; i++) {
          const m = this.motes[i];
          if (m.spawn_delay > 0) continue;
          if (this.player.carried >= capacity) break;
          if (
            distXZ(this.player.pos, m.pos) <= pickupR &&
            Math.abs(this.player.pos[1] - m.pos[1]) <= 1.5
          ) {
            this.motes.splice(i, 1);
            i -= 1;
            this.player.carried += 1;
            this._emit('mote_picked', { carried: this.player.carried });
          }
        }

        for (const c of this.charms) {
          if (!c.available) continue;
          if (
            distXZ(this.player.pos, c.pos) <= pickupR &&
            Math.abs(this.player.pos[1] - c.pos[1]) <= 1.5
          ) {
            c.available = false;
            c.respawn_ticks = 2700;
            this.player.charm_ticks = 600;
            this._emit('charm_picked', { charm_id: c.id, charm_ticks: 600 });
          }
        }
      }

      // Step 5: Interact with lanterns
      if (interactTriggered && this.player.carried > 0 && this.player.fall_wait_ticks <= 0) {
        const interactR = Number(this.tuning.interact_radius) || 2.0;
        const lanternCost = Number(this.tuning.lantern_cost) || 10;
        const perMoteScore = (this.tuning.score && Number(this.tuning.score.per_mote)) || 10;
        const perLanternScore = (this.tuning.score && Number(this.tuning.score.per_lantern)) || 100;

        let bestLantern = null;
        let bestDist = Infinity;
        const sortedLanterns = [...this.lanterns].sort(sortIdsAsc);
        for (const l of sortedLanterns) {
          if (l.lit) continue;
          const d = distXZ(this.player.pos, l.pos);
          if (d <= interactR && d < bestDist - 1e-6) {
            bestDist = d;
            bestLantern = l;
          }
        }

        if (bestLantern) {
          const needed = Math.max(0, lanternCost - bestLantern.deposited);
          const amount = Math.min(this.player.carried, needed);
          if (amount > 0) {
            this.player.carried -= amount;
            bestLantern.deposited += amount;
            this.score += amount * perMoteScore;
            this._emit('deposit', {
              lantern_id: bestLantern.id,
              amount,
              deposited: bestLantern.deposited
            });

            if (bestLantern.deposited >= lanternCost && !bestLantern.lit) {
              bestLantern.lit = true;
              this.score += perLanternScore;
              this._emit('lantern_lit', { lantern_id: bestLantern.id });

              // Mark any shades inside safe_radius to be pushed out in max 30 ticks
              const safeR = Number(this.tuning.safe_radius) || 6.0;
              for (const s of this.shades) {
                const dx = s.pos[0] - bestLantern.pos[0];
                const dz = s.pos[2] - bestLantern.pos[2];
                const d = Math.hypot(dx, dz);
                if (d < safeR) {
                  s.safe_push_ticks = 30;
                  s.safe_push_lantern_id = bestLantern.id;
                }
              }
            }
          }
        }
      }

      // Step 6: Update safe zones (push shades out over max 30 ticks)
      const safeR = Number(this.tuning.safe_radius) || 6.0;
      for (const s of this.shades) {
        if (s.safe_push_ticks > 0) {
          s.safe_push_ticks -= 1;
          const l = this.lanterns.find(x => x.id === s.safe_push_lantern_id);
          if (l && l.lit) {
            const dx = s.pos[0] - l.pos[0];
            const dz = s.pos[2] - l.pos[2];
            const d = Math.hypot(dx, dz);
            if (d < safeR) {
              const rem = Math.max(1, s.safe_push_ticks + 1);
              const stepOut = (safeR - d) / rem;
              if (d < 1e-6) {
                s.pos[0] += stepOut;
              } else {
                s.pos[0] += (dx / d) * stepOut;
                s.pos[2] += (dz / d) * stepOut;
              }
            }
          }
        }
      }

      // Step 7: Pulse (Tỏa Sáng)
      const pulseCost = Number(this.tuning.pulse_cost) || 3;
      if (
        pulseTriggered &&
        this.player.pulse_cd_ticks <= 0 &&
        this.player.carried >= pulseCost &&
        this.player.fall_wait_ticks <= 0
      ) {
        this.player.carried -= pulseCost;
        const cdTicks = Math.round((Number(this.tuning.pulse_cooldown_s) || 3.0) * TICK_RATE);
        this.player.pulse_cd_ticks = cdTicks;

        const pulseR = Number(this.tuning.pulse_radius) || 5.0;
        const pushM = Number(this.tuning.pulse_push_m) || 4.0;
        const perStun = (this.tuning.score && Number(this.tuning.score.per_stun)) || 5;
        const pulseCenter = [this.player.pos[0], this.player.pos[1] + 0.8, this.player.pos[2]];

        const stunnedIds = [];
        for (const s of this.shades) {
          if (s.spawn_delay > 0) continue;
          if (dist3D(pulseCenter, s.pos) <= pulseR) {
            stunnedIds.push(s.id);
            s.state = 'stunned';
            s.state_ticks_left = 120;
            s.push_ticks = 15;
            const dx = s.pos[0] - this.player.pos[0];
            const dz = s.pos[2] - this.player.pos[2];
            const hd = Math.hypot(dx, dz);
            if (hd < 1e-6) {
              s.push_dir = [1, 0];
            } else {
              s.push_dir = [dx / hd, dz / hd];
            }
            s.push_per_tick = pushM / 15;
            this.score += perStun;
          }
        }

        // Affect Drifters in 5m 3D radius
        for (const d of this.drifters) {
          if (d.spawn_delay > 0 || d.state === 'removed') continue;
          if (dist3D(pulseCenter, d.pos) <= pulseR) {
            if (d.state === 'chase') {
              d.state = 'flee';
              d.flee_ticks = 240;
            } else if (d.state === 'flee' && d.stolen > 0) {
              const droppedAmt = d.stolen;
              for (let i = 0; i < droppedAmt; i++) {
                this.motes.push({
                  id: `M${this.nextMoteId++}`,
                  pos: [round3(d.pos[0]), round3(d.pos[1]), round3(d.pos[2])],
                  kind: 'dropped',
                  ttl_ticks: 480,
                  spawn_delay: 1
                });
              }
              d.stolen = 0;
              d.flee_ticks = Math.min(d.flee_ticks, 120);
              this._emit('drifter_drop', { drifter_id: d.id, amount: droppedAmt });
            }
          }
        }

        this._emit('pulse', { stunned_ids: stunnedIds });
      }

      // Step 8: Move Shades and Drifters
      const shadeSpeed = this.night === 3 ? 4.5 : Number(this.tuning.shade_speed) || 4.0;
      for (const s of this.shades) {
        if (s.spawn_delay > 0) continue;

        if (s.state === 'stunned') {
          if (s.push_ticks > 0) {
            const nextPos = [
              s.pos[0] + s.push_dir[0] * s.push_per_tick,
              s.pos[1],
              s.pos[2] + s.push_dir[1] * s.push_per_tick
            ];
            if (!this._resolveObstacles(nextPos)) {
              s.pos[0] = nextPos[0];
              s.pos[2] = nextPos[2];
            }
          }
          continue;
        }

        if (s.state === 'recoil') {
          const recoilStep = (2.0 / 60);
          s.pos[0] += s.recoil_dir[0] * recoilStep;
          s.pos[2] += s.recoil_dir[1] * recoilStep;
          this._clampOutsideSafeZones(s.pos, 0);
          continue;
        }

        // Aggro check: detect 12m, lose 18m
        const dPlayer = distXZ(s.pos, this.player.pos);
        if (s.state === 'chase') {
          if (dPlayer > 18.0 || this.player.fall_wait_ticks > 0) {
            s.state = 'wander';
          }
        } else {
          if (dPlayer <= 12.0 && this.player.fall_wait_ticks <= 0) {
            s.state = 'chase';
          } else {
            s.state = 'wander';
          }
        }

        let moveX = 0;
        let moveZ = 0;
        if (s.state === 'chase') {
          const dx = this.player.pos[0] - s.pos[0];
          const dz = this.player.pos[2] - s.pos[2];
          const d = Math.hypot(dx, dz) || 1;
          moveX = (dx / d) * shadeSpeed * DT;
          moveZ = (dz / d) * shadeSpeed * DT;
        } else {
          // Wander towards nearest unlit lantern or gentle orbit
          if (this.sim_tick % 90 === 0) {
            s.wander_angle += this.rng.range(-0.9, 0.9);
          }
          moveX = Math.cos(s.wander_angle) * (shadeSpeed * 0.5) * DT;
          moveZ = Math.sin(s.wander_angle) * (shadeSpeed * 0.5) * DT;
        }

        const cand = [s.pos[0] + moveX, s.pos[1], s.pos[2] + moveZ];
        // Blocked at safe_radius around lit lanterns
        let blocked = false;
        for (const l of this.lanterns) {
          if (l.lit && distXZ(cand, l.pos) < safeR) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          s.pos[0] = cand[0];
          s.pos[2] = cand[2];
          this._resolveObstacles(s.pos);
        }
      }

      // Move Drifters
      for (const d of this.drifters) {
        if (d.spawn_delay > 0 || d.state === 'removed') continue;
        const distP = distXZ(d.pos, this.player.pos);

        if (d.state === 'idle') {
          if (!d.has_stolen && this.player.carried >= 5 && distP <= 15.0 && this.player.fall_wait_ticks <= 0) {
            d.state = 'chase';
          } else {
            if (this.sim_tick % 60 === 0) d.wander_angle += this.rng.range(-1.0, 1.0);
            d.pos[0] += Math.cos(d.wander_angle) * 2.0 * DT;
            d.pos[2] += Math.sin(d.wander_angle) * 2.0 * DT;
          }
        }

        if (d.state === 'chase') {
          if (d.has_stolen || this.player.carried < 5 || distP > 15.0 || this.player.fall_wait_ticks > 0) {
            d.state = 'idle';
          } else {
            const dx = this.player.pos[0] - d.pos[0];
            const dz = this.player.pos[2] - d.pos[2];
            const dist = Math.hypot(dx, dz) || 1;
            d.pos[0] += (dx / dist) * 7.0 * DT;
            d.pos[2] += (dz / dist) * 7.0 * DT;
          }
        } else if (d.state === 'flee') {
          const dx = d.pos[0] - this.player.pos[0];
          const dz = d.pos[2] - this.player.pos[2];
          const dist = Math.hypot(dx, dz) || 1;
          d.pos[0] += (dx / dist) * 7.0 * DT;
          d.pos[2] += (dz / dist) * 7.0 * DT;
          d.flee_ticks -= 1;
          if (d.flee_ticks <= 0) {
            d.state = 'removed';
          }
        }
      }

      // Step 9: Touch / Collisions (Drifters steal first, then Shades hit in ascending id order)
      if (this.player.fall_wait_ticks <= 0) {
        const sortedDrifters = [...this.drifters].sort(sortIdsAsc);
        for (const d of sortedDrifters) {
          if (d.spawn_delay > 0 || d.has_stolen || d.state === 'removed' || d.state === 'flee') continue;
          if (distXZ(d.pos, this.player.pos) <= 1.2) {
            const stolen = Math.min(3, this.player.carried);
            this.player.carried -= stolen;
            d.stolen = stolen;
            d.has_stolen = true;
            d.state = 'flee';
            d.flee_ticks = 240;
            this._emit('drifter_steal', {
              drifter_id: d.id,
              amount: stolen,
              carried: this.player.carried
            });
          }
        }

        if (this.player.invuln_ticks <= 0) {
          const shadeHitR = Number(this.tuning.shade_hit_radius) || 1.0;
          const sortedShades = [...this.shades].sort(sortIdsAsc);
          for (const s of sortedShades) {
            if (s.spawn_delay > 0 || s.state === 'stunned' || s.state === 'recoil' || s.safe_push_ticks > 0) continue;
            if (
              distXZ(s.pos, this.player.pos) <= shadeHitR &&
              Math.abs(s.pos[1] - this.player.pos[1]) <= 1.5
            ) {
              // Hit! Max 1 flame loss per tick
              this.player.flames = Math.max(0, this.player.flames - 1);
              const dropped = Math.floor(this.player.carried * (Number(this.tuning.hit_drop_ratio) || 0.5));
              this.player.carried = Math.max(0, this.player.carried - dropped);
              this.player.invuln_ticks = 90;

              // Shade recoils 2m in 60 ticks
              s.state = 'recoil';
              s.state_ticks_left = 60;
              const rx = s.pos[0] - this.player.pos[0];
              const rz = s.pos[2] - this.player.pos[2];
              const rd = Math.hypot(rx, rz);
              s.recoil_dir = rd < 1e-6 ? [1, 0] : [rx / rd, rz / rd];

              // Drop motes in 1.5 - 2.5m ring around Mây (pickable from next tick)
              for (let i = 0; i < dropped; i++) {
                const ang = (i * 2 * Math.PI) / Math.max(1, dropped);
                const r = 1.5 + this.rng.next() * 1.0;
                this.motes.push({
                  id: `M${this.nextMoteId++}`,
                  pos: [round3(this.player.pos[0] + Math.cos(ang) * r), round3(this.player.pos[1]), round3(this.player.pos[2] + Math.sin(ang) * r)],
                  kind: 'dropped',
                  ttl_ticks: 480,
                  spawn_delay: 1
                });
              }

              this._emit('player_hit', {
                by: 'shade',
                flames: this.player.flames,
                dropped
              });
              break;
            }
          }
        }
      }

      // Step 10: Scheduled spawns (motes, shades, drifters — interactable starting next tick)
      if (this.random_motes && this.sim_tick > 0 && this.sim_tick % 240 === 0 && this.motes.length < 30) {
        const freePts = this.map.moteSpawns.filter(
          pt => !this.motes.some(m => distXZ(m.pos, pt) < 0.5 && Math.abs(m.pos[1] - pt[1]) < 0.5)
        );
        if (freePts.length > 0) {
          const chosen = freePts[Math.floor(this.rng.next() * freePts.length)];
          this.motes.push({
            id: `M${this.nextMoteId++}`,
            pos: [...chosen],
            kind: 'random',
            ttl_ticks: null,
            spawn_delay: 1
          });
        }
      }

      if (this.random_shades && this.sim_tick >= 300) {
        const interval = this.map.shadeSpawnIntervalTicks;
        if (this.sim_tick === 300) {
          this._spawnShades(2);
        } else if ((this.sim_tick - 300) % interval === 0) {
          this._spawnShades(1);
        }
      }

      if (this.random_drifters && this.sim_tick > 0 && this.sim_tick % 1200 === 0) {
        const activeDrifters = this.drifters.filter(d => d.state !== 'removed').length;
        if (activeDrifters < 2 && this.map.drifterSpawns.length > 0) {
          const pt = this.map.drifterSpawns[Math.floor(this.rng.next() * this.map.drifterSpawns.length)];
          this.drifters.push({
            id: `D${this.nextDrifterId++}`,
            pos: [...pt],
            state: 'idle',
            stolen: 0,
            has_stolen: false,
            flee_ticks: 0,
            wander_angle: this.rng.range(0, Math.PI * 2),
            spawn_delay: 1
          });
        }
      }

      // Step 11: Check win / loss after every tick
      if (this.player.flames <= 0) {
        this._finishGame('lost', 'no_flames');
      } else if (this.lanterns.length > 0 && this.lanterns.every(l => l.lit)) {
        this._finishGame('won', 'all_lit');
      } else if (this.time_left_s <= 0) {
        this._finishGame('lost', 'dawn');
      }

      return this.events;
    }

    _spawnShades(count) {
      for (let k = 0; k < count; k++) {
        if (this.shades.length >= this.map.shadeMax) break;
        const validPts = this.map.shadeSpawns.filter(pt => {
          if (distXZ(pt, this.player.pos) < 15.0) return false;
          for (const l of this.lanterns) {
            if (l.lit && distXZ(pt, l.pos) < (Number(this.tuning.safe_radius) || 6.0)) return false;
          }
          return true;
        });
        if (validPts.length === 0) break;
        const chosen = validPts[Math.floor(this.rng.next() * validPts.length)];
        const id = `S${this.nextShadeId++}`;
        this.shades.push({
          id,
          pos: [...chosen],
          state: 'wander',
          state_ticks_left: 0,
          push_ticks: 0,
          push_dir: [1, 0],
          push_per_tick: 0,
          recoil_dir: [1, 0],
          wander_angle: this.rng.range(0, Math.PI * 2),
          spawn_delay: 1
        });
        this._emit('shade_spawned', { id });
      }
    }

    _finishGame(result, reason) {
      this.state = result;
      if (result === 'won') {
        const perSec = (this.tuning.score && Number(this.tuning.score.per_second_left)) || 2;
        const perFlame = (this.tuning.score && Number(this.tuning.score.per_flame_left)) || 50;
        this.score += Math.floor(this.time_left_s) * perSec + this.player.flames * perFlame;
      }
      this.score = Math.round(this.score);
      this._emit('game_over', { result, reason });
    }

    getSnapshot() {
      return {
        type: 'snapshot',
        tick: this.tick,
        sim_tick: this.sim_tick,
        night: this.night,
        state: this.state,
        time_left_s: round3(this.time_left_s),
        score: Math.round(this.score),
        wind: {
          active: this.wind.active,
          dir_deg: round3(this.wind.dir_deg)
        },
        player: {
          pos: roundVec3(this.player.pos),
          vel: roundVec3(this.player.vel),
          grounded: this.player.grounded,
          flames: this.player.flames,
          carried: this.player.carried,
          invuln: this.player.invuln_ticks > 0,
          dash_cd_s: round3(this.player.dash_cd_ticks / TICK_RATE),
          pulse_cd_s: round3(this.player.pulse_cd_ticks / TICK_RATE),
          charm_s: round3(this.player.charm_ticks / TICK_RATE)
        },
        lanterns: this.lanterns.map(l => ({
          id: l.id,
          pos: roundVec3(l.pos),
          lit: Boolean(l.lit),
          deposited: l.deposited
        })),
        shades: this.shades.map(s => ({
          id: s.id,
          pos: roundVec3(s.pos),
          state: s.state
        })),
        motes_active: this.motes.length,
        motes: this.motes.map(m => ({
          id: m.id,
          pos: roundVec3(m.pos),
          kind: m.kind,
          ttl_s: m.ttl_ticks !== null ? round3(m.ttl_ticks / TICK_RATE) : null
        })),
        drifters: this.drifters
          .filter(d => d.state !== 'removed')
          .map(d => ({
            id: d.id,
            pos: roundVec3(d.pos),
            state: d.state,
            stolen: d.stolen
          })),
        charms: this.charms.map(c => ({
          id: c.id,
          available: c.available,
          respawn_s: round3(c.respawn_ticks / TICK_RATE)
        }))
      };
    }

    getEndRecord() {
      return {
        type: 'end',
        ticks: this.tick,
        state: this.state,
        score: Math.round(this.score)
      };
    }
  }

  return GameWorld;
});
