# Deployment — Internal trial environment

**Status:** a proposed deployment diagram, not infrastructure that has been built. **Scope:** one instance of the screening subsystem running on synthetic data; not a production operating configuration.

[Open the SVG](diagrams/deployment.svg) to zoom in or embed it in a report.

![Deployment — Internal trial environment](diagrams/deployment.svg)

```mermaid
---
config:
  theme: base
  themeVariables:
    background: "#ffffff"
    lineColor: "#494949"
    textColor: "#494949"
    edgeLabelBackground: "#ffffff"
    clusterBkg: "#ffffff"
    clusterBorder: "#494949"
---
flowchart TB
    subgraph CANVAS["<b>Deployment View: Sàng lọc và xếp hạng CV theo JD</b>"]
    direction TB
        subgraph CLIENT["<b>Máy nhân viên tuyển dụng</b> <small>[Deployment node]</small>"]
            subgraph BROWSER["<b>Trình duyệt</b> <small>[Execution environment]</small>"]
                WEB["<b>Web App instance</b><br/><small>[Container instance: HTML/CSS/JavaScript]</small><br/>Hiển thị, nhập liệu<br/>và theo dõi tiến trình."]
            end
        end
        subgraph HOST["<b>Máy chủ thử nghiệm nội bộ</b> <small>[Deployment node · Linux VM · 4 vCPU / 8 GiB]</small>"]
            EDGE["<b>Nginx</b><br/><small>[Infrastructure node: reverse proxy]</small><br/>HTTPS endpoint; phục vụ static<br/>files của WEB và chuyển tiếp<br/>/api tới backend."]
            subgraph APP["<b>Backend process</b> <small>[Execution environment]</small>"]
                API["<b>Screening Backend instance</b><br/><small>[Container instance: Python/FastAPI]</small><br/>Python/FastAPI, một tiến trình;<br/>HTTP và bộ điều phối RUN<br/>chạy cùng ứng dụng."]
            end
            DB[("<b>Screening Database instance</b><br/><small>[Container instance: PostgreSQL]</small><br/>PostgreSQL · volume riêng;<br/>cổng 5432 chỉ mở trong<br/>mạng nội bộ máy chủ.")]
            FILES[("<b>CV Store instance</b><br/><small>[Container instance: S3-compatible storage]</small><br/>Dịch vụ tương thích S3 ·<br/>volume riêng; bucket CV<br/>không công khai.")]
            EDGE -.->|"Chuyển tiếp /api tới backend<br/><small>[HTTP loopback :8000]</small>"| API
            API -.->|"Đọc/ghi và giao dịch<br/><small>[SQL/TCP :5432 · mạng riêng]</small>"| DB
            API -.->|"Lưu và đọc file CV<br/><small>[HTTPS/S3 API :443 · mạng riêng]</small>"| FILES
        end
        AI["<b>Dịch vụ trích xuất AI</b><br/><small>[External deployment node: HTTPS endpoint]</small><br/>Do nhà cung cấp vận hành,<br/>ngoài phạm vi triển khai này."]
        BACKUP[("<b>Kho backup</b><br/><small>[Infrastructure node: tách khỏi máy chủ]</small><br/>Bản sao DB và file theo cùng<br/>mốc dữ liệu; mã hóa và<br/>giới hạn truy cập.")]
        WEB -.->|"Tải static files và gọi /api<br/><small>[HTTPS :443]</small>"| EDGE
        API -.->|"Gửi văn bản đã giảm thông tin nhận dạng<br/><small>[HTTPS :443]</small>"| AI
        DB -.->|"Backup theo lịch<br/><small>[Kênh mã hóa]</small>"| BACKUP
        FILES -.->|"Backup theo lịch<br/><small>[Kênh mã hóa]</small>"| BACKUP
    end
    classDef internal fill:#ffffff,color:#146ac4,stroke:#146ac4,stroke-width:3px
    classDef infra fill:#ffffff,color:#8a6a12,stroke:#8a6a12,stroke-width:3px
    classDef external fill:#ffffff,color:#c71025,stroke:#c71025,stroke-width:3px
    class WEB,API,DB,FILES internal
    class EDGE,BACKUP infra
    class AI external
    style CLIENT fill:#ffffff,color:#494949,stroke:#494949,stroke-width:2px
    style HOST fill:#ffffff,color:#494949,stroke:#494949,stroke-width:2px
    style BROWSER fill:#ffffff,color:#494949,stroke:#494949,stroke-width:2px,stroke-dasharray:8 6
    style APP fill:#ffffff,color:#494949,stroke:#494949,stroke-width:2px,stroke-dasharray:8 6
    linkStyle default stroke:#494949,stroke-width:2px
    style CANVAS fill:#ffffff,color:#494949,stroke:#ffffff,stroke-width:16px
```

## Legend and mapping back to C2

A solid grey frame is a device or server (deployment node); a dashed grey frame is an execution environment; an `instance` box is a running copy of a C2 container. An Infrastructure box is supporting deployment infrastructure, not a business component. A cylinder is durable data. Blue marks components inside the scope, amber marks operational infrastructure, and red marks what lies outside the system — the same colour convention, white fill, and coloured outlines used in C1–C3. A dashed arrow shows the direction in which a connection is opened or a copy is transferred; the line in square brackets gives the protocol and port. HTTPS is HTTP over TLS; VM is a virtual machine; the vCPU/GiB figures describe a starting allocation, not the result of load measurement.

| C2 container | Where it executes or is stored |
|---|---|
| WEB | Files served by Nginx; the JavaScript executes in the browser |
| API | A single backend process; the C3 components run inside it |
| DB | PostgreSQL on the trial server; data outlives the process |
| FILES | An S3-compatible object storage service on the server; durable data |
| AI | An external vendor endpoint; no vendor has been selected |

## Intended configuration and operations

- Only the Nginx HTTPS endpoint accepts traffic from the trial network. The database, the file store, and the backend port are not exposed directly to the browser. The prototype has no login mechanism; this environment relies on network restriction and synthetic data only.
- Backend configuration covers the database connection string, the file store endpoint and bucket, access keys, the AI endpoint and model, timeouts, and batch limits. Secrets stay server-side, never in JavaScript or in the repository. No real secret values appear in this documentation.
- Static files and the API share one origin to keep connectivity simple. The API serves CV files to the browser for a valid `resume_id`; it does not expose object keys as public URLs.
- Each deployment: back up → apply tested migrations → start the backend → check the database, file store, and readiness → serve the interface. There are currently no migrations, no Docker Compose file, and no deployment pipeline; the diagram does not claim those artifacts exist.
- Health checks distinguish "the process is alive" from "ready to serve". An AI failure causes controlled job retries or failures; it does not make previously published results unavailable for reading.
- Daily database and file backups are stored away from the server, with a manifest linking `resume_id`, object key, and hash. Trial targets: RPO at most 24 hours, RTO at most 4 hours; both can be confirmed only by rehearsing a restore.
- After a restart, the dispatcher reclaims jobs whose lease has expired. Results are written only with a still-valid lease token; the currently published run is kept intact until the transaction publishing the new run completes.

A single server is a single point of failure. No high availability or automatic failover is claimed. Before real CVs are used, access control and a data-handling policy must be added; building an account administration module remains outside the scope of this business design.

## How it runs today

The current prototype is opened directly as `index.html`, or served by a static HTTP server as described in the [README](../../README.md). It does not use Nginx, FastAPI, PostgreSQL, S3, or the AI service shown in the proposal above. None of this infrastructure is needed to run the existing demo.

Related: [C2 — the containers being deployed](c2-containers.md), [operations and quality goals in arc42](arc42.md#9-architecture-decisions).
