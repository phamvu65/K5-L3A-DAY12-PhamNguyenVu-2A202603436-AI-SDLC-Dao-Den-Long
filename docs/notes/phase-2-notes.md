# Phase 2 — Yêu cầu, Tiêu chí Nghiệm thu, Nhật ký AI & Đánh giá (Ticket-02)

## 1. Phân tích Yêu cầu & Tiêu chí Nghiệm thu (Acceptance Criteria)

| Mã YC | Tính năng Ticket-02 | Tiêu chí Nghiệm thu Kiểm chứng được |
|---|---|---|
| **REQ-2.1** | Đồng bộ số liệu chuẩn Contract v1.1 | `game.contract.json` đặt `contract_version: "1.1"`, khớp 100% số chuẩn (`player_speed: 6`, `dash_speed: 14`, `carry_capacity: 10`, `lantern_cost: 10`, `pulse_cost: 3`, `safe_radius: 6`, `shade_speed: 4`, v.v.). |
| **REQ-2.2** | Lướt (`dash`) | Nhấn `dash` di chuyển `14 m/s` trong `0.2 s` (`12` tick = `2.8 m`), giữ nguyên độ cao trên không, hồi chiêu `1.5 s`, phát sự kiện `dash`. |
| **REQ-2.3** | Đêm 2 — Đảo Cau | Hai đảo tròn bán kính `28 m` tâm `(0,0,0)` và `(70,0,0)`, cầu tre `x∈[26,44], z∈[-2,2]`, 2 bục nhảy `(20,0,18)` & `(50,0,-18)` phóng sang đảo kia, 6 đèn `L1..L6`, 1 Bùa Gió `C1`. |
| **REQ-2.4** | Đêm 3 — Đảo Chuông | Đảo 3 tầng (`Y=0`, `Y=3`, `Y=6`), 2 dốc `30°`/`150°`, bục nhảy `(0,3,13)`, tháp chuông bán kính `2 m` ở tâm tầng 2, 7 đèn `L1..L7`, gió mạnh mỗi `30 s` thổi `5 s` (`2 m/s`). |
| **REQ-2.5** | Gió Lạc (`drifters`) | Sinh ở Đêm 2 & 3 tại tick `1200, 2400...` tối đa 2 con. Chạm cướp `min(3, carried)` (`drifter_steal`), trúng Tỏa Sáng khi `flee` thả lại đom đóm (`drifter_drop`). |
| **REQ-2.6** | Bùa Gió (`charms`) | Nhặt cho `600` tick tốc độ `7.2 m/s` và Lướt không hồi chiêu (`charm_picked`); hồi sinh sau `2700` tick. |
| **REQ-2.7** | Tạm dừng (`pause`) & Chuỗi 3 Đêm | Nhấn `pause` dừng `sim_tick`, thời gian, hồi chiêu, spawn, TTL (`state: "paused"`); phát `paused` / `resumed`. UI có Menu chính -> Giới thiệu Đêm -> Chơi -> Kết quả -> Đêm tiếp theo / Bình Minh. |
| **REQ-2.8** | Thứ tự 12 bước & Hiệu năng Headless | Tuân thủ đúng thứ tự 12 bước mỗi tick; 1 Đêm đầy đủ (18,000 tick) chạy headless xong trong `<= 30 s` (thực tế `~126 ms`). |

## 2. Nhật ký AI & Tiết kiệm Token (Phase 2)
- **Tách `src/sim/maps.js`:** Tách định nghĩa 3 bản đồ và hình học (`getFloorY`, dốc, bục nhảy, cầu tre, tháp chuông) ra module riêng giúp `src/sim/world.js` gọn, dễ kiểm chứng và dùng chung cho cả trình duyệt lẫn headless.
- **Lỗi AI được phòng ngừa bằng test:** Đảm bảo thực thể mới sinh ở bước 10 có `spawn_delay = 1` để chỉ tương tác từ tick kế tiếp; kiểm tra `sim_tick` đứng yên trong khi `tick` vẫn tăng khi `paused`.
- **Ước tính Token Phase 2:** ~18,000 input / ~5,500 output tokens (~$0.09).
