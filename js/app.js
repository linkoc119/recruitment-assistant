/**
 * app.js — Điều hướng, quản lý trạng thái thuần trong biến JavaScript,
 * render động và xử lý tương tác hoàn chỉnh cho Trợ lý tuyển dụng.
 */

// ==========================================
// 1. TRẠNG THÁI ỨNG DỤNG (IN-MEMORY STATE)
// Tuyệt đối không dùng localStorage/sessionStorage
// ==========================================
const appState = {
  currentScreen: 's5',
  searchQuery: '',
  filter: 'all', // 'all' | 'pass' | 'fail' | 'short'
  sort: 'score', // 'score' | 'exp' | 'name'
  expandedIds: new Set(), // Danh sách ID đang mở rộng hàng
  shortlistedIds: new Set(), // Danh sách ID đã đưa vào shortlist
  rejectedIds: new Set(), // Danh sách ID đã loại
  modalAction: null, // 'shortlist' | 'reject' | 'rescore'
  modalCandidate: null,
  tipSemanticOpen: false,
  round2Active: false, // Trạng thái sau khi chấm lại vòng 2
  activeEvidenceKey: null, // Tiêu chí đang được xem bằng chứng (Màn 6)
  
  // Trạng thái màn 4 (mô phỏng)
  progCount: 18,
  progState: 'running', // 'running' | 'done' | 'error'

  // Trạng thái màn 7 (bộ tiêu chí)
  criteriaDirty: false,
  criteriaList: JSON.parse(JSON.stringify(RECRUITMENT_DATA.criteria))
};

// ==========================================
// 2. ROUTER ĐIỀU HƯỚNG BẰNG HASH
// ==========================================
const routes = {
  '#vi-tri': 's1',
  '#tieu-chi': 's2',
  '#tai-cv': 's3',
  '#tien-trinh': 's4',
  '#ket-qua': 's5',
  '#chi-tiet': 's6',
  '#chinh-tieu-chi': 's7'
};

function handleRouting() {
  const hash = window.location.hash || '#ket-qua';
  let targetScreen = 's5';

  if (hash.startsWith('#chi-tiet')) {
    targetScreen = 's6';
  } else if (routes[hash]) {
    targetScreen = routes[hash];
  }

  appState.currentScreen = targetScreen;
  updateNavigationUI(targetScreen);

  if (targetScreen === 's4') {
    startSimulation();
  } else {
    if (appState.simInterval) {
      clearInterval(appState.simInterval);
      appState.simInterval = null;
    }
    renderCurrentScreen(targetScreen);
  }
}

function navigateTo(hash) {
  window.location.hash = hash;
}

function updateNavigationUI(screenId) {
  // Cập nhật Sidebar menu
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.getAttribute('data-nav') === screenId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Cập nhật Demo Rail
  document.querySelectorAll('.demo-rail-btn').forEach(btn => {
    if (btn.getAttribute('data-rail') === screenId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Ẩn tất cả screen container, chỉ hiện screen active
  document.querySelectorAll('.screen-view').forEach(sec => {
    sec.classList.remove('active');
  });
  const activeSec = document.getElementById(`screen-${screenId}`);
  if (activeSec) {
    activeSec.classList.add('active');
  }

  // Cập nhật Tiêu đề và Breadcrumb trên Topbar
  const headerTitle = document.getElementById('headerTitle');
  const headerCrumb = document.getElementById('headerCrumb');

  const titles = {
    s1: 'Vị trí tuyển dụng',
    s2: 'JD & Tiêu chí tuyển dụng',
    s3: 'Chọn và tải CV ứng viên',
    s4: 'Tiến trình sàng lọc AI',
    s5: 'Kết quả sàng lọc & Xếp hạng',
    s6: 'Chi tiết kết quả ứng viên',
    s7: 'Chỉnh sửa tiêu chí & Chấm lại'
  };

  const crumbs = {
    s1: 'Tuyển dụng · Danh sách các vị trí đang mở',
    s2: 'Backend Developer · Senior · Hà Nội · 9 tiêu chí chuẩn',
    s3: 'Backend Developer · Tải lên & quản lý 42 file CV',
    s4: 'Backend Developer · Đang phân tích 42 CV',
    s5: 'Backend Developer · Senior · Hà Nội · 42 CV · Sàng lọc 11/09/2026 14:06',
    s6: 'Backend Developer · Nguyễn Văn An (Match Score: 92)',
    s7: 'Backend Developer · Hiệu chỉnh tiêu chí và chấm lại vòng 2'
  };

  if (headerTitle) headerTitle.textContent = titles[screenId] || 'Sàng lọc & Xếp hạng CV';
  if (headerCrumb) headerCrumb.textContent = crumbs[screenId] || '';
}

// ==========================================
// 3. RENDER MÀN 5: KẾT QUẢ SÀNG LỌC & XẾP HẠNG
// ==========================================
function renderScreen5() {
  const container = document.getElementById('s5Content');
  if (!container) return;

  const job = RECRUITMENT_DATA.currentJob;
  const isRound2 = appState.round2Active;

  // Lấy danh sách ứng viên đạt và không đạt
  let passedList = [...RECRUITMENT_DATA.rankingPassed];
  let failedList = [...RECRUITMENT_DATA.rankingFailed];

  // Nếu là vòng 2 (kịch bản chấm lại Docker bắt buộc):
  // Nguyễn Văn An và Trần Minh Bình chuyển sang không đạt
  if (isRound2) {
    // Ứng viên đạt chỉ còn các ứng viên có Docker: Phạm Văn Nam, Đỗ Quang Huy,...
    // Ta cập nhật theo kịch bản vòng 2 chuẩn xác
    passedList = [
      {
        id: 4,
        rank: 1,
        name: "Phạm Văn Nam",
        years: "3 năm",
        yearsNum: 3.0,
        city: "Hà Nội",
        score: 73,
        skillsMatch: ["Python", "FastAPI", "Docker", "REST API"],
        moreMatchCount: 2,
        skillsMiss: ["AWS", "PostgreSQL"],
        comps: { skills: 74, exp: 76, edu: 70, semantic: 72 },
        grade: "Phù hợp",
        passMandatory: true,
        summary: "Đủ yêu cầu bắt buộc và có Docker — trọng số tiêu chí này tăng giúp thứ hạng vươn lên đầu bảng."
      },
      {
        id: 6,
        rank: 4,
        name: "Đỗ Quang Huy",
        years: "2 năm 4 tháng",
        yearsNum: 2.33,
        city: "Hà Nội",
        score: 62,
        skillsMatch: ["Python", "SQL", "REST API", "Docker"],
        moreMatchCount: 2,
        skillsMiss: ["FastAPI khớp một phần"],
        comps: { skills: 60, exp: 70, edu: 70, semantic: 60 },
        grade: "Cần xem thêm",
        passMandatory: true,
        summary: "Có Docker nên vẫn đạt yêu cầu bắt buộc vòng 2. FastAPI vẫn chỉ khớp một phần."
      }
    ];

    failedList = [
      {
        id: 1,
        rank: 20,
        name: "Nguyễn Văn An",
        years: "5 năm 3 tháng",
        yearsNum: 5.25,
        city: "Hà Nội",
        score: 86,
        skillsMatch: ["Python", "FastAPI", "SQL", "REST API"],
        moreMatchCount: 3,
        skillsMiss: ["Docker (Bắt buộc)"],
        comps: { skills: 88, exp: 90, edu: 85, semantic: 94 },
        grade: "Không đạt bắt buộc",
        passMandatory: false,
        summary: "Mất 6 điểm và trượt yêu cầu bắt buộc vì thiếu Docker — tiêu chí này vừa chuyển từ ưu tiên sang bắt buộc. Vẫn giữ trong bảng để người tuyển dụng quyết định."
      },
      {
        id: 2,
        rank: 21,
        name: "Trần Minh Bình",
        years: "4 năm 1 tháng",
        yearsNum: 4.08,
        city: "Hà Nội",
        score: 80,
        skillsMatch: ["Python", "FastAPI", "SQL", "REST API"],
        moreMatchCount: 2,
        skillsMiss: ["Docker (Bắt buộc)", "AWS"],
        comps: { skills: 82, exp: 85, edu: 80, semantic: 89 },
        grade: "Không đạt bắt buộc",
        passMandatory: false,
        summary: "Thiếu Docker và AWS. Docker trở thành bắt buộc khiến ứng viên rơi xuống dưới đường phân cách."
      },
      {
        id: 3,
        rank: 24,
        name: "Lê Thị Hoa",
        years: "3 năm 6 tháng",
        yearsNum: 3.5,
        city: "Hà Nội",
        score: 70,
        skillsMatch: ["Python", "FastAPI", "SQL", "REST API"],
        moreMatchCount: 1,
        skillsMiss: ["Docker (Bắt buộc)", "AWS", "Redis"],
        comps: { skills: 74, exp: 74, edu: 80, semantic: 70 },
        grade: "Không đạt bắt buộc",
        passMandatory: false,
        summary: "Thiếu Docker — tiêu chí bắt buộc mới."
      },
      {
        id: 5,
        rank: 26,
        name: "Vũ Thị Lan",
        years: "2 năm 8 tháng",
        yearsNum: 2.67,
        city: "Hà Nội",
        score: 63,
        skillsMatch: ["Python", "SQL", "REST API"],
        moreMatchCount: 1,
        skillsMiss: ["Docker (Bắt buộc)", "Redis"],
        comps: { skills: 62, exp: 72, edu: 75, semantic: 60 },
        grade: "Không đạt bắt buộc",
        passMandatory: false,
        summary: "Thiếu Docker và Redis."
      },
      ...RECRUITMENT_DATA.rankingFailed
    ];
  }

  // Số lượng ứng viên theo kịch bản
  const totalCVs = 42;
  const passedCount = isRound2 ? 19 : 31;
  const failedCount = isRound2 ? 23 : 11;
  const shortlistCount = appState.shortlistedIds.size > 0 ? appState.shortlistedIds.size : 8;

  // Lọc theo tìm kiếm (Query)
  const q = appState.searchQuery.trim().toLowerCase();
  const filterByQuery = (item) => {
    if (!q) return true;
    return item.name.toLowerCase().includes(q) || 
           item.skillsMatch.some(s => s.toLowerCase().includes(q)) ||
           item.skillsMiss.some(s => s.toLowerCase().includes(q));
  };

  // Lọc theo bộ lọc Tab (Filter)
  let visiblePassed = passedList.filter(filterByQuery);
  let visibleFailed = failedList.filter(filterByQuery);

  if (appState.filter === 'pass') {
    visibleFailed = [];
  } else if (appState.filter === 'fail') {
    visiblePassed = [];
  } else if (appState.filter === 'short') {
    visiblePassed = visiblePassed.filter(item => appState.shortlistedIds.has(item.id));
    visibleFailed = visibleFailed.filter(item => appState.shortlistedIds.has(item.id));
  }

  // Sắp xếp (Sort)
  const sortFn = (a, b) => {
    if (appState.sort === 'name') {
      return a.name.localeCompare(b.name, 'vi');
    }
    if (appState.sort === 'exp') {
      return b.yearsNum - a.yearsNum;
    }
    return b.score - a.score;
  };

  visiblePassed.sort(sortFn);
  visibleFailed.sort(sortFn);

  // Xây dựng HTML
  let html = `
    <div style="max-width: 1200px; margin: 0 auto;">
      
      <!-- Cảnh báo nếu đang xem kết quả Vòng 2 -->
      ${isRound2 ? `
        <div style="background: var(--color-shortlist-bg); border: 1px solid var(--color-shortlist-border); border-left: 4px solid var(--color-shortlist); border-radius: var(--radius-md); padding: 12px 16px; margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <strong style="color: var(--color-shortlist); font-size: 14px;">Đang hiển thị kết quả Vòng 2 (Docker là tiêu chí bắt buộc)</strong>
            <div style="font-size: 12px; color: var(--color-neutral-700); margin-top: 2px;">Số lượng đạt giảm từ 31 xuống 19 ứng viên. 12 ứng viên rơi xuống dưới đường phân cách.</div>
          </div>
          <button type="button" class="btn btn-secondary" onclick="resetToRound1()" style="font-size: 12px;">Quay lại Vòng 1</button>
        </div>
      ` : ''}

      <!-- 4 THẺ CHỈ SỐ TỔNG QUAN -->
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-card-label">Tổng ứng viên</div>
          <div class="metric-card-val-row">
            <span class="metric-card-val">${totalCVs}</span>
            <span class="metric-card-unit">CV đã chấm</span>
          </div>
        </div>

        <div class="metric-card pass">
          <div class="metric-card-label">Đạt yêu cầu bắt buộc</div>
          <div class="metric-card-val-row">
            <span class="metric-card-val">${passedCount}</span>
            <span class="metric-card-unit">${Math.round((passedCount / totalCVs) * 100)}%</span>
          </div>
        </div>

        <div class="metric-card shortlist">
          <div class="metric-card-label">Đề xuất Shortlist</div>
          <div class="metric-card-val-row">
            <span class="metric-card-val">${shortlistCount}</span>
            <span class="metric-card-unit">ứng viên</span>
          </div>
        </div>

        <div class="metric-card fail">
          <div class="metric-card-label">Không đạt bắt buộc</div>
          <div class="metric-card-val-row">
            <span class="metric-card-val">${failedCount}</span>
            <span class="metric-card-unit">${Math.round((failedCount / totalCVs) * 100)}%</span>
          </div>
        </div>
      </div>

      <!-- THANH TÌM KIẾM, BỘ LỌC VÀ SẮP XẾP -->
      <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 16px;">
        
        <!-- Tìm kiếm -->
        <div style="display: flex; align-items: center; gap: 8px; border: 1px solid var(--color-divider); border-radius: var(--radius-md); padding: 6px 10px; background: #fff; min-width: 240px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="opacity: .6;"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg>
          <input type="text" id="filterSearchInput" value="${escapeHtml(appState.searchQuery)}" placeholder="Tìm ứng viên, kỹ năng…" style="border: 0; outline: none; background: transparent; font-size: 13px; width: 100%;" oninput="onSearchChange(this.value)">
        </div>

        <!-- Bộ lọc phân loại (Segmented control) -->
        <div class="seg" role="radiogroup" aria-label="Lọc ứng viên">
          <label class="seg-opt" style="${appState.filter === 'all' ? 'color:var(--color-accent-700);box-shadow:inset 0 0 0 1px var(--color-accent)' : ''}">
            <input type="radio" name="candFilter" value="all" ${appState.filter === 'all' ? 'checked' : ''} onchange="onFilterChange('all')">
            Tất cả (${totalCVs})
          </label>
          <label class="seg-opt" style="${appState.filter === 'pass' ? 'color:var(--color-accent-700);box-shadow:inset 0 0 0 1px var(--color-accent)' : ''}">
            <input type="radio" name="candFilter" value="pass" ${appState.filter === 'pass' ? 'checked' : ''} onchange="onFilterChange('pass')">
            Đạt yêu cầu (${passedCount})
          </label>
          <label class="seg-opt" style="${appState.filter === 'fail' ? 'color:var(--color-accent-700);box-shadow:inset 0 0 0 1px var(--color-accent)' : ''}">
            <input type="radio" name="candFilter" value="fail" ${appState.filter === 'fail' ? 'checked' : ''} onchange="onFilterChange('fail')">
            Không đạt (${failedCount})
          </label>
          <label class="seg-opt" style="${appState.filter === 'short' ? 'color:var(--color-accent-700);box-shadow:inset 0 0 0 1px var(--color-accent)' : ''}">
            <input type="radio" name="candFilter" value="short" ${appState.filter === 'short' ? 'checked' : ''} onchange="onFilterChange('short')">
            Đã Shortlist (${appState.shortlistedIds.size})
          </label>
        </div>

        <!-- Sắp xếp -->
        <div style="margin-left: auto; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 12.5px; color: var(--color-neutral-700);">Sắp xếp</span>
          <select class="input" style="width: auto; min-height: 32px; padding: 4px 8px; font-size: 12.5px; background: #fff;" onchange="onSortChange(this.value)">
            <option value="score" ${appState.sort === 'score' ? 'selected' : ''}>Match Score giảm dần</option>
            <option value="exp" ${appState.sort === 'exp' ? 'selected' : ''}>Kinh nghiệm nhiều nhất</option>
            <option value="name" ${appState.sort === 'name' ? 'selected' : ''}>Tên ứng viên (A–Z)</option>
          </select>
        </div>

      </div>

      <!-- BẢNG XẾP HẠNG 6 CỘT CHUẨN (KHÔNG TRÀN Ở 1440PX) -->
      <div class="ranking-table-card">
        <table class="ranking-table">
          <colgroup>
            <col class="col-rank">
            <col class="col-candidate">
            <col class="col-score">
            <col class="col-skills">
            <col class="col-mandatory">
            <col class="col-actions">
          </colgroup>
          <thead>
            <tr>
              <th style="padding-left: 14px;">Hạng</th>
              <th>Ứng viên</th>
              <th>Match Score</th>
              <th>Kỹ năng khớp & còn thiếu</th>
              <th>Bắt buộc</th>
              <th style="text-align: right; padding-right: 14px;">Hành động</th>
            </tr>
          </thead>
          <tbody>
  `;

  // Render danh sách ĐẠT YÊU CẦU BẮT BUỘC
  if (visiblePassed.length > 0) {
    visiblePassed.forEach(cand => {
      html += renderCandidateRow(cand, true);
    });

    // Thông báo số lượng còn lại (nếu chưa lọc shortlist/query)
    if (!q && appState.filter === 'all' && !isRound2) {
      html += `
        <tr>
          <td colspan="6" style="background: var(--color-neutral-100); color: var(--color-neutral-700); font-size: 12.5px; padding: 10px 16px; border-bottom: 1px solid var(--color-divider);">
            Còn <strong>25 ứng viên</strong> đạt yêu cầu bắt buộc ở các thứ hạng tiếp theo (7–31).
          </td>
        </tr>
      `;
    }
  }

  // QUY TẮC 1: ĐƯỜNG PHÂN CÁCH ỨNG VIÊN KHÔNG ĐẠT YÊU CẦU BẮT BUỘC
  // Ứng viên không đạt yêu cầu bắt buộc vẫn nằm trong bảng xếp hạng,
  // dưới một đường phân cách có chú thích, vẫn đánh số hạng, vẫn thao tác được.
  if (visibleFailed.length > 0 && appState.filter !== 'pass') {
    html += `
      <tr class="mandatory-divider-row">
        <td colspan="6">
          <div class="mandatory-divider-box">
            <span class="mandatory-divider-title">Không đạt yêu cầu bắt buộc — ${failedCount} ứng viên</span>
            <span class="mandatory-divider-desc">Vẫn được chấm điểm, vẫn giữ thứ hạng và vẫn thao tác được. AI gợi ý, bạn là người quyết định.</span>
          </div>
        </td>
      </tr>
    `;

    visibleFailed.forEach(cand => {
      html += renderCandidateRow(cand, false);
    });
  }

  // Trạng thái không có kết quả tìm kiếm
  if (visiblePassed.length === 0 && visibleFailed.length === 0) {
    html += `
      <tr>
        <td colspan="6" style="padding: 48px 16px; text-align: center;">
          <div style="font-family: var(--font-heading); font-size: 20px; color: var(--color-text);">Không tìm thấy ứng viên phù hợp</div>
          <div style="font-size: 13px; color: var(--color-neutral-700); margin-top: 6px;">Thử thay đổi từ khoá tìm kiếm hoặc chuyển bộ lọc sang "Tất cả".</div>
          <button type="button" class="btn btn-ghost" onclick="resetFilters()" style="margin-top: 10px;">Xoá bộ lọc</button>
        </td>
      </tr>
    `;
  }

  html += `
          </tbody>
        </table>
      </div>

      <!-- DÒNG CHÚ THÍCH SEMANTIC MATCHING DƯỚI BẢNG -->
      <div style="margin-top: 14px; display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--color-neutral-700);">
        <span>Semantic Matching nằm trong 4 điểm thành phần, mở rộng dòng để xem chi tiết.</span>
        <button type="button" class="btn btn-ghost" onclick="toggleSemanticTip()" style="font-size: 12px; text-decoration: underline; padding: 0 4px;">Semantic Matching là gì?</button>
      </div>

      ${appState.tipSemanticOpen ? `
        <div style="margin-top: 8px; max-width: 580px; border: 1px solid var(--color-accent-400); border-radius: var(--radius-md); background: var(--color-accent-100); padding: 12px 16px; font-size: 13px; line-height: 1.6; color: var(--color-accent-900); animation: fadeIn 0.2s ease;">
          <strong>Semantic Matching:</strong> Hệ thống so sánh ngữ nghĩa cách ứng viên kể về công việc trong CV với yêu cầu trong JD, nhận diện chính xác năng lực tương đương dù hai bên sử dụng thuật ngữ hoặc cách diễn đạt khác nhau.
        </div>
      ` : ''}

    </div>
  `;

  container.innerHTML = html;
}

// Render từng hàng ứng viên (6 cột)
function renderCandidateRow(cand, isPassed) {
  const isExpanded = appState.expandedIds.has(cand.id);
  const isShortlisted = appState.shortlistedIds.has(cand.id);
  const isRejected = appState.rejectedIds.has(cand.id);

  const rowClasses = [
    isShortlisted ? 'row-shortlisted' : '',
    isRejected ? 'row-rejected' : ''
  ].filter(Boolean).join(' ');

  let html = `
    <tr class="${rowClasses}">
      <!-- Cột 1: Hạng + Icon Toggle mở rộng dòng -->
      <td style="padding-left: 14px;">
        <div class="rank-box">
          <button type="button" class="toggle-exp-btn ${isExpanded ? 'expanded' : ''}" onclick="toggleRowExpand(${cand.id})" title="Xem 4 điểm thành phần">
            ▶
          </button>
          <span class="rank-number" style="color: ${isPassed ? 'var(--color-text)' : 'var(--color-neutral-600)'}">${cand.rank}</span>
        </div>
      </td>

      <!-- Cột 2: Ứng viên -->
      <td>
        <button type="button" class="candidate-name-btn" onclick="openCandidateDetail(${cand.id})">${escapeHtml(cand.name)}</button>
        <div class="candidate-subtext">${escapeHtml(cand.years)} kinh nghiệm · ${escapeHtml(cand.city)}</div>
        ${isShortlisted ? `
          <div class="tag-shortlisted">
            <span>★</span> Trong Shortlist
          </div>
        ` : ''}
        ${isRejected ? `
          <span class="tag" style="background:var(--color-fail-bg);color:var(--color-fail);border:1px solid var(--color-fail-border);margin-top:4px;">Đã loại</span>
        ` : ''}
      </td>

      <!-- Cột 3: Match Score -->
      <td>
        <div class="score-wrapper">
          <div class="score-number-row">
            <span class="score-num" style="color: ${isPassed ? 'var(--color-accent-700)' : 'var(--color-fail)'}">${cand.score}</span>
            <span class="score-max">/ 100</span>
          </div>
          <div class="score-bar-bg">
            <div class="score-bar-fill" style="width: ${cand.score}%; background: ${isPassed ? 'var(--color-accent-600)' : 'var(--color-fail)'};"></div>
          </div>
        </div>
      </td>

      <!-- Cột 4: Kỹ năng khớp & thiếu (Gộp gọn gàng trong 1 ô) -->
      <td>
        <div class="skills-cell">
          <div class="skills-group">
            <span class="skills-group-label match">✓ Khớp</span>
            ${cand.skillsMatch.slice(0, 3).map(skill => `
              <span class="skill-chip match">${escapeHtml(skill)}</span>
            `).join('')}
            ${cand.moreMatchCount ? `<span class="skill-more-badge">+${cand.moreMatchCount}</span>` : ''}
          </div>
          <div class="skills-group">
            <span class="skills-group-label miss">✕ Thiếu</span>
            ${cand.skillsMiss.map(skill => `
              <span class="skill-chip miss">${escapeHtml(skill)}</span>
            `).join('')}
          </div>
        </div>
      </td>

      <!-- Cột 5: Trạng thái Bắt buộc (Đủ 3 lớp: Màu, Icon, Chữ) -->
      <td>
        <span class="mandatory-badge ${isPassed ? 'pass' : 'fail'}">
          <span>${isPassed ? '✓' : '✕'}</span>
          <span>${isPassed ? 'Đạt' : 'Không đạt'}</span>
        </span>
      </td>

      <!-- Cột 6: Hành động -->
      <td style="text-align: right; padding-right: 14px;">
        <div class="action-btn-group" style="justify-content: flex-end;">
          <button type="button" class="btn btn-secondary btn-action" onclick="openCandidateDetail(${cand.id})">Chi tiết</button>
          
          <button type="button" class="btn btn-action ${isShortlisted ? 'btn-action-shortlist active' : 'btn-action-shortlist'}" onclick="openShortlistModal(${cand.id})" ${isRejected ? 'disabled' : ''}>
            ${isShortlisted ? '★ Shortlist' : (isPassed ? 'Shortlist' : 'Vẫn shortlist')}
          </button>

          <button type="button" class="btn btn-secondary btn-action" style="color: var(--color-fail);" onclick="openRejectModal(${cand.id})" ${isRejected ? 'disabled' : ''}>
            Loại
          </button>
        </div>
      </td>
    </tr>
  `;

  // DÒNG MỞ RỘNG (ACCORDION) HIỆN 4 ĐIỂM THÀNH PHẦN & GIẢI THÍCH AI
  if (isExpanded) {
    html += `
      <tr class="expand-row">
        <td colspan="6">
          <div class="expand-content-grid">
            
            <!-- Cột trái: 4 Điểm thành phần -->
            <div>
              <div class="expand-card-title">Bốn điểm thành phần</div>
              
              <div class="sub-score-row">
                <span class="sub-score-label">Kỹ năng</span>
                <div class="sub-score-bar-bg"><div class="sub-score-bar-fill" style="width: ${cand.comps.skills}%;"></div></div>
                <span class="sub-score-val">${cand.comps.skills}</span>
              </div>

              <div class="sub-score-row">
                <span class="sub-score-label">Kinh nghiệm</span>
                <div class="sub-score-bar-bg"><div class="sub-score-bar-fill" style="width: ${cand.comps.exp}%;"></div></div>
                <span class="sub-score-val">${cand.comps.exp}</span>
              </div>

              <div class="sub-score-row">
                <span class="sub-score-label">Học vấn</span>
                <div class="sub-score-bar-bg"><div class="sub-score-bar-fill" style="width: ${cand.comps.edu}%;"></div></div>
                <span class="sub-score-val">${cand.comps.edu}</span>
              </div>

              <div class="sub-score-row">
                <span class="sub-score-label" style="font-weight: 600; color: var(--color-accent-2-800);">Semantic Matching</span>
                <div class="sub-score-bar-bg"><div class="sub-score-bar-fill" style="width: ${cand.comps.semantic}%; background: var(--color-ai);"></div></div>
                <span class="sub-score-val" style="color: var(--color-accent-800);">${cand.comps.semantic}</span>
              </div>
            </div>

            <!-- Cột phải: Giải thích của AI -->
            <div>
              <div class="expand-card-title">Giải thích của AI</div>
              <p class="ai-summary-text">${escapeHtml(cand.summary)}</p>
              <button type="button" class="btn btn-ghost" onclick="openCandidateDetail(${cand.id})" style="font-size: 12.5px; padding-left: 0;">
                Mở hồ sơ đối chiếu và CV gốc →
              </button>
            </div>

          </div>
        </td>
      </tr>
    `;
  }

  return html;
}

// ==========================================
// 4. XỬ LÝ TƯƠNG TÁC MÀN 5 (FILTERS, SORTS, MODALS)
// ==========================================
function toggleRowExpand(id) {
  if (appState.expandedIds.has(id)) {
    appState.expandedIds.delete(id);
  } else {
    appState.expandedIds.add(id);
  }
  renderScreen5();
}

function onSearchChange(val) {
  appState.searchQuery = val;
  renderScreen5();
}

function onFilterChange(filterVal) {
  appState.filter = filterVal;
  renderScreen5();
}

function onSortChange(sortVal) {
  appState.sort = sortVal;
  renderScreen5();
}

function resetFilters() {
  appState.searchQuery = '';
  appState.filter = 'all';
  const searchInput = document.getElementById('filterSearchInput');
  if (searchInput) searchInput.value = '';
  renderScreen5();
}

function toggleSemanticTip() {
  appState.tipSemanticOpen = !appState.tipSemanticOpen;
  renderScreen5();
}

function openCandidateDetail(id) {
  navigateTo(`#chi-tiet/${id}`);
}

function findCandidate(id) {
  const all = [...RECRUITMENT_DATA.rankingPassed, ...RECRUITMENT_DATA.rankingFailed];
  return all.find(c => c.id === id) || RECRUITMENT_DATA.rankingPassed[0];
}

// Hộp thoại Shortlist
function openShortlistModal(id) {
  const cand = findCandidate(id);
  appState.modalCandidate = cand;

  document.getElementById('modalSlName').textContent = cand.name;
  document.getElementById('modalSlMeta').textContent = `${cand.years} kinh nghiệm · ${cand.city}`;
  document.getElementById('modalSlScore').textContent = cand.score;
  
  const passEl = document.getElementById('modalSlPass');
  if (cand.passMandatory) {
    passEl.textContent = '✓ Đạt toàn bộ 5 tiêu chí';
    passEl.style.color = 'var(--color-pass)';
  } else {
    passEl.textContent = '✕ Không đạt bắt buộc — vẫn shortlist được';
    passEl.style.color = 'var(--color-fail)';
  }

  document.getElementById('modalSlGrade').textContent = cand.grade || 'Phù hợp';
  document.getElementById('modalShortlist').style.display = 'grid';
}

function closeShortlistModal() {
  document.getElementById('modalShortlist').style.display = 'none';
  appState.modalCandidate = null;
}

function confirmShortlist() {
  if (appState.modalCandidate) {
    const id = appState.modalCandidate.id;
    if (appState.shortlistedIds.has(id)) {
      appState.shortlistedIds.delete(id);
    } else {
      appState.shortlistedIds.add(id);
      appState.rejectedIds.delete(id); // Nếu đã shortlist thì bỏ loại
    }
  }
  closeShortlistModal();
  renderCurrentScreen(appState.currentScreen);
}

// Hộp thoại Loại (Reject)
function openRejectModal(id) {
  const cand = findCandidate(id);
  appState.modalCandidate = cand;
  document.getElementById('modalRejName').textContent = cand.name;
  document.getElementById('modalReject').style.display = 'grid';
}

function closeRejectModal() {
  document.getElementById('modalReject').style.display = 'none';
  appState.modalCandidate = null;
}

function confirmReject() {
  if (appState.modalCandidate) {
    const id = appState.modalCandidate.id;
    appState.rejectedIds.add(id);
    appState.shortlistedIds.delete(id);
  }
  closeRejectModal();
  renderCurrentScreen(appState.currentScreen);
}

function resetToRound1() {
  appState.round2Active = false;
  renderScreen5();
}

// ==========================================
// 5. STUBS CHO CÁC MÀN KHÁC (SẼ LÀM TUẦN TỰ)
// ==========================================
function renderCurrentScreen(screenId) {
  switch (screenId) {
    case 's1': renderScreen1(); break;
    case 's2': renderScreen2(); break;
    case 's3': renderScreen3(); break;
    case 's4': renderScreen4(); break;
    case 's5': renderScreen5(); break;
    case 's6': renderScreen6(); break;
    case 's7': renderScreen7(); break;
    default: renderScreen5(); break;
  }
}

function renderScreen1() {
  const container = document.getElementById('s1Content');
  if (!container) return;

  const showEmpty = appState.s1EmptyState || false;
  const searchQ = (appState.s1Search || '').trim().toLowerCase();
  const statusFilter = appState.s1StatusFilter || 'all';
  const sortOption = appState.s1Sort || 'recent';

  let jobs = [...RECRUITMENT_DATA.jobs];

  // Lọc theo tìm kiếm
  if (searchQ) {
    jobs = jobs.filter(j => j.title.toLowerCase().includes(searchQ) || j.city.toLowerCase().includes(searchQ) || j.level.toLowerCase().includes(searchQ));
  }

  // Lọc theo trạng thái
  if (statusFilter !== 'all') {
    jobs = jobs.filter(j => j.status === statusFilter);
  }

  // Sắp xếp
  if (sortOption === 'cvCount') {
    jobs.sort((a, b) => b.cvCount - a.cvCount);
  } else if (sortOption === 'title') {
    jobs.sort((a, b) => a.title.localeCompare(b.title, 'vi'));
  }

  let html = `
    <div style="max-width: 1180px; margin: 0 auto;">

      <!-- TIÊU ĐỀ MÀN 1 & NÚT CHUYỂN TRẠNG THÁI TRỐNG -->
      <div style="display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 14px; margin-bottom: 6px;">
        <div>
          <h2 style="margin: 0; font-size: 28px; line-height: 1.15;">Sàng lọc & Xếp hạng CV</h2>
          <p style="margin: 6px 0 0; color: var(--color-neutral-700); font-size: 14px;">
            Chọn vị trí tuyển dụng để bắt đầu đối chiếu tiêu chí và sàng lọc hồ sơ ứng viên.
          </p>
        </div>

        <div style="display: flex; gap: 10px; align-items: center;">
          <button type="button" class="btn btn-ghost" onclick="toggleS1EmptyState()" style="font-size: 12.5px;">
            ${showEmpty ? 'Xem bảng có dữ liệu' : 'Xem trạng thái trống'}
          </button>
          <button type="button" class="btn btn-primary" onclick="alert('Mở biểu mẫu tạo vị trí tuyển dụng mới...')" style="font-weight: 600;">
            + Tạo vị trí mới
          </button>
        </div>
      </div>

      <hr class="hr" style="margin: 16px 0 20px;">

      ${showEmpty ? `
        <!-- TRẠNG THÁI TRỐNG (EMPTY STATE) -->
        <div class="card-panel" style="padding: 56px 28px; text-align: center; margin-bottom: 20px;">
          <div style="width: 52px; height: 52px; margin: 0 auto 14px; border-radius: 50%; background: var(--color-accent-100); color: var(--color-accent-700); display: grid; place-items: center;">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
          </div>
          <div style="font-family: var(--font-heading); font-size: 26px; font-weight: 700; color: var(--color-text);">Chưa có vị trí tuyển dụng nào</div>
          <p style="max-width: 440px; margin: 10px auto 20px; color: var(--color-neutral-700); font-size: 14px; line-height: 1.6;">
            Tạo vị trí đầu tiên và dán mô tả công việc (JD) vào — hệ thống AI sẽ tự động bóc tách các tiêu chí bắt buộc và ưu tiên để bạn xem xét.
          </p>
          <button type="button" class="btn btn-primary" onclick="toggleS1EmptyState()" style="padding: 8px 18px;">
            Tạo vị trí tuyển dụng mẫu
          </button>
        </div>
      ` : `
        <!-- BẢNG DANH SÁCH CÁC VỊ TRÍ TUYỂN DỤNG -->
        <div>
          <!-- THANH CÔNG CỤ TÌM KIẾM & BỘ LỌC -->
          <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 16px;">
            
            <!-- Ô tìm kiếm vị trí -->
            <div style="display: flex; align-items: center; gap: 8px; border: 1px solid var(--color-divider); border-radius: var(--radius-md); padding: 6px 10px; background: #fff; min-width: 250px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="opacity: .6;"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg>
              <input type="text" value="${escapeHtml(appState.s1Search || '')}" placeholder="Tìm theo tên vị trí, địa điểm…" style="border: 0; outline: none; background: transparent; font-size: 13px; width: 100%;" oninput="onS1SearchChange(this.value)">
            </div>

            <!-- Lọc trạng thái -->
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--color-neutral-700);">
              Trạng thái
              <select class="input" style="width: auto; min-height: 32px; padding: 4px 8px; font-size: 12.5px; background: #fff;" onchange="onS1StatusChange(this.value)">
                <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>Tất cả</option>
                <option value="Đang tuyển" ${statusFilter === 'Đang tuyển' ? 'selected' : ''}>Đang tuyển</option>
                <option value="Đã đóng" ${statusFilter === 'Đã đóng' ? 'selected' : ''}>Đã đóng</option>
                <option value="Nháp" ${statusFilter === 'Nháp' ? 'selected' : ''}>Nháp</option>
              </select>
            </label>

            <!-- Sắp xếp -->
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--color-neutral-700); margin-left: auto;">
              Sắp xếp
              <select class="input" style="width: auto; min-height: 32px; padding: 4px 8px; font-size: 12.5px; background: #fff;" onchange="onS1SortChange(this.value)">
                <option value="recent" ${sortOption === 'recent' ? 'selected' : ''}>Sàng lọc gần nhất</option>
                <option value="cvCount" ${sortOption === 'cvCount' ? 'selected' : ''}>Số CV nhiều nhất</option>
                <option value="title" ${sortOption === 'title' ? 'selected' : ''}>Tên vị trí (A–Z)</option>
              </select>
            </label>

          </div>

          <!-- BẢNG CÁC VỊ TRÍ -->
          <div class="ranking-table-card">
            <table class="table" style="min-width: 960px; font-size: 13.5px;">
              <thead>
                <tr>
                  <th style="padding-left: 18px;">Vị trí tuyển dụng</th>
                  <th style="width: 120px;">Cấp bậc</th>
                  <th style="width: 140px;">Địa điểm</th>
                  <th style="text-align: right; width: 110px;">CV đã nhận</th>
                  <th style="text-align: right; width: 130px;">Trong Shortlist</th>
                  <th style="width: 120px;">Trạng thái</th>
                  <th style="width: 160px;">Sàng lọc gần nhất</th>
                  <th style="width: 170px; text-align: right; padding-right: 18px;"></th>
                </tr>
              </thead>
              <tbody>
                ${jobs.map(job => {
                  const isCurrent = job.isScreening;
                  return `
                    <tr style="${isCurrent ? 'background: #f7fafd;' : ''}">
                      <td style="padding-left: 18px;">
                        <span style="font-family: var(--font-heading); font-size: 17px; font-weight: 700; color: var(--color-text);">
                          ${escapeHtml(job.title)}
                        </span>
                        ${isCurrent ? '<div style="font-size: 11px; color: var(--color-accent-700); font-weight: 600; margin-top: 1px;">● Vị trí đang sàng lọc</div>' : ''}
                      </td>
                      <td style="color: var(--color-text);">${escapeHtml(job.level)}</td>
                      <td style="color: var(--color-text);">${escapeHtml(job.city)}</td>
                      <td style="text-align: right; font-family: var(--font-sans); font-size: 15px; font-weight: 700; font-feature-settings: 'tnum' 1;">
                        ${job.cvCount}
                      </td>
                      <td style="text-align: right; font-family: var(--font-sans); font-size: 15px; font-weight: 700; font-feature-settings: 'tnum' 1; color: ${job.shortlistCount > 0 ? 'var(--color-shortlist)' : 'var(--color-neutral-600)'};">
                        ${job.shortlistCount}
                      </td>
                      <td>
                        <span class="tag tag-neutral" style="font-weight: 500;">${escapeHtml(job.status)}</span>
                      </td>
                      <td style="font-size: 12.5px; color: var(--color-neutral-700); font-feature-settings: 'lnum' 1, 'tnum' 1;">
                        ${escapeHtml(job.lastScreened)}
                      </td>
                      <td style="text-align: right; padding-right: 18px;">
                        ${isCurrent ? `
                          <button type="button" class="btn btn-primary" onclick="navigateTo('#ket-qua')" style="font-size: 12.5px; padding: 5px 12px; font-weight: 600; white-space: nowrap;">
                            Xem kết quả (42 CV) →
                          </button>
                        ` : `
                          <button type="button" class="btn btn-secondary" onclick="alert('Chức năng sàng lọc cho vị trí này sẽ khả dụng ở phiên bản mở rộng.')" style="font-size: 12.5px; padding: 5px 12px; white-space: nowrap;">
                            Bắt đầu sàng lọc
                          </button>
                        `}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `}

    </div>
  `;

  container.innerHTML = html;
}

function toggleS1EmptyState() {
  appState.s1EmptyState = !appState.s1EmptyState;
  renderScreen1();
}

function onS1SearchChange(val) {
  appState.s1Search = val;
  renderScreen1();
}

function onS1StatusChange(val) {
  appState.s1StatusFilter = val;
  renderScreen1();
}

function onS1SortChange(val) {
  appState.s1Sort = val;
  renderScreen1();
}

function renderScreen2() {
  const container = document.getElementById('s2Content');
  if (!container) return;

  const critList = appState.criteriaList;
  const mandatoryList = critList.filter(c => c.type === 'mandatory');
  const preferredList = critList.filter(c => c.type === 'preferred');
  const totalW = critList.reduce((sum, c) => sum + Number(c.weight), 0);

  let html = `
    <div style="max-width: 1240px; margin: 0 auto;">
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 26px; align-items: start;">

        <!-- CỘT TRÁI: MÔ TẢ CÔNG VIỆC GỐC (JD GỐC) -->
        <section class="card-panel" style="padding: 24px;">
          <div style="font-size: 11.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-accent-700); font-weight: 600;">
            Mô tả công việc gốc
          </div>
          
          <h2 style="margin: 8px 0 4px; font-size: 26px; line-height: 1.15;">Backend Developer</h2>
          <div style="font-size: 13px; color: var(--color-neutral-700); margin-bottom: 14px;">
            Cấp Senior · Hà Nội · Cập nhật 09/09/2026 lúc 10:22
          </div>

          <hr class="hr" style="margin: 14px 0 18px;">

          <div style="font-size: 14px; line-height: 1.75; text-align: justify; color: var(--color-text);">
            <p>
              Chúng tôi tìm kiếm một <strong>Kỹ sư Backend cấp cao (Senior Backend Developer)</strong> tham gia vào đội ngũ phát triển nền tảng hệ thống thanh toán nội bộ, chịu trách nhiệm thiết kế, tối ưu kiến trúc và vận hành các dịch vụ phân tán chịu tải cao.
            </p>

            <h4 style="margin: 16px 0 6px; font-size: 16px; color: var(--color-text);">Yêu cầu công việc (Bắt buộc)</h4>
            <p>
              Thành thạo ngôn ngữ lập trình <strong>Python</strong> và có kinh nghiệm thực tế sâu sắc với <strong>FastAPI</strong> trong môi trường sản phẩm thực tế. Nắm vững bản chất của <strong>SQL</strong>, kỹ thuật thiết kế lược đồ và tối ưu hoá truy vấn trên các hệ quản trị cơ sở dữ liệu quan hệ. Có khả năng thiết kế <strong>REST API</strong> rõ ràng, chuẩn mực, có tài liệu chi tiết phục vụ tích hợp giữa nhiều nhóm sản phẩm. Yêu cầu <strong>tối thiểu hai năm kinh nghiệm</strong> làm việc thực tế trong lĩnh vực phát triển backend.
            </p>

            <h4 style="margin: 16px 0 6px; font-size: 16px; color: var(--color-text);">Điểm cộng ưu tiên</h4>
            <p>
              Có kinh nghiệm đóng gói ứng dụng và tự động hoá triển khai bằng <strong>Docker</strong>; từng làm việc thực tế với hạ tầng đám mây <strong>AWS</strong> (EC2, S3, RDS); sử dụng thành thạo <strong>PostgreSQL</strong> ở quy mô sản phẩm chịu tải lớn; am hiểu và ứng dụng <strong>Redis</strong> cho bộ nhớ đệm (caching) hoặc hàng đợi tác vụ nền (background task queues).
            </p>

            <div style="margin-top: 20px; padding: 12px 14px; background: var(--color-neutral-100); border-radius: var(--radius-sm); border-left: 3px solid var(--color-accent); font-size: 12.5px; line-height: 1.6; color: var(--color-neutral-800);">
              💡 Hệ thống AI Recruitment Assistant đã tự động bóc tách <strong>${critList.length} tiêu chí đo lường được</strong> từ văn bản JD này. Bạn có thể xem lại cấu trúc tiêu chí bên cột phải.
            </div>
          </div>
        </section>

        <!-- CỘT PHẢI: TIÊU CHÍ TUYỂN DỤNG ĐÃ BÓC TÁCH -->
        <section>
          <div style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px;">
            <h3 style="margin: 0; font-size: 22px;">Tiêu chí tuyển dụng</h3>
            <span style="font-size: 13px; color: var(--color-neutral-700); font-weight: 500;">
              ${critList.length} tiêu chí · Tổng trọng số ${totalW}
            </span>
          </div>

          <!-- Nhóm 1: Yêu cầu bắt buộc (Viền nhấn màu accent) -->
          <div class="card-panel highlight-border" style="margin-bottom: 18px; padding: 20px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
              <span style="font-family: var(--font-heading); font-size: 18px; font-weight: 700; color: var(--color-text);">Yêu cầu bắt buộc</span>
              <span class="tag tag-accent" style="font-weight: 600;">Quyết định đỗ / trượt</span>
            </div>
            <div style="font-size: 12.5px; color: var(--color-neutral-700); margin-bottom: 14px; line-height: 1.5;">
              Thiếu bất kỳ tiêu chí nào ở nhóm này, ứng viên vẫn được chấm điểm đầy đủ nhưng sẽ bị xếp xuống dưới đường phân cách (nhóm không đạt).
            </div>

            <div style="display: flex; flex-direction: column;">
              ${mandatoryList.map(c => `
                <div style="display: flex; align-items: center; gap: 14px; padding: 10px 0; border-top: 1px solid var(--color-divider);">
                  <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 13.5px; font-weight: 600; color: var(--color-text);">${escapeHtml(c.label)}</div>
                    <div style="font-size: 11.5px; color: var(--color-neutral-700);">
                      ${escapeHtml(c.kind)}${c.minYears ? ` · tối thiểu ${c.minYears} năm` : ''}
                    </div>
                  </div>
                  
                  <!-- Thanh trọng số -->
                  <div style="width: 110px; height: 7px; background: var(--color-neutral-300); border-radius: 2px; overflow: hidden;">
                    <div style="height: 100%; width: ${(c.weight / 22) * 100}%; background: var(--color-accent-600);"></div>
                  </div>

                  <div style="width: 44px; text-align: right; font-family: var(--font-sans); font-size: 15px; font-weight: 700; font-feature-settings: 'tnum' 1; color: var(--color-accent-800);">
                    ${c.weight}%
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Nhóm 2: Yêu cầu ưu tiên -->
          <div class="card-panel" style="padding: 20px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
              <span style="font-family: var(--font-heading); font-size: 18px; font-weight: 700; color: var(--color-text);">Yêu cầu ưu tiên</span>
              <span class="tag tag-neutral" style="font-weight: 500;">Điểm cộng</span>
            </div>
            <div style="font-size: 12.5px; color: var(--color-neutral-700); margin-bottom: 14px; line-height: 1.5;">
              Thiếu tiêu chí nhóm này thì bị trừ điểm tương ứng, nhưng không bị đánh trượt yêu cầu bắt buộc.
            </div>

            <div style="display: flex; flex-direction: column;">
              ${preferredList.map(c => `
                <div style="display: flex; align-items: center; gap: 14px; padding: 10px 0; border-top: 1px solid var(--color-divider);">
                  <div style="flex: 1; min-width: 0; font-size: 13.5px; font-weight: 500; color: var(--color-text);">
                    ${escapeHtml(c.label)}
                  </div>
                  
                  <!-- Thanh trọng số -->
                  <div style="width: 110px; height: 7px; background: var(--color-neutral-300); border-radius: 2px; overflow: hidden;">
                    <div style="height: 100%; width: ${(c.weight / 22) * 100}%; background: var(--color-neutral-600);"></div>
                  </div>

                  <div style="width: 44px; text-align: right; font-family: var(--font-sans); font-size: 15px; font-weight: 700; font-feature-settings: 'tnum' 1; color: var(--color-neutral-800);">
                    ${c.weight}%
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Nút điều hướng -->
          <div style="display: flex; gap: 12px; margin-top: 20px; align-items: center;">
            <button type="button" class="btn btn-secondary" onclick="navigateTo('#chinh-tieu-chi')">
              Chỉnh sửa tiêu chí
            </button>
            <button type="button" class="btn btn-primary" onclick="navigateTo('#tai-cv')" style="font-weight: 600;">
              Tiếp tục chọn CV (42 CV) →
            </button>
          </div>

        </section>

      </div>

    </div>
  `;

  container.innerHTML = html;
}

function renderScreen3() {
  const container = document.getElementById('s3Content');
  if (!container) return;

  const allCvs = RECRUITMENT_DATA.cvUploads;
  const showEmpty = appState.s3EmptyState || false;
  const filter = appState.s3Filter || 'all';

  const parsedCount = allCvs.filter(c => c.status === 'parsed').length;
  const parsingCount = allCvs.filter(c => c.status === 'parsing').length;
  const dupCount = allCvs.filter(c => c.status === 'duplicate').length;
  const errCount = allCvs.filter(c => c.status === 'error').length;

  let filteredList = allCvs;
  if (filter !== 'all') {
    filteredList = allCvs.filter(c => c.status === filter);
  }

  let html = `
    <div style="max-width: 1140px; margin: 0 auto;">

      <!-- KHU VỰC KÉO THẢ TẢI FILE CV (DROPZONE) -->
      <div style="border: 2px dashed var(--color-neutral-400); border-radius: var(--radius-md); background: var(--color-surface); padding: 36px 24px; text-align: center; margin-bottom: 24px;">
        <div style="width: 48px; height: 48px; margin: 0 auto 12px; border-radius: 50%; background: var(--color-accent-100); color: var(--color-accent-700); display: grid; place-items: center;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
        </div>
        <div style="font-family: var(--font-heading); font-size: 22px; font-weight: 700; color: var(--color-text);">Kéo thả CV vào đây để phân tích</div>
        <div style="font-size: 13px; color: var(--color-neutral-700); margin: 6px auto 16px; max-width: 480px;">
          Hỗ trợ định dạng PDF hoặc DOCX, tối đa 10 MB mỗi file · Có thể chọn đồng thời 42 file để hệ thống trích xuất thông tin tự động.
        </div>
        <div style="display: flex; justify-content: center; gap: 10px;">
          <button type="button" class="btn btn-primary" onclick="alert('Mở hộp thoại chọn file CV từ máy tính...')">
            Chọn file từ máy tính
          </button>
          <button type="button" class="btn btn-ghost" onclick="toggleS3EmptyState()" style="font-size: 12px;">
            ${showEmpty ? 'Xem bảng 42 CV mẫu' : 'Xem giao diện khi chưa có CV'}
          </button>
        </div>
      </div>

      ${showEmpty ? `
        <!-- GIAO DIỆN TRẠNG THÁI TRỐNG (EMPTY STATE) -->
        <div class="card-panel" style="padding: 48px 24px; text-align: center; margin-bottom: 24px;">
          <div style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-accent-700); font-weight: 700;">Trạng thái trống</div>
          <div style="font-family: var(--font-heading); font-size: 24px; margin: 8px 0;">Chưa có CV nào được chọn</div>
          <p style="font-size: 13.5px; color: var(--color-neutral-700); max-width: 460px; margin: 0 auto 16px;">
            Kéo thả hoặc tải lên các tệp hồ sơ ứng viên để AI trích xuất kỹ năng, kinh nghiệm và đối chiếu với tiêu chí tuyển dụng.
          </p>
          <button type="button" class="btn btn-secondary" onclick="toggleS3EmptyState()">Tải 42 CV mẫu của vị trí Backend Developer</button>
        </div>
      ` : `
        <!-- BẢNG DANH SÁCH 42 CV ĐÃ CHỌN -->
        <div>
          <!-- Header danh sách & Bộ lọc nhanh trạng thái -->
          <div style="display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 12px;">
            <div style="display: flex; align-items: baseline; gap: 10px;">
              <h3 style="margin: 0; font-size: 20px;">CV đã chọn</h3>
              <span style="font-size: 13px; font-weight: 600; color: var(--color-accent-800); background: var(--color-accent-100); border: 1px solid var(--color-accent-300); padding: 2px 8px; border-radius: var(--radius-sm);">
                ${allCvs.length} file đầy đủ
              </span>
            </div>

            <!-- Phân loại 4 trạng thái -->
            <div class="seg" role="radiogroup">
              <label class="seg-opt" style="${filter === 'all' ? 'color:var(--color-accent-700);box-shadow:inset 0 0 0 1px var(--color-accent)' : ''}">
                <input type="radio" name="s3FilterRadio" value="all" ${filter === 'all' ? 'checked' : ''} onchange="setS3Filter('all')">
                Tất cả (${allCvs.length})
              </label>
              <label class="seg-opt" style="${filter === 'parsed' ? 'color:var(--color-accent-700);box-shadow:inset 0 0 0 1px var(--color-accent)' : ''}">
                <input type="radio" name="s3FilterRadio" value="parsed" ${filter === 'parsed' ? 'checked' : ''} onchange="setS3Filter('parsed')">
                ✓ Đã phân tích (${parsedCount})
              </label>
              <label class="seg-opt" style="${filter === 'parsing' ? 'color:var(--color-accent-700);box-shadow:inset 0 0 0 1px var(--color-accent)' : ''}">
                <input type="radio" name="s3FilterRadio" value="parsing" ${filter === 'parsing' ? 'checked' : ''} onchange="setS3Filter('parsing')">
                ● Đang phân tích (${parsingCount})
              </label>
              <label class="seg-opt" style="${filter === 'duplicate' ? 'color:var(--color-accent-700);box-shadow:inset 0 0 0 1px var(--color-accent)' : ''}">
                <input type="radio" name="s3FilterRadio" value="duplicate" ${filter === 'duplicate' ? 'checked' : ''} onchange="setS3Filter('duplicate')">
                ! Trùng lặp (${dupCount})
              </label>
              <label class="seg-opt" style="${filter === 'error' ? 'color:var(--color-accent-700);box-shadow:inset 0 0 0 1px var(--color-accent)' : ''}">
                <input type="radio" name="s3FilterRadio" value="error" ${filter === 'error' ? 'checked' : ''} onchange="setS3Filter('error')">
                ✕ Lỗi (${errCount})
              </label>
            </div>
          </div>

          <!-- Bảng cuộn danh sách 42 file -->
          <div class="ranking-table-card" style="max-height: 520px; overflow-y: auto;">
            <table class="table" style="min-width: 820px; font-size: 13px;">
              <thead style="position: sticky; top: 0; z-index: 10; background: var(--color-neutral-100);">
                <tr>
                  <th style="padding-left: 18px; width: 44px;">STT</th>
                  <th>Tên tệp</th>
                  <th>Ứng viên</th>
                  <th style="width: 140px;">Thời gian tải</th>
                  <th style="min-width: 320px; padding-right: 18px;">Trạng thái phân tích</th>
                </tr>
              </thead>
              <tbody>
                ${filteredList.map((f, index) => {
                  let statusColor = 'var(--color-pass)';
                  let statusBg = 'var(--color-pass-bg)';
                  let statusBorder = 'var(--color-pass-border)';

                  if (f.status === 'parsing') {
                    statusColor = 'var(--color-accent-800)';
                    statusBg = 'var(--color-accent-100)';
                    statusBorder = 'var(--color-accent-300)';
                  } else if (f.status === 'duplicate') {
                    statusColor = 'var(--color-warn)';
                    statusBg = 'var(--color-warn-bg)';
                    statusBorder = 'var(--color-warn-border)';
                  } else if (f.status === 'error') {
                    statusColor = 'var(--color-fail)';
                    statusBg = 'var(--color-fail-bg)';
                    statusBorder = 'var(--color-fail-border)';
                  }

                  return `
                    <tr>
                      <td style="padding-left: 18px; font-family: var(--font-sans); font-size: 12.5px; font-feature-settings: 'tnum' 1; color: var(--color-neutral-700);">${f.id}</td>
                      <td>
                        <span style="font-weight: 600; color: var(--color-text);">${escapeHtml(f.file)}</span>
                      </td>
                      <td>
                        ${f.candidate !== '—' ? `<strong>${escapeHtml(f.candidate)}</strong>` : '<span style="color:var(--color-neutral-600)">—</span>'}
                      </td>
                      <td style="color: var(--color-neutral-700); font-size: 12px; font-feature-settings: 'lnum' 1, 'tnum' 1;">
                        ${escapeHtml(f.uploadTime)}
                      </td>
                      <td style="padding-right: 18px;">
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                          <span class="tag" style="background: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusBorder}; font-weight: 600;">
                            ${f.icon} ${escapeHtml(f.statusText)}
                          </span>

                          ${f.barW ? `
                            <div style="width: 90px; height: 6px; background: var(--color-neutral-300); border-radius: 2px; overflow: hidden;">
                              <div style="height: 100%; width: ${f.barW}; background: var(--color-accent-600);"></div>
                            </div>
                            <span style="font-size: 11px; color: var(--color-accent-800);">${f.barW}</span>
                          ` : ''}

                          ${f.retry ? `
                            <button type="button" class="btn btn-ghost" onclick="alert('Đang chạy lại OCR cho tệp này...')" style="font-size: 11.5px; padding: 2px 6px; color: var(--color-fail); text-decoration: underline;">
                              Thử lại
                            </button>
                          ` : ''}
                        </div>

                        ${f.note ? `
                          <div style="font-size: 11.5px; color: ${f.status === 'error' ? 'var(--color-fail)' : 'var(--color-neutral-800)'}; margin-top: 4px; line-height: 1.4;">
                            ${escapeHtml(f.note)}
                          </div>
                        ` : ''}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- THANH TỔNG KẾT & NÚT BẮT ĐẦU AI SCREENING -->
          <div style="display: flex; align-items: center; gap: 20px; padding: 16px 20px; background: var(--color-surface); border: 1px solid var(--color-divider); border-top: 0; border-radius: 0 0 var(--radius-md) var(--radius-md); flex-wrap: wrap;">
            <div>
              <span style="font-family: var(--font-heading); font-size: 22px; font-weight: 700; color: var(--color-text); margin-right: 4px;">${allCvs.length}</span>
              <span style="font-size: 13px;">CV đã sẵn sàng</span>
            </div>

            <div style="font-size: 13px; color: var(--color-neutral-700);">
              <span style="font-weight: 600; color: var(--color-warn);">1</span> trùng lặp (đã gộp)
            </div>

            <div style="font-size: 13px; color: var(--color-neutral-700);">
              <span style="font-weight: 600; color: var(--color-fail);">1</span> cần bổ sung OCR
            </div>

            <div style="margin-left: auto;">
              <button type="button" class="btn btn-primary" onclick="navigateTo('#tien-trinh')" style="padding: 9px 20px; font-size: 14px; font-weight: 600;">
                Bắt đầu AI Screening (42 CV) →
              </button>
            </div>
          </div>
        </div>
      `}

    </div>
  `;

  container.innerHTML = html;
}

function setS3Filter(filterVal) {
  appState.s3Filter = filterVal;
  renderScreen3();
}

function toggleS3EmptyState() {
  appState.s3EmptyState = !appState.s3EmptyState;
  renderScreen3();
}


function renderScreen4() {
  const container = document.getElementById('s4Content');
  if (!container) return;

  const mode = appState.progMode || 'simulation'; // 'simulation' | 'running' | 'done' | 'error'
  let count = 42;
  let kicker = 'Đã hoàn tất';
  let subtitle = 'Hoàn tất lúc 14:06 · Thời gian xử lý: 4 phút 12 giây';
  let pct = 100;
  let barColor = 'var(--color-pass)';
  let isErr = false;
  let isDone = true;
  let isRunning = false;
  let doneUpTo = 6;
  let activeStep = -1;

  if (mode === 'simulation') {
    count = appState.simCount !== undefined ? appState.simCount : 0;
    pct = Math.round((count / 42) * 100);
    isDone = count >= 42;
    isRunning = !isDone;
    isErr = false;

    if (isDone) {
      kicker = 'Đã hoàn tất sàng lọc';
      subtitle = 'Hoàn tất lúc 14:06 · 42 CV đã được phân tích đầy đủ';
      barColor = 'var(--color-pass)';
      doneUpTo = 6;
      activeStep = -1;
    } else {
      kicker = 'Đang tiến hành AI Screening';
      subtitle = `Đang xử lý ${count} / 42 CV · Ước tính còn khoảng ${Math.max(1, Math.round((42 - count) * 0.15))} giây`;
      barColor = 'var(--color-accent-600)';
      doneUpTo = Math.floor((count / 42) * 6);
      activeStep = doneUpTo;
    }
  } else if (mode === 'running') {
    count = 18;
    pct = 43;
    isDone = false;
    isRunning = true;
    isErr = false;
    kicker = 'Đang tiến hành sàng lọc';
    subtitle = 'Đang xử lý 18 / 42 CV · Ước tính còn khoảng 2 phút 30 giây';
    barColor = 'var(--color-accent-600)';
    doneUpTo = 3;
    activeStep = 3;
  } else if (mode === 'done') {
    count = 42;
    pct = 100;
    isDone = true;
    isRunning = false;
    isErr = false;
    kicker = 'Đã hoàn tất toàn bộ';
    subtitle = 'Hoàn tất lúc 14:06 · Thời gian xử lý: 4 phút 12 giây';
    barColor = 'var(--color-pass)';
    doneUpTo = 6;
    activeStep = -1;
  } else if (mode === 'error') {
    count = 27;
    pct = 64;
    isDone = false;
    isRunning = false;
    isErr = true;
    kicker = 'Tạm dừng giữa quá trình';
    subtitle = 'Dừng lúc 13:58 · Phát hiện 2 file lỗi phân tích văn bản';
    barColor = '#c2512f';
    doneUpTo = 4;
    activeStep = -1;
  }

  const stepLabels = [
    'Trích xuất thông tin cấu trúc (Parsing)',
    'Phân tích & đối chiếu kỹ năng (Skills Match)',
    'Đối chiếu số năm kinh nghiệm backend',
    'Semantic Matching (Ngữ nghĩa công việc)',
    'Tính điểm thành phần & Match Score',
    'Xếp hạng ứng viên & phân định yêu cầu bắt buộc'
  ];

  const steps = stepLabels.map((label, i) => {
    const isStepDone = i < doneUpTo;
    const isStepActive = isRunning && i === activeStep;
    let icon = '○';
    let iconColor = 'var(--color-neutral-600)';
    let note = 'chờ xử lý';
    let opacity = '0.45';

    if (isStepDone) {
      icon = '✓';
      iconColor = 'var(--color-pass)';
      note = 'xong';
      opacity = '1';
    } else if (isStepActive) {
      icon = '●';
      iconColor = 'var(--color-accent-700)';
      note = 'đang chạy…';
      opacity = '1';
    } else if (isErr && i >= doneUpTo) {
      note = 'tạm dừng';
    }

    return { label, icon, iconColor, note, opacity, isStepActive };
  });

  // Số liệu thống kê thời gian thực
  let stats = [];
  if (isDone) {
    stats = [
      { label: 'Tổng số CV đã chấm', val: '42', color: 'var(--color-text)' },
      { label: 'Đạt yêu cầu bắt buộc', val: '31', color: 'var(--color-pass)' },
      { label: 'Không đạt bắt buộc', val: '11', color: 'var(--color-fail)' },
      { label: 'Đề xuất Shortlist', val: '8', color: 'var(--color-shortlist)' }
    ];
  } else if (isErr) {
    stats = [
      { label: 'CV đã hoàn tất', val: '27', color: 'var(--color-text)' },
      { label: 'File lỗi phân tích', val: '2', color: 'var(--color-fail)' },
      { label: 'Hồ sơ chờ xử lý', val: '13', color: 'var(--color-neutral-700)' }
    ];
  } else {
    const p = Math.round(count * 0.74);
    stats = [
      { label: 'CV đã chấm', val: count.toString(), color: 'var(--color-text)' },
      { label: 'Tạm thời đạt bắt buộc', val: p.toString(), color: 'var(--color-pass)' },
      { label: 'Tạm thời không đạt', val: (count - p).toString(), color: 'var(--color-fail)' }
    ];
  }

  let html = `
    <div style="max-width: 940px; margin: 0 auto;">

      <!-- CHUYỂN ĐỔI CHẾ ĐỘ MÔ PHỎNG TIẾN TRÌNH -->
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 20px;">
        <div class="seg" role="radiogroup">
          <label class="seg-opt" style="${mode === 'simulation' ? 'color:var(--color-accent-700);box-shadow:inset 0 0 0 1px var(--color-accent)' : ''}">
            <input type="radio" name="progModeRadio" value="simulation" ${mode === 'simulation' ? 'checked' : ''} onchange="setProgMode('simulation')">
            ▶ Mô phỏng đếm 0 → 42 (6 giây)
          </label>
          <label class="seg-opt" style="${mode === 'running' ? 'color:var(--color-accent-700);box-shadow:inset 0 0 0 1px var(--color-accent)' : ''}">
            <input type="radio" name="progModeRadio" value="running" ${mode === 'running' ? 'checked' : ''} onchange="setProgMode('running')">
            Trạng thái đang chạy (18/42)
          </label>
          <label class="seg-opt" style="${mode === 'done' ? 'color:var(--color-accent-700);box-shadow:inset 0 0 0 1px var(--color-accent)' : ''}">
            <input type="radio" name="progModeRadio" value="done" ${mode === 'done' ? 'checked' : ''} onchange="setProgMode('done')">
            Trạng thái đã xong (42/42)
          </label>
          <label class="seg-opt" style="${mode === 'error' ? 'color:var(--color-accent-700);box-shadow:inset 0 0 0 1px var(--color-accent)' : ''}">
            <input type="radio" name="progModeRadio" value="error" ${mode === 'error' ? 'checked' : ''} onchange="setProgMode('error')">
            Trạng thái lỗi (27/42)
          </label>
        </div>

        ${mode === 'simulation' ? `
          <button type="button" class="btn btn-secondary" onclick="restartSimulation()" style="font-size: 12px;">
            ⟳ Chạy lại từ 0
          </button>
        ` : ''}
      </div>

      <!-- KHUNG TIẾN TRÌNH CHÍNH -->
      <div class="card-panel" style="padding: 28px 30px;">
        
        <!-- Header đếm số CV và % -->
        <div style="display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
          <div>
            <div style="font-size: 11.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-accent-700); font-weight: 700;">
              ${kicker}
            </div>
            <div style="font-family: var(--font-heading); font-size: 42px; line-height: 1.05; font-weight: 700; margin: 4px 0 2px; color: var(--color-text);">
              ${count} / 42 CV
            </div>
            <div style="font-size: 13px; color: var(--color-neutral-700);">
              ${subtitle}
            </div>
          </div>

          <div style="font-family: var(--font-heading); font-size: 38px; font-weight: 700; color: ${barColor};">
            ${pct}%
          </div>
        </div>

        <!-- Thanh tiến độ lớn -->
        <div style="height: 9px; background: var(--color-neutral-300); border-radius: 3px; overflow: hidden; margin: 18px 0 24px;">
          <div style="height: 100%; width: ${pct}%; background: ${barColor}; transition: width 0.25s ease;"></div>
        </div>

        <!-- BỐ CỤC 2 CỘT: CÁC BƯỚC XỬ LÝ VÀ THỐNG KÊ -->
        <div style="display: grid; grid-template-columns: 1.3fr 0.9fr; gap: 32px;">
          
          <!-- Cột trái: 6 bước xử lý sáng dần -->
          <div>
            <div style="font-size: 11.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-neutral-700); font-weight: 700; margin-bottom: 10px;">
              Các bước xử lý AI
            </div>

            <div style="display: flex; flex-direction: column; gap: 2px;">
              ${steps.map((s, idx) => `
                <div style="display: flex; align-items: center; gap: 10px; padding: 7px 0; opacity: ${s.opacity}; transition: opacity 0.2s ease;">
                  <span style="width: 20px; text-align: center; color: ${s.iconColor}; font-size: 14px; font-weight: 700;" class="${s.isStepActive ? 'pulse-dot' : ''}">
                    ${s.icon}
                  </span>
                  <span style="font-size: 13.5px; font-weight: ${s.isStepActive ? '600' : '400'}; color: var(--color-text);">
                    ${idx + 1}. ${escapeHtml(s.label)}
                  </span>
                  <span style="margin-left: auto; font-size: 11.5px; color: ${s.isStepActive ? 'var(--color-accent-800)' : 'var(--color-neutral-700)'}; font-weight: ${s.isStepActive ? '600' : '400'};">
                    ${s.note}
                  </span>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Cột phải: Thống kê số lượng -->
          <div>
            <div style="font-size: 11.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-neutral-700); font-weight: 700; margin-bottom: 10px;">
              Thống kê kết quả
            </div>

            <div style="display: flex; flex-direction: column;">
              ${stats.map(st => `
                <div style="display: flex; align-items: baseline; justify-content: space-between; padding: 9px 0; border-top: 1px solid var(--color-divider);">
                  <span style="font-size: 13px; color: var(--color-text);">${escapeHtml(st.label)}</span>
                  <span style="font-family: var(--font-heading); font-size: 24px; font-weight: 700; color: ${st.color}; font-feature-settings: 'lnum' 1, 'tnum' 1;">
                    ${st.val}
                  </span>
                </div>
              `).join('')}
            </div>
          </div>

        </div>

        <!-- Hộp cảnh báo nếu có lỗi -->
        ${isErr ? `
          <div style="margin-top: 24px; border: 1px solid #c2512f; border-left: 4px solid #c2512f; border-radius: var(--radius-md); padding: 14px 18px; background: #fdf3f0; animation: fadeIn 0.2s ease;">
            <div style="font-family: var(--font-heading); font-size: 17px; font-weight: 700; color: var(--color-fail);">
              Có lỗi xảy ra trong quá trình bóc tách văn bản
            </div>
            <div style="font-size: 13px; color: var(--color-text); margin-top: 4px; line-height: 1.5;">
              Hệ thống đã chấm xong 27 trong 42 CV. Hai file là bản scan hình ảnh không có lớp ký tự searchable (<code>cv-scan-0917.pdf</code>). 13 CV còn lại đang tạm dừng.
            </div>
          </div>
        ` : ''}

        <!-- CÁC NÚT ĐIỀU HƯỚNG VÀ THAO TÁC DƯỚI CÙNG -->
        <div style="display: flex; gap: 12px; margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--color-divider); align-items: center; flex-wrap: wrap;">
          ${isDone ? `
            <button type="button" class="btn btn-primary" onclick="navigateTo('#ket-qua')" style="padding: 9px 22px; font-size: 14px; font-weight: 600;">
              Xem kết quả sàng lọc & xếp hạng (Màn 5) →
            </button>
          ` : ''}

          ${isRunning ? `
            <button type="button" class="btn btn-secondary" onclick="pauseSimulation()">
              Tạm dừng sàng lọc
            </button>
            <button type="button" class="btn btn-primary" onclick="finishSimulationInstantly()">
              Bỏ qua & Xem kết quả ngay →
            </button>
          ` : ''}

          ${isErr ? `
            <button type="button" class="btn btn-primary" onclick="setProgMode('done')">
              Chạy tiếp 15 CV còn lại
            </button>
            <button type="button" class="btn btn-secondary" onclick="navigateTo('#tai-cv')">
              Xem 2 file lỗi tại Màn 3
            </button>
          ` : ''}
        </div>

      </div>

    </div>
  `;

  container.innerHTML = html;
}

// Xử lý mô phỏng đếm 0 -> 42 trong 6 giây
function startSimulation() {
  if (appState.simInterval) {
    clearInterval(appState.simInterval);
  }

  appState.progMode = 'simulation';
  appState.simCount = 0;
  renderScreen4();

  // 42 bước trong 6000ms => khoảng 140ms mỗi bước
  appState.simInterval = setInterval(() => {
    if (appState.currentScreen !== 's4' || appState.progMode !== 'simulation') {
      clearInterval(appState.simInterval);
      return;
    }

    appState.simCount += 1;
    if (appState.simCount >= 42) {
      appState.simCount = 42;
      clearInterval(appState.simInterval);
      appState.simInterval = null;
    }
    renderScreen4();
  }, 142);
}

function restartSimulation() {
  startSimulation();
}

function pauseSimulation() {
  if (appState.simInterval) {
    clearInterval(appState.simInterval);
    appState.simInterval = null;
  }
  appState.progMode = 'running';
  renderScreen4();
}

function finishSimulationInstantly() {
  if (appState.simInterval) {
    clearInterval(appState.simInterval);
    appState.simInterval = null;
  }
  appState.simCount = 42;
  appState.progMode = 'done';
  renderScreen4();
}

function setProgMode(newMode) {
  if (appState.simInterval) {
    clearInterval(appState.simInterval);
    appState.simInterval = null;
  }
  appState.progMode = newMode;
  if (newMode === 'simulation') {
    startSimulation();
  } else {
    renderScreen4();
  }
}


function renderScreen6() {
  const container = document.getElementById('s6Content');
  if (!container) return;

  const an = RECRUITMENT_DATA.candidateDetailAn;
  const isShortlisted = appState.shortlistedIds.has(1);
  const isRejected = appState.rejectedIds.has(1);
  const activeKey = appState.activeEvidenceKey;

  let html = `
    <div style="max-width: 1240px; margin: 0 auto;">

      <!-- KHỐI TỔNG QUAN TRÊN ĐẦU -->
      <div class="detail-top-card">
        <div style="min-width: 240px;">
          <h2 style="margin: 0 0 4px; font-size: 28px;">${escapeHtml(an.name)}</h2>
          <div style="font-size: 13.5px; color: var(--color-neutral-700);">${escapeHtml(an.targetJob)}</div>
          <div style="margin-top: 10px; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--color-pass); background: var(--color-pass-bg); border: 1px solid var(--color-pass-border); padding: 4px 10px; border-radius: var(--radius-sm);">
            ✓ Đạt toàn bộ 5 yêu cầu bắt buộc
          </div>
        </div>

        <!-- Khối Match Score to rõ font Cormorant Garamond -->
        <div class="detail-score-box">
          <div>
            <div style="font-size: 11.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-accent-700); margin-bottom: 2px;">Match Score</div>
            <div style="display: flex; align-items: baseline; gap: 8px;">
              <span class="detail-score-val">${an.score}</span>
              <span style="font-size: 13px; color: var(--color-neutral-700);">/ 100 · <strong>Hạng ${an.rank}</strong> / ${an.totalInPool}</span>
            </div>
            <div style="width: 190px; height: 8px; background: var(--color-neutral-300); border-radius: 2px; overflow: hidden; margin-top: 6px;">
              <div style="height: 100%; width: ${an.score}%; background: var(--color-accent-600);"></div>
            </div>
          </div>
        </div>

        <!-- Các nút hành động -->
        <div style="margin-left: auto; display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
          <button type="button" class="btn btn-secondary" onclick="navigateTo('#ket-qua')">
            ← Quay lại danh sách
          </button>
          
          <button type="button" class="btn btn-secondary" style="color: var(--color-fail);" onclick="openRejectModal(1)" ${isRejected ? 'disabled' : ''}>
            ${isRejected ? 'Đã loại' : 'Loại ứng viên'}
          </button>

          <button type="button" class="btn ${isShortlisted ? 'btn-action-shortlist active' : 'btn-action-shortlist'}" style="padding: 7px 16px; font-size: 13px;" onclick="openShortlistModal(1)" ${isRejected ? 'disabled' : ''}>
            ${isShortlisted ? '★ Trong Shortlist' : 'Đưa vào Shortlist'}
          </button>
        </div>
      </div>

      <!-- BỐ CỤC 2 CỘT: TRÁI LÀ PHÂN TÍCH, PHẢI LÀ CV GỐC XEM TRƯỚC -->
      <div class="detail-content-grid">

        <!-- CỘT TRÁI: CÁC KHỐI PHÂN TÍCH -->
        <div class="detail-panel">

          <!-- Khối 1: Giải thích của AI -->
          <div class="card-panel ai-panel">
            <div class="panel-title" style="display: flex; align-items: center; gap: 8px; color: var(--color-accent-2-800);">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-ai)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
              Giải thích của AI
            </div>
            <p style="margin: 0; font-size: 13.5px; line-height: 1.7; text-align: justify; color: var(--color-text);">
              ${escapeHtml(an.aiExplanation)}
            </p>
          </div>

          <!-- Khối 2: Bốn điểm thành phần -->
          <div class="card-panel">
            <div class="panel-title">Điểm thành phần</div>
            <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 12px;">
              ${an.comps.map(c => `
                <div style="display: flex; align-items: center; gap: 14px;">
                  <span style="font-size: 13px; width: 150px; font-weight: ${c.label === 'Semantic Matching' ? '600' : '400'}; color: ${c.label === 'Semantic Matching' ? 'var(--color-accent-2-800)' : 'var(--color-text)'};">${escapeHtml(c.label)}</span>
                  <div style="flex: 1; height: 7px; background: var(--color-neutral-300); border-radius: 2px; overflow: hidden;">
                    <div style="height: 100%; width: ${c.barW}; background: ${c.label === 'Semantic Matching' ? 'var(--color-ai)' : 'var(--color-neutral-800)'};"></div>
                  </div>
                  <span style="font-family: var(--font-sans); font-size: 15px; font-weight: 700; font-feature-settings: 'tnum' 1; width: 32px; text-align: right; color: ${c.label === 'Semantic Matching' ? 'var(--color-accent-2-800)' : 'var(--color-text)'};">${c.val}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Khối 3: Bảng đối chiếu yêu cầu (9 tiêu chí) -->
          <div class="card-panel" style="padding: 0; overflow: hidden;">
            <div style="padding: 16px 20px 10px;">
              <div class="panel-title" style="margin-bottom: 4px;">Đối chiếu yêu cầu</div>
              <div style="font-size: 12px; color: var(--color-neutral-700); line-height: 1.5;">
                Trọng số là điểm tối đa tiêu chí đó mang lại, đóng góp là điểm thực tế đạt được — hai cột khác nghĩa, không gộp chung.
              </div>
            </div>

            <div style="overflow-x: auto;">
              <table class="req-table">
                <thead>
                  <tr>
                    <th style="padding-left: 20px; width: 19%;">Yêu cầu</th>
                    <th style="width: 12%;">Loại</th>
                    <th style="width: 11%; white-space: nowrap;">Trạng thái</th>
                    <th style="width: 9%; text-align: right; white-space: nowrap;">Trọng số</th>
                    <th style="width: 9%; text-align: right; white-space: nowrap;">Đóng góp</th>
                    <th style="padding-right: 20px; width: 40%;">Bằng chứng</th>
                  </tr>
                </thead>
                <tbody>
                  ${an.requirements.map(q => {
                    const isKeyActive = q.key && activeKey === q.key;
                    const isMissing = q.contribution === 0;
                    return `
                      <tr style="${isKeyActive ? 'background: var(--color-accent-100);' : ''}">
                        <td style="padding-left: 20px; font-weight: 500;">${escapeHtml(q.req)}</td>
                        <td>
                          <span class="tag" style="background: ${q.type === 'Bắt buộc' ? 'var(--color-accent-100)' : 'var(--color-neutral-100)'}; color: ${q.type === 'Bắt buộc' ? 'var(--color-accent-800)' : 'var(--color-neutral-800)'}; border: 1px solid ${q.type === 'Bắt buộc' ? 'var(--color-accent-400)' : 'var(--color-neutral-300)'}; font-weight: 500; white-space: nowrap;">
                            ${escapeHtml(q.type)}
                          </span>
                        </td>
                        <td>
                          <span style="display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; font-size: 12.5px; font-weight: 600; color: ${isMissing ? 'var(--color-fail)' : 'var(--color-pass)'};">
                            ${q.statusIcon} ${escapeHtml(q.status)}
                          </span>
                        </td>
                        <td style="text-align: right; color: var(--color-neutral-700); font-weight: 500;">${q.weight}</td>
                        <td style="text-align: right; font-family: var(--font-sans); font-size: 15px; font-weight: 700; font-feature-settings: 'tnum' 1; color: ${isMissing ? 'var(--color-fail)' : 'var(--color-text)'};">${q.contribution}</td>
                        <td style="padding-right: 20px;">
                          ${q.key ? `
                            <div style="display: flex; align-items: baseline; gap: 6px;">
                              <span style="font-size: 12px; color: var(--color-neutral-800); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(q.evidence)}">
                                ${escapeHtml(q.evidence)}
                              </span>
                              <button type="button" class="btn btn-ghost" onclick="toggleEvidence('${q.key}')" style="font-size: 11.5px; padding: 2px 6px; white-space: nowrap; color: ${isKeyActive ? 'var(--color-accent-800)' : 'var(--color-accent-700)'}; font-weight: 600;">
                                ${isKeyActive ? 'Đang sáng' : 'Xem bằng chứng'}
                              </button>
                            </div>
                            ${isKeyActive ? `
                              <div style="margin-top: 6px; border-left: 3px solid var(--color-accent); padding: 6px 8px; background: var(--color-accent-100); font-size: 12px; line-height: 1.5; color: var(--color-accent-900); animation: fadeIn 0.15s ease;">
                                ${escapeHtml(q.evidence)}
                              </div>
                            ` : ''}
                          ` : `
                            <span style="font-size: 12px; color: var(--color-fail); font-style: italic;">${escapeHtml(q.evidence)}</span>
                          `}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                  <!-- Hàng tổng kết -->
                  <tr style="background: var(--color-neutral-100); font-weight: 700;">
                    <td colspan="3" style="padding-left: 20px; font-family: var(--font-heading); font-size: 16px;">Tổng cộng</td>
                    <td style="text-align: right; font-size: 13px; color: var(--color-neutral-700);">100</td>
                    <td style="text-align: right; font-family: var(--font-heading); font-size: 22px; color: var(--color-accent-700);">${an.score}</td>
                    <td style="padding-right: 20px; font-size: 12px; color: var(--color-neutral-700);">Đúng bằng Match Score (92)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Khối 4: Thông tin cá nhân & Liên hệ -->
          <div class="card-panel">
            <div class="panel-title">Thông tin ứng viên</div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px 24px; margin-top: 12px;">
              <div style="border-top: 1px solid var(--color-divider); padding-top: 8px;">
                <div style="font-size: 11px; color: var(--color-neutral-700); text-transform: uppercase;">Họ và tên</div>
                <div style="font-size: 13.5px; font-weight: 600; margin-top: 2px;">${escapeHtml(an.name)}</div>
              </div>
              <div style="border-top: 1px solid var(--color-divider); padding-top: 8px;">
                <div style="font-size: 11px; color: var(--color-neutral-700); text-transform: uppercase;">Email</div>
                <div style="font-size: 13.5px; margin-top: 2px;">${escapeHtml(an.email)}</div>
              </div>
              <div style="border-top: 1px solid var(--color-divider); padding-top: 8px;">
                <div style="font-size: 11px; color: var(--color-neutral-700); text-transform: uppercase;">Số điện thoại</div>
                <div style="font-size: 13.5px; margin-top: 2px;">${escapeHtml(an.phone)}</div>
              </div>
              <div style="border-top: 1px solid var(--color-divider); padding-top: 8px;">
                <div style="font-size: 11px; color: var(--color-neutral-700); text-transform: uppercase;">Nơi ở</div>
                <div style="font-size: 13.5px; margin-top: 2px;">${escapeHtml(an.city)}</div>
              </div>
              <div style="border-top: 1px solid var(--color-divider); padding-top: 8px;">
                <div style="font-size: 11px; color: var(--color-neutral-700); text-transform: uppercase;">Kinh nghiệm</div>
                <div style="font-size: 13.5px; margin-top: 2px;">${escapeHtml(an.years)}</div>
              </div>
              <div style="border-top: 1px solid var(--color-divider); padding-top: 8px;">
                <div style="font-size: 11px; color: var(--color-neutral-700); text-transform: uppercase;">Học vấn</div>
                <div style="font-size: 13.5px; margin-top: 2px;">${escapeHtml(an.education)}</div>
              </div>
            </div>
          </div>

        </div>

        <!-- CỘT PHẢI: CV GỐC XEM TRƯỚC VÀ HIGHLIGHT BẰNG CHỨNG -->
        <div class="cv-preview-wrapper">
          <div style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px;">
            <div style="display: flex; align-items: baseline; gap: 8px;">
              <h3 style="margin: 0; font-size: 18px; white-space: nowrap;">CV gốc</h3>
              <span style="font-size: 12px; color: var(--color-neutral-700);">nguyen-van-an-backend.pdf · Trang 1 / 2</span>
            </div>
            <button type="button" class="btn btn-ghost" style="font-size: 12px;" onclick="alert('Đang tải file nguyen-van-an-backend.pdf...')">
              Tải xuống ↓
            </button>
          </div>

          <!-- Tờ giấy in CV với hiệu ứng sáng đoạn văn bản khi bấm 'Xem bằng chứng' -->
          <div class="cv-paper" id="cvPaperView">
            ${an.cvLines.map(line => {
              const isLineActive = line.key && activeKey === line.key;
              const lineClasses = [
                'cv-line',
                line.type,
                isLineActive ? 'highlighted' : ''
              ].filter(Boolean).join(' ');

              return `
                <div class="${lineClasses}" id="cv-line-${line.key || 'plain'}" data-key="${line.key || ''}">
                  ${escapeHtml(line.text)}
                </div>
              `;
            }).join('')}
          </div>

          <div style="margin-top: 10px; font-size: 12px; color: var(--color-neutral-700); text-align: right;">
            💡 Bấm nút <strong>"Xem bằng chứng"</strong> ở bảng đối chiếu để định vị và làm sáng đoạn văn bản tương ứng.
          </div>
        </div>

      </div>

    </div>
  `;

  container.innerHTML = html;

  // Nếu có active key thì tự động cuộn nhẹ đến đoạn CV được highlight
  if (activeKey) {
    setTimeout(() => {
      const el = document.getElementById(`cv-line-${activeKey}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 50);
  }
}

// Tương tác làm sáng đoạn văn bản trong CV bên phải
function toggleEvidence(key) {
  if (appState.activeEvidenceKey === key) {
    appState.activeEvidenceKey = null;
  } else {
    appState.activeEvidenceKey = key;
  }
  renderScreen6();
}


function renderScreen7() {
  const container = document.getElementById('s7Content');
  if (!container) return;

  const currentTab = appState.s7Tab || (appState.round2Active ? 'b' : 'a');
  const critList = appState.criteriaList;
  const isDirty = appState.criteriaDirty;
  const totalW = critList.reduce((sum, c) => sum + Number(c.weight), 0);

  let html = `
    <div style="max-width: 1180px; margin: 0 auto;">

      <!-- CHUYỂN ĐỔI 2 TAB: SỬA TIÊU CHÍ VÀ SO SÁNH VÒNG CHẤM -->
      <div class="seg" style="margin-bottom: 20px;" role="tablist">
        <label class="seg-opt" style="${currentTab === 'a' ? 'color:var(--color-accent-700);box-shadow:inset 0 0 0 1px var(--color-accent)' : ''}">
          <input type="radio" name="s7TabRadio" value="a" ${currentTab === 'a' ? 'checked' : ''} onchange="setS7Tab('a')">
          a · Sửa tiêu chí & Trọng số
        </label>
        <label class="seg-opt" style="${currentTab === 'b' ? 'color:var(--color-accent-700);box-shadow:inset 0 0 0 1px var(--color-accent)' : ''}">
          <input type="radio" name="s7TabRadio" value="b" ${currentTab === 'b' ? 'checked' : ''} onchange="setS7Tab('b')">
          b · So sánh hai vòng chấm ${appState.round2Active ? '✓' : ''}
        </label>
      </div>
  `;

  // =====================================
  // TAB 7A: SỬA TIÊU CHÍ & TRỌNG SỐ
  // =====================================
  if (currentTab === 'a') {
    html += `
      <!-- Cảnh báo có thay đổi chưa lưu -->
      ${isDirty ? `
        <div style="background: var(--color-accent-100); border: 1px solid var(--color-accent-600); border-left: 4px solid var(--color-accent-700); border-radius: var(--radius-md); padding: 13px 18px; margin-bottom: 16px; animation: fadeIn 0.2s ease;">
          <div style="font-family: var(--font-heading); font-size: 17px; font-weight: 700; color: var(--color-accent-800);">Có thay đổi chưa lưu vào hệ thống</div>
          <div style="font-size: 13px; margin-top: 3px; color: var(--color-text);">Bảng xếp hạng hiện tại vẫn dựa trên bộ tiêu chí cũ. Nhấn <strong>"Chấm lại 42 CV"</strong> để tính toán lại kết quả khớp với tiêu chí vừa sửa.</div>
        </div>
      ` : ''}

      <!-- Nút chọn nhanh kịch bản chấm lại Docker bắt buộc theo đề bài -->
      <div style="margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
        <span style="font-size: 13px; color: var(--color-neutral-700);">Kéo thanh trượt để chỉnh trọng số hoặc thay đổi loại tiêu chí bên dưới:</span>
        <button type="button" class="btn btn-secondary" onclick="applyDockerScenario()" style="font-size: 12.5px; border-color: var(--color-accent-600); color: var(--color-accent-800); background: #fff;">
          ⚡ Kịch bản đề bài: Đổi Docker sang Bắt buộc (Trọng số 14)
        </button>
      </div>

      <!-- BẢNG CHỈNH TIÊU CHÍ -->
      <div class="ranking-table-card">
        <table class="table" style="min-width: 820px; font-size: 13.5px;">
          <thead>
            <tr>
              <th style="padding-left: 18px;">Tiêu chí tuyển dụng</th>
              <th style="width: 170px;">Loại yêu cầu</th>
              <th style="min-width: 260px;">Trọng số điểm</th>
              <th style="width: 140px;">Kinh nghiệm</th>
              <th style="width: 70px; text-align: right; padding-right: 18px;"></th>
            </tr>
          </thead>
          <tbody>
            ${critList.map((c, index) => {
              const isDocker = c.id === 'docker';
              return `
                <tr style="${isDocker && c.type === 'mandatory' ? 'background: var(--color-warn-bg);' : ''}">
                  <td style="padding-left: 18px; font-weight: 500;">
                    ${escapeHtml(c.label)}
                    ${isDocker && c.type === 'mandatory' ? '<span class="tag" style="background:var(--color-fail-bg);color:var(--color-fail);border:1px solid var(--color-fail-border);margin-left:6px;font-size:10px;">Mới đổi bắt buộc</span>' : ''}
                  </td>
                  <td>
                    <select class="input" style="min-height: 32px; min-width: 172px; padding: 3px 8px; font-size: 12.5px; border-color: ${c.type === 'mandatory' ? 'var(--color-accent-600)' : 'var(--color-divider)'}; color: ${c.type === 'mandatory' ? 'var(--color-accent-800)' : 'var(--color-text)'}; font-weight: ${c.type === 'mandatory' ? '600' : '400'}; background: #fff;" onchange="onCritTypeChange(${index}, this.value)">
                      <option value="mandatory" ${c.type === 'mandatory' ? 'selected' : ''}>Bắt buộc (Quyết định)</option>
                      <option value="preferred" ${c.type === 'preferred' ? 'selected' : ''}>Ưu tiên (Cộng điểm)</option>
                    </select>
                  </td>
                  <td>
                    <div style="display: flex; align-items: center; gap: 12px;">
                      <input type="range" min="0" max="30" step="1" value="${c.weight}" oninput="onCritWeightChange(${index}, this.value)" style="flex: 1; accent-color: var(--color-accent-600); cursor: pointer;">
                      <span style="font-family: var(--font-sans); font-size: 16px; font-weight: 700; font-feature-settings: 'tnum' 1; width: 36px; text-align: right; color: var(--color-accent-800);">${c.weight}</span>
                    </div>
                  </td>
                  <td style="font-size: 12.5px; color: var(--color-neutral-700);">
                    ${c.minYears ? `≥ ${c.minYears} năm` : '—'}
                  </td>
                  <td style="text-align: right; padding-right: 18px;">
                    <button type="button" class="btn btn-ghost" onclick="resetCritRow(${index})" style="font-size: 12px; color: var(--color-fail); padding: 2px 6px;">
                      Xoá
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <!-- THANH TỔNG TRỌNG SỐ & HÀNH ĐỘNG -->
        <div style="display: flex; align-items: center; gap: 18px; padding: 14px 18px; border-top: 1px solid var(--color-divider); background: var(--color-neutral-100); flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary" onclick="addCustomCriteria()" style="font-size: 12.5px;">+ Thêm tiêu chí</button>

          <div style="font-size: 13.5px;">
            Tổng trọng số: 
            <span style="font-family: var(--font-heading); font-size: 24px; font-weight: 700; margin: 0 4px; color: ${totalW === 100 ? 'var(--color-pass)' : 'var(--color-fail)'};">
              ${totalW}
            </span>
            <span style="color: var(--color-neutral-700);">/ 100</span>
          </div>

          <div style="font-size: 12.5px; color: ${totalW === 100 ? 'var(--color-pass)' : 'var(--color-fail)'}; font-weight: 500;">
            ${totalW === 100 ? '✓ Đã cân bằng đúng 100' : (totalW > 100 ? `! Vượt ${totalW - 100} điểm, vui lòng giảm bớt` : `! Còn thiếu ${100 - totalW} điểm để đạt 100`)}
          </div>

          <div style="margin-left: auto; display: flex; gap: 10px;">
            <button type="button" class="btn btn-secondary" onclick="resetAllCriteria()">
              Hoàn tác ban đầu
            </button>
            <button type="button" class="btn btn-primary" onclick="openRescoreModal()" style="font-weight: 600;">
              Chấm lại 42 CV
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // =====================================
  // TAB 7B: SO SÁNH HAI VÒNG CHẤM
  // =====================================
  if (currentTab === 'b') {
    const comp = RECRUITMENT_DATA.roundComparison;

    html += `
      <!-- THẺ TỔNG QUAN 2 VÒNG CHẤM -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
        
        <!-- Vòng 1 -->
        <div class="card-panel">
          <div style="font-size: 12px; color: var(--color-neutral-700);">Vòng 1 · ${comp.round1.time} · ${comp.round1.desc}</div>
          <div style="display: flex; align-items: baseline; gap: 8px; margin-top: 6px;">
            <span style="font-family: var(--font-heading); font-size: 34px; font-weight: 700; color: var(--color-pass);">${comp.round1.passed}</span>
            <span style="font-size: 13px; color: var(--color-neutral-700);">đạt yêu cầu bắt buộc / ${comp.round1.total}</span>
          </div>
          <div style="font-size: 12px; color: var(--color-neutral-700); margin-top: 4px;">Vòng 1 được lưu trữ nguyên bản, có thể xem lại bất cứ lúc nào.</div>
        </div>

        <!-- Vòng 2 -->
        <div class="card-panel highlight-border" style="border-color: #c2512f; background: #fffbfa;">
          <div style="font-size: 12px; color: var(--color-fail); font-weight: 600;">Vòng 2 · ${comp.round2.time} · ${comp.round2.desc}</div>
          <div style="display: flex; align-items: baseline; gap: 8px; margin-top: 6px;">
            <span style="font-family: var(--font-heading); font-size: 34px; font-weight: 700; color: var(--color-fail);">${comp.round2.passed}</span>
            <span style="font-size: 13px; color: var(--color-neutral-700);">đạt yêu cầu bắt buộc / ${comp.round2.total}</span>
          </div>
          <div style="font-size: 12.5px; color: var(--color-fail); margin-top: 4px; font-weight: 600;">${comp.round2.shiftNote}</div>
        </div>

      </div>

      <!-- KHỐI CẢNH BÁO: TRƯỜNG HỢP NGUYỄN VĂN AN -->
      <div style="border: 2px solid #c2512f; border-radius: var(--radius-md); background: #fdf3f0; padding: 20px 22px; margin-bottom: 22px; animation: fadeIn 0.2s ease;">
        <div style="font-size: 11.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-fail); font-weight: 700;">Trường hợp biến động đáng chú ý nhất</div>
        
        <div style="display: flex; gap: 24px; flex-wrap: wrap; align-items: center; margin-top: 10px;">
          <div style="min-width: 190px;">
            <div style="font-family: var(--font-heading); font-size: 24px; font-weight: 700; color: var(--color-text);">${comp.notableCandidate.name}</div>
            <div style="font-size: 12.5px; color: var(--color-neutral-700);">${comp.notableCandidate.meta}</div>
          </div>

          <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
            <!-- Vòng 1 -->
            <div>
              <div style="font-size: 11px; color: var(--color-neutral-700);">Vòng 1</div>
              <div style="font-family: var(--font-heading); font-size: 36px; font-weight: 700; line-height: 1; color: var(--color-text);">${comp.notableCandidate.r1Score}</div>
              <div style="font-size: 12px; color: var(--color-pass); font-weight: 600;">${comp.notableCandidate.r1Rank}</div>
            </div>

            <div style="font-size: 22px; color: var(--color-neutral-500);">→</div>

            <!-- Vòng 2 -->
            <div>
              <div style="font-size: 11px; color: var(--color-neutral-700);">Vòng 2</div>
              <div style="font-family: var(--font-heading); font-size: 36px; font-weight: 700; line-height: 1; color: var(--color-fail);">${comp.notableCandidate.r2Score}</div>
              <div style="font-size: 12px; color: var(--color-fail); font-weight: 600;">${comp.notableCandidate.r2Rank}</div>
            </div>

            <div style="border-left: 1px solid var(--color-fail-border); padding-left: 18px; max-width: 440px;">
              <div style="font-size: 13px; line-height: 1.6; color: var(--color-neutral-800);">
                ${comp.notableCandidate.reason}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- BẢNG SO SÁNH THỨ HẠNG VÀ ĐIỂM SỐ 6 ỨNG VIÊN ĐẦU BẢNG -->
      <div class="ranking-table-card">
        <table class="table" style="min-width: 880px; font-size: 13px;">
          <thead>
            <tr>
              <th style="padding-left: 18px;">Ứng viên</th>
              <th style="text-align: right; width: 110px;">Điểm Vòng 1</th>
              <th style="text-align: right; width: 110px;">Điểm Vòng 2</th>
              <th style="text-align: right; width: 100px;">Chênh lệch</th>
              <th style="width: 170px;">Yêu cầu bắt buộc</th>
              <th style="padding-right: 18px;">Nguyên nhân biến động</th>
            </tr>
          </thead>
          <tbody>
            ${comp.candidatesDiff.map(c => `
              <tr style="${c.failedNow ? 'background: #fdf3f0;' : ''}">
                <td style="padding-left: 18px;">
                  <span style="font-weight: 600; font-size: 14px; color: var(--color-text);">${escapeHtml(c.name)}</span>
                  <div style="font-size: 11.5px; color: var(--color-neutral-700);">${escapeHtml(c.ranks)}</div>
                </td>
                <td style="text-align: right; font-family: var(--font-sans); font-size: 16px; font-weight: 700; font-feature-settings: 'tnum' 1; color: var(--color-neutral-700);">${c.r1}</td>
                <td style="text-align: right; font-family: var(--font-sans); font-size: 16px; font-weight: 700; font-feature-settings: 'tnum' 1; color: ${c.failedNow ? 'var(--color-fail)' : 'var(--color-text)'};">${c.r2}</td>
                <td style="text-align: right; font-weight: 700; color: ${c.delta.startsWith('+') ? 'var(--color-pass)' : 'var(--color-fail)'};">${c.delta}</td>
                <td style="font-size: 12.5px; font-weight: 600; color: ${c.failedNow ? 'var(--color-fail)' : 'var(--color-pass)'}; white-space: nowrap;">
                  ${escapeHtml(c.passStatus)}
                </td>
                <td style="font-size: 12.5px; color: var(--color-text); padding-right: 18px;">${escapeHtml(c.reason)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- NÚT HÀNH ĐỘNG CUỐI MÀN 7B -->
      <div style="display: flex; gap: 12px; margin-top: 20px; align-items: center;">
        <button type="button" class="btn btn-primary" onclick="switchToRound2Ranking()" style="font-weight: 600;">
          Mở bảng xếp hạng Vòng 2 trên Màn 5 →
        </button>
        <button type="button" class="btn btn-secondary" onclick="switchToRound1Ranking()">
          Xem lại bảng xếp hạng Vòng 1
        </button>
      </div>
    `;
  }

  html += `</div>`;
  container.innerHTML = html;
}

// Chuyển tab trong Màn 7
function setS7Tab(tab) {
  appState.s7Tab = tab;
  renderScreen7();
}

// Chỉnh loại tiêu chí (Bắt buộc / Ưu tiên)
function onCritTypeChange(index, newType) {
  appState.criteriaList[index].type = newType;
  appState.criteriaDirty = true;
  renderScreen7();
}

// Chỉnh trọng số tiêu chí (Slider)
function onCritWeightChange(index, newWeight) {
  appState.criteriaList[index].weight = Number(newWeight);
  appState.criteriaDirty = true;
  renderScreen7();
}

// Xoá trọng số dòng tiêu chí
function resetCritRow(index) {
  appState.criteriaList[index].weight = 0;
  appState.criteriaDirty = true;
  renderScreen7();
}

// Áp dụng kịch bản đề bài: Docker bắt buộc (Trọng số 14)
function applyDockerScenario() {
  appState.criteriaList = [
    { id: "python", label: "Python", kind: "Kỹ năng", type: "mandatory", weight: 20, minYears: null },
    { id: "fastapi", label: "FastAPI", kind: "Kỹ năng", type: "mandatory", weight: 16, minYears: null },
    { id: "sql", label: "SQL", kind: "Kỹ năng", type: "mandatory", weight: 13, minYears: null },
    { id: "rest", label: "REST API", kind: "Kỹ năng", type: "mandatory", weight: 13, minYears: null },
    { id: "exp", label: "Tối thiểu 2 năm kinh nghiệm backend", kind: "Kinh nghiệm", type: "mandatory", weight: 14, minYears: "2.0" },
    { id: "docker", label: "Docker", kind: "Kỹ năng", type: "mandatory", weight: 14, minYears: null }, // Đổi sang bắt buộc!
    { id: "aws", label: "AWS", kind: "Kỹ năng", type: "preferred", weight: 6, minYears: null },
    { id: "pg", label: "PostgreSQL", kind: "Kỹ năng", type: "preferred", weight: 3, minYears: null },
    { id: "redis", label: "Redis", kind: "Kỹ năng", type: "preferred", weight: 1, minYears: null }
  ];
  appState.criteriaDirty = true;
  renderScreen7();
}

// Hoàn tác lại bộ tiêu chí ban đầu
function resetAllCriteria() {
  appState.criteriaList = JSON.parse(JSON.stringify(RECRUITMENT_DATA.criteria));
  appState.criteriaDirty = false;
  renderScreen7();
}

// Thêm tiêu chí mới
function addCustomCriteria() {
  const newId = 'custom_' + Date.now();
  appState.criteriaList.push({
    id: newId,
    label: 'Tiêu chí bổ sung ' + (appState.criteriaList.length + 1),
    kind: 'Kỹ năng',
    type: 'preferred',
    weight: 0,
    minYears: null
  });
  appState.criteriaDirty = true;
  renderScreen7();
}

// Mở modal xác nhận chấm lại
function openRescoreModal() {
  document.getElementById('modalRescore').style.display = 'grid';
}

function closeRescoreModal() {
  document.getElementById('modalRescore').style.display = 'none';
}

function confirmRescore() {
  closeRescoreModal();
  appState.round2Active = true;
  appState.criteriaDirty = false;
  appState.s7Tab = 'b';
  renderScreen7();
}

function switchToRound2Ranking() {
  appState.round2Active = true;
  navigateTo('#ket-qua');
}

function switchToRound1Ranking() {
  appState.round2Active = false;
  navigateTo('#ket-qua');
}

// Tiện ích escape HTML phòng chống XSS
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"']/g, function(m) {
    switch (m) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#039;';
      default: return m;
    }
  });
}

// ==========================================
// 6. KHỞI TẠO EVENT LISTENERS
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  // Gắn sự kiện router hash
  window.addEventListener('hashchange', handleRouting);

  // Gắn sự kiện modal Shortlist
  const btnCancelSl = document.getElementById('btnCancelShortlist');
  const btnConfirmSl = document.getElementById('btnConfirmShortlist');
  if (btnCancelSl) btnCancelSl.addEventListener('click', closeShortlistModal);
  if (btnConfirmSl) btnConfirmSl.addEventListener('click', confirmShortlist);

  // Gắn sự kiện modal Reject
  const btnCancelRej = document.getElementById('btnCancelReject');
  const btnConfirmRej = document.getElementById('btnConfirmReject');
  if (btnCancelRej) btnCancelRej.addEventListener('click', closeRejectModal);
  if (btnConfirmRej) btnConfirmRej.addEventListener('click', confirmReject);

  // Gắn sự kiện modal Chấm lại (Rescore)
  const btnCancelRescore = document.getElementById('btnCancelRescore');
  const btnConfirmRescore = document.getElementById('btnConfirmRescore');
  if (btnCancelRescore) btnCancelRescore.addEventListener('click', closeRescoreModal);
  if (btnConfirmRescore) btnConfirmRescore.addEventListener('click', confirmRescore);

  // Nút menu mobile & drawer
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('appSidebar');
  if (mobileBtn && sidebar) {
    mobileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== mobileBtn) {
        sidebar.classList.remove('open');
      }
    });

    sidebar.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('open');
        }
      });
    });
  }

  // Khởi động router lần đầu
  handleRouting();
});

