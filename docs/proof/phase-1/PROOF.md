# Bằng chứng Kiểm chứng Phase 1 (Proof of Verification)

Mọi bằng chứng dưới đây được sinh trực tiếp từ mã nguồn tại tag `phase-1` bằng lệnh:

```bash
node tests/run_tests.js
```

## 1. Bảng Truy vết Yêu cầu -> Bằng chứng (Traceability Matrix)

| Yêu cầu | Cách kiểm chứng | Tệp bằng chứng trong repo | Kết quả |
|---|---|---|---|
| **Contract v1.0 Schema & Tuning** | Kiểm tra cấu trúc `game.contract.json` và các trường `tuning` hợp lệ | `tests/run_tests.js` (Test #1) | **ĐẠT (PASS)** |
| **Di chuyển & Xoay Camera 3D** | Kiểm tra công thức `x' = x·cosθ + z·sinθ, z' = −x·sinθ + z·cosθ` và chuẩn hóa vector chéo | `tests/run_tests.js` (Test #2, #3) | **ĐẠT (PASS)** |
| **Nhặt đom đóm, Nạp đèn & Thắng (`all_lit`)** | Chạy headless với `scenario_win.json` và `inputs_win.json` | `docs/proof/phase-1/out_win.jsonl` | **ĐẠT (PASS)** |
| **Tỏa sáng (`pulse`) làm choáng & đẩy lùi Bóng Mực** | Chạy headless với `scenario_pulse.json` và `inputs_pulse.json` | `docs/proof/phase-1/out_pulse.jsonl` | **ĐẠT (PASS)** |
| **Bóng Mực chạm gây mất máu, rơi đom đóm & Thua (`no_flames`)** | Chạy headless với `scenario_lose.json` | `docs/proof/phase-1/out_lose.jsonl` | **ĐẠT (PASS)** |
| **Vùng an toàn (`safe_radius`) quanh đèn sáng** | Kiểm tra Bóng Mực không thể đi vào bán kính `5.0m` quanh đèn đã thắp | `tests/run_tests.js` (Test #7) | **ĐẠT (PASS)** |
| **Tính tất định (Determinism)** | Chạy 2 lần cùng `--seed 777 --night 1 --ticks 300`, so sánh từng byte giữa 2 file output | `docs/proof/phase-1/determinism_run1.jsonl`, `determinism_run2.jsonl` | **ĐẠT (Khớp 100%)** |
| **Mã thoát 2 khi sai định dạng input/scenario** | Chạy headless với file input có `tick` trùng nhau (`tick: 10` lặp lại) | `tests/run_tests.js` (Test #9) | **ĐẠT (Exit code 2)** |
| **Giao diện 3D, HUD, Nón lá treo đèn & Chơi lại** | Chạy server 3D `node src/server.js`, kiểm tra trực tiếp trên trình duyệt và chụp ảnh màn hình | `docs/proof/phase-1/gameplay_3d.png`, `docs/proof/phase-1/jump_action_3d.png` | **ĐẠT (PASS)** |

## 2. Trích dẫn Output Headless Thực tế

### `docs/proof/phase-1/out_win.jsonl` (Nhặt đom đóm -> Nạp đèn L1 -> Thắp sáng đủ 5 đèn -> Thắng)
```jsonl
{"type":"snapshot","tick":0,"sim_tick":0,"state":"playing","time_left_s":120,"score":0,"player":{"pos":[0,0,0],"flames":3,"carried":2},"lanterns":[{"id":"L1","pos":[0,0,5],"lit":false,"deposited":0},{"id":"L2","pos":[20,0,0],"lit":true,"deposited":3},{"id":"L3","pos":[-20,0,0],"lit":true,"deposited":3},{"id":"L4","pos":[0,0,-20],"lit":true,"deposited":3},{"id":"L5","pos":[15,0,15],"lit":true,"deposited":3}],"shades":[],"motes_active":1,"motes":[{"id":"M1","pos":[0,0,2]}]}
{"type":"event","tick":5,"name":"mote_picked","data":{"carried":3}}
{"type":"event","tick":41,"name":"deposit","data":{"lantern_id":"L1","amount":3,"deposited":3}}
{"type":"event","tick":41,"name":"lantern_lit","data":{"lantern_id":"L1"}}
{"type":"event","tick":41,"name":"game_over","data":{"result":"won","reason":"all_lit"}}
{"type":"end","ticks":41,"state":"won","score":855}
```

### `docs/proof/phase-1/out_pulse.jsonl` (Tỏa sáng làm choáng và đẩy lùi Bóng Mực S1 từ x=3.0 ra x=7.0)
```jsonl
{"type":"snapshot","tick":0,"sim_tick":0,"state":"playing","time_left_s":180,"score":0,"player":{"pos":[0,0,0],"flames":3,"carried":2},"lanterns":[{"id":"L1","pos":[0,0,25],"lit":false,"deposited":0},{"id":"L2","pos":[23.776,0,7.725],"lit":false,"deposited":0},{"id":"L3","pos":[14.695,0,-20.225],"lit":false,"deposited":0},{"id":"L4","pos":[-14.695,0,-20.225],"lit":false,"deposited":0},{"id":"L5","pos":[-23.776,0,7.725],"lit":false,"deposited":0}],"shades":[{"id":"S1","pos":[3,0,0],"state":"chase"},{"id":"S2","pos":[20,0,0],"state":"chase"}],"motes_active":0,"motes":[]}
{"type":"event","tick":1,"name":"pulse","data":{"stunned_ids":["S1"]}}
{"type":"snapshot","tick":5,"sim_tick":5,"state":"playing","time_left_s":179.917,"score":25,"player":{"pos":[0,0,0],"flames":3,"carried":1},"lanterns":[{"id":"L1","pos":[0,0,25],"lit":false,"deposited":0},{"id":"L2","pos":[23.776,0,7.725],"lit":false,"deposited":0},{"id":"L3","pos":[14.695,0,-20.225],"lit":false,"deposited":0},{"id":"L4","pos":[-14.695,0,-20.225],"lit":false,"deposited":0},{"id":"L5","pos":[-23.776,0,7.725],"lit":false,"deposited":0}],"shades":[{"id":"S1","pos":[7,0,0],"state":"stunned"},{"id":"S2","pos":[19.708,0,0],"state":"chase"}],"motes_active":0,"motes":[]}
{"type":"end","ticks":10,"state":"playing","score":25}
```
