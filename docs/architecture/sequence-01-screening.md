# SEQ-01 — JD setup and the first screening run

**Status:** proposed backend behaviour. **Preconditions:** the user has a JD and the CVs; the position has no active job. **Outcome:** one published run, holding results and evidence for the CVs that succeeded plus a separate list of failed CVs.

[Open the SVG](diagrams/sequence-01-screening.svg) to zoom in or embed it in a report.

![SEQ-01 — JD setup and the first screening run](diagrams/sequence-01-screening.svg)

```mermaid
---
title: "SEQ-01 — Thiết lập JD và sàng lọc lần đầu — Đề xuất"
---
sequenceDiagram
    autonumber
    actor REC as Nhân viên tuyển dụng
    participant WEB as WEB · Web App
    participant API as API · HTTP + CRIT + CV
    participant RUN as RUN · Screening Coordinator
    participant AI as AI qua EXTRACT
    participant SCORE as SCORE · Scoring Engine
    participant DB as DB qua DATA
    participant FILES as FILES qua DATA
    REC->>WEB: Nhập vị trí và JD
    WEB->>API: POST /jobs và POST /jobs/{id}/criteria-draft
    API->>DB: Lưu vị trí và JD gốc
    API->>AI: Trích xuất tiêu chí từ văn bản JD
    alt AI lỗi hoặc dữ liệu không hợp lệ
        AI-->>API: Lỗi có cấu trúc
        API-->>WEB: Báo lỗi và cho phép nhập tiêu chí thủ công
    else Dữ liệu hợp lệ
        AI-->>API: Tiêu chí nháp kèm nguồn JD
        API-->>WEB: Đề xuất để người dùng kiểm tra
    end
    REC->>WEB: Sửa và xác nhận bộ tiêu chí
    WEB->>API: PUT criteria với expected_revision
    API->>DB: Kiểm tra version, lưu revision bất biến
    API-->>WEB: criteria_revision mới
    REC->>WEB: Chọn các CV và tải lên
    loop Mỗi file
        WEB->>API: POST resumes, file multipart
        API->>API: Kiểm tra định dạng, dung lượng và SHA-256
        API->>DB: Tra hash đã tồn tại
        alt File trùng
            API-->>WEB: resume_id đã có, không tạo bản sao
        else File mới hợp lệ
            API->>FILES: Lưu bằng object key duy nhất
            API->>DB: Lưu metadata và phiên bản CV
            API-->>WEB: resume_id, trạng thái uploaded
        else File không hợp lệ
            API-->>WEB: Lỗi riêng của file
        end
    end
    REC->>WEB: Bắt đầu sàng lọc các CV hợp lệ
    WEB->>API: POST screening-runs, revision, resume_ids, idempotency key
    API->>RUN: Tạo vòng đầu
    RUN->>DB: Transaction tạo run queued và đóng băng đầu vào
    API-->>WEB: 202 Accepted, run_id
    par Xử lý nền trong backend
    RUN->>DB: Nhận lease, chuyển run sang running
    loop Mỗi CV trong snapshot của run
        RUN->>API: CV đọc văn bản của phiên bản đã chọn
        API->>FILES: Lấy file gốc
        API-->>RUN: Văn bản hoặc lỗi đọc file
        opt Văn bản đọc được
            RUN->>AI: Trích xuất dữ liệu CV
            AI-->>RUN: Dữ liệu đã kiểm tra hoặc lỗi
        end
        alt Đọc file hoặc trích xuất thất bại sau retry
            RUN->>DB: Ghi item failed, nguyên nhân, cập nhật tiến trình
        else Đầu vào đủ điều kiện chấm
            RUN->>DB: Lưu snapshot trích xuất và phiên bản model
            RUN->>SCORE: Chấm snapshot CV với criteria và policy
            SCORE-->>RUN: Điểm, pass/fail, đóng góp, bằng chứng
            RUN->>DB: Lưu kết quả staged và đánh dấu item succeeded
        end
    end
    alt Có ít nhất một CV thành công, mọi item đã kết thúc
        RUN->>DB: Transaction publish run và đánh dấu kết quả latest
    else Không có kết quả thành công
        RUN->>DB: Đánh dấu run failed, không công bố ranking
    end
    and Theo dõi tiến trình từ giao diện
    loop Trong khi tác vụ chưa kết thúc
        WEB->>API: GET screening-runs/{run_id}
        API->>RUN: Đọc tiến trình
        RUN->>DB: Đọc trạng thái đã lưu
        API-->>WEB: Tổng, thành công, lỗi, còn chờ và trạng thái run
    end
    end
    REC->>WEB: Xem kết quả
    WEB->>API: GET jobs/{id}/ranking
    API->>DB: REVIEW đọc published run qua DATA
    API-->>WEB: Ranking, run_id, tiêu chí đã dùng và danh sách lỗi
```

## Rules and exceptions

- The `API` lane collapses the `HTTP`, `CRIT`, and `CV` components into their container; `RUN` and `SCORE` are kept separate because the flow turns on their interaction. Participants annotated `qua DATA` / `qua EXTRACT` ("via DATA" / "via EXTRACT") collapse the C3 adapter calls to keep the diagram readable; no service bypasses the repository on its own. RUN is a module inside the API, not a separate process or service. A solid line is a request, a dashed line a response; `alt` is a conditional branch and `loop` an iteration.
- The `par` block shows background processing and polling happening concurrently. WEB does not have to wait for scoring to finish before asking for progress; once the run ends, the interface can fetch the results or display the error.
- A missing, invalid, or superseded criteria set returns `422`/`409` and no job is created. Resending the same idempotency key with the same payload returns the same run; a different payload returns `409`.
- A PDF with no text layer is flagged as needing reprocessing; automatic OCR is not part of this first proposal. A failed file is never counted as a candidate who did not meet the criteria.
- If the file is stored successfully but the metadata write fails, the API deletes the object just created or records it for orphan cleanup; it never touches files belonging to another CV record. A unique constraint handles concurrent duplicate uploads.
- A run may end as `completed_with_errors`; the ranking contains only successful items and always states the number of failed CVs. If every CV fails, no empty ranking table is published as though scoring had completed.
- Information missing from a readable CV is recorded as insufficient evidence, which is distinct from a technical failure to read the file. The scoring rules are in [arc42 §8](arc42.md#8-cross-cutting-concepts).

Related: [C3](c3-components.md), [SEQ-02](sequence-02-review.md).
