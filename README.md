# Đảo Đèn Lồng — Day 12 AI SDLC Lab

> **Học viên:** Phạm Nguyên Vũ · **MSSV:** `2A202603436` · **Lớp:** K5-L3A
> **Video Demo (`.mp4`):** [Xem Video Demo tại `docs/demo/demo.mp4`](docs/demo/demo.mp4) *(cập nhật khi phát hành Release `v1.0.0`)*

**Đảo Đèn Lồng** là game 3D góc nhìn thứ ba được phát triển theo quy trình AI SDLC. Người chơi điều khiển **Mây** — người giữ đèn nhỏ tuổi đội chiếc nón lá có treo đèn lồng nhỏ — chạy khắp **Đảo Bến** giữa biển mây để thu thập đom đóm, thắp sáng lại **5 Đèn Lồng Lớn** và dùng ánh sáng xua đuổi **Bóng Mực** trong sương đen.

---

## 1. Cài đặt và Chạy Game (Tối đa 3 lệnh — macOS / Linux / Windows)

Dự án sử dụng **Node.js thuần (Zero external npm dependencies)** nên không cần cài đặt thư viện ngoài, chạy tức thì trên macOS, Linux và Windows:

```bash
# Lệnh 1: Kiểm tra môi trường / build
node --check src/headless.js

# Lệnh 2: Chạy bộ kiểm thử tự động & kiểm chứng Test Contract v1.0
node tests/run_tests.js

# Lệnh 3: Khởi động game 3D có giao diện (mở http://localhost:3000 trên trình duyệt)
node src/server.js
```

---

## 2. Điều khiển (Controls)

| Phím / Chuột | Hành động |
|---|---|
| `W A S D` hoặc `Phím Mũi Tên` | Di chuyển Mây trên đảo theo hướng Camera 3D |
| `Space` | Nhảy (Jump) |
| `E` | Nạp đom đóm vào Đèn Lồng Lớn khi đứng gần (`<= 2.5m`) |
| `F` | **Tỏa sáng (Pulse)**: tốn `1` đom đóm để làm choáng (`3s`) và đẩy lùi Bóng Mực trong bán kính `6.0m` |
| `Q / R` hoặc `Kéo chuột trái` | Xoay góc nhìn Camera 3D quanh Mây |
| `M` | Bật / Tắt âm thanh Chuông Gió Ngũ Cung |

---

## 3. Chế độ Headless & Test Contract v1.0

Khai báo cấu hình nằm ở [`game.contract.json`](game.contract.json). Chạy chế độ headless đúng chuẩn **Test Contract v1.0**:

```bash
node src/headless.js --seed 42 --night 1 --ticks 600 --out /tmp/out.jsonl --snapshot-every 10
```

Chạy kèm file `--scenario` và `--inputs`:

```bash
node src/headless.js --seed 101 --night 1 \
  --scenario docs/proof/phase-1/scenario_win.json \
  --inputs docs/proof/phase-1/inputs_win.json \
  --ticks 100 --out /tmp/win.jsonl --snapshot-every 10
```

### Bảng Thông số Tuning & Cách Tính Điểm (`game.contract.json`)

- **Nhân vật & Tương tác:** `player_speed = 6.0` m/s, `carry_capacity = 5`, `lantern_cost = 3`, `lantern_count_night1 = 5`, `pickup_radius = 1.5` m, `interact_radius = 2.5` m, `flames = 3`, `invuln_s = 1.5` s, `hit_drop_ratio = 0.5`, `fall_enabled = true` (rơi khỏi rìa đảo bán kính `45m` bị trừ 1 ngọn lửa và hồi sinh về tâm đảo).
- **Tỏa sáng & Bóng Mực:** `pulse_cost = 1`, `pulse_radius = 6.0` m, `pulse_stun_s = 3.0` s, `pulse_push_m = 4.0` m, `pulse_cooldown_s = 1.0` s, `safe_radius = 5.0` m (vùng an toàn quanh đèn đã sáng mà Bóng Mực không vào được), `shade_speed = 3.5` m/s, `shade_hit_radius = 1.2` m.
- **Cách tính điểm (`score`):**
  - Nhặt 1 đom đóm (`mote_picked`): **`+10` điểm** (`per_mote: 10`)
  - Thắp sáng 1 Đèn Lồng Lớn (`lantern_lit`): **`+100` điểm** (`per_lantern: 100`)
  - Làm choáng mỗi Bóng Mực khi Tỏa sáng (`pulse`): **`+25` điểm** (`per_stun: 25`)
  - Thưởng khi Thắng (`won`): **`+5` điểm / giây còn lại** (`per_second_left: 5`) + **`+50` điểm / ngọn lửa còn lại** (`per_flame_left: 50`).

---

## 4. Sáng tạo của tôi (Creative Additions — Hạng mục F)

Để làm phong phú trải nghiệm cổ tích của Đảo Đèn Lồng mà **không làm thay đổi bất kỳ kết quả hay thực thể nào của chế độ Headless Contract**, tôi đã thiết kế tách biệt trong tầng hiển thị [`src/web/game3d.js`](src/web/game3d.js):

1. **Hoa Đăng Bay Lên Trời & Bầu Trời Biển Mây Ấm Dần:**
   - Mỗi khi Mây thắp sáng một Đèn Lồng Lớn, một chùm **Hoa Đăng vàng ấm** bay bổng lên bầu trời đêm.
   - Bầu trời đêm và biển mây quanh đảo chuyển màu ấm dần theo tỷ lệ phần trăm Đèn Lồng đã thắp (`0% -> 100%`), đúng tinh thần *"Đảo sáng dần lên khi thắp đèn"*.
2. **Chuông Gió Ngũ Cung Việt Nam (Procedural WebAudio):**
   - Âm thanh khi nhặt đom đóm, nạp đèn, tỏa sáng và thắp đèn được tổng hợp thời gian thực bằng `Web Audio API` theo thang âm **Ngũ Cung Việt Nam (Hò - Xự - Xang - Xê - Cống)**, mang lại âm hưởng cổ tích êm dịu mà không cần tải file âm thanh ngoài.
3. **Bằng chứng không phá vỡ Test Contract:**
   - Toàn bộ hiệu ứng Hoa Đăng và Chuông Gió chỉ nằm trong `src/web/game3d.js`, hoàn toàn độc lập với `src/sim/world.js` và `src/headless.js`. Kết quả chạy `node tests/run_tests.js` đạt **9/9 PASS** và tính tất định khớp 100%.

---

## 5. Cấu trúc Hồ sơ SDLC, Harness AI & Bằng chứng

| Đường dẫn | Mô tả |
|---|---|
| [`AGENTS.md`](AGENTS.md) | File hướng dẫn cố định cho AI Agent (kiến trúc, lệnh chuẩn, quy tắc Test Contract) |
| [`.agents/skills/verify-contract/SKILL.md`](.agents/skills/verify-contract/SKILL.md) | Skill tự động hóa quy trình kiểm chứng contract và tính tất định |
| [`.agents/skills/ui-ux-pro-max/SKILL.md`](.agents/skills/ui-ux-pro-max/SKILL.md) | Skill UI/UX Pro Max Design Intelligence (tạo Design System [`design-system/dao-den-long/MASTER.md`](design-system/dao-den-long/MASTER.md)) |
| [`.githooks/pre-commit`](.githooks/pre-commit) | Git hook chặn commit khi bộ test `tests/run_tests.js` chưa xanh |
| [`.github/workflows/verify.yml`](.github/workflows/verify.yml) | GitHub Actions CI tự động chạy test trên Ubuntu mỗi lần push / tag |
| [`docs/notes/phase-1-notes.md`](docs/notes/phase-1-notes.md) | Tiêu chí nghiệm thu, giả định PRD-0, nhật ký dùng AI & ước tính token Phase 1 |
| [`docs/proof/phase-1/PROOF.md`](docs/proof/phase-1/PROOF.md) | Bảng truy vết yêu cầu, scenario JSON, output JSONL thực tế và ảnh chụp 3D |
| [`CREDITS.md`](CREDITS.md) & [`LICENSE`](LICENSE) | Ghi nguồn tài sản, công cụ AI và giấy phép MIT |
