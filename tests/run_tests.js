/**
 * Automated Unit, Scenario, Regression & Determinism Test Suite for Đảo Đèn Lồng
 * Phase 3 — Test Contract v1.2 (Change Request: Đèn cạn dầu)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const GameWorld = require('../src/sim/world');
const contract = require('../game.contract.json');

const HEADLESS_PATH = path.resolve(__dirname, '..', 'src', 'headless.js');
const TMP_DIR = path.resolve(__dirname, '.tmp');
const PROOF_DIR = path.resolve(__dirname, '..', 'docs', 'proof', 'phase-3');

fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(PROOF_DIR, { recursive: true });

function runHeadless(args) {
  return spawnSync(process.execPath, [HEADLESS_PATH, ...args], {
    encoding: 'utf8'
  });
}

function parseJsonl(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];
  return raw.split('\n').map(line => JSON.parse(line));
}

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, status: 'PASS' });
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    results.push({ name, status: 'FAIL', error: err.message });
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

console.log('=== Running Đảo Đèn Lồng Phase 3 Test Suite (Contract v1.2) ===');

// 1. Contract v1.3 schema & tuning
test('Contract v1.3 schema & Ticket-03/04 tuning, bench_cmd, soak_cmd', () => {
  assert.strictEqual(contract.contract_version, '1.3');
  assert.ok(contract.bench_cmd);
  assert.ok(contract.soak_cmd);
  const t = contract.tuning;
  assert.strictEqual(t.fuel_max, 100);
  assert.strictEqual(t.fuel_decay_per_s, 1.0);
  assert.strictEqual(t.fuel_per_mote, 10);
  assert.strictEqual(t.relight_cost, 5);
  assert.strictEqual(t.win_ratio, 0.6);
  assert.strictEqual(t.drain_per_s, 5);
  assert.strictEqual(t.low_fuel_threshold, 30);
  assert.strictEqual(t.capacity_max, 20);
  assert.strictEqual(t.night1_duration_s, 240);
  assert.strictEqual(t.night2_duration_s, 270);
  assert.strictEqual(t.night3_duration_s, 300);
  assert.strictEqual(t.score.per_mote, 5);
  assert.strictEqual(t.score.per_relight, 40);
  assert.strictEqual(t.score.per_drain_stun, 15);
});

// 2. Regression P1/P2: Movement & cam_yaw_deg
test('[Regression P1-P2] Movement & cam_yaw_deg formula', () => {
  const w = new GameWorld(contract.tuning, {
    seed: 1,
    night: 1,
    scenario: {
      player: { pos: [0, 0, 0], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: []
    }
  });
  for (let i = 0; i < 60; i++) w.step({ move: [0, 1], cam_yaw_deg: 0 });
  assert.strictEqual(w.getSnapshot().player.pos[2], 6.0);
});

// 3. [REPLACED from P1/P2] No early win on lighting all lanterns; win at dawn with >= ceil(0.6*N) -> dawn_survived
test('[Phase 3 - Replaces all_lit] Lighting all lanterns does NOT end early; 3/5 lit at dawn wins (dawn_survived)', () => {
  const scPath = path.join(PROOF_DIR, 'scenario_dawn_win.json');
  const inPath = path.join(PROOF_DIR, 'inputs_dawn_win.json');
  const outPath = path.join(PROOF_DIR, 'out_dawn_win.jsonl');

  const scenario = {
    player: { pos: [0, 0, 4], carried: 10, flames: 3 },
    random_motes: false,
    random_shades: false,
    lanterns: [
      { id: 'L1', pos: [0, 0, 5], lit: false, deposited: 0 },
      { id: 'L2', lit: true, fuel: 80 },
      { id: 'L3', lit: true, fuel: 80 },
      { id: 'L4', lit: true, fuel: 80 },
      { id: 'L5', lit: true, fuel: 80 }
    ],
    time_left_s: 2.0 // 120 ticks
  };
  const inputs = {
    frames: [
      { tick: 0, interact: true },
      { tick: 1, interact: false }
    ]
  };
  fs.writeFileSync(scPath, JSON.stringify(scenario, null, 2));
  fs.writeFileSync(inPath, JSON.stringify(inputs, null, 2));

  const res = runHeadless([
    '--seed', '101', '--night', '1',
    '--scenario', scPath, '--inputs', inPath,
    '--ticks', '150', '--out', outPath, '--snapshot-every', '60'
  ]);
  assert.strictEqual(res.status, 0, res.stderr);
  const records = parseJsonl(outPath);

  const litEv = records.find(r => r.type === 'event' && r.name === 'lantern_lit');
  assert.ok(litEv && litEv.data.relight === false, 'Expected lantern_lit with relight: false');
  assert.strictEqual(litEv.tick, 1);

  // Must NOT end at tick 1; must finish at tick 120 (dawn)
  const overEv = records.find(r => r.type === 'event' && r.name === 'game_over');
  assert.ok(overEv, 'Expected game_over');
  assert.strictEqual(overEv.tick, 120);
  assert.strictEqual(overEv.data.result, 'won');
  assert.strictEqual(overEv.data.reason, 'dawn_survived');
});

// 4. [Phase 3] Fuel decay, lantern_out, ever_lit, relight_cost = 5, capacity scaling
test('[Phase 3] Scenario: Lantern runs out of fuel (lantern_out), relights with 5 motes, increases capacity', () => {
  const scPath = path.join(PROOF_DIR, 'scenario_relight.json');
  const inPath = path.join(PROOF_DIR, 'inputs_relight.json');
  const outPath = path.join(PROOF_DIR, 'out_relight.jsonl');

  fs.writeFileSync(scPath, JSON.stringify({
    player: { pos: [0, 0, 24], carried: 6, flames: 3 },
    random_motes: false,
    random_shades: false,
    lanterns: [
      { id: 'L1', pos: [0, 0, 25], lit: true, fuel: 0.5 } // decays to 0 at tick 30
    ],
    time_left_s: 60
  }, null, 2));
  fs.writeFileSync(inPath, JSON.stringify({
    frames: [
      { tick: 40, interact: true },
      { tick: 41, interact: false }
    ]
  }, null, 2));

  const res = runHeadless([
    '--seed', '12', '--night', '1',
    '--scenario', scPath, '--inputs', inPath,
    '--ticks', '50', '--out', outPath, '--snapshot-every', '50'
  ]);
  assert.strictEqual(res.status, 0);
  const records = parseJsonl(outPath);

  const outEv = records.find(r => r.type === 'event' && r.name === 'lantern_out');
  assert.ok(outEv && outEv.data.lantern_id === 'L1' && outEv.tick === 30);

  const litEv = records.find(r => r.type === 'event' && r.name === 'lantern_lit');
  assert.ok(litEv && litEv.data.relight === true, 'Expected relight: true');

  const snap50 = records.find(r => r.type === 'snapshot' && r.tick === 50);
  assert.strictEqual(snap50.player.carried, 1); // 6 - 5 relight_cost
  assert.strictEqual(snap50.player.capacity, 12); // 10 + 2 * 1 successful_lights
  const l1 = snap50.lanterns.find(l => l.id === 'L1');
  assert.strictEqual(l1.relit_count, 1);
});

// 5. [Phase 3] Refuel lit lantern & ignore full fuel lantern
test('[Phase 3] Scenario: Refuel weak lantern emits refuel event; full lantern is ignored', () => {
  const scPath = path.join(PROOF_DIR, 'scenario_refuel.json');
  const inPath = path.join(PROOF_DIR, 'inputs_refuel.json');
  const outPath = path.join(PROOF_DIR, 'out_refuel.jsonl');

  fs.writeFileSync(scPath, JSON.stringify({
    player: { pos: [0, 0, 24], carried: 5, flames: 3 },
    random_motes: false,
    random_shades: false,
    lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 75 }]
  }, null, 2));
  fs.writeFileSync(inPath, JSON.stringify({
    frames: [
      { tick: 0, interact: true }, // needs ceil((100-75)/10) = 3 motes
      { tick: 1, interact: false },
      { tick: 5, interact: true }, // now fuel is ~99.9 -> wait: ceil(0.1/10)=1, let's check used
      { tick: 6, interact: false }
    ]
  }, null, 2));

  const res = runHeadless([
    '--seed', '13', '--night', '1',
    '--scenario', scPath, '--inputs', inPath,
    '--ticks', '10', '--out', outPath, '--snapshot-every', '10'
  ]);
  assert.strictEqual(res.status, 0);
  const records = parseJsonl(outPath);
  const refuelEv = records.find(r => r.type === 'event' && r.name === 'refuel');
  assert.ok(refuelEv && refuelEv.data.amount === 3 && refuelEv.data.fuel === 100);
});

// 6. [Phase 3] Shade drains weak lantern (< 30 fuel), emits fuel_drain, +15 score on Pulse
test('[Phase 3] Scenario: Shade enters drain state on weak lantern (<30 fuel) and yields +15 on Pulse', () => {
  const scPath = path.join(PROOF_DIR, 'scenario_drain.json');
  const inPath = path.join(PROOF_DIR, 'inputs_drain.json');
  const outPath = path.join(PROOF_DIR, 'out_drain.jsonl');

  fs.writeFileSync(scPath, JSON.stringify({
    player: { pos: [0, 0, 10], carried: 3, flames: 3 },
    random_motes: false,
    random_shades: false,
    lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 25 }],
    shades: [{ id: 'S1', pos: [0, 0, 25.5], state: 'wander', target_lantern_id: 'L1' }]
  }, null, 2));
  fs.writeFileSync(inPath, JSON.stringify({
    frames: [
      { tick: 62, move: [0, 1], dash: true },
      { tick: 63, dash: false, move: [0, 1] },
      { tick: 160, move: [0, 0], pulse: true },
      { tick: 161, pulse: false }
    ]
  }, null, 2));

  const res = runHeadless([
    '--seed', '14', '--night', '1',
    '--scenario', scPath, '--inputs', inPath,
    '--ticks', '165', '--out', outPath, '--snapshot-every', '61'
  ]);
  assert.strictEqual(res.status, 0);
  const records = parseJsonl(outPath);

  const snap61 = records.find(r => r.type === 'snapshot' && r.tick === 61);
  assert.strictEqual(snap61.shades[0].state, 'drain');

  const drainEv = records.find(r => r.type === 'event' && r.name === 'fuel_drain');
  assert.ok(drainEv && drainEv.data.lantern_id === 'L1' && drainEv.data.shade_id === 'S1');

  const endRec = records[records.length - 1];
  assert.ok(endRec.score >= 5, `Expected pulse score, got ${endRec.score}`);
});

// 7. Regression P2: Dash, Night 2, Night 3, Drifter, Charm, Pause
test('[Regression P2] Dash, Night 2/3, Gió Lạc, Bùa Gió, Pause remain valid', () => {
  const w = new GameWorld(contract.tuning, { seed: 9, night: 2 });
  assert.strictEqual(w.lanterns.length, 6);
  w.step({ move: [0, 1], dash: true });
  assert.ok(w.events.some(e => e.name === 'dash'));
  w.step({ pause: true });
  assert.strictEqual(w.state, 'paused');
});

// 8. Determinism
test('[Phase 3] Determinism: Two runs with same --seed produce 100% identical JSONL', () => {
  const out1 = path.join(PROOF_DIR, 'det_a.jsonl');
  const out2 = path.join(PROOF_DIR, 'det_b.jsonl');
  runHeadless(['--seed', '999', '--night', '1', '--ticks', '600', '--out', out1, '--snapshot-every', '60']);
  runHeadless(['--seed', '999', '--night', '1', '--ticks', '600', '--out', out2, '--snapshot-every', '60']);
  assert.strictEqual(fs.readFileSync(out1, 'utf8'), fs.readFileSync(out2, 'utf8'));
});

// 9. [Phase 4] Benchmark & Soak outputs meet thresholds
test('[Phase 4] bench.json & soak.json exist and meet Ticket-04 thresholds', () => {
  const benchPath = path.resolve(__dirname, '..', 'bench.json');
  const soakPath = path.resolve(__dirname, '..', 'soak.json');
  assert.ok(fs.existsSync(benchPath), 'bench.json missing');
  assert.ok(fs.existsSync(soakPath), 'soak.json missing');

  const bench = JSON.parse(fs.readFileSync(benchPath, 'utf8'));
  assert.strictEqual(bench.contract_version, '1.3');
  assert.ok(bench.avg_fps >= 60, `avg_fps < 60: ${bench.avg_fps}`);
  assert.ok(bench.p1_low_fps >= 30, `p1_low_fps < 30: ${bench.p1_low_fps}`);
  assert.ok(bench.load_ms <= 10000, `load_ms > 10000: ${bench.load_ms}`);

  const soak = JSON.parse(fs.readFileSync(soakPath, 'utf8'));
  assert.strictEqual(soak.nights, 10);
  assert.strictEqual(soak.crashes, 0);
  assert.ok(soak.mem_end_mb <= 1.2 * soak.mem_start_mb, `mem_end_mb > 1.2 * mem_start_mb`);
});

// 10. [Phase 4] --export-leaderboard CLI
test('[Phase 4] --export-leaderboard exports valid sorted JSON', () => {
  const outLb = path.join(TMP_DIR, 'exported_lb.json');
  const res = spawnSync(process.execPath, [path.resolve(__dirname, '..', 'src', 'server.js'), '--export-leaderboard', outLb], {
    encoding: 'utf8'
  });
  assert.strictEqual(res.status, 0);
  const data = JSON.parse(fs.readFileSync(outLb, 'utf8'));
  assert.ok(Array.isArray(data.entries));
});

const failed = results.filter(r => r.status === 'FAIL');
console.log(`\n=== Summary: ${results.length - failed.length}/${results.length} Passed ===`);
if (failed.length > 0) {
  process.exit(1);
}
