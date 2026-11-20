# AGENTS.md — Đảo Đèn Lồng (AI SDLC Harness)

## 1. Kiến trúc bắt buộc
- **Tách biệt hoàn toàn simulation và presentation:**
  - `src/sim/` chứa toàn bộ logic game 60Hz tất định (`1 tick = 1/60s`), PRNG theo `--seed`, **TUYỆT ĐỐI KHÔNG** import `three`, `window`, `document` hay `Math.random()`.
  - `src/web/` chứa giao diện 3D (Three.js/Canvas), HUD, âm thanh, và các yếu tố sáng tạo hiển thị.
  - `src/headless.js` là CLI thực thi **Test Contract** đọc `--seed`, `--night`, `--scenario`, `--inputs`, `--ticks`, `--out`, `--snapshot-every`.

## 2. Lệnh chuẩn (macOS / Linux / Windows)
- Build / Kiểm tra cú pháp: `node --check src/headless.js`
- Chạy Headless Contract: `node src/headless.js --seed 42 --night 1 --ticks 600 --out /tmp/out.jsonl`
- Chạy Unit & Contract Tests: `node tests/run_tests.js`
- Chạy Web 3D Game: `node src/server.js` (mở `http://localhost:3000`)

## 3. Quy ước Test Contract (BẮT BUỘC)
- Mọi con số gameplay phải đọc trực tiếp từ `game.contract.json` (`tuning`), không hardcode khác với contract.
- Tọa độ xuất ra JSONL làm tròn 3 chữ số thập phân (`Number(v.toFixed(3))`).
- Khoảng cách gameplay tính trên mặt phẳng ngang **XZ** (`Math.hypot(dx, dz) <= r`).
- Lỗi định dạng file `--inputs` hoặc `--scenario` phải thoát với mã thoát **2** (`process.exit(2)`) và ghi lỗi ra `stderr`.
- Tính tất định: cùng `--seed`, `--scenario`, `--inputs` phải sinh ra file `.jsonl` giống hệt nhau 100% từng byte.
- Không kết thúc phase khi `node tests/run_tests.js` chưa PASS 100%.
