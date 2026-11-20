# ADR-001: Thay đổi Mô hình Trạng thái Đèn & Luật Thắng (Phase 3 — Ticket-03)

## Bối cảnh
Ở Phase 1–2, đèn lồng một khi đã thắp sẽ sáng vĩnh viễn và game kết thúc thắng ngay khi tất cả đèn sáng (`all_lit`). Playtest cho thấy người chơi giỏi hoàn thành quá nhanh và thiếu áp lực duy trì ánh sáng về cuối Đêm.

## Quyết định Thiết kế
1. **Biểu diễn Nhiên liệu bằng Số nguyên (`fuel_ticks`):**
   - Thay vì dùng số thực `fuel` (dễ lệch dấu phẩy động khi trừ `1/60` và `5/60` mỗi tick), mọi phép tính nhiên liệu trong `src/sim/world.js` được lưu bằng **số nguyên `fuel_ticks`** (`0..6000`, trong đó `1 fuel = 60 fuel_ticks`).
   - Chỉ chia `60` và làm tròn 1 chữ số thập phân khi xuất snapshot hoặc sự kiện `refuel` / `fuel_drain`.
2. **Máy trạng thái Đèn Lồng 3 pha + `ever_lit`:**
   - `unlit (ever_lit=false)` -> cần `10` đom đóm để thắp (`+100` điểm).
   - `lit (fuel_ticks > 0)` -> hao `1` tick/tick; có thể châm dầu (`refuel`, `+5`/đom đóm); mất vùng an toàn khi `fuel_ticks < 1800` (`fuel < 30`).
   - `unlit (ever_lit=true)` sau `lantern_out` -> chỉ cần `5` đom đóm để thắp lại (`relight: true`, `+40` điểm).
3. **Luật Thắng Mới (`dawn_survived`):**
   - Bỏ thắng sớm `all_lit`. Mọi Đêm chỉ kết thúc khi hết Ngọn Lửa (`no_flames`) hoặc tới bình minh (`time_left_s <= 0`).
   - Tại bình minh, thắng (`dawn_survived`) khi số đèn đang sáng `>= ceil(0.6 * totalLanterns)`.
4. **Cập nhật Test Cũ (Không skip âm thầm):**
   - Test `all_lit` ở Phase 1–2 được thay thế tường minh bằng test `dawn_survived` trong `tests/run_tests.js` để chứng minh đèn sáng đủ không kết thúc sớm và chỉ thắng khi sống sót tới bình minh với ngưỡng `>= 60%` đèn sáng.
