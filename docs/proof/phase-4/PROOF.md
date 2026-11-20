# Bằng chứng Kiểm chứng Phase 4 — Bình minh v1.0.0 (Contract v1.3)

## 1. Kết quả Benchmark (`bench.json`)
Chạy thực tế lệnh:
```bash
node src/bench.js --seed 42 --duration 30 --out bench.json
```
- `avg_fps`: **124.6** (Ngưỡng đạt: `>= 60`)
- `p1_low_fps`: **103.0** (Ngưỡng đạt: `>= 30`)
- `frame_ms_p95`: **8.27 ms**
- `load_ms`: **4 ms** (Ngưỡng đạt: `<= 10000`)

## 2. Kết quả Soak Test (`soak.json`)
Chạy thực tế lệnh:
```bash
node src/soak.js --seed 7 --nights 10 --out soak.json
```
- `nights`: **10**
- `crashes`: **0** (Ngưỡng đạt: `0`)
- `mem_start_mb`: **47.91 MB** -> `mem_end_mb`: **50.75 MB** (`1.059x <= 1.2x`)
- `duration_s`: **0.42 s**

## 3. Bộ Kiểm thử Tổng hợp (`node tests/run_tests.js`)
- **10/10 PASS** (bao gồm Contract v1.3, Regression Phase 1–3, Benchmark, Soak, và `--export-leaderboard`).
