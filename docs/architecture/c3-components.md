# C3 — Component: Screening Backend

**Status:** proposed; these components do not exist in the current code.

**Scope:** opens up the `API` container from C2 only.

**Audience:** backend designers and developers.

[Open the SVG](diagrams/c3-components.svg) to zoom in or embed it in a report.

![C3 — Component: Screening Backend](diagrams/c3-components.svg)

<details>
<summary>Mermaid — equivalent content and relationships</summary>

```mermaid
---
title: "C3 — Component: Screening Backend — Đề xuất"
---
flowchart TB
    WEB["WEB · Web App<br/>[Container · HTML/CSS/JavaScript]<br/>Gửi lệnh và xem kết quả"]
    subgraph API["API · Screening Backend — Container Python/FastAPI đề xuất"]
        HTTP["HTTP · API Controllers<br/>[Component · FastAPI routers]<br/>Kiểm tra request, phiên bản và trả HTTP"]
        CRIT["CRIT · Criteria Service<br/>[Component · Python]<br/>JD, duyệt và đóng băng bộ tiêu chí"]
        CV["CV · Resume Service<br/>[Component · Python/PDF-DOCX parser]<br/>File, hash, phiên bản và văn bản CV"]
        RUN["RUN · Screening Coordinator<br/>[Component · Python async tasks]<br/>Tác vụ bền vững, retry và công bố vòng"]
        SCORE["SCORE · Scoring Engine<br/>[Component · Python domain module]<br/>Lọc bắt buộc, điểm và đóng góp tiêu chí"]
        REVIEW["REVIEW · Ranking and Review Service<br/>[Component · Python]<br/>Xếp hạng, bằng chứng, quyết định và so sánh"]
        EXTRACT["EXTRACT · Extraction Adapter<br/>[Component · Python HTTP client]<br/>Gọi AI, kiểm tra schema và bằng chứng"]
        DATA["DATA · Repositories<br/>[Component · Python SQL/S3 clients]<br/>Truy cập dữ liệu, file và ranh giới giao dịch"]
        HTTP -->|"Yêu cầu trích xuất hoặc lưu tiêu chí · gọi hàm"| CRIT
        HTTP -->|"Nạp hoặc đọc file CV · gọi hàm"| CV
        HTTP -->|"Tạo tác vụ và đọc tiến trình · gọi hàm"| RUN
        HTTP -->|"Đọc kết quả và ghi quyết định · gọi hàm"| REVIEW
        CRIT -->|"Trích xuất JD · gọi hàm"| EXTRACT
        CRIT -->|"Lưu revision tiêu chí · gọi hàm"| DATA
        CV -->|"Lưu file, hash và phiên bản · gọi hàm"| DATA
        RUN -->|"Đọc văn bản của phiên bản CV · gọi hàm"| CV
        RUN -->|"Trích xuất CV chưa có snapshot · gọi hàm"| EXTRACT
        RUN -->|"Chấm snapshot theo policy · gọi hàm"| SCORE
        RUN -->|"Tác vụ, snapshot và publish transaction · gọi hàm"| DATA
        REVIEW -->|"Đọc vòng, bằng chứng và ghi quyết định · gọi hàm"| DATA
    end
    DB[("DB · Screening Database<br/>[Container · PostgreSQL]<br/>Dữ liệu, tác vụ và lịch sử")]
    FILES[("FILES · CV Store<br/>[Container · S3-compatible storage]<br/>File CV gốc riêng tư")]
    AI["AI · Dịch vụ trích xuất AI<br/>[External Software System · HTTPS API]<br/>Trả dữ liệu JD/CV có cấu trúc"]
    WEB -->|"HTTPS/JSON hoặc multipart"| HTTP
    DATA -->|"Đọc/ghi và giao dịch · SQL/TCP"| DB
    DATA -->|"Lưu/đọc file · HTTPS/S3 API"| FILES
    EXTRACT -->|"Trích xuất văn bản · HTTPS/JSON"| AI
    classDef internal fill:#fff,color:#146ac4,stroke:#146ac4,stroke-width:3px
    classDef neighbour fill:#fff,color:#146ac4,stroke:#146ac4,stroke-width:3px
    classDef external fill:#fff,color:#c71025,stroke:#c71025,stroke-width:3px
    class HTTP,CRIT,CV,RUN,SCORE,REVIEW,EXTRACT,DATA internal
    class WEB,DB,FILES neighbour
    class AI external
    linkStyle default stroke:#494949,stroke-width:2px,stroke-dasharray:8 6
```

</details>

## Legend and dependency rules

In the SVG, the outer frame is the `SYS` system and the inner frame is the `API` container. A box with two tabs on its left edge and a `[Component]` label is a component inside the backend. WEB, DB, and FILES sit outside the backend frame but still belong to the system; AI is a red box outside both frames. The Mermaid version omits the outer frame to keep the focus on the API; the elements and relationships are equivalent to the SVG.

A dashed arrow runs from caller to provider and states whether the call is internal or a network protocol; it does not express execution order or synchronous versus asynchronous behaviour. Element-type labels accompany the icons, so meaning does not depend on colour alone. PDF/DOCX are CV formats; the remaining abbreviations follow the [arc42 glossary](arc42.md#12-glossary).

`SCORE` only receives a snapshot and returns a result: it does not call the AI, write to the database, or read files. That makes it testable — the same input always yields the same score. `EXTRACT` returns either validated data or a structured error; it never decides a shortlist. `DATA` contains no scoring formula. `RUN` owns the job lifecycle and the run-publication transaction; `REVIEW` owns human actions.

| Component | Main contract | Failure cases |
|---|---|---|
| HTTP | Valid request → service call; response carries the ID and version | `422` for invalid data, `409` for a version or job conflict |
| CRIT | JD → draft criteria; user approval → an immutable revision | Too few criteria, weights that do not sum correctly, edits to a superseded revision |
| CV | Valid file → `resume_id`, hash, object key, status | Corrupt file, size limit exceeded, duplicate hash; never merges people on matching names alone |
| RUN | Input revision + CV list → `run_id`, progress, published run | Bounded retries, lease expiry, no CV processed successfully |
| SCORE | CV snapshot + criteria + policy → score, pass/fail, contributions | Missing data is recorded explicitly; an invalid policy is rejected |
| REVIEW | Published run → ranking/detail/diff; decisions carry an expected version | A newer run appears → the user is asked to re-check; writes never land on the wrong run |
| EXTRACT | Text + schema → data with valid spans plus metadata | Timeout, malformed JSON, evidence absent from the source |
| DATA | Repository methods plus the transaction boundary | Database rollback; compensating deletion of written files when the metadata cannot be saved |

Calls into DATA are shown at the shared repository level; no service calls the database directly. Background processing uses `RUN` inside the same API container — no worker container has been left out of the diagram.

See [the three runtime flows](arc42.md#6-runtime-view) and [the scoring rules](arc42.md#8-cross-cutting-concepts).
