# C2 — Container: CV Screening and Ranking against a JD

**Status:** proposal for a production-intended system.

**Scope:** opens up `SYS` from C1.

**Audience:** the design, development, and operations teams.

[Open the SVG](diagrams/c2-containers.svg) to zoom in or embed it in a report.

![C2 — Container: CV Screening and Ranking against a JD](diagrams/c2-containers.svg)

<details>
<summary>Mermaid — equivalent content and relationships</summary>

```mermaid
---
title: "C2 — Container: Sàng lọc CV theo JD — Đề xuất"
---
flowchart TB
    REC["REC · Nhân viên tuyển dụng<br/>[Person]<br/>Duyệt tiêu chí, kết quả và quyết định"]
    subgraph SYS["SYS · Sàng lọc và xếp hạng CV theo JD — Software System đề xuất"]
        WEB["WEB · Web App<br/>[Container · HTML/CSS/JavaScript]<br/>7 màn hình, xem CV và theo dõi tiến trình"]
        API["API · Screening Backend<br/>[Container · Python/FastAPI]<br/>API, điều phối tác vụ bền vững, chấm điểm và lịch sử"]
        DB[("DB · Screening Database<br/>[Container · PostgreSQL]<br/>Tiêu chí, phiên bản đầu vào, tác vụ và kết quả")]
        FILES[("FILES · CV Store<br/>[Container · S3-compatible object storage]<br/>Giữ file CV gốc trong bucket riêng tư")]
        WEB -->|"Lệnh, truy vấn và polling · HTTPS/JSON; CV · multipart"| API
        API -->|"Đọc/ghi dữ liệu và giao dịch · SQL/TCP"| DB
        API -->|"Lưu/đọc file theo object key · HTTPS/S3 API"| FILES
    end
    AI["AI · Dịch vụ trích xuất AI<br/>[External Software System · HTTPS API]<br/>Trích xuất dữ liệu JD/CV có bằng chứng"]
    REC -->|"Thao tác và xem kết quả · trình duyệt"| WEB
    API -->|"Gửi văn bản; nhận dữ liệu có cấu trúc · HTTPS/JSON"| AI
    classDef person fill:#fff,color:#2b8205,stroke:#2b8205,stroke-width:3px
    classDef internal fill:#fff,color:#146ac4,stroke:#146ac4,stroke-width:3px
    classDef external fill:#fff,color:#c71025,stroke:#c71025,stroke-width:3px
    class REC person
    class WEB,API,DB,FILES internal
    class AI external
    linkStyle default stroke:#494949,stroke-width:2px,stroke-dasharray:8 6
```

</details>

## Responsibilities and contracts

| ID | Responsibility | Boundary |
|---|---|---|
| WEB | Rendering, data entry, action confirmation, job polling | Holds no AI key, computes no authoritative score, has no direct database access |
| API | Validates input; runs the pipeline; returns rankings; publishes new runs; serves files to the CV viewer | One modular backend, not a set of microservices |
| DB | Business data, immutable snapshots, job state, and the run-publication transaction | Built on the 8-table model; requires the extensions listed in arc42 §8 |
| FILES | Original PDF/DOCX files, identified by object key and hash | Private bucket; in this design WEB reads through the API |
| AI | Extracts criteria, CV information, and citation positions | Output is untrusted by default; the API validates the schema and cross-checks it against the source text |

A dashed arrow marks the party that initiates the call; return values travel over the same connection and are not drawn separately. Dashed does not mean asynchronous processing. The green person figure is a user; the blue frame encloses the system's containers; the red box is an external system. The window icon is the Web App, the terminal prompt is the backend, the cylinder is the database, and the bucket shape is the file store. The accompanying type/technology labels keep the diagram readable when printed without colour. HTTP(S) is the web protocol; JSON is the data format; SQL is the database query interface; the S3 API is the object-storage interface. "Container" here is the C4 unit of application or data store, not necessarily a Docker container.

## Background processing at project scale

The API records the job in the database before returning `202 Accepted` with a `run_id`. A dispatcher running inside the same backend process picks up durable jobs from the database, limited to one active job per position. Progress is retrieved by polling the API. If the process stops, the job is reclaimed once its lease expires; result writes carry an idempotency key and a lease check to prevent duplication.

Redis, a message broker, and a separately deployed worker are not needed yet. Splitting out a worker is an expansion path once load figures exist, not a hidden component in the current diagram. Python/FastAPI is a proposal for the text pipeline; the fact that a sample CV mentions FastAPI is not evidence that the project already has such a backend.

The current prototype implements only the interface corresponding to `WEB`, using `js/data.js` and state variables in place of the connections above.

Next: [C3 — opening up the API alone](c3-components.md), [Deployment](deployment.md), [arc42](arc42.md).
