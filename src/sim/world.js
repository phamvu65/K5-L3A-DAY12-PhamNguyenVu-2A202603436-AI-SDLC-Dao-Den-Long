// Core deterministic 60Hz game simulation for Đảo Đèn Lồng (Phase 1 / Contract v1.0)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const PRNG = require('./prng');
    module.exports = factory(PRNG);
  } else {
    root.GameWorld = factory(root.PRNG);
  }
})(typeof self !== 'undefined' ? self : this, function (PRNG) {
  const TICK_RATE = 60;
  const DT = 1 / TICK_RATE;
  const ISLAND_RADIUS = 45.0;
  const GRAVITY = 20.0;
  const JUMP_VELOCITY = 8.0;

  function round3(n) {
    const r = Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
    return Object.is(r, -0) ? 0 : r;
  }

  function roundVec3(v) {
    return [round3(v[0]), round3(v[1]), round3(v[2])];
  }

  function distXZ(a, b) {
    const dx = a[0] - b[0];
    const dz = a[2] - b[2];
    return Math.hypot(dx, dz);
  }

  class GameWorld {
    constructor(tuning, options = {}) {
      this.tuning = JSON.parse(JSON.stringify(tuning));
      this.seed = options.seed !== undefined ? Number(options.seed) : 1;
      this.night = options.night !== undefined ? Number(options.night) : 1;
      this.rng = new PRNG(this.seed);

      this.tick = 0;
      this.sim_tick = 0;
      this.state = 'playing'; // 'playing' | 'won' | 'lost'
      this.score = 0;
      this.island_radius = ISLAND_RADIUS;

      const duration = Number(this.tuning.night1_duration_s) || 180;
      this.initial_duration_s = duration;
      this.time_left_s = duration;

      this.player = {
        pos: [0, 0, 0],
        vy: 0,
        flames: Number(this.tuning.flames) || 3,
        carried: 0,
        invuln_ticks: 0,
        pulse_cd_ticks: 0,
        facing_yaw_rad: 0
      };

      // Input state (persists across frames; edge-triggered for jump/interact/pulse)
      this.prevButtons = {
        jump: false,
        interact: false,
        pulse: false,
        dash: false
      };

      this.nextMoteId = 1;
      this.nextShadeId = 1;

      this.lanterns = this._createDefaultLanterns();
      this.motes = [];
      this.shades = [];
      this.random_motes = true;
      this.random_shades = true;

      this.events = [];

      // Populate default world before scenario override
      this._populateDefaultMotes(20);
      this._populateDefaultShades(3);

      if (options.scenario) {
        this.applyScenario(options.scenario);
      }
    }

    _createDefaultLanterns() {
      const count = Number(this.tuning.lantern_count_night1) || 5;
      const radius = 25.0;
      const list = [];
      for (let i = 0; i < count; i++) {
        const angle = (i * 2 * Math.PI) / count;
        const x = round3(Math.sin(angle) * radius);
        const z = round3(Math.cos(angle) * radius);
        list.push({
          id: `L${i + 1}`,
          pos: [x, 0, z],
          lit: false,
          deposited: 0
        });
      }
      return list;
    }

    _randomPointOnIsland(minR, maxR) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const angle = this.rng.range(0, Math.PI * 2);
        const r = Math.sqrt(this.rng.range(minR * minR, maxR * maxR));
        const pos = [round3(Math.cos(angle) * r), 0, round3(Math.sin(angle) * r)];
        return pos;
      }
      return [10, 0, 10];
    }

    _populateDefaultMotes(count) {
      this.motes = [];
      for (let i = 0; i < count; i++) {
        const pos = this._randomPointOnIsland(4.0, 38.0);
        this.motes.push({
          id: `M${this.nextMoteId++}`,
          pos: [pos[0], 0, pos[2]]
        });
      }
    }

    _populateDefaultShades(count) {
      this.shades = [];
      for (let i = 0; i < count; i++) {
        const pos = this._randomPointOnIsland(15.0, 36.0);
        this.shades.push({
          id: `S${this.nextShadeId++}`,
          pos: [pos[0], 0, pos[2]],
          state: 'chase',
          stun_ticks: 0
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
        }
        if (sc.player.carried !== undefined) {
          if (typeof sc.player.carried !== 'number' || sc.player.carried < 0) throw new Error('Invalid player.carried');
          this.player.carried = sc.player.carried;
        }
        if (sc.player.flames !== undefined) {
          if (typeof sc.player.flames !== 'number' || sc.player.flames < 0) throw new Error('Invalid player.flames');
          this.player.flames = sc.player.flames;
        }
      }

      if (sc.lanterns !== undefined) {
        if (!Array.isArray(sc.lanterns)) throw new Error('scenario.lanterns must be an array');
        for (const lPatch of sc.lanterns) {
          if (!lPatch || typeof lPatch.id !== 'string') throw new Error('Each scenario lantern must have string id');
          let target = this.lanterns.find(l => l.id === lPatch.id);
          if (!target) {
            target = { id: lPatch.id, pos: [0, 0, 25], lit: false, deposited: 0 };
            this.lanterns.push(target);
          }
          if (lPatch.pos !== undefined) {
            if (!Array.isArray(lPatch.pos) || lPatch.pos.length !== 3 || lPatch.pos.some(v => typeof v !== 'number')) {
              throw new Error('Invalid lantern.pos');
            }
            target.pos = [...lPatch.pos];
          }
          if (lPatch.deposited !== undefined) {
            if (typeof lPatch.deposited !== 'number' || lPatch.deposited < 0) throw new Error('Invalid lantern.deposited');
            target.deposited = lPatch.deposited;
          }
          if (lPatch.lit !== undefined) {
            if (typeof lPatch.lit !== 'boolean') throw new Error('Invalid lantern.lit');
            target.lit = lPatch.lit;
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
            if (m.length !== 3 || m.some(v => typeof v !== 'number')) throw new Error('Invalid mote coordinates');
            this.motes.push({
              id: `M${this.nextMoteId++}`,
              pos: [m[0], m[1], m[2]]
            });
          } else if (m && typeof m === 'object' && Array.isArray(m.pos) && m.pos.length === 3) {
            const id = m.id ? String(m.id) : `M${this.nextMoteId++}`;
            this.motes.push({
              id,
              pos: [m.pos[0], m.pos[1], m.pos[2]]
            });
          } else {
            throw new Error('Invalid mote item in scenario');
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
          if (!s || typeof s !== 'object' || !Array.isArray(s.pos) || s.pos.length !== 3 || s.pos.some(v => typeof v !== 'number')) {
            throw new Error('Invalid shade in scenario');
          }
          const id = s.id ? String(s.id) : `S${this.nextShadeId++}`;
          const numMatch = /^S(\d+)$/.exec(id);
          if (numMatch) {
            const num = Number(numMatch[1]);
            if (num >= this.nextShadeId) this.nextShadeId = num + 1;
          }
          this.shades.push({
            id,
            pos: [s.pos[0], s.pos[1], s.pos[2]],
            state: s.state || 'chase',
            stun_ticks: 0
          });
        }
      } else if (!this.random_shades) {
        this.shades = [];
      }
    }

    _emit(name, data) {
      this.events.push({
        type: 'event',
        tick: this.tick,
        name,
        data
      });
    }

    _pushOutFromSafeZones(pos, extraMargin = 0) {
      const safeR = Number(this.tuning.safe_radius) || 0;
      if (safeR <= 0) return;
      const minAllowed = safeR + extraMargin;
      for (const lantern of this.lanterns) {
        if (!lantern.lit) continue;
        const dx = pos[0] - lantern.pos[0];
        const dz = pos[2] - lantern.pos[2];
        const d = Math.hypot(dx, dz);
        if (d < minAllowed) {
          if (d < 1e-6) {
            pos[0] = lantern.pos[0] + minAllowed;
            pos[2] = lantern.pos[2];
          } else {
            const scale = minAllowed / d;
            pos[0] = lantern.pos[0] + dx * scale;
            pos[2] = lantern.pos[2] + dz * scale;
          }
        }
      }
    }

    /**
     * Step k (k = 0..N-1) reads input of tick k and creates state k+1.
     * Events in this step are emitted with tick = k+1.
     */
    step(input = {}) {
      this.events = [];
      if (this.state !== 'playing') {
        return this.events;
      }

      // Advance to tick k+1
      this.tick += 1;
      this.sim_tick += 1;
      this.time_left_s = Math.max(0, this.initial_duration_s - this.sim_tick / TICK_RATE);

      // Decrement cooldowns & timers
      if (this.player.invuln_ticks > 0) this.player.invuln_ticks -= 1;
      if (this.player.pulse_cd_ticks > 0) this.player.pulse_cd_ticks -= 1;

      const move = Array.isArray(input.move) ? input.move : [0, 0];
      const camYawDeg = typeof input.cam_yaw_deg === 'number' ? input.cam_yaw_deg : 0;
      const jumpBtn = Boolean(input.jump);
      const interactBtn = Boolean(input.interact);
      const pulseBtn = Boolean(input.pulse);

      const jumpTriggered = jumpBtn && !this.prevButtons.jump;
      const interactTriggered = interactBtn && !this.prevButtons.interact;
      const pulseTriggered = pulseBtn && !this.prevButtons.pulse;

      this.prevButtons.jump = jumpBtn;
      this.prevButtons.interact = interactBtn;
      this.prevButtons.pulse = pulseBtn;

      // 1. Player Movement (XZ + Y jump)
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
      // Contract formula: x' = x·cosθ + z·sinθ, z' = −x·sinθ + z·cosθ
      const wx = mx * cosT + mz * sinT;
      const wz = -mx * sinT + mz * cosT;

      if (len > 1e-4) {
        this.player.facing_yaw_rad = Math.atan2(wx, wz);
      }

      const speed = Number(this.tuning.player_speed) || 0;
      this.player.pos[0] += wx * speed * DT;
      this.player.pos[2] += wz * speed * DT;

      if (jumpTriggered && this.player.pos[1] <= 0.001) {
        this.player.vy = JUMP_VELOCITY;
      }
      if (this.player.pos[1] > 0 || this.player.vy !== 0) {
        this.player.pos[1] += this.player.vy * DT;
        this.player.vy -= GRAVITY * DT;
        if (this.player.pos[1] <= 0) {
          this.player.pos[1] = 0;
          this.player.vy = 0;
        }
      }

      // Check fall off island if fall_enabled
      if (this.tuning.fall_enabled) {
        const distFromCenter = Math.hypot(this.player.pos[0], this.player.pos[2]);
        if (distFromCenter > this.island_radius) {
          this._handlePlayerHit('fall');
          if (this.state !== 'playing') return this.events;
        }
      } else {
        const distFromCenter = Math.hypot(this.player.pos[0], this.player.pos[2]);
        if (distFromCenter > this.island_radius) {
          const s = this.island_radius / distFromCenter;
          this.player.pos[0] *= s;
          this.player.pos[2] *= s;
        }
      }

      // 2. Pickup Motes (automatic within pickup_radius on XZ plane)
      const pickupR = Number(this.tuning.pickup_radius) || 0;
      const capacity = Number(this.tuning.carry_capacity) || Infinity;
      const perMoteScore = (this.tuning.score && Number(this.tuning.score.per_mote)) || 0;

      for (let i = 0; i < this.motes.length; i++) {
        if (this.player.carried >= capacity) break;
        const mote = this.motes[i];
        if (distXZ(this.player.pos, mote.pos) <= pickupR) {
          this.motes.splice(i, 1);
          i -= 1;
          this.player.carried += 1;
          this.score += perMoteScore;
          this._emit('mote_picked', { carried: this.player.carried });
        }
      }

      // 3. Interact / Deposit into Lantern
      if (interactTriggered && this.player.carried > 0) {
        const interactR = Number(this.tuning.interact_radius) || 0;
        const lanternCost = Number(this.tuning.lantern_cost) || 1;
        const perLanternScore = (this.tuning.score && Number(this.tuning.score.per_lantern)) || 0;

        // Find closest unlit lantern within interact_radius
        let bestLantern = null;
        let bestDist = Infinity;
        for (const lantern of this.lanterns) {
          if (lantern.lit) continue;
          const d = distXZ(this.player.pos, lantern.pos);
          if (d <= interactR && d < bestDist) {
            bestDist = d;
            bestLantern = lantern;
          }
        }

        if (bestLantern) {
          const needed = Math.max(0, lanternCost - bestLantern.deposited);
          const amount = Math.min(this.player.carried, needed);
          if (amount > 0) {
            this.player.carried -= amount;
            bestLantern.deposited += amount;
            this._emit('deposit', {
              lantern_id: bestLantern.id,
              amount,
              deposited: bestLantern.deposited
            });

            if (bestLantern.deposited >= lanternCost && !bestLantern.lit) {
              bestLantern.lit = true;
              this.score += perLanternScore;
              this._emit('lantern_lit', { lantern_id: bestLantern.id });

              // Push any shades inside the newly lit lantern's safe zone outside
              for (const shade of this.shades) {
                this._pushOutFromSafeZones(shade.pos, 0.01);
              }

              // Check win condition immediately
              if (this.lanterns.length > 0 && this.lanterns.every(l => l.lit)) {
                this._finishGame('won', 'all_lit');
                return this.events;
              }
            }
          }
        }
      }

      // 4. Pulse (Repel & Stun Shades)
      const pulseCost = Number(this.tuning.pulse_cost) || 0;
      if (
        pulseTriggered &&
        this.player.pulse_cd_ticks <= 0 &&
        this.player.carried >= pulseCost
      ) {
        this.player.carried -= pulseCost;
        const cdTicks = Math.round((Number(this.tuning.pulse_cooldown_s) || 0) * TICK_RATE);
        this.player.pulse_cd_ticks = cdTicks;

        const pulseR = Number(this.tuning.pulse_radius) || 0;
        const stunTicks = Math.round((Number(this.tuning.pulse_stun_s) || 0) * TICK_RATE);
        const pushM = Number(this.tuning.pulse_push_m) || 0;
        const perStunScore = (this.tuning.score && Number(this.tuning.score.per_stun)) || 0;

        const stunnedIds = [];
        for (const shade of this.shades) {
          const d = distXZ(this.player.pos, shade.pos);
          if (d <= pulseR) {
            stunnedIds.push(shade.id);
            if (stunTicks > 0) {
              shade.state = 'stunned';
              shade.stun_ticks = stunTicks;
            }
            if (pushM > 0) {
              const dx = shade.pos[0] - this.player.pos[0];
              const dz = shade.pos[2] - this.player.pos[2];
              if (d < 1e-6) {
                shade.pos[0] += pushM;
              } else {
                shade.pos[0] += (dx / d) * pushM;
                shade.pos[2] += (dz / d) * pushM;
              }
              this._pushOutFromSafeZones(shade.pos, 0.01);
            }
            this.score += perStunScore;
          }
        }

        this._emit('pulse', { stunned_ids: stunnedIds });
      }

      // 5. Random Spawns (only when enabled)
      if (this.random_motes && this.sim_tick % 300 === 0 && this.motes.length < 25) {
        const pos = this._randomPointOnIsland(5.0, 38.0);
        this.motes.push({
          id: `M${this.nextMoteId++}`,
          pos: [pos[0], 0, pos[2]]
        });
      }
      if (this.random_shades && this.sim_tick % 900 === 0 && this.shades.length < 6) {
        const pos = this._randomPointOnIsland(20.0, 38.0);
        this._pushOutFromSafeZones(pos, 1.0);
        const id = `S${this.nextShadeId++}`;
        this.shades.push({
          id,
          pos: [pos[0], 0, pos[2]],
          state: 'chase',
          stun_ticks: 0
        });
        this._emit('shade_spawned', { id });
      }

      // 6. Shades AI & Collision
      const shadeSpeed = Number(this.tuning.shade_speed) || 0;
      const shadeHitR = Number(this.tuning.shade_hit_radius) || 0;
      const safeR = Number(this.tuning.safe_radius) || 0;

      const playerInSafeZone =
        safeR > 0 &&
        this.lanterns.some(l => l.lit && distXZ(this.player.pos, l.pos) <= safeR);

      for (const shade of this.shades) {
        if (shade.stun_ticks > 0) {
          shade.stun_ticks -= 1;
          if (shade.stun_ticks <= 0) {
            shade.stun_ticks = 0;
            shade.state = 'chase';
          } else {
            shade.state = 'stunned';
            continue;
          }
        }

        shade.state = 'chase';
        if (shadeSpeed > 0 && !playerInSafeZone) {
          const dx = this.player.pos[0] - shade.pos[0];
          const dz = this.player.pos[2] - shade.pos[2];
          const d = Math.hypot(dx, dz);
          if (d > 1e-6) {
            const stepDist = Math.min(d, shadeSpeed * DT);
            const nextPos = [
              shade.pos[0] + (dx / d) * stepDist,
              shade.pos[1],
              shade.pos[2] + (dz / d) * stepDist
            ];

            // Shades cannot enter safe_radius around lit lanterns
            let blockedByLantern = false;
            if (safeR > 0) {
              for (const lantern of this.lanterns) {
                if (!lantern.lit) continue;
                if (distXZ(nextPos, lantern.pos) < safeR) {
                  blockedByLantern = true;
                  break;
                }
              }
            }

            if (!blockedByLantern) {
              shade.pos[0] = nextPos[0];
              shade.pos[2] = nextPos[2];
            } else {
              this._pushOutFromSafeZones(shade.pos, 0.01);
            }
          }
        }

        // Check hit with player
        if (
          this.player.invuln_ticks <= 0 &&
          !playerInSafeZone &&
          distXZ(this.player.pos, shade.pos) <= shadeHitR
        ) {
          this._handlePlayerHit('shade');
          if (this.state !== 'playing') return this.events;
        }
      }

      // 7. Check Dawn / Time out
      if (this.time_left_s <= 0 && this.state === 'playing') {
        this._finishGame('lost', 'dawn');
        return this.events;
      }

      return this.events;
    }

    _handlePlayerHit(by) {
      this.player.flames = Math.max(0, this.player.flames - 1);
      const dropRatio = Number(this.tuning.hit_drop_ratio) || 0;
      const dropped = Math.floor(this.player.carried * dropRatio);
      this.player.carried = Math.max(0, this.player.carried - dropped);

      const invulnTicks = Math.round((Number(this.tuning.invuln_s) || 0) * TICK_RATE);
      this.player.invuln_ticks = invulnTicks;

      if (by === 'fall') {
        // Respawn player safely at origin
        this.player.pos = [0, 0, 0];
        this.player.vy = 0;
      }

      // Drop motes around impact site (outside pickup radius so they aren't immediately re-picked)
      for (let i = 0; i < dropped; i++) {
        const angle = (i * 2 * Math.PI) / Math.max(1, dropped);
        const dropDist = (Number(this.tuning.pickup_radius) || 1.5) + 1.25;
        const mx = this.player.pos[0] + Math.cos(angle) * dropDist;
        const mz = this.player.pos[2] + Math.sin(angle) * dropDist;
        this.motes.push({
          id: `M${this.nextMoteId++}`,
          pos: [round3(mx), 0, round3(mz)]
        });
      }

      this._emit('player_hit', {
        by,
        flames: this.player.flames,
        dropped
      });

      if (this.player.flames <= 0) {
        this._finishGame('lost', 'no_flames');
      }
    }

    _finishGame(result, reason) {
      this.state = result;
      if (result === 'won') {
        const perSec = (this.tuning.score && Number(this.tuning.score.per_second_left)) || 0;
        const perFlame = (this.tuning.score && Number(this.tuning.score.per_flame_left)) || 0;
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
        state: this.state,
        time_left_s: round3(this.time_left_s),
        score: Math.round(this.score),
        player: {
          pos: roundVec3(this.player.pos),
          flames: this.player.flames,
          carried: this.player.carried
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
          pos: roundVec3(m.pos)
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
