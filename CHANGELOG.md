# Changelog — Đảo Đèn Lồng

## [v1.0.0 / Phase 4] — Contract v1.3 (Ticket-04: Bình minh v1.0.0)
- **Benchmark (`src/bench.js`) & Soak Test (`src/soak.js`):** Đo hiệu năng cảnh chuẩn 200 Bóng Mực + 100 đom đóm và kiểm tra ổn định bộ nhớ 10 Đêm liên tiếp (`bench.json`, `soak.json`).
- **Bảng xếp hạng cục bộ (`leaderboard.json`):** Lưu top 10, hỗ trợ nhập tên sau khi thắng Đêm 3 hoặc thua, và lệnh `node src/server.js --export-leaderboard out.json`.
- **Dễ tiếp cận (Accessibility):** Đổi phím đầy đủ có cảnh báo trùng + khôi phục mặc định, phụ đề/chỉ báo hình ảnh, giảm chuyển động, cỡ chữ tối thiểu 18px + tùy chọn chữ lớn ×1.25.
- **Đóng gói phát hành:** Hoàn thiện `README.md`, `retro.md`, `PROOF.md` và GitHub Release `v1.0.0`.

## [Phase 3] — Contract v1.2 (Ticket-03: Đèn cạn dầu)
### Breaking Changes (Thay đổi phá vỡ tương thích)
- **Loại bỏ thắng sớm `all_lit`:** Thắp đủ đèn không còn kết thúc Đêm ngay lập tức. Lý do kết thúc thắng đổi thành `dawn_survived` khi hết giờ với `>= ceil(0.6 * tổng đèn)` đèn đang sáng.
- **Đèn lồng có nhiên liệu (`fuel`):** Đèn sáng hao `1.0 fuel/s` và tắt (`lantern_out`) khi cạn. Đèn từng sáng (`ever_lit`) thắp lại với `5` đom đóm.
- **Vùng an toàn phụ thuộc nhiên liệu:** Đèn có `fuel < 30` mất vùng an toàn và bị Bóng Mực chuyển sang trạng thái `drain` để hút `5 fuel/s`.
- **Thay đổi thời lượng & công thức điểm:** Thời lượng Đêm 1/2/3 đổi thành `240 / 270 / 300 s`; bỏ thưởng thời gian; điểm nạp đom đóm `+5`, thắp lại `+40`, bình minh `+50 + floor(fuel)` mỗi đèn sáng.
- **Sức chứa tăng dần & Chế độ mù màu:** Sức chứa `10 + 2 * successful_lights` (tối đa 20); thêm tùy chọn Bảng màu dễ phân biệt (`#00B3FF`, `#FFFFFF` + ⚠, đèn tắt xẹp 20% + vết rách).

## [Phase 2] — Contract v1.1 (Ticket-02: Ba hòn đảo)
- Chuẩn hóa toàn bộ thông số gameplay; mở rộng thành **3 Đêm** (Đảo Bến, Đảo Cau, Đảo Chuông).
- Thêm **Lướt (`dash`)**, **Gió Lạc (`drifters`)**, **Bùa Gió (`charms`)**, **Tạm dừng (`pause`)**, chuỗi 3 Đêm và bảng màu chuẩn.

## [Phase 1] — Contract v1.0 (PRD-0)
- Xây dựng kiến trúc tách biệt `src/sim/` (60Hz tất định) và `src/web/` (3D perspective + Hoa Đăng + Chuông Gió Ngũ Cung), cùng CLI `src/headless.js`.
