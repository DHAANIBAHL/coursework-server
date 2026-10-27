// Turns database rows into the camelCase shapes the website uses.
// Stored file names are never sent; files are fetched through /api/files.
import { parseJson } from "./classroom.js";

export const material = (m) => ({
  id: m.id,
  courseSlug: m.course_slug,
  title: m.title,
  description: m.description ?? "",
  kind: m.kind,
  url: m.kind === "link" ? m.url : `/api/files/material/${m.id}`,
  fileName: m.original_name,
  mimeType: m.mime_type,
  sizeBytes: m.size_bytes,
  createdAt: m.created_at,
});

// status: "draft" (no publish time), "scheduled" (publish time in the future),
// or "posted". Students only ever receive posted announcements.
export const announcement = (a) => ({
  id: a.id,
  courseSlug: a.course_slug,
  title: a.title,
  body: a.body,
  category: a.category ?? "general",
  related: a.related_type ? { type: a.related_type, id: a.related_id, title: a.related_title ?? null } : null,
  pinned: Boolean(a.pinned),
  publishAt: a.publish_at ?? null,
  status: !a.publish_at ? "draft" : new Date(a.publish_at) > new Date() ? "scheduled" : "posted",
  authorName: a.author_name ?? null,
  createdAt: a.created_at,
});

export const assignment = (a) => ({
  id: a.id,
  courseSlug: a.course_slug,
  title: a.title,
  instructions: a.instructions,
  dueAt: a.due_at,
  maxPoints: a.max_points,
  createdAt: a.created_at,
});

export const submission = (s) => ({
  id: s.id,
  assignmentId: s.assignment_id,
  studentId: s.student_id,
  studentName: s.student_name ?? undefined,
  studentEmail: s.student_email ?? undefined,
  textAnswer: s.text_answer ?? "",
  file: s.file_name ? { name: s.original_name, url: `/api/files/submission/${s.id}`, sizeBytes: s.size_bytes } : null,
  submittedAt: s.submitted_at,
  grade: s.grade,
  feedback: s.feedback ?? "",
  gradedAt: s.graded_at,
});

// Teachers see the answers; students get `forStudent: true` (no answers).
export const classQuiz = (q, { forStudent = false } = {}) => {
  const questions = parseJson(q.questions);
  return {
    id: q.id,
    courseSlug: q.course_slug,
    title: q.title,
    description: q.description ?? "",
    kind: q.kind ?? "quiz",
    timeLimitMin: q.time_limit_min ?? null,
    maxAttempts: q.max_attempts ?? null,
    dueAt: q.due_at,
    published: Boolean(q.published),
    questionCount: questions.length,
    questions: forStudent
      ? questions.map(({ id, prompt, options }) => ({ id, prompt, options }))
      : questions,
    createdAt: q.created_at,
  };
};

export const liveSession = (s) => ({
  id: s.id,
  courseSlug: s.course_slug,
  title: s.title,
  description: s.description ?? "",
  startsAt: s.starts_at,
  durationMin: s.duration_min,
  meetingUrl: s.meeting_url,
  createdAt: s.created_at,
});
