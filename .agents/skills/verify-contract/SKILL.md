---
name: verify-contract
description: Chạy toàn bộ unit tests, scenario headless, kiểm tra tính tất định và lưu bằng chứng vào docs/proof/
---

# Skill: Verify Test Contract & Determinism

Khi cần kiểm chứng một Phase trước khi gắn tag:

1. Chạy bộ kiểm thử tự động:
   ```bash
   node tests/run_tests.js
   ```
2. Kiểm tra tính tất định (determinism):
   - Chạy cùng một scenario + inputs 2 lần với cùng `--seed`.
   - So sánh hash / nội dung 2 file JSONL phải khớp 100%.
3. Kiểm tra mã thoát lỗi định dạng (exit code 2):
   - Chạy với file inputs có `tick` không tăng nghiêm ngặt hoặc JSON lỗi -> phải trả về exit code `2`.
4. Lưu output thực tế vào `docs/proof/phase-N/` để làm bằng chứng khớp với commit ở tag `phase-N`.
