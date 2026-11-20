# Bằng chứng Kiểm chứng Phase 3 (Contract v1.2)

Chạy kiểm chứng bằng lệnh:
```bash
node tests/run_tests.js
```

| Hạng mục Kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|
| **Contract v1.2 & Số liệu Ticket-03** | `tests/run_tests.js` (Test #1) | **PASS** |
| **Luật thắng mới `dawn_survived` (thay thế `all_lit`)** | `docs/proof/phase-3/out_dawn_win.jsonl` | **PASS** |
| **Hao dầu, `lantern_out`, `ever_lit`, thắp lại 5 đom đóm, tăng sức chứa** | `docs/proof/phase-3/out_relight.jsonl` | **PASS** |
| **Châm dầu (`refuel`)** | `docs/proof/phase-3/out_refuel.jsonl` | **PASS** |
| **Bóng Mực hút dầu (`drain`, `fuel_drain` mỗi 60 tick)** | `docs/proof/phase-3/out_drain.jsonl` | **PASS** |
| **Regression Phase 1–2 & Tính tất định** | `docs/proof/phase-3/det_a.jsonl`, `det_b.jsonl` | **PASS (100% khớp)** |
