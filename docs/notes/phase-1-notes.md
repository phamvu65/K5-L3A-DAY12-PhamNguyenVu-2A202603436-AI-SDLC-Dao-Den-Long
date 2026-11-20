# Phase 1 — Yêu cầu, Giả định, Nhật ký AI & Đánh giá (PRD-0)

## 1. Phân tích Yêu cầu & Tiêu chí Nghiệm thu (Acceptance Criteria)

| Mã YC | Yêu cầu từ PRD-0 & Test Contract v1.0 | Tiêu chí nghiệm thu kiểm chứng được |
|---|---|---|
| **REQ-1.1** | Màn chơi Đêm 1 – Đảo Bến có 5 Đèn Lồng Lớn (`L1`..`L5`), Mây xuất phát tại `(0, 0, 0)` | Snapshot tại `tick: 0` có `player.pos = [0,0,0]` và mảng `lanterns` gồm 5 đèn `L1`..`L5`. |
| **REQ-1.2** | Di chuyển 3D theo vector `move [x, z]` và góc camera `cam_yaw_deg`, nhảy trên trục Y | Công thức xoay `x' = x·cosθ + z·sinθ`, `z' = −x·sinθ + z·cosθ`, chuẩn hóa vector dài > 1 về 1. |
| **REQ-1.3** | Nhặt đom đóm tự động trong `pickup_radius` khi chưa đầy `carry_capacity` | Khi khoảng cách XZ ≤ `1.5m`, phát sự kiện `mote_picked`, tăng `carried` thêm 1 và cộng `score.per_mote` (`10`). |
| **REQ-1.4** | Tương tác (`interact` false -> true) trong `interact_radius` để nạp đom đóm vào đèn | Phát sự kiện `deposit` với `amount = min(carried, lantern_cost - deposited)`. Khi đủ `lantern_cost` (`3`), phát `lantern_lit` và cộng `score.per_lantern` (`100`). |
| **REQ-1.5** | Bóng Mực đuổi người chơi, sợ đèn đã thắp (`safe_radius`), chạm phải gây mất máu và rơi đom đóm | Bóng Mực không đi vào bán kính `5.0m` quanh đèn đã sáng. Khi chạm Mây (`<= 1.2m`), phát `player_hit`, trừ 1 `flames`, rơi `floor(carried * 0.5)` đom đóm. |
| **REQ-1.6** | Tỏa sáng (`pulse` false -> true) tốn `pulse_cost` đom đóm, làm choáng và đẩy lùi Bóng Mực | Tốn 1 đom đóm, phát `pulse` kèm `stunned_ids`, Bóng Mực trong `6.0m` chuyển sang `state: "stunned"` trong `3.0s`, bị đẩy lùi `4.0m`, cộng `25` điểm/con. |
| **REQ-1.7** | Điều kiện Thắng / Thua và tính điểm cuối màn | Thắp đủ 5 đèn -> `game_over(won, all_lit)`. Hết máu -> `game_over(lost, no_flames)`. Hết giờ -> `game_over(lost, dawn)`. Điểm thắng cộng thêm `per_second_left` và `per_flame_left`. |
| **REQ-1.8** | Tính tất định & xử lý lỗi định dạng theo Test Contract v1.0 | Cùng `--seed`, `--scenario`, `--inputs` chạy 2 lần cho output `.jsonl` giống hệt 100%. Lỗi định dạng file inputs/scenario thoát với mã **2**. |

---

## 2. Các Giả định cho Chỗ Mơ hồ trong PRD-0

PRD-0 cố ý để mở các thông số cụ thể. Tôi đã chọn bộ thông số cân bằng và khai báo chính xác trong `game.contract.json`:

1. **Kích thước Đảo Bến & Rơi khỏi đảo (`fall_enabled: true`):**
   - Đảo Bến là hòn đảo tròn bán kính `45.0m`, tâm tại `(0, 0, 0)`, mặt đất tại `Y = 0`.
   -5 Đèn Lồng Lớn (`L1`..`L5`) đặt cách đều trên vòng tròn bán kính `25.0m`.
   - Nếu Mây đi quá rìa đảo (`> 45.0m`), Mây bị phạt rơi (`player_hit` với `by: "fall"`), mất 1 ngọn lửa, rơi 50% đom đóm đang giữ và hồi sinh về tâm đảo `(0, 0, 0)`.
2. **Thông số Nhân vật & Đèn Lồng:**
   - `player_speed: 6.0` m/s, `carry_capacity: 5` đom đóm, `lantern_cost: 3` đom đóm/đèn, `pickup_radius: 1.5` m, `interact_radius: 2.5` m.
   - `flames: 3` (máu ban đầu), `invuln_s: 1.5` giây bất tử sau khi bị chạm, `hit_drop_ratio: 0.5` (rơi `floor(carried * 0.5)` đom đóm).
3. **Thông số Tỏa sáng (Pulse) & Bóng Mực:**
   - `pulse_cost: 1` đom đóm, `pulse_radius: 6.0` m, `pulse_stun_s: 3.0` giây, `pulse_push_m: 4.0` m, `pulse_cooldown_s: 1.0` giây.
   - `safe_radius: 5.0` m quanh mỗi đèn đã thắp sáng (Bóng Mực không thể tiến vào vùng này và bị đẩy ra khi đèn vừa sáng).
   - `shade_speed: 3.5` m/s, `shade_hit_radius: 1.2` m.
4. **Thời lượng & Điểm số (`score`):**
   - `night1_duration_s: 180` giây (3 phút).
   - Điểm: nhặt 1 đom đóm `+10` (`per_mote: 10`), thắp 1 đèn `+100` (`per_lantern: 100`), làm choáng 1 Bóng Mực `+25` (`per_stun: 25`). Khi thắng cộng thưởng `+5` điểm/giây còn lại (`per_second_left: 5`) và `+50` điểm/ngọn lửa còn lại (`per_flame_left: 50`).

---

## 3. Nhật ký Dùng AI, Lỗi phát hiện & Quản lý Token (Phase 1)

### Những lần AI dễ sai và cách kiểm soát bằng Harness:
- **Vấn đề 1 (Độ chính xác số thực `-0` và làm tròn 3 chữ số):** Trong JavaScript, phép tính lượng giác như `-0 * Math.sin(0)` có thể tạo ra `-0`, hoặc sai số dấu phẩy động. Tôi đã viết hàm `round3(n)` chuẩn hóa `Object.is(r, -0) ? 0 : r` trong `src/sim/world.js` và kiểm tra bằng unit test xoay camera `cam_yaw_deg = 90`.
- **Vấn đề 2 (Đom đóm đánh rơi bị nhặt lại ngay lập tức trong cùng vùng `pickup_radius`):** Khi bị Bóng Mực chạm, nếu đom đóm rơi ngay tại vị trí `(x, z)` của Mây thì ở tick kế tiếp Mây sẽ tự động nhặt lại ngay. Tôi đã đặt khoảng cách rơi `dropDist = pickup_radius + 1.25` để đom đóm văng ra ngoài tầm nhặt tự động, đúng tinh thần bị đánh rơi.
- **Vấn đề 3 (Tách biệt Sáng tạo và Headless Contract):** Các yếu tố sáng tạo (Hoa Đăng bay lên trời khi thắp đèn & Chuông gió ngũ cung WebAudio) được đặt hoàn toàn trong `src/web/game3d.js`, đảm bảo không sinh thêm thực thể hay thay đổi kết quả `src/headless.js`.

### Ước tính Token & Chiến lược Tiết kiệm (Phase 1):
- **Số lượt tương tác / Tool calls:** ~14 bước.
- **Token ước tính Phase 1:** ~22,000 input tokens / ~6,500 output tokens (Chi phí ước tính: ~$0.12).
- **Cách tiết kiệm token:**
  1. Thiết kế `AGENTS.md` ngắn gọn (dưới 35 dòng) để không làm phình ngữ cảnh mỗi lượt.
  2. Viết `src/sim/world.js` dùng chung cho cả Node.js Headless và trình duyệt (UMD module), không phải viết 2 bộ logic riêng biệt.
  3. Tạo bộ test tự động `node tests/run_tests.js` kiểm tra cùng lúc 9 tiêu chí (Contract schema, công thức xoay camera, chuẩn hóa vector chéo, scenario thắng, scenario pulse, scenario thua, vùng an toàn `safe_radius`, tính tất định 2 lần chạy, và mã thoát 2) chỉ trong < 1 giây.

---

## 4. Đánh giá Phase 1 (Evaluation)
- **Kết quả đạt được:** 9/9 bài kiểm thử tự động trong `tests/run_tests.js` đạt `PASS`. Game 3D trên trình duyệt chạy mượt ở 60 FPS với đầy đủ nhân vật Mây đội nón lá treo đèn lồng nhỏ, 5 Đèn Lồng Lớn, đom đóm, Bóng Mực, HUD và nút Chơi lại.
- **Điểm cần lưu ý cho Phase 2:** Sẵn sàng mở rộng `GameWorld` khi Ticket-02 bổ sung cơ chế mới (ví dụ `dash` hoặc loại thực thể mới) mà vẫn giữ nguyên tính tương thích ngược với các test của Phase 1.
