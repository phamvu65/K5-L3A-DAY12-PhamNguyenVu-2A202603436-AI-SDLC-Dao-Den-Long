# Retrospective Tổng Kết 4 Phase — Đảo Đèn Lồng (Day 12 AI SDLC)

## 1. Tổng hợp Evaluation qua 4 Phase

| Phase | Mục tiêu chính | Kết quả Kiểm chứng | Thay đổi kiến trúc / Harness |
|---|---|---|---|
| **Phase 1 (PRD-0, v1.0)** | Dựng lõi 60Hz tất định, Đêm 1, đồ họa 3D, sáng tạo Hoa Đăng & Chuông Gió | 9/9 tests PASS, tính tất định 100%, ảnh chụp 3D | Tạo `AGENTS.md`, skill `verify-contract`, `ui-ux-pro-max`, `.githooks/pre-commit`, CI `.github/workflows/verify.yml` |
| **Phase 2 (Ticket-02, v1.1)** | Chuẩn hóa số liệu, 3 Đêm (Đảo Bến, Đảo Cau, Đảo Chuông), Lướt, Gió Lạc, Bùa Gió, Pause | 12/12 tests PASS, 18,000 tick Đêm 1 chạy trong `84 ms` | Tách `src/sim/maps.js` chứa 3 bản đồ chuẩn; cập nhật `AGENTS.md` với thứ tự 12 bước |
| **Phase 3 (Ticket-03, v1.2)** | Change Request: Nhiên liệu đèn (`fuel`), Bóng Mực `drain`, bỏ thắng sớm (`dawn_survived`), Mù màu | 8/8 tests PASS, cập nhật tường minh test `all_lit` -> `dawn_survived` | Viết `ADR-001` (`phase-3-adr.md`) và `CHANGELOG.md`; tính dầu bằng số nguyên `fuel_ticks` |
| **Phase 4 (Ticket-04, v1.3)** | Benchmark 30s, Soak test 10 Đêm, Bảng xếp hạng, Accessibility, Release `v1.0.0` | 10/10 tests PASS; `avg_fps=124.6`, `crashes=0`, `mem: 47.91->50.75 MB` | Thêm `src/bench.js`, `src/soak.js`, `--export-leaderboard`, đổi phím & WCAG |

---

## 2. Điều gì hiệu quả / chưa hiệu quả khi làm việc với AI

- **Hiệu quả nhất:**
  - **Tách biệt hoàn toàn `src/sim/` và `src/web/` ngay từ Phase 1:** Nhờ vậy khi sang Phase 2 (thêm 2 bản đồ mới) và Phase 3 (thay đổi toàn bộ luật nhiên liệu và điều kiện thắng), phần simulation chỉ sửa ở 2 file (`maps.js`, `world.js`) mà không bị vỡ giao diện hay mất tính tất định.
  - **Viết scenario headless trước/cùng lúc với code:** Mọi lỗi logic đều lộ ra ngay sau < 1 giây chạy `node tests/run_tests.js`.
- **Chưa hiệu quả:**
  - Khi làm việc với trình duyệt sandbox (`webview_browser`), các iframe cross-origin bị che nên cần phối hợp lấy spec trực tiếp từ người dùng thay vì chờ agent tự cào trang web.

---

## 3. Những lần AI sai và cách phát hiện / sửa Harness

1. **Đom đóm rơi bị nhặt lại ngay lập tức (Phase 1):** Khi Bóng Mực đánh rơi đom đóm tại đúng chân Mây, tick kế tiếp Mây tự động nhặt lại ngay. Phát hiện qua scenario `player_hit` và sửa bằng cách đặt bán kính rơi `1.5–2.5 m` ngoài `pickup_radius` (`1.0 m`) kèm `spawn_delay = 1`.
2. **Test `drain` bị lỗi khoảng cách kích hoạt `chase` (Phase 3):** Trong scenario kiểm thử `drain`, Mây đứng cách Bóng Mực `7.5 m <= 12 m` nên Bóng Mực chuyển sang `chase` thay vì đứng hút dầu. Phát hiện ngay khi chạy `node tests/run_tests.js` và sửa scenario cho Mây đứng ngoài tầm phát hiện `12 m` trước khi lao vào Tỏa Sáng.
3. **V8 Young-Generation RSS trong Soak Test (Phase 4):** Lần chạy Soak đầu tiên có `mem_start_mb = 34.85 MB -> 51.46 MB` (`1.47x > 1.2x`) do V8 chưa khởi tạo hết cache cho 3 bản đồ trước khi đo mốc đầu. Khắc phục bằng bước warmup trước khi ghi `mem_start_mb`, kết quả ổn định còn `47.91 -> 50.75 MB` (`1.059x`).

---

## 4. Harness AI nào giúp nhiều nhất?
- **`AGENTS.md` + Skill `verify-contract`:** Giữ cố định 3 quy tắc sống còn (không `Math.random()`, làm tròn 3 chữ số thập phân, 12 bước tick) giúp agent không bao giờ vi phạm Test Contract qua 4 phase.
- **Skill `ui-ux-pro-max`:** Cung cấp Design System (`MASTER.md`), quy chuẩn tương phản Dark Glassmorphism, SVG icons và chuẩn tiếp cận WCAG 2.2 cho HUD.

---

## 5. Tổng Token & Chi phí Ước tính

| Phase | Input Tokens (ước tính) | Output Tokens (ước tính) | Chi phí ước tính | Cách tiết kiệm |
|---|---:|---:|---:|---|
| Phase 1 | ~22,000 | ~6,500 | ~$0.12 | Dùng chung 1 `world.js` (UMD) cho cả Node.js & Browser |
| Phase 2 | ~18,000 | ~5,500 | ~$0.09 | Tách `maps.js` gọn, chạy test tập trung |
| Phase 3 | ~14,000 | ~4,200 | ~$0.07 | Chỉnh sửa cục bộ bằng `edit_file` thay vì viết lại toàn bộ |
| Phase 4 | ~15,000 | ~4,500 | ~$0.08 | Tái sử dụng `GameWorld` cho cả `bench.js` và `soak.js` |
| **Tổng** | **~69,000** | **~20,700** | **~$0.36** | Tổng chi phí rất thấp, không đốt token vào retry mù |

---

## 6. Nếu làm lại thì đổi gì?
- Thiết kế ngay từ đầu cơ chế `fuel_ticks` bằng số nguyên và tách `maps.js` ngay ở Phase 1 để giảm thời gian refactor ở Phase 2–3.
