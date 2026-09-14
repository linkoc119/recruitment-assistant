# SEQ-03 — Editing criteria, re-scoring, and comparing two runs

**Status:** proposed behaviour. **Preconditions:** run R1 has been published and reusable CV snapshots exist. **Outcome:** R2 has its own criteria set while R1 remains intact; the user can compare scores, ranks, mandatory-criteria status, and the reason each result changed.

[Open the SVG](diagrams/sequence-03-rescore.svg) to zoom in or embed it in a report.

![SEQ-03 — Editing criteria, re-scoring, and comparing two runs](diagrams/sequence-03-rescore.svg)

```mermaid
---
title: "SEQ-03 — Sửa tiêu chí và chấm lại — Đề xuất"
---
sequenceDiagram
    autonumber
    actor REC as Nhân viên tuyển dụng
    participant WEB as WEB · Web App
    participant HTTP as HTTP · API Controllers
    participant CRIT as CRIT · Criteria Service
    participant RUN as RUN · Screening Coordinator
    participant SCORE as SCORE · Scoring Engine
    participant REVIEW as REVIEW · Ranking and Review Service
    participant DB as DB qua DATA
    REC->>WEB: Đổi trọng số hoặc bắt buộc/ưu tiên
    WEB->>HTTP: PUT criteria với expected_revision
    HTTP->>CRIT: Kiểm tra và lưu revision mới
    CRIT->>DB: Append snapshot tiêu chí R2, không sửa snapshot R1
    CRIT-->>WEB: Revision mới, kết quả hiện tại dựa trên tiêu chí cũ
    REC->>WEB: Xem thay đổi và xác nhận chấm lại
    WEB->>HTTP: POST screening-runs, base_run_id, revision, idempotency key
    HTTP->>RUN: Tạo R2 từ tập CV đã thành công của R1
    RUN->>DB: Transaction kiểm tra base run, active run và đóng băng đầu vào
    alt Yêu cầu cũ hoặc đang có tác vụ khác
        DB-->>RUN: Xung đột, không tạo thêm vòng
        RUN-->>WEB: 409 và ID vòng hiện hành/tác vụ đang chạy
    else Yêu cầu hợp lệ
        DB-->>RUN: run_id R2 queued, R1 vẫn published
        RUN-->>WEB: 202 Accepted và run_id R2
        RUN->>DB: Nhận lease, đọc snapshot CV của R1 và tiêu chí R2
        loop Mỗi CV trong tập chấm lại đã đóng băng
            RUN->>SCORE: Snapshot CV cũ, criteria R2, cùng scoring policy
            SCORE-->>RUN: Điểm mới, pass/fail, đóng góp và bằng chứng
            RUN->>DB: Lưu kết quả staged của R2 và tiến trình
        end
        Note over RUN,DB: WEB polling R2 qua HTTP, R1 vẫn đọc được trong lúc chạy
        alt Có item lỗi sau retry hoặc run không hoàn tất
            RUN->>DB: Đánh dấu R2 failed, không đổi published run
            RUN-->>WEB: Thông báo lỗi qua polling, giữ ranking R1
        else Mọi item của tập so sánh đều thành công
            RUN->>DB: BEGIN, khóa vị trí, kiểm tra base_run_id và lease token
            RUN->>DB: R1 latest=false, R2 latest=true, published_run_id=R2
            RUN->>DB: R2 completed, COMMIT toàn bộ cùng giao dịch
            RUN-->>WEB: Hoàn tất qua polling, có thể xem R2
        end
    end
    opt R2 đã được công bố
        REC->>WEB: So sánh R1 và R2
        WEB->>HTTP: GET comparison với hai run_id cụ thể
        HTTP->>REVIEW: So sánh cùng resume_id/snapshot
        REVIEW->>DB: Đọc điểm, criteria, policy và quyết định của hai vòng
        REVIEW-->>WEB: Chênh điểm, hạng, pass/fail và tiêu chí thay đổi
    end
```

## Rules and exceptions

The component names match C3; the database is reached through DATA. A solid line is a call and a dashed line a result; responses to WEB are collapsed through HTTP. `alt` is a choice, `loop` an iteration, and `opt` a part that only occurs when its condition holds.

- Re-scoring after a criteria edit uses **exactly the successful CV set and extraction snapshots of the original run**, without calling the AI again. CVs that failed in the first run need a new screening pass to upload or reprocess them; they are not mixed into this R1–R2 comparison.
- Changing the model, the CV version, or the scoring policy constitutes a new kind of evaluation and must not be labelled "criteria change only". This design keeps the policy fixed throughout this flow.
- R1 does not lose its current-run flag the moment re-scoring is requested. All flags and `published_run_id` move together only when the R2 result qualifies for publication. If the transaction fails, the rollback leaves R1 unchanged.
- One active run per position; revision and run IDs must be validated server-side. A retry with the same idempotency key does not create an R3. The lease token prevents an old process from publishing after the job has been reclaimed by another process.
- If the user keeps editing criteria while R2 is running, R2 still uses the snapshot that was fixed at submission. The interface must report when the latest revision differs from the revision behind the results just published.
- Every shortlist/reject decision from R1 is kept in history; R2 starts in the `scored` state so the user reconsiders. Decisions are never transferred automatically on the basis of a new score.
- "Docker becomes mandatory and a candidate therefore moves to not-passed" is a business case that must be tested. The sample figures 92 → 86 and 31 → 19 in the prototype are not commitments made by the implemented formula.

Related: [snapshots and transactions in arc42](arc42.md#8-cross-cutting-concepts).
