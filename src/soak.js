#!/usr/bin/env node
/**
 * Soak Test Runner for Đảo Đèn Lồng — Test Contract v1.3
 * Usage: node src/soak.js --seed 7 --nights 10 --out soak.json
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const GameWorld = require('./sim/world');
const PRNG = require('./sim/prng');
const contract = require('../game.contract.json');

function parseArgs(argv) {
  const args = { seed: 7, nights: 10, out: 'soak.json' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--seed') args.seed = Number(argv[++i]);
    else if (argv[i] === '--nights') args.nights = Number(argv[++i]);
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const t0 = performance.now();
  const results = [];
  let crashes = 0;
  let memStartMb = null;

  // Warm up V8 JIT & young-generation heap across all 3 night maps before measuring baseline RSS
  for (const wn of [1, 2, 3]) {
    const warmup = new GameWorld(contract.tuning, { seed: args.seed, night: wn });
    for (let w = 0; w < 5400; w++) warmup.step({ move: [0.5, 0.5], jump: w % 20 === 0, pulse: w % 60 === 0 });
  }

  for (let i = 0; i < args.nights; i++) {
    const nightNum = (i % 3) + 1;
    const nightSeed = args.seed + i;
    const inputRng = new PRNG(nightSeed * 13 + 7);

    let world = new GameWorld(contract.tuning, {
      seed: nightSeed,
      night: nightNum
    });

    if (i === 0) {
      memStartMb = Number((process.memoryUsage().rss / (1024 * 1024)).toFixed(2));
    }

    let moveDir = [0, 0];
    const maxTicks = Math.round(world.initial_duration_s * 60) + 10;

    try {
      for (let t = 0; t < maxTicks; t++) {
        if (world.state === 'won' || world.state === 'lost') break;
        if (t % 30 === 0) {
          const ang = inputRng.range(0, Math.PI * 2);
          moveDir = [Math.cos(ang), Math.sin(ang)];
        }
        world.step({
          move: moveDir,
          cam_yaw_deg: 0,
          jump: inputRng.next() < 0.05,
          dash: inputRng.next() < 0.03,
          pulse: inputRng.next() < 0.02,
          interact: inputRng.next() < 0.10
        });
      }
      results.push(world.state === 'won' ? 'won' : 'lost');
    } catch (err) {
      crashes += 1;
      results.push('crash');
      process.stderr.write(`Crash on night ${i}: ${err.message}\n`);
    }
    world = null;
  }

  if (global.gc) global.gc();
  const memEndMb = Number((process.memoryUsage().rss / (1024 * 1024)).toFixed(2));
  const durationS = Number(((performance.now() - t0) / 1000).toFixed(2));

  const output = {
    nights: args.nights,
    crashes,
    results,
    mem_start_mb: memStartMb,
    mem_end_mb: memEndMb,
    duration_s: durationS
  };

  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`Soak test complete: ${args.nights} nights, crashes=${crashes}, mem=${memStartMb} -> ${memEndMb} MB, ${durationS}s`);
  process.exit(crashes > 0 ? 1 : 0);
}

main();
