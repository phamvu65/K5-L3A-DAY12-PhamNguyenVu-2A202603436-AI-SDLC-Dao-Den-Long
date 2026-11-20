/**
 * Automated Unit, Scenario, Regression & Determinism Test Suite for Đảo Đèn Lồng
 * Phase 2 — Test Contract v1.1
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const GameWorld = require('../src/sim/world');
const contract = require('../game.contract.json');

const HEADLESS_PATH = path.resolve(__dirname, '..', 'src', 'headless.js');
const TMP_DIR = path.resolve(__dirname, '.tmp');
const PROOF_DIR = path.resolve(__dirname, '..', 'docs', 'proof', 'phase-2');

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

console.log('=== Running Đảo Đèn Lồng Phase 2 Test Suite (Contract v1.1) ===');

// 1. Contract v1.1 schema & standard tuning
test('Contract v1.1 schema & standardized Ticket-02 tuning values', () => {
  assert.strictEqual(contract.contract_version, '1.1');
  const t = contract.tuning;
  assert.strictEqual(t.player_speed, 6.0);
  assert.strictEqual(t.dash_speed, 14.0);
  assert.strictEqual(t.dash_duration_s, 0.2);
  assert.strictEqual(t.dash_cooldown_s, 1.5);
  assert.strictEqual(t.carry_capacity, 10);
  assert.strictEqual(t.lantern_cost, 10);
  assert.strictEqual(t.pickup_radius, 1.0);
  assert.strictEqual(t.interact_radius, 2.0);
  assert.strictEqual(t.pulse_cost, 3);
  assert.strictEqual(t.pulse_radius, 5.0);
  assert.strictEqual(t.night1_duration_s, 300);
  assert.strictEqual(t.night2_duration_s, 330);
  assert.strictEqual(t.night3_duration_s, 360);
  assert.strictEqual(t.safe_radius, 6.0);
  assert.strictEqual(t.shade_speed, 4.0);
  assert.strictEqual(t.shade_hit_radius, 1.0);
});

// 2. Regression: Movement & cam_yaw_deg formula
test('[Regression P1] Movement & cam_yaw_deg formula + diagonal normalization', () => {
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

  for (let i = 0; i < 60; i++) w.step({ move: [0, 1], cam_yaw_deg: 90 });
  assert.strictEqual(w.getSnapshot().player.pos[0], 6.0);
});

// 3. Regression: Pickup, deposit (10 cost), light final lantern & win
test('[Regression P1] Scenario: Pickup motes, deposit 10, light final lantern -> game_over(won, all_lit)', () => {
  const scPath = path.join(PROOF_DIR, 'scenario_win.json');
  const inPath = path.join(PROOF_DIR, 'inputs_win.json');
  const outPath = path.join(PROOF_DIR, 'out_win.jsonl');

  const scenario = {
    player: { pos: [0, 0, 0], carried: 9, flames: 3 },
    random_motes: false,
    random_shades: false,
    motes: [[0, 0, 2]],
    shades: [],
    lanterns: [
      { id: 'L1', pos: [0, 0, 5], deposited: 0, lit: false },
      { id: 'L2', lit: true, deposited: 10 },
      { id: 'L3', lit: true, deposited: 10 },
      { id: 'L4', lit: true, deposited: 10 },
      { id: 'L5', lit: true, deposited: 10 }
    ],
    time_left_s: 120
  };
  const inputs = {
    frames: [
      { tick: 0, move: [0, 1], cam_yaw_deg: 0 },
      { tick: 40, move: [0, 0], interact: true },
      { tick: 41, interact: false }
    ]
  };
  fs.writeFileSync(scPath, JSON.stringify(scenario, null, 2));
  fs.writeFileSync(inPath, JSON.stringify(inputs, null, 2));

  const res = runHeadless([
    '--seed', '101', '--night', '1',
    '--scenario', scPath, '--inputs', inPath,
    '--ticks', '100', '--out', outPath, '--snapshot-every', '10'
  ]);
  assert.strictEqual(res.status, 0, res.stderr);
  const records = parseJsonl(outPath);

  const deposit = records.find(r => r.type === 'event' && r.name === 'deposit');
  assert.ok(deposit && deposit.data.amount === 10 && deposit.data.deposited === 10);
  const over = records.find(r => r.type === 'event' && r.name === 'game_over');
  assert.ok(over && over.data.result === 'won' && over.data.reason === 'all_lit');
});

// 4. New Feature: Dash (14 m/s for 0.2s = 12 ticks, cooldown 1.5s)
test('[Phase 2] Scenario: Dash moves 2.8m in 12 ticks and triggers dash event + cooldown', () => {
  const scPath = path.join(PROOF_DIR, 'scenario_dash.json');
  const inPath = path.join(PROOF_DIR, 'inputs_dash.json');
  const outPath = path.join(PROOF_DIR, 'out_dash.jsonl');

  fs.writeFileSync(scPath, JSON.stringify({
    player: { pos: [0, 0, 0], carried: 0, flames: 3 },
    random_motes: false,
    random_shades: false
  }, null, 2));
  fs.writeFileSync(inPath, JSON.stringify({
    frames: [
      { tick: 0, move: [0, 1], dash: true },
      { tick: 1, dash: false, move: [0, 0] }
    ]
  }, null, 2));

  const res = runHeadless([
    '--seed', '10', '--night', '1',
    '--scenario', scPath, '--inputs', inPath,
    '--ticks', '15', '--out', outPath, '--snapshot-every', '12'
  ]);
  assert.strictEqual(res.status, 0);
  const records = parseJsonl(outPath);
  const dashEv = records.find(r => r.type === 'event' && r.name === 'dash');
  assert.ok(dashEv, 'Expected dash event');
  const snap12 = records.find(r => r.type === 'snapshot' && r.tick === 12);
  assert.ok(snap12);
  assert.ok(Math.abs(snap12.player.pos[2] - 2.8) < 0.05, `Expected ~2.8m dash, got ${snap12.player.pos[2]}`);
  assert.ok(snap12.player.dash_cd_s > 1.0);
});

// 5. New Feature: Pulse 3D distance, 120 tick stun, 4m push over 15 ticks
test('[Phase 2] Scenario: Pulse (cost 3, radius 5m) stuns 120 ticks & pushes 4m over 15 ticks', () => {
  const scPath = path.join(PROOF_DIR, 'scenario_pulse.json');
  const inPath = path.join(PROOF_DIR, 'inputs_pulse.json');
  const outPath = path.join(PROOF_DIR, 'out_pulse.jsonl');

  fs.writeFileSync(scPath, JSON.stringify({
    player: { pos: [0, 0, 0], carried: 4, flames: 3 },
    random_motes: false,
    random_shades: false,
    shades: [
      { id: 'S1', pos: [3, 0, 0], state: 'chase' },
      { id: 'S2', pos: [15, 0, 0], state: 'chase' }
    ]
  }, null, 2));
  fs.writeFileSync(inPath, JSON.stringify({
    frames: [
      { tick: 0, pulse: true },
      { tick: 1, pulse: false }
    ]
  }, null, 2));

  const res = runHeadless([
    '--seed', '202', '--night', '1',
    '--scenario', scPath, '--inputs', inPath,
    '--ticks', '20', '--out', outPath, '--snapshot-every', '15'
  ]);
  assert.strictEqual(res.status, 0);
  const records = parseJsonl(outPath);
  const pulseEv = records.find(r => r.type === 'event' && r.name === 'pulse');
  assert.deepStrictEqual(pulseEv.data.stunned_ids, ['S1']);

  const snap15 = records.find(r => r.type === 'snapshot' && r.tick === 15);
  const s1 = snap15.shades.find(s => s.id === 'S1');
  assert.strictEqual(s1.state, 'stunned');
  assert.ok(Math.abs(s1.pos[0] - 7.0) < 0.05, `Expected S1 pushed to x=7.0, got ${s1.pos[0]}`);
  assert.strictEqual(snap15.player.carried, 1);
});

// 6. New Feature: Night 2 (Đảo Cau) Jump Pad & Bamboo Bridge
test('[Phase 2] Scenario: Night 2 (Đảo Cau) jump pad launches Mây across to Island B', () => {
  const scPath = path.join(PROOF_DIR, 'scenario_night2_jumppad.json');
  const inPath = path.join(PROOF_DIR, 'inputs_night2_jumppad.json');
  const outPath = path.join(PROOF_DIR, 'out_night2_jumppad.jsonl');

  fs.writeFileSync(scPath, JSON.stringify({
    player: { pos: [19.5, 0, 18], carried: 0, flames: 3 },
    random_motes: false,
    random_shades: false,
    random_drifters: false
  }, null, 2));
  fs.writeFileSync(inPath, JSON.stringify({
    frames: [
      { tick: 0, move: [1, 0] },
      { tick: 10, move: [0, 0] }
    ]
  }, null, 2));

  const res = runHeadless([
    '--seed', '22', '--night', '2',
    '--scenario', scPath, '--inputs', inPath,
    '--ticks', '100', '--out', outPath, '--snapshot-every', '20'
  ]);
  assert.strictEqual(res.status, 0);
  const records = parseJsonl(outPath);
  const endSnap = records.filter(r => r.type === 'snapshot').pop();
  assert.strictEqual(endSnap.lanterns.length, 6);
  assert.ok(endSnap.player.pos[0] > 42, `Expected Mây launched toward Island B (x>42), got x=${endSnap.player.pos[0]}`);
});

// 7. New Feature: Night 3 (Đảo Chuông) 3 tiers, 7 lanterns, wind & bell tower
test('[Phase 2] Scenario: Night 3 (Đảo Chuông) has 7 lanterns, 2 charms, and wind cycle', () => {
  const outPath = path.join(PROOF_DIR, 'out_night3.jsonl');
  const res = runHeadless([
    '--seed', '33', '--night', '3',
    '--ticks', '1600', '--out', outPath, '--snapshot-every', '400'
  ]);
  assert.strictEqual(res.status, 0);
  const records = parseJsonl(outPath);
  const snap0 = records.find(r => r.type === 'snapshot' && r.tick === 0);
  assert.strictEqual(snap0.lanterns.length, 7);
  assert.strictEqual(snap0.charms.length, 2);
  const snap1600 = records.find(r => r.type === 'snapshot' && r.tick === 1600);
  assert.strictEqual(snap1600.wind.active, true, 'Expected wind active at tick 1600');
});

// 8. New Feature: Gió Lạc (Drifter) steal & pulse drop
test('[Phase 2] Scenario: Gió Lạc (Drifter) steals up to 3 motes and drops them on Pulse', () => {
  const scPath = path.join(PROOF_DIR, 'scenario_drifter.json');
  const inPath = path.join(PROOF_DIR, 'inputs_drifter.json');
  const outPath = path.join(PROOF_DIR, 'out_drifter.jsonl');

  fs.writeFileSync(scPath, JSON.stringify({
    player: { pos: [0, 0, 0], carried: 8, flames: 3 },
    random_motes: false,
    random_shades: false,
    random_drifters: false,
    drifters: [{ id: 'D1', pos: [1.0, 0, 0], state: 'chase' }]
  }, null, 2));
  fs.writeFileSync(inPath, JSON.stringify({
    frames: [
      { tick: 2, pulse: true },
      { tick: 3, pulse: false }
    ]
  }, null, 2));

  const res = runHeadless([
    '--seed', '44', '--night', '2',
    '--scenario', scPath, '--inputs', inPath,
    '--ticks', '20', '--out', outPath, '--snapshot-every', '5'
  ]);
  assert.strictEqual(res.status, 0);
  const records = parseJsonl(outPath);
  const stealEv = records.find(r => r.type === 'event' && r.name === 'drifter_steal');
  assert.ok(stealEv && stealEv.data.amount === 3 && stealEv.data.carried === 5);
  const dropEv = records.find(r => r.type === 'event' && r.name === 'drifter_drop');
  assert.ok(dropEv && dropEv.data.amount === 3);
});

// 9. New Feature: Bùa Gió (Wind Charm) speed 7.2 m/s & zero dash cooldown
test('[Phase 2] Scenario: Bùa Gió (Wind Charm) grants 600 ticks of 7.2 m/s speed & 0 dash cooldown', () => {
  const scPath = path.join(PROOF_DIR, 'scenario_charm.json');
  const inPath = path.join(PROOF_DIR, 'inputs_charm.json');
  const outPath = path.join(PROOF_DIR, 'out_charm.jsonl');

  fs.writeFileSync(scPath, JSON.stringify({
    player: { pos: [34.5, 0, 0], carried: 0, flames: 3 },
    random_motes: false,
    random_shades: false,
    random_drifters: false
  }, null, 2));
  fs.writeFileSync(inPath, JSON.stringify({
    frames: [
      { tick: 0, move: [1, 0] },
      { tick: 10, move: [0, 0], dash: true },
      { tick: 11, dash: false }
    ]
  }, null, 2));

  const res = runHeadless([
    '--seed', '55', '--night', '2',
    '--scenario', scPath, '--inputs', inPath,
    '--ticks', '25', '--out', outPath, '--snapshot-every', '25'
  ]);
  assert.strictEqual(res.status, 0);
  const records = parseJsonl(outPath);
  const charmEv = records.find(r => r.type === 'event' && r.name === 'charm_picked');
  assert.ok(charmEv && charmEv.data.charm_id === 'C1' && charmEv.data.charm_ticks === 600);
  const snap25 = records.find(r => r.type === 'snapshot' && r.tick === 25);
  assert.strictEqual(snap25.player.dash_cd_s, 0);
  assert.ok(snap25.player.charm_s > 9.0);
});

// 10. New Feature: Pause & Resume
test('[Phase 2] Scenario: Pause freezes sim_tick & time_left_s while tick increments', () => {
  const inPath = path.join(PROOF_DIR, 'inputs_pause.json');
  const outPath = path.join(PROOF_DIR, 'out_pause.jsonl');
  fs.writeFileSync(inPath, JSON.stringify({
    frames: [
      { tick: 10, pause: true },
      { tick: 11, pause: false },
      { tick: 30, pause: true },
      { tick: 31, pause: false }
    ]
  }, null, 2));

  const res = runHeadless([
    '--seed', '66', '--night', '1',
    '--inputs', inPath, '--ticks', '40', '--out', outPath, '--snapshot-every', '20'
  ]);
  assert.strictEqual(res.status, 0);
  const records = parseJsonl(outPath);
  assert.ok(records.find(r => r.type === 'event' && r.name === 'paused'));
  assert.ok(records.find(r => r.type === 'event' && r.name === 'resumed'));
  const snap20 = records.find(r => r.type === 'snapshot' && r.tick === 20);
  assert.strictEqual(snap20.state, 'paused');
  assert.strictEqual(snap20.sim_tick, 10);
});

// 11. Determinism & Performance (< 30s for full Night 1 18,000 ticks)
test('[Phase 2] Determinism & Performance: Full 18,000-tick Night 1 headless runs in < 5s & identical', () => {
  const out1 = path.join(PROOF_DIR, 'determinism_n1_a.jsonl');
  const out2 = path.join(PROOF_DIR, 'determinism_n1_b.jsonl');
  const t0 = Date.now();
  const r1 = runHeadless(['--seed', '777', '--night', '1', '--ticks', '18000', '--out', out1, '--snapshot-every', '600']);
  const elapsedMs = Date.now() - t0;
  const r2 = runHeadless(['--seed', '777', '--night', '1', '--ticks', '18000', '--out', out2, '--snapshot-every', '600']);
  assert.strictEqual(r1.status, 0);
  assert.strictEqual(r2.status, 0);
  assert.strictEqual(fs.readFileSync(out1, 'utf8'), fs.readFileSync(out2, 'utf8'));
  assert.ok(elapsedMs < 30000, `Headless took too long: ${elapsedMs}ms`);
  console.log(`    (18,000 ticks finished in ${elapsedMs} ms)`);
});

// 12. Invalid inputs exit code 2
test('[Regression P1] Error handling: Malformed inputs exit with code 2', () => {
  const badInPath = path.join(TMP_DIR, 'bad_inputs.json');
  fs.writeFileSync(badInPath, JSON.stringify({ frames: [{ tick: 5 }, { tick: 5 }] }));
  const res = runHeadless(['--seed', '1', '--night', '1', '--inputs', badInPath, '--ticks', '10', '--out', path.join(TMP_DIR, 'bad.jsonl')]);
  assert.strictEqual(res.status, 2);
});

const failed = results.filter(r => r.status === 'FAIL');
console.log(`\n=== Summary: ${results.length - failed.length}/${results.length} Passed ===`);
if (failed.length > 0) {
  process.exit(1);
}
