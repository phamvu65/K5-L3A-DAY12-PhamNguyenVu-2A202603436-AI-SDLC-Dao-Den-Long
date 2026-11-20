#!/usr/bin/env node
/**
 * Headless runner for Đảo Đèn Lồng — Test Contract v1.0
 * Usage:
 *   node src/headless.js --seed <int> --night 1 [--scenario <file.json>] [--inputs <file.json>]
 *                        --ticks <int> --out <file.jsonl> [--snapshot-every <int, default 10>]
 */

const fs = require('fs');
const path = require('path');
const GameWorld = require('./sim/world');

function exitWithError(code, msg) {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {
    seed: 1,
    night: 1,
    scenario: null,
    inputs: null,
    ticks: null,
    out: null,
    snapshotEvery: 10
  };

  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    switch (flag) {
      case '--seed':
        if (next === undefined) exitWithError(1, 'Missing value for --seed');
        args.seed = Number(next);
        if (!Number.isInteger(args.seed)) exitWithError(1, '--seed must be an integer');
        i++;
        break;
      case '--night':
        if (next === undefined) exitWithError(1, 'Missing value for --night');
        args.night = Number(next);
        if (!Number.isInteger(args.night) || args.night < 1) exitWithError(1, '--night must be a positive integer');
        i++;
        break;
      case '--scenario':
        if (next === undefined) exitWithError(2, 'Missing value for --scenario');
        args.scenario = next;
        i++;
        break;
      case '--inputs':
        if (next === undefined) exitWithError(2, 'Missing value for --inputs');
        args.inputs = next;
        i++;
        break;
      case '--ticks':
        if (next === undefined) exitWithError(1, 'Missing value for --ticks');
        args.ticks = Number(next);
        if (!Number.isInteger(args.ticks) || args.ticks < 0) exitWithError(1, '--ticks must be a non-negative integer');
        i++;
        break;
      case '--out':
        if (next === undefined) exitWithError(1, 'Missing value for --out');
        args.out = next;
        i++;
        break;
      case '--snapshot-every':
        if (next === undefined) exitWithError(1, 'Missing value for --snapshot-every');
        args.snapshotEvery = Number(next);
        if (!Number.isInteger(args.snapshotEvery) || args.snapshotEvery <= 0) {
          exitWithError(1, '--snapshot-every must be a positive integer');
        }
        i++;
        break;
      default:
        exitWithError(1, `Unknown argument: ${flag}`);
    }
  }

  if (args.ticks === null) exitWithError(1, '--ticks is required');
  if (!args.out) exitWithError(1, '--out is required');

  return args;
}

function loadAndValidateInputs(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    exitWithError(2, `Cannot read inputs file: ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    exitWithError(2, `Invalid JSON in inputs file: ${err.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.frames)) {
    exitWithError(2, 'Inputs JSON must contain a "frames" array');
  }

  let lastTick = -1;
  const frameMap = new Map();

  for (let i = 0; i < parsed.frames.length; i++) {
    const f = parsed.frames[i];
    if (!f || typeof f !== 'object' || Array.isArray(f)) {
      exitWithError(2, `Frame at index ${i} must be an object`);
    }
    if (!Number.isInteger(f.tick) || f.tick < 0) {
      exitWithError(2, `Frame at index ${i} has invalid tick: ${f.tick}`);
    }
    if (f.tick <= lastTick) {
      exitWithError(2, `Frame ticks must increase strictly (got ${f.tick} after ${lastTick})`);
    }
    lastTick = f.tick;

    if (f.move !== undefined) {
      if (
        !Array.isArray(f.move) ||
        f.move.length !== 2 ||
        typeof f.move[0] !== 'number' ||
        typeof f.move[1] !== 'number' ||
        Number.isNaN(f.move[0]) ||
        Number.isNaN(f.move[1]) ||
        f.move[0] < -1 ||
        f.move[0] > 1 ||
        f.move[1] < -1 ||
        f.move[1] > 1
      ) {
        exitWithError(2, `Frame at tick ${f.tick} has invalid move vector`);
      }
    }

    if (f.cam_yaw_deg !== undefined) {
      if (typeof f.cam_yaw_deg !== 'number' || Number.isNaN(f.cam_yaw_deg)) {
        exitWithError(2, `Frame at tick ${f.tick} has invalid cam_yaw_deg`);
      }
    }

    for (const btn of ['jump', 'interact', 'pulse', 'dash']) {
      if (f[btn] !== undefined && typeof f[btn] !== 'boolean') {
        exitWithError(2, `Frame at tick ${f.tick} field "${btn}" must be boolean`);
      }
    }

    frameMap.set(f.tick, f);
  }

  return frameMap;
}

function loadAndValidateScenario(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    exitWithError(2, `Cannot read scenario file: ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    exitWithError(2, `Invalid JSON in scenario file: ${err.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    exitWithError(2, 'Scenario JSON root must be an object');
  }

  return parsed;
}

function main() {
  const args = parseArgs(process.argv);

  const contractPath = path.resolve(__dirname, '..', 'game.contract.json');
  let contract;
  try {
    contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  } catch (err) {
    exitWithError(1, `Failed to load game.contract.json: ${err.message}`);
  }

  const scenario = args.scenario ? loadAndValidateScenario(args.scenario) : null;
  const frameMap = args.inputs ? loadAndValidateInputs(args.inputs) : new Map();

  let world;
  try {
    world = new GameWorld(contract.tuning, {
      seed: args.seed,
      night: args.night,
      scenario
    });
  } catch (err) {
    exitWithError(2, `Invalid scenario format: ${err.message}`);
  }

  const lines = [];

  // Snapshot tick 0: state after scenario setup, before applying input
  lines.push(JSON.stringify(world.getSnapshot()));

  // Current persistent input state
  const currentInput = {
    move: [0, 0],
    cam_yaw_deg: 0,
    jump: false,
    interact: false,
    pulse: false,
    dash: false
  };

  // If scenario already won/lost at tick 0 (shouldn't emit events, just check if playing)
  for (let k = 0; k < args.ticks; k++) {
    if (world.state !== 'playing') break;

    if (frameMap.has(k)) {
      const f = frameMap.get(k);
      if (f.move !== undefined) currentInput.move = [f.move[0], f.move[1]];
      if (f.cam_yaw_deg !== undefined) currentInput.cam_yaw_deg = f.cam_yaw_deg;
      if (f.jump !== undefined) currentInput.jump = f.jump;
      if (f.interact !== undefined) currentInput.interact = f.interact;
      if (f.pulse !== undefined) currentInput.pulse = f.pulse;
      if (f.dash !== undefined) currentInput.dash = f.dash;
    }

    const stepEvents = world.step(currentInput);
    for (const ev of stepEvents) {
      lines.push(JSON.stringify(ev));
    }

    if (world.tick % args.snapshotEvery === 0) {
      lines.push(JSON.stringify(world.getSnapshot()));
    }

    if (world.state !== 'playing') {
      break;
    }
  }

  // Mandatory end record
  lines.push(JSON.stringify(world.getEndRecord()));

  try {
    const outDir = path.dirname(path.resolve(args.out));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(args.out, lines.join('\n') + '\n', 'utf8');
  } catch (err) {
    exitWithError(1, `Cannot write output file: ${err.message}`);
  }

  process.exit(0);
}

main();
