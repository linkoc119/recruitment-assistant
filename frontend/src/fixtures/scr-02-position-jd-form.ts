import type { components } from "@app/api-types";

type Job = components["schemas"]["Job"];
type SkillList = components["schemas"]["SkillList"];

export const job: Job = {
  id: "1",
  title: "Backend Developer",
  jd_raw_text: `We are seeking a Senior Backend Developer to join our core payment platform team, responsible for designing, optimizing, and operating high-throughput distributed microservices.

Key Responsibilities & Mandatory Requirements:
Proficient in Python with deep hands-on production experience in FastAPI. Solid foundation in SQL, relational database schema design, and query performance tuning. Proven ability to design clean, well-documented REST APIs for multi-team service integration. Minimum 2 years of professional backend engineering experience.

Preferred Qualifications:
Experience with application containerization and automated deployments using Docker; hands-on experience with AWS cloud infrastructure (EC2, S3, RDS); strong expertise in PostgreSQL for high-scale systems; practical experience with Redis for caching and background task queues.`,
  level: "Senior",
  status: "open",
  version: 1,
  created_at: "2026-09-01T09:00:00Z",
  updated_at: "2026-09-09T10:22:00Z",
  criteria_revision: 1,
  published_run_id: "31",
  readiness: {
    approved_criteria: true,
    ready_cv_count: 42,
    active_run_id: null,
    can_start: true,
    blocking_codes: [],
  },
};

export const skillList: SkillList = {
  items: [
    { id: "1", name: "Python", aliases: ["Py", "Python3"], dictionary_version: "v1" },
    { id: "2", name: "FastAPI", aliases: ["Fast API"], dictionary_version: "v1" },
    { id: "3", name: "SQL", aliases: ["Relational Database"], dictionary_version: "v1" },
    { id: "4", name: "REST API", aliases: ["RESTful API", "REST"], dictionary_version: "v1" },
    { id: "5", name: "Docker", aliases: ["Containerization"], dictionary_version: "v1" },
    { id: "6", name: "AWS", aliases: ["Amazon Web Services"], dictionary_version: "v1" },
    { id: "7", name: "PostgreSQL", aliases: ["Postgres"], dictionary_version: "v1" },
    { id: "8", name: "Redis", aliases: ["Cache"], dictionary_version: "v1" },
  ],
  page: { offset: 0, limit: 50, total: 8 },
};
