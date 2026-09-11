/**
 * data.js — Bộ dữ liệu mẫu tập trung cho hệ thống trợ lý tuyển dụng
 * Toàn bộ số liệu và thông tin được định nghĩa duy nhất tại đây.
 */

const RECRUITMENT_DATA = {
  // Vị trí đang sàng lọc
  currentJob: {
    id: "backend-dev",
    title: "Backend Developer",
    level: "Senior",
    city: "Hà Nội",
    cvCount: 42,
    status: "Đang tuyển",
    lastScreened: "11/09/2026 lúc 14:06",
    shortlistTarget: 8,
    stats: {
      total: 42,
      passed: 31,
      failed: 11,
      shortlisted: 8
    }
  },

  // Danh sách các vị trí tuyển dụng (Màn 1)
  jobs: [
    {
      id: "backend-dev",
      title: "Backend Developer",
      level: "Senior",
      city: "Hà Nội",
      cvCount: 42,
      shortlistCount: 8,
      status: "Đang tuyển",
      lastScreened: "11/09/2026 lúc 14:06",
      isScreening: true
    },
    {
      id: "ai-engineer",
      title: "AI Engineer",
      level: "Middle",
      city: "Hà Nội",
      cvCount: 24,
      shortlistCount: 3,
      status: "Đang tuyển",
      lastScreened: "08/09/2026 lúc 09:15",
      isScreening: false
    },
    {
      id: "data-analyst",
      title: "Data Analyst",
      level: "Junior",
      city: "TP. Hồ Chí Minh",
      cvCount: 18,
      shortlistCount: 0,
      status: "Đang tuyển",
      lastScreened: "Chưa sàng lọc",
      isScreening: false
    }
  ],

  // Tiêu chí tuyển dụng (Màn 2 & Màn 7) — Tổng trọng số đúng 100
  criteria: [
    { id: "python", label: "Python", kind: "Kỹ năng", type: "mandatory", weight: 22, minYears: null },
    { id: "fastapi", label: "FastAPI", kind: "Kỹ năng", type: "mandatory", weight: 18, minYears: null },
    { id: "sql", label: "SQL", kind: "Kỹ năng", type: "mandatory", weight: 14, minYears: null },
    { id: "rest", label: "REST API", kind: "Kỹ năng", type: "mandatory", weight: 14, minYears: null },
    { id: "exp", label: "Tối thiểu 2 năm kinh nghiệm backend", kind: "Kinh nghiệm", type: "mandatory", weight: 14, minYears: "2.0" },
    { id: "docker", label: "Docker", kind: "Kỹ năng", type: "preferred", weight: 8, minYears: null },
    { id: "aws", label: "AWS", kind: "Kỹ năng", type: "preferred", weight: 6, minYears: null },
    { id: "pg", label: "PostgreSQL", kind: "Kỹ năng", type: "preferred", weight: 3, minYears: null },
    { id: "redis", label: "Redis", kind: "Kỹ năng", type: "preferred", weight: 1, minYears: null }
  ],

  // 42 CV tải lên cho Màn 3 (39 Đã phân tích, 1 Đang phân tích, 1 Trùng lặp, 1 Lỗi phân tích)
  cvUploads: [
    { id: 1, file: "nguyen-van-an-backend.pdf", candidate: "Nguyễn Văn An", uploadTime: "11/09/2026 13:41", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 2, file: "tran-minh-binh-cv.pdf", candidate: "Trần Minh Bình", uploadTime: "11/09/2026 13:41", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 3, file: "le-thi-hoa-2026.docx", candidate: "Lê Thị Hoa", uploadTime: "11/09/2026 13:42", status: "parsing", statusText: "Đang phân tích", icon: "●", note: "Đang trích xuất cấu trúc và phân loại kỹ năng", barW: "64%" },
    { id: 4, file: "pham-van-nam.pdf", candidate: "Phạm Văn Nam", uploadTime: "11/09/2026 13:42", status: "duplicate", statusText: "Trùng lặp", icon: "!", note: "Trùng với hồ sơ Phạm Văn Nam nộp ngày 02/08/2026 (bản v1). Hệ thống nhận diện bản v2." },
    { id: 5, file: "cv-scan-0917.pdf", candidate: "—", uploadTime: "11/09/2026 13:43", status: "error", statusText: "Lỗi phân tích", icon: "✕", note: "File PDF là bản scan dạng hình ảnh không có lớp text searchable. Cần OCR bổ sung.", retry: true },
    { id: 6, file: "vu-thi-lan.pdf", candidate: "Vũ Thị Lan", uploadTime: "11/09/2026 13:43", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 7, file: "do-quang-huy-dev.pdf", candidate: "Đỗ Quang Huy", uploadTime: "11/09/2026 13:44", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 8, file: "bui-thanh-ha.pdf", candidate: "Bùi Thanh Hà", uploadTime: "11/09/2026 13:44", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 9, file: "ngo-van-tu.pdf", candidate: "Ngô Văn Tú", uploadTime: "11/09/2026 13:45", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 10, file: "hoang-quoc-viet.pdf", candidate: "Hoàng Quốc Việt", uploadTime: "11/09/2026 13:45", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 11, file: "phan-anh-tuan.pdf", candidate: "Phan Anh Tuấn", uploadTime: "11/09/2026 13:45", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 12, file: "nguyen-thi-mai.pdf", candidate: "Nguyễn Thị Mai", uploadTime: "11/09/2026 13:46", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 13, file: "dang-dinh-khoa.pdf", candidate: "Đặng Đình Khoa", uploadTime: "11/09/2026 13:46", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 14, file: "trinh-van-quy.pdf", candidate: "Trịnh Văn Quý", uploadTime: "11/09/2026 13:46", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 15, file: "duong-minh-duc.pdf", candidate: "Dương Minh Đức", uploadTime: "11/09/2026 13:47", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 16, file: "ha-thi-yen.pdf", candidate: "Hà Thị Yến", uploadTime: "11/09/2026 13:47", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 17, file: "luong-xuan-truong.pdf", candidate: "Lương Xuân Trường", uploadTime: "11/09/2026 13:47", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 18, file: "vo-thanh-tam.pdf", candidate: "Võ Thành Tâm", uploadTime: "11/09/2026 13:48", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 19, file: "mai-van-phong.pdf", candidate: "Mai Văn Phong", uploadTime: "11/09/2026 13:48", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 20, file: "dinh-trong-nghia.pdf", candidate: "Đinh Trọng Nghĩa", uploadTime: "11/09/2026 13:48", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 21, file: "chu-van-an.pdf", candidate: "Chu Văn An", uploadTime: "11/09/2026 13:49", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 22, file: "ta-quang-buu.pdf", candidate: "Tạ Quang Bửu", uploadTime: "11/09/2026 13:49", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 23, file: "tran-dai-nghia.pdf", candidate: "Trần Đại Nghĩa", uploadTime: "11/09/2026 13:50", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 24, file: "nguyen-huu-canh.pdf", candidate: "Nguyễn Hữu Cảnh", uploadTime: "11/09/2026 13:50", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 25, file: "le-van-thinh.pdf", candidate: "Lê Văn Thịnh", uploadTime: "11/09/2026 13:50", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 26, file: "ly-thuong-kiet.pdf", candidate: "Lý Thường Kiệt", uploadTime: "11/09/2026 13:51", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 27, file: "pham-ngu-lao.pdf", candidate: "Phạm Ngũ Lão", uploadTime: "11/09/2026 13:51", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 28, file: "tran-quoc-toan.pdf", candidate: "Trần Quốc Toản", uploadTime: "11/09/2026 13:51", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 29, file: "nguyen-trai-cv.pdf", candidate: "Nguyễn Trãi", uploadTime: "11/09/2026 13:52", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 30, file: "le-quy-don.pdf", candidate: "Lê Quý Đôn", uploadTime: "11/09/2026 13:52", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 31, file: "nguyen-du.pdf", candidate: "Nguyễn Du", uploadTime: "11/09/2026 13:52", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 32, file: "nguyen-khuyen.pdf", candidate: "Nguyễn Khuyến", uploadTime: "11/09/2026 13:53", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 33, file: "doan-thi-diem.pdf", candidate: "Đoàn Thị Điểm", uploadTime: "11/09/2026 13:53", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 34, file: "ho-xuan-huong.pdf", candidate: "Hồ Xuân Hương", uploadTime: "11/09/2026 13:53", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 35, file: "ba-huyen-thanh-quan.pdf", candidate: "Bà Huyện Thanh Quan", uploadTime: "11/09/2026 13:54", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 36, file: "tran-te-xuong.pdf", candidate: "Trần Tế Xương", uploadTime: "11/09/2026 13:54", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 37, file: "nguyen-binh-khiem.pdf", candidate: "Nguyễn Bỉnh Khiêm", uploadTime: "11/09/2026 13:54", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 38, file: "phan-boi-chau.pdf", candidate: "Phan Bội Châu", uploadTime: "11/09/2026 13:55", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 39, file: "phan-chau-trinh.pdf", candidate: "Phan Châu Trinh", uploadTime: "11/09/2026 13:55", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 40, file: "huynh-thuc-khang.pdf", candidate: "Huỳnh Thúc Kháng", uploadTime: "11/09/2026 13:55", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 41, file: "luong-van-can.pdf", candidate: "Lương Văn Can", uploadTime: "11/09/2026 13:56", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null },
    { id: 42, file: "nguyen-quyen.pdf", candidate: "Nguyễn Quyền", uploadTime: "11/09/2026 13:56", status: "parsed", statusText: "Đã phân tích", icon: "✓", note: null }
  ],

  // Danh sách ứng viên xếp hạng Vòng 1 (Màn 5)
  // 6 người đạt yêu cầu bắt buộc đầu bảng
  rankingPassed: [
    {
      id: 1,
      rank: 1,
      name: "Nguyễn Văn An",
      years: "5 năm 3 tháng",
      yearsNum: 5.25,
      city: "Hà Nội",
      score: 92,
      skillsMatch: ["Python", "FastAPI", "SQL", "REST API"],
      moreMatchCount: 4, // AWS, PostgreSQL, Redis, Exp
      skillsMiss: ["Docker"],
      comps: { skills: 95, exp: 90, edu: 85, semantic: 94 },
      grade: "Rất phù hợp",
      passMandatory: true,
      summary: "Ứng viên đáp ứng toàn bộ năm yêu cầu bắt buộc, kinh nghiệm vượt mức tối thiểu hơn ba năm. Điểm bị trừ duy nhất do không tìm thấy bằng chứng về Docker, tuy nhiên ứng viên đã có kinh nghiệm triển khai trên AWS nên khoảng cách không lớn. Semantic Matching cho thấy mô tả công việc trong CV bám sát yêu cầu của vị trí."
    },
    {
      id: 2,
      rank: 2,
      name: "Trần Minh Bình",
      years: "4 năm 1 tháng",
      yearsNum: 4.08,
      city: "Hà Nội",
      score: 86,
      skillsMatch: ["Python", "FastAPI", "SQL", "REST API"],
      moreMatchCount: 3,
      skillsMiss: ["Docker", "AWS"],
      comps: { skills: 88, exp: 85, edu: 80, semantic: 89 },
      grade: "Rất phù hợp",
      passMandatory: true,
      summary: "Khớp đủ yêu cầu bắt buộc với bốn năm làm backend. Thiếu bằng chứng về Docker và AWS nên mất phần điểm ưu tiên. Kiến trúc hệ thống và tư duy API tốt."
    },
    {
      id: 3,
      rank: 3,
      name: "Lê Thị Hoa",
      years: "3 năm 6 tháng",
      yearsNum: 3.5,
      city: "Hà Nội",
      score: 75,
      skillsMatch: ["Python", "FastAPI", "SQL", "REST API"],
      moreMatchCount: 2,
      skillsMiss: ["Docker", "AWS", "Redis"],
      comps: { skills: 78, exp: 74, edu: 80, semantic: 72 },
      grade: "Phù hợp",
      passMandatory: true,
      summary: "Đủ yêu cầu bắt buộc, nền tảng học vấn tốt. Mất phần lớn điểm ưu tiên vì chưa có kinh nghiệm hạ tầng điện toán đám mây và cơ chế bộ nhớ đệm phân tán."
    },
    {
      id: 4,
      rank: 4,
      name: "Phạm Văn Nam",
      years: "3 năm",
      yearsNum: 3.0,
      city: "Hà Nội",
      score: 71,
      skillsMatch: ["Python", "FastAPI", "Docker", "REST API"],
      moreMatchCount: 2,
      skillsMiss: ["AWS", "PostgreSQL"],
      comps: { skills: 70, exp: 76, edu: 70, semantic: 68 },
      grade: "Phù hợp",
      passMandatory: true,
      summary: "Đủ yêu cầu bắt buộc và đã làm việc với Docker trong môi trường production. Điểm kỹ năng thấp hơn nhóm trên do thiếu kinh nghiệm AWS và PostgreSQL."
    },
    {
      id: 5,
      rank: 5,
      name: "Vũ Thị Lan",
      years: "2 năm 8 tháng",
      yearsNum: 2.67,
      city: "Hà Nội",
      score: 68,
      skillsMatch: ["Python", "SQL", "REST API"],
      moreMatchCount: 2,
      skillsMiss: ["Docker", "Redis"],
      comps: { skills: 66, exp: 72, edu: 75, semantic: 64 },
      grade: "Phù hợp",
      passMandatory: true,
      summary: "Vừa đủ yêu cầu kinh nghiệm, học vấn tốt. Semantic Matching thấp hơn vì mô tả công việc trong CV còn chung chung, chưa làm nổi bật hiệu năng xử lý."
    },
    {
      id: 6,
      rank: 6,
      name: "Đỗ Quang Huy",
      years: "2 năm 4 tháng",
      yearsNum: 2.33,
      city: "Hà Nội",
      score: 64,
      skillsMatch: ["Python", "SQL", "REST API"],
      moreMatchCount: 2,
      skillsMiss: ["FastAPI khớp một phần"],
      comps: { skills: 60, exp: 70, edu: 70, semantic: 62 },
      grade: "Cần xem thêm",
      passMandatory: true,
      summary: "FastAPI chỉ khớp một phần — có sử dụng trong các dự án cá nhân, chưa chứng minh được trong môi trường tải lớn, nên tiêu chí này chỉ đóng góp một nửa trọng số."
    }
  ],

  // Ứng viên không đạt yêu cầu bắt buộc (Dưới đường phân cách - Màn 5)
  rankingFailed: [
    {
      id: 32,
      rank: 32,
      name: "Bùi Thanh Hà",
      years: "1 năm 7 tháng",
      yearsNum: 1.58,
      city: "Hà Nội",
      score: 54,
      skillsMatch: ["Python", "SQL"],
      moreMatchCount: 0,
      skillsMiss: ["FastAPI", "Chưa đủ 2 năm kinh nghiệm"],
      comps: { skills: 58, exp: 42, edu: 75, semantic: 56 },
      grade: "Chưa đạt",
      passMandatory: false,
      summary: "Thiếu FastAPI và chưa đủ hai năm kinh nghiệm backend — hai tiêu chí bắt buộc. Điểm học vấn cao, có thể xem xét cho vị trí cấp Junior."
    },
    {
      id: 33,
      rank: 33,
      name: "Ngô Văn Tú",
      years: "3 năm 2 tháng",
      yearsNum: 3.17,
      city: "TP. Hồ Chí Minh",
      score: 48,
      skillsMatch: ["REST API", "Docker"],
      moreMatchCount: 0,
      skillsMiss: ["Python", "SQL"],
      comps: { skills: 40, exp: 62, edu: 70, semantic: 44 },
      grade: "Chưa đạt",
      passMandatory: false,
      summary: "Ba năm kinh nghiệm backend nhưng trên ngăn xếp công nghệ khác (NodeJS/PHP): thiếu Python và SQL, đều là tiêu chí bắt buộc của vị trí này."
    }
  ],

  // Chi tiết ứng viên Nguyễn Văn An (Màn 6)
  candidateDetailAn: {
    name: "Nguyễn Văn An",
    targetJob: "Backend Developer · Senior · Hà Nội",
    years: "5 năm 3 tháng",
    city: "Hà Nội",
    email: "an.nv@email.com",
    phone: "0912 345 678",
    education: "Kỹ sư Công nghệ thông tin Đại học Bách khoa Hà Nội",
    score: 92,
    rank: 1,
    totalInPool: 42,
    passMandatory: true,
    comps: [
      { label: "Kỹ năng", val: 95, barW: "95%" },
      { label: "Kinh nghiệm", val: 90, barW: "90%" },
      { label: "Học vấn", val: 85, barW: "85%" },
      { label: "Semantic Matching", val: 94, barW: "94%" }
    ],
    aiExplanation: "Ứng viên đáp ứng toàn bộ năm yêu cầu bắt buộc, kinh nghiệm vượt mức tối thiểu hơn ba năm. Điểm bị trừ duy nhất do không tìm thấy bằng chứng về Docker, tuy nhiên ứng viên đã có kinh nghiệm triển khai trên AWS nên khoảng cách không lớn. Semantic Matching cho thấy mô tả công việc trong CV bám sát yêu cầu của vị trí.",
    // Đối chiếu 9 tiêu chí: Trọng số (Max) vs Đóng góp (Thực tế đạt được) -> Tổng đóng góp = 92
    requirements: [
      {
        req: "Python",
        type: "Bắt buộc",
        status: "Khớp",
        statusIcon: "✓",
        weight: 22,
        contribution: 22,
        evidence: "Ba năm phát triển bằng Python tại FPT Software",
        key: "py"
      },
      {
        req: "FastAPI",
        type: "Bắt buộc",
        status: "Khớp",
        statusIcon: "✓",
        weight: 18,
        contribution: 18,
        evidence: "Xây dựng REST API bằng FastAPI cho hệ thống thanh toán",
        key: "fa"
      },
      {
        req: "SQL",
        type: "Bắt buộc",
        status: "Khớp",
        statusIcon: "✓",
        weight: 14,
        contribution: 14,
        evidence: "Tối ưu truy vấn, giảm 40% thời gian phản hồi",
        key: "sql"
      },
      {
        req: "REST API",
        type: "Bắt buộc",
        status: "Khớp",
        statusIcon: "✓",
        weight: 14,
        contribution: 14,
        evidence: "Thiết kế API nội bộ phục vụ ba nhóm sản phẩm",
        key: "rest"
      },
      {
        req: "Tối thiểu 2 năm kinh nghiệm",
        type: "Bắt buộc",
        status: "Khớp",
        statusIcon: "✓",
        weight: 14,
        contribution: 14,
        evidence: "5 năm 3 tháng, tính từ 06/2021",
        key: "exp"
      },
      {
        req: "Docker",
        type: "Ưu tiên",
        status: "Thiếu",
        statusIcon: "✕",
        weight: 8,
        contribution: 0,
        evidence: "Không tìm thấy bằng chứng trong CV",
        key: null
      },
      {
        req: "AWS",
        type: "Ưu tiên",
        status: "Khớp",
        statusIcon: "✓",
        weight: 6,
        contribution: 6,
        evidence: "Triển khai dịch vụ trên EC2 và S3",
        key: "aws"
      },
      {
        req: "PostgreSQL",
        type: "Ưu tiên",
        status: "Khớp",
        statusIcon: "✓",
        weight: 3,
        contribution: 3,
        evidence: "Sử dụng PostgreSQL tại dự án thanh toán",
        key: "pg"
      },
      {
        req: "Redis",
        type: "Ưu tiên",
        status: "Khớp",
        statusIcon: "✓",
        weight: 1,
        contribution: 1,
        evidence: "Dùng Redis làm bộ nhớ đệm phiên",
        key: "redis"
      }
    ],
    // Dòng trong CV hiển thị ở nửa bên phải
    cvLines: [
      { text: "Nguyễn Văn An", type: "title", key: null },
      { text: "Senior Backend Developer · Hà Nội · an.nv@email.com · 0912 345 678", type: "meta", key: null },
      { text: "Kinh nghiệm làm việc", type: "heading", key: null },
      { text: "FPT Software — Backend Developer · 06/2021 – nay", type: "subhead", key: null },
      { text: "Ba năm phát triển bằng Python cho nhóm nền tảng thanh toán, phụ trách các dịch vụ xử lý giao dịch.", type: "paragraph", key: "py" },
      { text: "Xây dựng REST API bằng FastAPI cho hệ thống thanh toán, phục vụ trung bình 1,2 triệu yêu cầu mỗi ngày.", type: "paragraph", key: "fa" },
      { text: "Thiết kế API nội bộ phục vụ ba nhóm sản phẩm, kèm tài liệu và bộ kiểm thử hợp đồng.", type: "paragraph", key: "rest" },
      { text: "Tối ưu truy vấn SQL và chỉ mục, giảm 40% thời gian phản hồi của báo cáo đối soát.", type: "paragraph", key: "sql" },
      { text: "Sử dụng PostgreSQL tại dự án thanh toán, quản lý phân vùng bảng giao dịch theo tháng.", type: "paragraph", key: "pg" },
      { text: "Dùng Redis làm bộ nhớ đệm phiên và hàng đợi tác vụ nền.", type: "paragraph", key: "redis" },
      { text: "VNG — Junior Developer · 06/2021 – 08/2023", type: "subhead", key: null },
      { text: "Triển khai dịch vụ trên EC2 và S3, cấu hình cân bằng tải và sao lưu định kỳ.", type: "paragraph", key: "aws" },
      { text: "Học vấn", type: "heading", key: null },
      { text: "Kỹ sư Công nghệ thông tin, Đại học Bách khoa Hà Nội · 2017 – 2021", type: "paragraph", key: null },
      { text: "Tổng cộng 5 năm 3 tháng kinh nghiệm phát triển backend.", type: "paragraph", key: "exp" }
    ]
  },

  // Dữ liệu so sánh hai vòng chấm (Màn 7)
  // Docker đổi từ ưu tiên sang bắt buộc, trọng số tăng 8 -> 14
  roundComparison: {
    round1: {
      time: "11/09/2026 14:06",
      desc: "Bộ tiêu chí cũ (Docker là ưu tiên)",
      passed: 31,
      total: 42
    },
    round2: {
      time: "11/09/2026 16:41",
      desc: "Docker chuyển thành Bắt buộc (Trọng số 14)",
      passed: 19,
      total: 42,
      shiftNote: "✕ 12 ứng viên chuyển từ đạt sang không đạt"
    },
    notableCandidate: {
      name: "Nguyễn Văn An",
      meta: "5 năm 3 tháng · Hà Nội",
      r1Score: 92,
      r1Rank: "hạng 1 · đạt",
      r2Score: 86,
      r2Rank: "dưới đường phân cách · không đạt",
      reason: "Mất 6 điểm và trượt yêu cầu bắt buộc vì thiếu Docker — tiêu chí này vừa chuyển từ ưu tiên sang bắt buộc. Ứng viên vẫn nằm trong bảng, bạn tự quyết định giữ hay loại."
    },
    candidatesDiff: [
      {
        name: "Nguyễn Văn An",
        ranks: "hạng 1 → hạng 20 (dưới đường phân cách)",
        r1: 92,
        r2: 86,
        delta: "-6",
        passStatus: "✓ Đạt → ✕ Không đạt",
        reason: "Thiếu Docker — nay là tiêu chí bắt buộc",
        failedNow: true
      },
      {
        name: "Trần Minh Bình",
        ranks: "hạng 2 → hạng 21",
        r1: 86,
        r2: 80,
        delta: "-6",
        passStatus: "✓ Đạt → ✕ Không đạt",
        reason: "Thiếu Docker và AWS",
        failedNow: true
      },
      {
        name: "Lê Thị Hoa",
        ranks: "hạng 3 → hạng 24",
        r1: 75,
        r2: 70,
        delta: "-5",
        passStatus: "✓ Đạt → ✕ Không đạt",
        reason: "Thiếu Docker",
        failedNow: true
      },
      {
        name: "Phạm Văn Nam",
        ranks: "hạng 4 → hạng 1",
        r1: 71,
        r2: 73,
        delta: "+2",
        passStatus: "✓ Vẫn đạt",
        reason: "Có Docker, trọng số tiêu chí này tăng",
        failedNow: false
      },
      {
        name: "Vũ Thị Lan",
        ranks: "hạng 5 → hạng 26",
        r1: 68,
        r2: 63,
        delta: "-5",
        passStatus: "✓ Đạt → ✕ Không đạt",
        reason: "Thiếu Docker và Redis",
        failedNow: true
      },
      {
        name: "Đỗ Quang Huy",
        ranks: "hạng 6 → hạng 4",
        r1: 64,
        r2: 62,
        delta: "-2",
        passStatus: "✓ Vẫn đạt",
        reason: "Có Docker; FastAPI vẫn chỉ khớp một phần",
        failedNow: false
      }
    ]
  }
};
