# Bằng chứng Kiểm chứng Phase 2 (Contract v1.1)

Chạy toàn bộ bộ kiểm thử bằng một lệnh:
```bash
node tests/run_tests.js
```

| Hạng mục Kiểm chứng | Tệp Scenario / Output | Kết quả |
|---|---|---|
| **Contract v1.1 & Số liệu chuẩn Ticket-02** | `tests/run_tests.js` (Test #1) | **PASS** |
| **Regression Phase 1 (Di chuyển, Xoay camera, Nạp đèn, Thắng)** | `docs/proof/phase-2/out_win.jsonl` | **PASS** |
| **Lướt (`dash` 14 m/s, 12 tick = 2.8m, hồi chiêu 1.5s)** | `docs/proof/phase-2/out_dash.jsonl` | **PASS** |
| **Tỏa Sáng (`pulse` 3D, choáng 120 tick, đẩy 4m trong 15 tick)** | `docs/proof/phase-2/out_pulse.jsonl` | **PASS** |
| **Đêm 2 — Đảo Cau (Bục nhảy, cầu tre, 6 đèn)** | `docs/proof/phase-2/out_night2_jumppad.jsonl` | **PASS** |
| **Đêm 3 — Đảo Chuông (3 tầng, 7 đèn, 2 Bùa Gió, gió mạnh)** | `docs/proof/phase-2/out_night3.jsonl` | **PASS** |
| **Gió Lạc (`drifter_steal` & `drifter_drop`)** | `docs/proof/phase-2/out_drifter.jsonl` | **PASS** |
| **Bùa Gió (`charm_picked`, tốc độ 7.2 m/s, Lướt 0 hồi chiêu)** | `docs/proof/phase-2/out_charm.jsonl` | **PASS** |
| **Tạm dừng & Tiếp tục (`paused` / `resumed`, đứng `sim_tick`)** | `docs/proof/phase-2/out_pause.jsonl` | **PASS** |
| **Tính tất định & Hiệu năng (18,000 tick Đêm 1 trong ~126 ms < 30s)** | `docs/proof/phase-2/determinism_n1_a.jsonl`, `_b.jsonl` | **PASS (Khớp 100%)** |
| **Mã thoát 2 khi sai định dạng inputs** | `tests/run_tests.js` (Test #12) | **PASS (Exit 2)** |
