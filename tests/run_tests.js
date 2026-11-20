/**
 * Automated Unit, Scenario & Determinism Test Suite for Đảo Đèn Lồng (Contract v1.0)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const GameWorld = require('../src/sim/world');
const contract = require('../game.contract.json');

const HEADLESS_PATH = path.resolve(__dirname, '..', 'src', 'headless.js');
const TMP_DIR = path.resolve(__dirname, '.tmp');
const PROOF_DIR = path.resolve(__dirname, '..', 'docs', 'proof', 'phase-1');

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

console.log('=== Running Đảo Đèn Lồng Phase 1 Test Suite ===');

// 1. Contract file structure validation
test('Contract v1.0 schema & tuning fields are valid', () => {
  assert.strictEqual(contract.contract_version, '1.0');
  assert.ok(contract.team && contract.team.includes('2A202603436'));
  assert.ok(contract.headless_cmd);
  const t = contract.tuning;
  assert.strictEqual(t.lantern_count_night1, 5);
  assert.ok(t.player_speed > 0);
  assert.ok(t.carry_capacity >= t.lantern_cost);
  assert.ok(t.pickup_radius > 0);
  assert.ok(t.interact_radius > 0);
  assert.ok(t.pulse_radius > 0);
  assert.ok(t.safe_radius > 0);
});

// 2. Movement and camera yaw rotation formula
test('Movement & cam_yaw_deg formula: x\' = x*cosθ + z*sinθ, z\' = -x*sinθ + z*cosθ', () => {
  const w = new GameWorld(contract.tuning, {
    seed: 1,
    scenario: {
      player: { pos: [0, 0, 0], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: []
    }
  });

  // Move along +Z with cam_yaw_deg = 0 for 60 ticks (1 second)
  for (let i = 0; i < 60; i++) {
    w.step({ move: [0, 1], cam_yaw_deg: 0 });
  }
  const snap1 = w.getSnapshot();
  assert.strictEqual(snap1.player.pos[0], 0);
  assert.strictEqual(snap1.player.pos[2], contract.tuning.player_speed);

  // Move along +Z with cam_yaw_deg = 90 deg -> x' = sin(90)=1, z' = cos(90)=0
  for (let i = 0; i < 60; i++) {
    w.step({ move: [0, 1], cam_yaw_deg: 90 });
  }
  const snap2 = w.getSnapshot();
  assert.strictEqual(snap2.player.pos[0], contract.tuning.player_speed);
  assert.strictEqual(snap2.player.pos[2], contract.tuning.player_speed);
});

// 3. Diagonal movement normalization
test('Diagonal move vector [1, 1] is normalized to length 1', () => {
  const w = new GameWorld(contract.tuning, {
    seed: 1,
    scenario: {
      player: { pos: [0, 0, 0], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: []
    }
  });
  for (let i = 0; i < 60; i++) {
    w.step({ move: [1, 1], cam_yaw_deg: 0 });
  }
  const dist = Math.hypot(w.player.pos[0], w.player.pos[2]);
  assert.ok(Math.abs(dist - contract.tuning.player_speed) < 1e-3);
});

// 4. Scenario: Pick motes, deposit, light last lantern & win
test('Scenario: Pickup motes, deposit, light final lantern -> game_over(won, all_lit)', () => {
  const scPath = path.join(PROOF_DIR, 'scenario_win.json');
  const inPath = path.join(PROOF_DIR, 'inputs_win.json');
  const outPath = path.join(PROOF_DIR, 'out_win.jsonl');

  const scenario = {
    player: { pos: [0, 0, 0], carried: 2, flames: 3 },
    random_motes: false,
    random_shades: false,
    motes: [[0, 0, 2]],
    shades: [],
    lanterns: [
      { id: 'L1', pos: [0, 0, 5], deposited: 0, lit: false },
      { id: 'L2', pos: [20, 0, 0], deposited: 3, lit: true },
      { id: 'L3', pos: [-20, 0, 0], deposited: 3, lit: true },
      { id: 'L4', pos: [0, 0, -20], deposited: 3, lit: true },
      { id: 'L5', pos: [15, 0, 15], deposited: 3, lit: true }
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
    '--seed', '101',
    '--night', '1',
    '--scenario', scPath,
    '--inputs', inPath,
    '--ticks', '100',
    '--out', outPath,
    '--snapshot-every', '10'
  ]);

  assert.strictEqual(res.status, 0, `Headless failed: ${res.stderr}`);
  const records = parseJsonl(outPath);

  const picked = records.find(r => r.type === 'event' && r.name === 'mote_picked');
  assert.ok(picked, 'Expected mote_picked event');
  assert.strictEqual(picked.data.carried, 3);

  const deposit = records.find(r => r.type === 'event' && r.name === 'deposit');
  assert.ok(deposit, 'Expected deposit event');
  assert.strictEqual(deposit.data.lantern_id, 'L1');
  assert.strictEqual(deposit.data.amount, 3);
  assert.strictEqual(deposit.data.deposited, 3);

  const lit = records.find(r => r.type === 'event' && r.name === 'lantern_lit');
  assert.ok(lit, 'Expected lantern_lit event');
  assert.strictEqual(lit.data.lantern_id, 'L1');

  const gameOver = records.find(r => r.type === 'event' && r.name === 'game_over');
  assert.ok(gameOver, 'Expected game_over event');
  assert.strictEqual(gameOver.data.result, 'won');
  assert.strictEqual(gameOver.data.reason, 'all_lit');

  const endRec = records[records.length - 1];
  assert.strictEqual(endRec.type, 'end');
  assert.strictEqual(endRec.state, 'won');
  assert.strictEqual(endRec.ticks, 41);
});

// 5. Scenario: Pulse stun & push shades
test('Scenario: Pulse stuns and pushes shades within pulse_radius', () => {
  const scPath = path.join(PROOF_DIR, 'scenario_pulse.json');
  const inPath = path.join(PROOF_DIR, 'inputs_pulse.json');
  const outPath = path.join(PROOF_DIR, 'out_pulse.jsonl');

  const scenario = {
    player: { pos: [0, 0, 0], carried: 2, flames: 3 },
    random_motes: false,
    random_shades: false,
    motes: [],
    shades: [
      { id: 'S1', pos: [3, 0, 0] },
      { id: 'S2', pos: [20, 0, 0] }
    ]
  };

  const inputs = {
    frames: [
      { tick: 0, pulse: true },
      { tick: 1, pulse: false }
    ]
  };

  fs.writeFileSync(scPath, JSON.stringify(scenario, null, 2));
  fs.writeFileSync(inPath, JSON.stringify(inputs, null, 2));

  const res = runHeadless([
    '--seed', '202',
    '--night', '1',
    '--scenario', scPath,
    '--inputs', inPath,
    '--ticks', '10',
    '--out', outPath,
    '--snapshot-every', '5'
  ]);

  assert.strictEqual(res.status, 0);
  const records = parseJsonl(outPath);

  const pulseEv = records.find(r => r.type === 'event' && r.name === 'pulse');
  assert.ok(pulseEv, 'Expected pulse event');
  assert.deepStrictEqual(pulseEv.data.stunned_ids, ['S1']);

  const snap5 = records.find(r => r.type === 'snapshot' && r.tick === 5);
  assert.ok(snap5);
  const s1 = snap5.shades.find(s => s.id === 'S1');
  assert.strictEqual(s1.state, 'stunned');
  // Pushed from x=3 by pulse_push_m (4.0) -> x=7.0
  assert.strictEqual(s1.pos[0], 3 + contract.tuning.pulse_push_m);
});

// 6. Scenario: Shade hit & loss by no_flames
test('Scenario: Shade hits player, drops motes, loses last flame -> game_over(lost, no_flames)', () => {
  const scPath = path.join(PROOF_DIR, 'scenario_lose.json');
  const outPath = path.join(PROOF_DIR, 'out_lose.jsonl');

  const scenario = {
    player: { pos: [0, 0, 0], carried: 4, flames: 1 },
    random_motes: false,
    random_shades: false,
    motes: [],
    shades: [{ id: 'S1', pos: [1.5, 0, 0] }]
  };

  fs.writeFileSync(scPath, JSON.stringify(scenario, null, 2));

  const res = runHeadless([
    '--seed', '303',
    '--night', '1',
    '--scenario', scPath,
    '--ticks', '30',
    '--out', outPath,
    '--snapshot-every', '5'
  ]);

  assert.strictEqual(res.status, 0);
  const records = parseJsonl(outPath);

  const hitEv = records.find(r => r.type === 'event' && r.name === 'player_hit');
  assert.ok(hitEv, 'Expected player_hit event');
  assert.strictEqual(hitEv.data.by, 'shade');
  assert.strictEqual(hitEv.data.flames, 0);
  assert.strictEqual(hitEv.data.dropped, 2);

  const overEv = records.find(r => r.type === 'event' && r.name === 'game_over');
  assert.ok(overEv, 'Expected game_over event');
  assert.strictEqual(overEv.data.result, 'lost');
  assert.strictEqual(overEv.data.reason, 'no_flames');
});

// 7. Scenario: Safe radius around lit lantern blocks shades
test('Scenario: Lit lantern safe_radius prevents shades from entering or hitting player', () => {
  const w = new GameWorld(contract.tuning, {
    seed: 1,
    scenario: {
      player: { pos: [0, 0, 25], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: 'S1', pos: [0, 0, 18] }],
      lanterns: [{ id: 'L1', pos: [0, 0, 25], deposited: 3, lit: true }]
    }
  });

  for (let i = 0; i < 120; i++) {
    w.step({});
  }
  const s1 = w.shades[0];
  const distToLantern = Math.hypot(s1.pos[0] - 0, s1.pos[2] - 25);
  assert.ok(distToLantern >= contract.tuning.safe_radius, `Shade entered safe_radius: ${distToLantern}`);
  assert.strictEqual(w.player.flames, 3);
});

// 8. Determinism check: 2 runs with identical seed + inputs produce byte-identical JSONL
test('Determinism: Two runs with same --seed produce 100% identical JSONL output', () => {
  const out1 = path.join(PROOF_DIR, 'determinism_run1.jsonl');
  const out2 = path.join(PROOF_DIR, 'determinism_run2.jsonl');

  const r1 = runHeadless([
    '--seed', '777',
    '--night', '1',
    '--ticks', '300',
    '--out', out1,
    '--snapshot-every', '15'
  ]);
  const r2 = runHeadless([
    '--seed', '777',
    '--night', '1',
    '--ticks', '300',
    '--out', out2,
    '--snapshot-every', '15'
  ]);

  assert.strictEqual(r1.status, 0);
  assert.strictEqual(r2.status, 0);

  const c1 = fs.readFileSync(out1, 'utf8');
  const c2 = fs.readFileSync(out2, 'utf8');
  assert.strictEqual(c1, c2, 'Outputs differ between identical seeded runs!');
  assert.ok(c1.length > 100);
});

// 9. Invalid inputs/scenario exit code 2
test('Error handling: Malformed inputs or non-increasing frame ticks exit with code 2', () => {
  const badInPath = path.join(TMP_DIR, 'bad_inputs.json');
  fs.writeFileSync(
    badInPath,
    JSON.stringify({
      frames: [
        { tick: 10, move: [0, 1] },
        { tick: 10, move: [0, 0] } // duplicate tick -> must exit 2
      ]
    })
  );

  const res = runHeadless([
    '--seed', '1',
    '--night', '1',
    '--inputs', badInPath,
    '--ticks', '20',
    '--out', path.join(TMP_DIR, 'bad_out.jsonl')
  ]);

  assert.strictEqual(res.status, 2, `Expected exit code 2, got ${res.status}`);
});

const failed = results.filter(r => r.status === 'FAIL');
console.log(`\n=== Summary: ${results.length - failed.length}/${results.length} Passed ===`);
if (failed.length > 0) {
  process.exit(1);
}
