# SEQ-02 — Reviewing evidence and deciding shortlist/reject

**Status:** proposed behaviour. **Preconditions:** a published run exists. **Outcome:** the user can verify the scores; a decision is written only against the exact result being viewed, and only while it is not stale.

[Open the SVG](diagrams/sequence-02-review.svg) to zoom in or embed it in a report.

![SEQ-02 — Reviewing evidence and deciding shortlist/reject](diagrams/sequence-02-review.svg)

```mermaid
---
title: "SEQ-02 — Kiểm chứng và quyết định shortlist hoặc loại — Đề xuất"
---
sequenceDiagram
    autonumber
    actor REC as Nhân viên tuyển dụng
    participant WEB as WEB · Web App
    participant HTTP as HTTP · API Controllers
    participant REVIEW as REVIEW · Ranking and Review Service
    participant CV as CV · Resume Service
    participant DB as DB qua DATA
    participant FILES as FILES qua DATA
    REC->>WEB: Mở bảng xếp hạng của vị trí
    WEB->>HTTP: GET jobs/{id}/ranking
    HTTP->>REVIEW: Lấy vòng đang công bố
    REVIEW->>DB: Đọc run_id và kết quả nhất quán cùng snapshot
    REVIEW-->>WEB: Ranking, run_id, result_version
    REC->>WEB: Mở chi tiết và bằng chứng
    WEB->>HTTP: GET screenings/{id} với run_id
    HTTP->>REVIEW: Đọc đúng kết quả lịch sử được chọn
    REVIEW->>DB: Đọc score, criteria snapshot, evidence spans
    REVIEW-->>WEB: Điểm, đóng góp và vị trí trích dẫn
    WEB->>HTTP: GET resumes/{resume_id}/content
    HTTP->>CV: Đọc file của kết quả đang xem
    CV->>DB: Tra object key của đúng phiên bản CV
    CV->>FILES: Đọc file riêng tư
    alt File lấy được
        CV-->>WEB: Nội dung CV, đối chiếu đoạn trích
    else File tạm không lấy được
        CV-->>WEB: Lỗi xem CV, giữ phần phân tích đã tải
    end
    REC->>WEB: Chọn shortlist hoặc loại, xác nhận
    WEB->>HTTP: PATCH decision, run_id, expected_result_version
    HTTP->>REVIEW: Yêu cầu ghi quyết định
    REVIEW->>DB: Transaction khóa vị trí và kiểm tra published run/version
    alt Vòng mới đã công bố hoặc quyết định đã đổi
        DB-->>REVIEW: Xung đột, rollback
        REVIEW-->>WEB: 409, yêu cầu tải kết quả mới và xem lại
    else Kết quả vẫn hiện hành
        REVIEW->>DB: Cập nhật status, decision_at, tăng result_version
        DB-->>REVIEW: Commit
        REVIEW-->>WEB: Quyết định đã lưu và version mới
    end
    WEB-->>REC: Hiển thị trạng thái bằng chữ, biểu tượng và màu
```

## Rules and exceptions

A solid line is a request and a dashed line a response; responses reaching WEB are drawn collapsed through HTTP. DB and FILES are reached only through DATA. A ranking read must pin a single `run_id` within one query or transaction, so that figures from two runs are never combined if a publication happens concurrently.

The AI is not called when existing results are viewed. Evidence always references the CV version and the criteria snapshot of the run being viewed. The API never accepts an arbitrary URL or file path from the browser in order to read a file.

A candidate who fails a mandatory criterion can still be viewed and shortlisted. If the user shortlists someone who did not pass, the interface states plainly which criteria were not met and asks for confirmation; the decision does not alter `passed_mandatory` or the score. Nothing is auto-rejected for a missing criterion.

Decisions belong to a run within this scope. A new run starts in the `scored` state; decisions from the previous run remain readable but are not carried over automatically. A retry with the same decision and the current version may return the existing state; a stale version returns a conflict rather than overwriting a newer decision.

Related: [SEQ-03](sequence-03-rescore.md), [arc42 §9](arc42.md#9-architecture-decisions).
