# AGENTS.md — Đảo Đèn Lồng (AI SDLC Harness)

## 1. Kiến trúc bắt buộc
- **Tách biệt hoàn toàn simulation và presentation:**
  - `src/sim/` chứa toàn bộ logic game 60Hz tất định (`1 tick = 1/60s`), PRNG theo `--seed`, **TUYỆT ĐỐI KHÔNG** import `three`, `window`, `document` hay `Math.random()`.
  - `src/sim/maps.js` chứa định nghĩa 3 bản đồ chuẩn (Đêm 1 Đảo Bến, Đêm 2 Đảo Cau, Đêm 3 Đảo Chuông), điểm sinh đom đóm, điểm sinh Bóng Mực, bục nhảy, dốc, tháp chuông, và vị trí Bùa Gió.
  - `src/web/` chứa giao diện 3D, HUD đầy đủ, menu chuỗi 3 Đêm, cài đặt, âm thanh, và các yếu tố sáng tạo hiển thị.
  - `src/headless.js` là CLI thực thi **Test Contract** đọc `--seed`, `--night` (`1|2|3`), `--scenario`, `--inputs`, `--ticks`, `--out`, `--snapshot-every`.

## 2. Lệnh chuẩn (macOS / Linux / Windows)
- Build / Kiểm tra cú pháp: `node --check src/headless.js`
- Chạy Headless Contract: `node src/headless.js --seed 42 --night 1 --ticks 600 --out tests/.tmp/out.jsonl`
- Chạy Unit & Contract Tests: `node tests/run_tests.js`
- Chạy Web 3D Game: `node src/server.js` (mở `http://localhost:3000`)

## 3. Quy ước Test Contract (BẮT BUỘC)
- Mọi con số gameplay phải đọc trực tiếp từ `game.contract.json` (`tuning`), không hardcode khác với contract.
- Thứ tự xử lý 12 bước trong mỗi tick phải tuân thủ tuyệt đối theo Ticket-02 (input/pause -> giảm bộ đếm -> di chuyển/gió/rơi -> nhặt -> nạp đèn -> safe zone -> pulse -> di chuyển Bóng Mực & Gió Lạc -> chạm -> spawn -> xét thắng/thua -> snapshot).
- Tọa độ xuất ra JSONL làm tròn 3 chữ số thập phân (`Number(v.toFixed(3))`).
- Lỗi định dạng file `--inputs` hoặc `--scenario` phải thoát với mã thoát **2** (`process.exit(2)`) và ghi lỗi ra `stderr`.
- Tính tất định: cùng `--seed`, `--night`, `--scenario`, `--inputs` phải sinh ra file `.jsonl` giống hệt nhau 100% từng byte.
- Không kết thúc phase khi `node tests/run_tests.js` chưa PASS 100%.
