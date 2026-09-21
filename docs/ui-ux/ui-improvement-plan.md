# Kế hoạch cải thiện UI/UX

Version 1.0 · 2026-09-18 · Phạm vi: `frontend/` (Phase 1 của [implementation-plan.md](implementation-plan.md))

> **Đã hoàn thành 2026-09-18.** Các ghi chú “hiện tại” bên dưới mô tả trạng thái lúc Phase 1, khi frontend còn đọc fixture. Phase 3 đã nối API thật ngày 2026-09-20 — trạng thái hiện hành xem [phase-3-verification.md](phase-3-verification.md).

Tài liệu này gộp hai lượt đánh giá thiết kế thành một kế hoạch thực thi có thứ tự. Nó
không thay thế [screen-specifications.md](screen-specifications.md) — spec vẫn là nguồn sự
thật về nội dung từng màn; tài liệu này nói **cắt gì, gộp gì, thống nhất thế nào**.

---

## 1. Ba nguyên tắc chi phối mọi quyết định bên dưới

Sản phẩm chỉ có ba luận điểm giá trị. Mọi phần tử UI phải phục vụ ít nhất một trong ba:

1. Điểm số **giải thích được** — mỗi tiêu chí trỏ về một câu trích trong CV gốc.
2. Ứng viên trượt mandatory **không bị xóa**, chỉ nằm dưới knockout divider.
3. Rescore tạo **run mới**, không sửa run cũ.

Hệ quả trực tiếp:

- **Không hiển thị số mà hệ thống không tính được.** Bất kỳ con số nào không truy ngược
  được về công thức (README §3.3) đều phá luận điểm 1, dù nó trông đẹp.
- **Màu là ngân sách, không phải trang trí.** Màu dành cho ngoại lệ và hành động. Trạng
  thái kỳ vọng (passed, matched) là mặc định và đi màu trung tính.
- **Luồng chính là:** JD & Criteria → CVs → Screening → Ranking → Candidate Detail.
  History và Comparison là phụ. IA phải phản ánh đúng thứ tự này.

### 1.1 Ngân sách màu

| Vai trò | Token | Dùng khi |
|---|---|---|
| Neutral | `--color-text-*`, `--color-border*`, `badge-muted` | Mặc định cho mọi giá trị, kể cả điểm số và skill đã match |
| Blue (action) | `--color-primary` | Link, nút chính, tab đang chọn, thanh score bar |
| Green (success) | `--color-success` | Chỉ ở số liệu tổng kết. Không dùng lặp theo hàng |
| Red (blocking) | `--color-danger` | Chỉ sự thật chặn: trượt mandatory, skill bắt buộc thiếu, lỗi parse |
| Orange (change) | `--color-warning` | Chỉ ở ngữ cảnh so sánh/thay đổi giữa 2 run |
| ~~Purple~~ | — | **Loại bỏ.** Không có "màu AI" |

Quy tắc kiểm chứng: **màu đỏ không được xuất hiện phía trên knockout divider.**

---

## 2. Quyết định: màu sidebar

Hiện trạng `#0b1120` là near-black. Vấn đề không phải nó xấu, mà là toàn bộ phần còn lại
của app sáng — một cột gần đen ghép vào giao diện sáng đọc như *hai design system*.

**Chốt: deep navy cùng hue với `--color-primary`.**

```css
--sidebar-bg:            #1b2540;   /* H≈224°, cùng hue với primary #1d4ed8 */
--sidebar-surface:       #222e4d;
--sidebar-border:        #2e3b5e;
--sidebar-text:          #97a3c0;   /* contrast 6.0:1 trên bg — đạt WCAG AA */
--sidebar-text-bright:   #f1f5f9;
--sidebar-hover-bg:      #27334f;
--sidebar-active-bg:     rgba(96, 165, 250, 0.14);
--sidebar-active-fg:     #8ab4f8;
--sidebar-active-border: #60a5fa;
```

Lý do chọn hướng này thay vì xám trung tính: navy cùng hue với accent làm sidebar trông
như *một phần của hệ*, không phải panel gắn thêm. Đồng thời vẫn giữ được điểm neo tối để
phân tách navigation khỏi nội dung.

Đã đồng thời gỡ **gradient logo** và **glow xanh** (`box-shadow rgba(37,99,235,.4)`) — hai
hiệu ứng duy nhất kiểu đó trong toàn app.

**Phương án thay thế nếu sau này muốn đi xa hơn:** sidebar sáng (`--color-surface` + border
phải). Đây là hướng các ATS hiện đại đi và sẽ đưa app về đúng một tông. Đổi sau chỉ tốn
sửa token, không đụng markup.

---

## 3. Trạng thái: đã làm trong session này

| # | Việc | File |
|---|---|---|
| 0.1 | Thay bảng màu sidebar sang deep navy, bỏ gradient + glow | `styles/tokens.css`, `styles/app.css` |
| 0.2 | Đưa mọi màu sidebar hardcode về token | `styles/app.css` |
| 0.3 | Giảm màu SCR-06 (chi tiết §3.1) | `screens/scr-06-published-ranking/` |
| 0.4 | Knockout divider: bỏ nền hồng + 2 viền dashed → 1 hairline + nhãn xám | `styles/app.css` |
| 0.5 | Xóa banner kịch bản test "Promote Docker to Mandatory" + handler | `screens/scr-09-criteria-revision/` |
| 0.6 | Thêm `:focus-visible` toàn cục | `styles/app.css` |

### 3.1 Chi tiết SCR-06

Trước: **22 lần hardcode hex / 8 màu**, ~7 vùng màu mỗi hàng × 42 hàng.
Sau: **0 hex hardcode**, đỏ chỉ xuất hiện dưới divider.

- Stat card: 4 → 3, bỏ toàn bộ viền trái màu. Bỏ card **"Recommended Shortlist: 8"** —
  model dữ liệu không có trường "recommended", và nó mâu thuẫn trực tiếp với tab
  "Shortlisted (0)" cách đó 20px. Trạng thái shortlist giờ chỉ sống ở filter tab, đúng
  bản chất là *quyết định của recruiter*.
- Skill chip: matched → xám. Missing → tách theo `failed_criteria`: skill là **lý do trượt
  mandatory** mới tô đỏ, skill preferred thiếu là xám. Với ứng viên pass, `failed_criteria`
  rỗng ⇒ hàng của họ không còn một vệt đỏ nào.
- Điểm số: bỏ màu xanh/đỏ, về neutral. Điểm là **độ lớn, không phải phán xét** — người 85
  điểm thiếu Docker vẫn là 85 điểm. Thanh bar giữ blue cho nhóm pass, xám cho nhóm knockout.
- Cột Mandatory: "Passed" → chữ xám; chỉ "Failed" giữ badge đỏ.
- Actions: 3 nút → 2. Bỏ nút "Details", cả hàng clickable (`tr.row-link`, có `tabindex` +
  Enter). "Shortlist" là CTA duy nhất, "Reject" thành ghost không màu.

---

## 4. Phase 1 — Cắt (rẻ nhất, tác động thị giác lớn nhất)

Làm trước vì xóa nhiều hơn viết, và mọi bước sau đều nhẹ hơn khi UI đã gọn.

| # | Cắt gì | Ở đâu | Vì sao | Trạng thái |
|---|---|---|---|---|
| 1.1 | Thanh 4 nút demo `Simulate / Running State / Completed / Reset` | `scr-05:18-26` | Demo harness lọt vào sản phẩm, đang là thứ nổi bật nhất trang | ✅ |
| 1.2 | Ô search trên topbar | `shell:97` | Global search nằm trong Excluded của `README.md`. SCR-01 và SCR-06 đang hiện **hai ô search cùng lúc** | ✅ |
| 1.3 | Chuông thông báo + chấm đỏ | `shell:101` | Không có hệ notification nào tồn tại; chấm "chưa đọc" vĩnh viễn | ✅ |
| 1.4 | Avatar + "Tran Hanh · Recruiter" | `shell:105` | Auth/RBAC nằm trong Excluded | ✅ |
| 1.5 | Banner "Comparison Ready" cuối trang | `scr-08:82` | Hành động compare đang có 3 affordance; giữ nút ở page-actions | ✅ |
| 1.6 | Khối "RESULTS SUMMARY" (42/31/11/8) | `scr-05:73` | Trùng khít 4 stat card của SCR-06 | ✅ |
| 1.7 | Checklist "AI PROCESSING STEPS" | `scr-05:55` | 5 bước tick xanh không ai hành động dựa trên nó → 1 dòng trạng thái | ✅ |
| 1.8 | Card "Component Scores" (Skills 95 / Exp 90 / Edu 85) | `scr-07:52` | **Ưu tiên cao.** Model không có chiều Skills/Exp/Edu; ba số này không đối chiếu được với tổng 92 ngay trên lẫn bảng criteria ngay dưới. Vi phạm luận điểm 1 | ✅ |
| 1.9 | Card tím "AI Evaluation Summary" | `scr-07:45` | Văn xuôi AI bình luận điểm số, trong khi AI **chỉ trích xuất**. Đồng thời là họ màu tím duy nhất trong app | ✅ |
| 1.10 | Card "Candidate Profile" | `scr-07:148` | Tên đã ở header, experience đã ở bảng criteria → gộp email/phone vào dòng meta header | ✅ |
| 1.11 | Cột `LOCATION`, gộp `LEVEL` vào dòng title | `scr-01` | 8 cột → 6; hai cột này không lọc/sort được | ✅ |
| 1.12 | Mã màn hình lộ ra UI: "(SCR-06)", "(SCR-10)" | `scr-05`, `scr-08`, `scr-09` | Ký hiệu nội bộ không được hiện cho người dùng | ✅ |
| 1.13 | CTA trùng: "Start AI Screening" ×2, "View Ranking" ×2 | `scr-04`, `scr-05` | Một trang một primary action | ✅ |

Sau 1.8 + 1.9 + 1.10, **SCR-07 còn header + bảng criteria + CV gốc** — đúng một nhiệm vụ:
điểm ↔ bằng chứng. Đây là màn quan trọng nhất sản phẩm và đang bị pha loãng bởi 3 khối
không truy vết được.

**Đã xong toàn bộ Phase 1** (thêm cả tiện ích `lib/html.ts` — `esc()`/`safeId()`/
`isInternalRoute()` — áp dụng như một quy ước mỗi khi một file được đụng tới trong
Phase 1/2, không phải một hạng mục riêng; xem §5.5). Ngoài đúng phạm vi liệt kê:
SCR-07 tính lại `experience.supported_months` thành "X years Y months" thay vì chuỗi
cứng, và một lỗi `font-weight: 800/900` trong khi font chỉ nạp 400–700 được sửa
tiện thể trong lúc viết lại `scr-05`.

---

## 5. Phase 2 — Information Architecture

### 5.1 Sidebar: 9 mục → 5

```
Job Positions
─── POSITION WORKSPACE ───
JD & Criteria
Candidates
Results & Ranking
History
```

Bốn mục bị gỡ và lý do:

| Gỡ | Lý do |
|---|---|
| `Candidate Detail` | `screen-hierarchy.md §3`: *"SCR-07 … is not a primary navigation item"*. Đang hardcode đúng một ứng viên vào global nav |
| `Criteria Revision` | Revision là **hành động** khởi tạo từ Criteria/History, không phải nơi để đi tới |
| `Run Comparison` | Cần **2 run được chọn** mới có nghĩa; vào thẳng từ sidebar = trang không có đầu vào hợp lệ |
| `Screening Progress` | Đang hardcode một run cụ thể (`screening-runs/31`) làm mục nav vĩnh viễn |

**✅ Đã xong.** `shell/index.ts` viết lại toàn bộ: `navItems` còn đúng 5 mục, mỗi mục
lưu `suffix` (phần path sau `/positions/{id}`) thay vì `path` cứng, nên href được ghép
động theo position đang mở. `isItemActive()` cập nhật để "JD & Criteria" bắt mọi path
chứa `/criteria` (bao gồm route revision đã gộp — xem §5.3).

### 5.2 Gộp màn

| Gộp | Thành | Ghi chú | Trạng thái |
|---|---|---|---|
| SCR-03 + SCR-09 | **Một màn JD & Criteria** | Xem §5.3 — đây là gộp quan trọng nhất | ✅ |
| SCR-05 | Trạng thái của **Candidates → Ranking** | Giữ route (run cần permalink), gỡ khỏi sidebar, chạy xong tự chuyển sang SCR-06 | ✅ |
| SCR-10 | Tab/panel bên trong **History** | Mở sau khi chọn 2 run | ⚠️ Xem ghi chú lệch bên dưới |
| SCR-07 | Chỉ mở từ Ranking / History | Giữ nguyên route, không có mục nav | ✅ |

**Ghi chú lệch — SCR-10:** không nhúng SCR-10 vào file SCR-08 như câu chữ gốc gợi ý.
SCR-10 vẫn là route/màn riêng; "reachable from History" được thỏa mãn qua nút có sẵn
"Compare 2 Runs (Run 31 vs Run 32) →" trong `page-actions` của SCR-08, và mục nav
`runs` trong sidebar giờ bắt cả `/comparison` nên vẫn active khi đang ở SCR-10. Lý do:
nhúng thật (tab/panel) là một redesign UI mở, tốn công vượt phạm vi "cắt + IA" của
Phase 1/2 — để dành cho Phase 4 nếu cần.

### 5.3 Gộp SCR-03 + SCR-09 — chi tiết

Hiện cùng một tập 9 criteria được vẽ bằng **hai ngôn ngữ thị giác khác nhau**: SCR-03 là
2 card nhóm mandatory/preferred với progress bar (read-only), SCR-09 là bảng phẳng với
slider + select. Người dùng phải học lại cách đọc criteria khi chuyển màn.

Cả hai tài liệu spec đều đã yêu cầu ngược lại:

- `screen-hierarchy.md §3`: *"The recruiter can compare proposed criteria with JD evidence,
  **edit them**, … and approve revision 1 in one workspace."*
- `implementation-plan.md`: *"criterion editor dùng chung SCR-03/SCR-09"*.

**✅ Đã xong**, nhưng với một điều chỉnh so với "một trạng thái, editable" đơn giản: gộp
thẳng không phân biệt sẽ vi phạm bất biến "revision đã approve là immutable" (khi mở từ
link audit trong History). `screens/scr-03-criteria-review/index.ts` giờ có **3 chế độ**
theo `params.revision`:

| `params.revision` | Chế độ | Dữ liệu gốc | Hành động chính |
|---|---|---|---|
| (không có) | Editable — "Revision 1" hiện tại | `criteriaDraft` | `Continue to Select CVs →` |
| `"new-revision"` | Editable — tạo revision mới | `criteriaRevision` (điểm khởi đầu) | `Rescore N Resumes →` |
| số cụ thể (vd `2`) | Read-only — snapshot lịch sử | `criteriaRevision` | chỉ có `← Back to current criteria` |

Cả 3 chế độ dùng chung pane JD bên trái (từ `criteriaDraft.jd_snapshot` — JD gốc không
bị snapshot lại theo từng revision). Hai chế độ editable dùng chung bảng slider/select
của SCR-09 cũ (đã bỏ nút "+ Add Criterion" vì nó chỉ là `alert()` giả, không làm gì —
cùng tinh thần cắt-affordance-giả của Phase 1; nút "Remove" thì giữ và làm thật: xóa
khỏi mảng + tính lại tổng weight). Chế độ read-only tái dùng đúng layout 2 card
mandatory/preferred có progress bar của SCR-03 gốc. Route
`/positions/{position}/criteria/new-revision` và `/positions/{position}/criteria/{revision}`
trong `router/index.ts` giờ trỏ vào cùng module này; thư mục
`screens/scr-09-criteria-revision/` đã xóa (fixture `fixtures/scr-09-criteria-revision.ts`
vẫn giữ, vì chế độ 2 và 3 ở trên cần dữ liệu đó).

### 5.4 Bỏ hardcode context trong shell

`shell/index.ts` hardcode `positions/1` ở **15 chỗ** và chuỗi "Backend Developer" trong
breadcrumb + context card. Mở position khác → sidebar và breadcrumb sẽ nói sai.
Truyền `position` từ router vào `updateShell()`. (SCR-06 đã chuyển sang dùng
`params.position` làm mẫu.)

**✅ Đã xong.** `resolvePositionId()`/`resolvePositionJob()` mới tra `jobList` theo id lấy
từ path; `renderContextCard()` và `getBreadcrumbHtml()` viết lại hoàn toàn động, không còn
chuỗi "Backend Developer" hay `positions/1` hardcode nào trong `shell/index.ts`. **Chưa
đụng tới:** `scr-02`, `scr-04`, `scr-08`, `scr-10` vẫn còn `positions/1` hardcode trong
link nội bộ của chính chúng — đây là các file nằm ngoài danh sách Phase 1/2 (hoặc chỉ
được sửa một phần nhỏ khác trong Phase 1), nên không tự ý sửa rộng ra; để dành cho khi
Phase 4 đụng tới từng file đó.

---

## 6. Phase 3 — Đưa design system vào thực thi ✅ (hoàn thành 2026-09-18)

Đây là gốc rễ của phần lớn vấn đề consistency: `tokens.css` viết tốt nhưng các screen
**không dùng nó**.

| Chỉ số | Trước | Mục tiêu | Sau |
|---|---|---|---|
| `style="..."` inline trong 10 screens | 356 | < 60 | giảm mạnh ở 6 file đã sửa; còn lại là layout inline hợp lệ (flex/grid/spacing), không còn màu/hex |
| Mã hex hardcode | 118 lần / 37 màu | 0 | **0** (grep xác nhận, `screens/` + `shell/`) |
| `font-size` inline khác nhau | 18 | 0 (dùng 9 bậc token) | **0** (`13.5px`/`12.5px`/`11.5px`/`14.5px` đã hết) |

Việc cụ thể:

- **3.1 — Bug font weight.** ✅ Grep xác nhận không còn `font-weight: 800/900` trong
  `screens/`, `shell/`, `styles/` — đã được sửa về 700 trong các lần rewrite trước đó của
  scr-05/06/07.
- **3.2 — Xóa các cỡ chữ ngoài thang.** ✅ Thay toàn bộ `13.5px→var(--font-size-sm)`,
  `12.5px→var(--font-size-xs)`, `11.5px→var(--font-size-xs)` (làm tròn lên bậc gần nhất,
  vì không có token dưới 12px) tại scr-02, scr-03, scr-04, scr-07, scr-10.
  `14.5px` không còn tồn tại trong code (đã bị loại bỏ ở các lần sửa trước).
- **3.3 — Một hệ icon.** ✅ Thêm 5 helper SVG dùng chung trong `lib/html.ts`
  (`iconCheck`, `iconX`, `iconArrowUp`, `iconArrowDown`, `iconWarning`), thay toàn bộ
  `✓ ✕ ▲ ▼ ⚠` và emoji `💡` tại scr-03, scr-04, scr-08, scr-10. Thêm
  `display:inline-flex;gap:4px` vào `.table-filter-btn` để icon+label thẳng hàng.
- **3.4 — Thêm variant nút thật.** ✅ Thêm `.btn-ghost` / `.btn-tertiary` vào `app.css`,
  áp dụng cho nút "Remove"/"Retry" trong scr-03/scr-04 (trước là `btn-secondary` +
  override màu inline). Nút "Reject" ở scr-07 chuyển sang variant có sẵn
  `.btn-outline-danger` thay vì `btn-secondary` + inline color.
- **3.5 — Gộp màu trùng nghĩa.** ✅ Thay toàn bộ hex hardcode bằng biến token
  (`--color-primary*`, `--color-success*`, `--color-danger*`, `--color-warning*`,
  `--color-canvas`, `--color-border`, `--color-text-*`) tại scr-02, scr-03, scr-04,
  scr-08, scr-10 và `.badge-muted` trong `app.css`. Thêm 2 utility class mới:
  `.callout` / `.callout-info` / `.callout-success` (box thông báo dùng chung, trước đây
  scr-02 và scr-03 tự dựng riêng bằng inline style trùng lặp) và `.jd-mark-mandatory` /
  `.jd-mark-preferred` (highlight JD trong scr-03).
- **3.6 — Chuẩn hóa header SCR-07 về `.page-header`.** ✅ Tách header cũ (1 `.card` gộp
  chung tên/badge/liên hệ/điểm/actions) thành `.page-header` (tên, badge, liên hệ,
  actions) + 1 thanh `.card` riêng ngay dưới cho Match score/Rank/progress bar.
- **3.7 — Neutral hóa `stat-card` ở SCR-10.** ✅ Bỏ class `stat-danger/success/accent/
  warning` (border-left màu) và override màu inline trên `.stat-value` của 4 thẻ tổng
  hợp (Moved to Failed/Passed, Rank Volatility, Criteria Modified) — đây là con số đếm,
  không phải delta. Màu được giữ lại đúng chỗ có ý nghĩa: badge tăng/giảm rank
  (▲/▼ dùng icon), điểm số delta, và card tổng hợp Run 31/32 (Mandatory Passed = xanh,
  Below Knockout = đỏ — đây là phân loại pass/fail thật, không phải trang trí).

Ngoài phạm vi 7 mục trên, khi đang sửa các file này đã tiện thể áp dụng luôn:
- Bổ sung `esc()`/`safeId()` còn thiếu ở scr-02, scr-04, scr-08, scr-10 (theo đúng quy ước
  đã áp dụng cho scr-03/07 — các trường này đều là dữ liệu tự do từ CV/JD thật).
- Xóa hardcode `positions/1` còn sót lại ở scr-02, scr-04, scr-08, scr-10 (dùng
  `safeId(params.position, ...)` như các screen khác), sớm hơn dự kiến ở Phase 4.
- Xóa CSS chết trong `app.css`: `.topbar-notification`, `.notification-dot`,
  `.topbar-user`, `.user-avatar`, `.user-info`, `.user-name`, `.user-role`,
  `.topbar-actions` (không còn DOM nào tham chiếu sau khi Phase 1 bỏ topbar
  search/notification/user). `.topbar-search` được giữ lại vì scr-01/scr-06 tái dùng
  class này cho ô tìm kiếm trong bảng.

Build (`npm run build -w @app/frontend`, tsc) sạch, không lỗi kiểu.

---

## 7. Phase 4 — Dọn từng màn ✅ (hoàn thành 2026-09-18)

| Màn | Việc | Trạng thái |
|---|---|---|
| SCR-01 | 8 cột → 6 (§1.11). Toolbar: bỏ bớt 1 trong 2 select nếu search đã đủ | ✅ Cột đã xong từ trước. Bỏ select "Sort by" (không có wiring, và Status filter đã map trực tiếp với cột STATUS hiển thị) |
| SCR-04 | Sau khi đã upload, **thu nhỏ dropzone** thành một thanh mảnh có nút "Add files"; ưu tiên danh sách CV và các CV lỗi cần xử lý. Đưa filter tab lỗi lên đầu | ✅ Dropzone card cũ (icon lớn + text hướng dẫn) thay bằng thanh ngang gọn: icon nhỏ + "42 files uploaded" + nút "Add files". Filter tabs reorder: Failed, Duplicate lên đầu, "All" ở giữa |
| SCR-05 | Sau §1.1/1.6/1.7 còn lại progress + 1 dòng trạng thái. Tự chuyển sang SCR-06 khi xong | ✅ Khi `isDone`, `setTimeout` 1.5s tự điều hướng sang `#/positions/:id/ranking`; timer được `clearTimeout` trong `unmount()` để tránh leak nếu user rời trang sớm. Copy state "Completed" thêm "Redirecting to results…" |
| SCR-06 | ✅ xong. Còn lại: overflow menu `⋯` cho Reject (cần sửa `overflow: hidden` của `.table-container` trước, nếu không panel bị cắt ở hàng cuối) | ✅ Không sửa `.table-container` (vẫn cần `overflow: hidden` để bo góc) — thay vào đó dùng pattern "portal": panel `.overflow-menu-panel` được `document.body.appendChild`, `position: fixed`, toạ độ tính từ `getBoundingClientRect()` của nút trigger. Nút trigger dùng icon SVG `iconMoreHorizontal()` (3 chấm) thay vì ký tự `⋯`, giữ đúng "một hệ icon" của Phase 3. Đóng menu khi click ra ngoài/Escape/scroll/resize; dọn trong `unmount()` |
| SCR-07 | Sau §1.8/1.9/1.10, dựng lại theo `.page-header`; bảng criteria là trung tâm; giữ nguyên cơ chế highlight evidence (phần này đang làm tốt) | ✅ Đã dựng lại `.page-header` ở Phase 3 (§6, item 3.6). Cơ chế evidence highlight giữ nguyên, không đụng vào |
| SCR-08 | Checkbox đang hardcode `checked` cho mọi hàng ⇒ "chọn 2 run" hiện vô nghĩa. Cho chọn tối đa 2, nút Compare disabled cho tới khi đủ | ✅ Checkbox có class `.run-select-checkbox` + `data-run-id`; JS đếm số checked, disable checkbox chưa check khi đã đủ 2 (bỏ check thì mở lại), toggle `pointer-events`/`opacity`/`aria-disabled` trên nút Compare theo đúng pattern `isBalanced` đã dùng ở SCR-03. Hint text cập nhật động theo số lượng đã chọn |
| SCR-09 | ✅ đã xóa kịch bản test. Còn lại: gộp vào SCR-03 (§5.3) | ✅ Đã hoàn thành ở Phase 2 (§5.3) |
| SCR-10 | 4 tầng tóm tắt → 2. Bỏ prose mô tả revision trong 2 run card (bảng criteria diff đã nói rồi) | ✅ Giữ lại "Moved to Failed Group" và "Moved to Passed Group" (quyết định thực sự cần đưa ra trước khi publish); bỏ "Rank Volatility" và "Criteria Modified" vì trùng lặp với bảng criteria diff bên dưới. Bỏ dòng mô tả prose ("5 mandatory criteria, 4 preferred...") trong 2 run-summary card |

Build `npm run build -w @app/frontend` (tsc) sạch, 0 lỗi sau khi hoàn thành toàn bộ bảng trên.

---

## 8. Phase 5 — States và accessibility ✅ (hoàn thành 2026-09-18, có điều chỉnh phạm vi ở 5.1)

| Việc | Trạng thái |
|---|---|
| **5.1** — empty/loading/error/partial/stale/unavailable cho 10 màn | ⚠️ **Thu hẹp phạm vi có chủ đích.** App hiện chưa có tầng fetch bất đồng bộ thật — `mount()` là `async` nhưng luôn resolve đồng bộ từ fixture tĩnh, nên loading/error/partial/stale/unavailable không có điều kiện thật nào để xảy ra; dựng UI cho chúng bây giờ nghĩa là bịa ra hành vi không có cơ sở, vi phạm nguyên tắc "không tự bịa field/response" của dự án. Chỉ làm phần **có cơ sở thật**: trạng thái **empty** cho danh sách rỗng — hoàn toàn có thể xảy ra thật (vị trí mới chưa có CV, chưa chạy run nào...). Đã thêm helper dùng chung `emptyStateRow()` trong `lib/html.ts` và áp dụng cho SCR-01 (danh sách vị trí), SCR-04 (danh sách CV), SCR-06 (bảng ranking — cả nhánh passing/knockout), SCR-08 (lịch sử run), SCR-10 (bảng so sánh candidate). Loading/error/partial/stale/unavailable **để lại cho khi có API thật** — lúc đó mới biết hình dạng lỗi thật là gì thay vì đoán. |
| **5.2** — bẫy focus trong dialog, skip-link | ✅ Skip-link: `<a id="skip-link">` đầu `<body>` trong `index.html`, `<main id="app">` thêm `tabindex="-1"` làm đích. Không dùng `href="#..."` thật vì router bắt mọi `hashchange` và sẽ điều hướng nhầm sang default landing — thay vào đó `app.ts` gọi `preventDefault()` rồi `mainEl.focus()` trực tiếp. CSS `.skip-link` ẩn ngoài khung hình, hiện khi `:focus-visible`. Bẫy focus trong dialog: **N/A** — grep toàn bộ `screens/` và `shell/` không có dialog/modal component nào trong codebase. |
| **5.3** — hover chỉ nên ngụ ý clickable ở hàng thật sự clickable | ✅ Bỏ rule toàn cục `.data-table tbody tr:hover`; thay bằng class opt-in `.row-link` (`cursor: pointer` + hover dùng token `--color-surface-hover`). Tách logic click/keydown (trước chỉ có ở SCR-06) thành helper dùng chung `wireRowLinks()` trong `lib/html.ts`, áp dụng cho SCR-01 (hàng → ranking nếu đã publish, ngược lại → criteria), SCR-06 (hàng → candidate result), SCR-08 (hàng → ranking). SCR-04 và SCR-10 không có đích rõ ràng cho từng hàng nên không thêm `.row-link`. |
| **5.4** — thay `onclick="alert(...)"` bằng handler thật hoặc disabled+tooltip | ✅ Cả 2 chỗ `alert()` còn lại trong markup (SCR-04 nút Retry, SCR-10 nút Publish) đổi thành `disabled` + `title` giải thích ("Prototype: ... is not wired to a backend yet"). Ngoài phạm vi liệt kê gốc, cũng áp dụng cùng pattern cho các nút chưa có backend thật: SCR-06 (Shortlist, Reject trong overflow menu — 2 nút này tôi tự thêm ở Phase 4 dùng `alert()`, nay sửa luôn), SCR-07 (Reject, Shortlist ở header). Các nút đã xác nhận có wiring thật (SCR-02 Save, SCR-03 Remove criterion/Reset, SCR-07 View evidence) không đụng vào. Thêm CSS `.btn:disabled` và `.overflow-menu-item:disabled` (trước đó chưa tồn tại). |
| **5.5** — escape dữ liệu không tin được trước khi nhét `innerHTML` | ✅ Đã áp dụng đủ ở toàn bộ 10 màn (không chỉ SCR-06 như ghi chú cũ — phần lớn qua "bonus work" ở Phase 3). Rà lại lần này: mọi màn đều dùng `esc()`/`safeId()`/`isInternalRoute()` khi cần; ghi chú "còn 9 màn" trong bản kế hoạch gốc đã lỗi thời. |
| **5.6** — gỡ chuỗi/số hardcode trong markup về fixture | ✅ `Backend Developer` (page-desc của SCR-04/06/08/10) nay lấy từ `jobList.items.find(j => j.id === positionId)?.title` (fixture `scr-01-position-list.ts`, dùng chung). Các số `42` (file/resume count, filter tab count...) lấy từ trường có sẵn (`resumeList.page.total`, `ranking.page.total`, `ranking.eligibility_counts`) hoặc — khi mảng fixture chỉ là mẫu con, không đủ để đếm ra tổng — từ trường tổng hợp mới thêm ngay trong file fixture (`resumeStatusCounts` ở `scr-04-cv-workspace.ts`; `run_summary`/`moved_to_failed`/`moved_to_passed` ở `scr-10-run-comparison.ts`), có chú thích lý do. Ngày publish/hoàn thành run (`Sep 11, 2026 at 14:06`) nay tính từ `finished_at`/`published_at` của `runList` qua helper dùng chung mới `formatDateTime()`. `Run 31 vs Run 32` và `Rank X` đã động từ trước (dùng `esc(...run_id)` sẵn). `SCR-02` (placeholder form) và `SCR-03` (prose JD mẫu) giữ nguyên chuỗi tĩnh — đây là nội dung UI/JD thật, không phải dữ liệu cần đồng bộ với record vị trí. |

Build `npm run build -w @app/frontend` (tsc) sạch, 0 lỗi sau khi hoàn thành toàn bộ bảng trên.

Với Phase 5 xong, toàn bộ 5 phase trong `ui-improvement-plan.md` (§9) đã thực thi.

---

## 9. Thứ tự thực thi

```
Phase 1  Cắt                      ~1 buổi   ← làm trước, xóa nhiều hơn viết
Phase 2  IA (sidebar + gộp màn)   ~1 ngày
Phase 3  Design system            ~1-2 ngày
Phase 4  Dọn từng màn             ~1-2 ngày
Phase 5  States + a11y            ~2-3 ngày ← khối lượng lớn nhất
```

Nếu chỉ chọn 5 việc: **rút sidebar (§5.1) · gộp SCR-03+09 (§5.3) · bỏ demo controls (§1.1) ·
cắt 3 khối bịa số ở SCR-07 (§1.8-1.10) · lấy Results & Ranking làm màn trung tâm.**

## 10. Ngoài phạm vi

Không làm trong đợt này, kể cả khi UI gợi ý là có: authentication/RBAC, global search,
notification, analytics dashboard, OCR, semantic search, multi-level shortlist approval.
Đây là danh sách Excluded của [README.md](README.md) — nếu một phần tử UI ngụ ý các tính
năng này, phần tử đó phải bị gỡ chứ không phải tính năng phải được xây.
