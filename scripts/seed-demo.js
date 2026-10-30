// Fills the database with demo data: an admin, teachers, students, and a few
// weeks of classroom activity, all dated relative to now.
//
//   npm run seed:demo                          add (or refresh) the demo data
//   npm run seed:demo -- --courses web-design  only these courses get teachers
//   npm run seed:demo -- --remove              take all demo data out again
//
// Demo accounts use @demo.coursework.test emails; everything they created goes
// with them on --remove. Real accounts and their data are never touched.
// Course lessons and built-in quizzes are read from the course catalog
// database (CATALOG_DB_NAME, default learning_platform), so the demo progress
// matches what the website shows.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { catalogDb, db } from "../db.js";
import { cleanQuestions } from "../lib/classroom.js";
import { UPLOAD_DIR } from "../lib/uploads.js";
import * as demo from "./demo-data.js";

const args = process.argv.slice(2);
const DEMO_LIKE = `%@${demo.DEMO_DOMAIN}`;

// --- Helpers --------------------------------------------------------------------------

// A seeded random generator, so every run produces the same people and scores.
let seed = 20261027;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (lo, hi) => lo + rand() * (hi - lo);
const chance = (p) => rand() < p;
const pick = (list) => list[Math.floor(rand() * list.length)];
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
function sample(list, n) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// Times in whole seconds (MySQL rounds fractions; see lib/classroom.js).
const NOW = new Date(Math.floor(Date.now() / 1000) * 1000);
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const plus = (date, ms) => new Date(Math.floor((date.getTime() + ms) / 1000) * 1000);
const earliest = (...dates) => new Date(Math.min(...dates.map((d) => d.getTime())));
const latest = (...dates) => new Date(Math.max(...dates.map((d) => d.getTime())));
// `days` from now at a local hour (and minute), or at the current time when hour is null.
function at(days, hour = null, minute = 0) {
  const d = plus(NOW, days * DAY);
  if (hour !== null) d.setHours(hour, minute, 0, 0);
  return d;
}
// Somewhere between two times, never in the future.
const sometime = (from, to) => earliest(plus(from, between(0, to - from)), plus(NOW, -60e3));

const email = (local) => `${local}@${demo.DEMO_DOMAIN}`;
const slugify = (name) => name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");

// --- Files ----------------------------------------------------------------------------

const MIME = {
  ".pdf": "application/pdf", ".md": "text/markdown", ".html": "text/html", ".csv": "text/csv",
  ".js": "text/javascript", ".css": "text/css", ".py": "text/x-python", ".sql": "application/sql", ".txt": "text/plain",
};

// A one-page PDF: the first line as a title, the rest as body text.
function makePdf(lines) {
  const esc = (s) => s.replace(/[\\()]/g, (m) => `\\${m}`).replace(/[^\x20-\x7e]/g, "-");
  let stream = `BT /F1 20 Tf 56 760 Td (${esc(lines[0])}) Tj /F1 12 Tf`;
  lines.slice(1).forEach((line, i) => (stream += ` 0 ${i === 0 ? -40 : -22} Td (${esc(line)}) Tj`));
  stream += " ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets = objects.map((obj, i) => {
    const offset = Buffer.byteLength(out);
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    return offset;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

// Writes a demo file into uploads/ the way an upload would be stored.
function storeFile(spec) {
  const ext = path.extname(spec.name).toLowerCase();
  const body = spec.pdf ? makePdf(spec.pdf) : Buffer.from(spec.text, "utf8");
  const fileName = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, fileName), body);
  return { file_name: fileName, original_name: spec.name, mime_type: MIME[ext] ?? "application/octet-stream", size_bytes: body.length };
}
const noFile = { file_name: null, original_name: null, mime_type: null, size_bytes: null };

// --- Remove ---------------------------------------------------------------------------

async function removeDemo() {
  const [users] = await db.query("SELECT id FROM users WHERE email LIKE ?", [DEMO_LIKE]);
  const ids = users.map((u) => u.id);
  let files = [];
  if (ids.length) {
    const [m] = await db.query("SELECT file_name FROM materials WHERE created_by IN (?) AND file_name IS NOT NULL", [ids]);
    const [s] = await db.query(
      `SELECT file_name FROM submissions WHERE file_name IS NOT NULL
         AND (student_id IN (?) OR assignment_id IN (SELECT id FROM assignments WHERE created_by IN (?)))`,
      [ids, ids]
    );
    files = [...m, ...s].map((r) => r.file_name);
    const [quizzes] = await db.query("SELECT id FROM class_quizzes WHERE created_by IN (?)", [ids]);
    if (quizzes.length) await db.query("DELETE FROM quiz_attempts WHERE quiz_key IN (?)", [quizzes.map((q) => `class:${q.id}`)]);
    // Content first (its created_by would otherwise just be emptied), then the
    // accounts, which take enrollments, progress, submissions and attempts with them.
    for (const table of ["announcements", "class_quizzes", "assignments", "materials", "live_sessions"]) {
      await db.query(`DELETE FROM ${table} WHERE created_by IN (?)`, [ids]);
    }
    await db.query("DELETE FROM users WHERE id IN (?)", [ids]);
  }
  const [contact] = await db.query("DELETE FROM contact_messages WHERE email LIKE ?", [DEMO_LIKE]);
  for (const f of files) fs.rmSync(path.join(UPLOAD_DIR, path.basename(f)), { force: true });
  return { users: ids.length, files: files.length, messages: contact.affectedRows };
}

// --- Seed -----------------------------------------------------------------------------

// Every published course from the catalog database: { slug, lessonCount,
// quizzes: [{ slug, end, questionCount }] }, where `end` is the position of the
// last lesson a built-in quiz covers. Courses and quizzes keep catalog order.
async function loadCourses() {
  let courses, quizzes;
  try {
    [[courses], [quizzes]] = await Promise.all([
      catalogDb.query(
        `SELECT c.id, c.slug, (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count
           FROM courses c WHERE c.status = 'published' ORDER BY c.position, c.id`
      ),
      catalogDb.query(
        `SELECT q.course_id, q.slug, last.position AS end,
                (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS question_count
           FROM quizzes q LEFT JOIN lessons last ON last.id = q.last_lesson_id
          WHERE q.origin = 'catalog' AND q.published ORDER BY q.course_id, q.id`
      ),
    ]);
  } catch (err) {
    throw new Error(
      `Can't read the course catalog (${err.message}). Load coursework-app/database/schema.sql and seed.sql into CATALOG_DB_NAME (default learning_platform).`
    );
  }
  return courses.map((c) => ({
    slug: c.slug,
    lessonCount: c.lesson_count,
    quizzes: quizzes
      .filter((q) => q.course_id === c.id)
      .map((q) => ({ slug: q.slug, end: q.end ?? Infinity, questionCount: q.question_count })),
  }));
}

async function insert(table, row) {
  const [result] = await db.query(`INSERT INTO ${table} SET ?`, [row]);
  return result.insertId;
}

async function seedDemo(allCourses) {
  const bySlug = new Map(allCourses.map((c) => [c.slug, c]));
  const only = args.includes("--courses") ? args[args.indexOf("--courses") + 1]?.split(",") ?? [] : null;
  const taught = demo.courses.filter((c) => !only || only.includes(c.slug));
  for (const c of [...taught.map((t) => t.slug), ...demo.extraCourses]) {
    if (!bySlug.has(c)) throw new Error(`The website has no course "${c}". Update scripts/demo-data.js.`);
  }
  const counts = {};
  const count = (table, n = 1) => (counts[table] = (counts[table] ?? 0) + n);

  // People
  const hash = await bcrypt.hash(demo.DEMO_PASSWORD, 12);
  const addUser = async (name, local, role, created) => {
    count("users");
    return insert("users", { name, email: email(local), password_hash: hash, role, created_at: created });
  };
  await addUser(demo.admin.name, demo.admin.email, "admin", at(-60, 10));
  const teacherIds = {};
  for (const t of demo.teachers) teacherIds[t.key] = await addUser(t.name, t.email, "teacher", at(between(-48, -42), 11));
  const students = [];
  for (const name of demo.students) {
    const joined = at(between(-52, -38), Math.floor(between(8, 22)), Math.floor(between(0, 59)));
    const id = await addUser(name, slugify(name), "student", joined);
    // How strong and how active each student is, so their results hang together.
    students.push({ id, name, local: slugify(name), joined, skill: between(0.5, 0.97), pace: chance(0.12) ? between(0.1, 0.35) : between(0.6, 1.25) });
  }

  // Who joins what: every taught course gets a class; students add a few others.
  const enrollments = new Map(); // student id -> Map(slug -> enrolled_at)
  const enroll = (s, slug, when) => {
    if (!enrollments.has(s.id)) enrollments.set(s.id, new Map());
    if (!enrollments.get(s.id).has(slug)) enrollments.get(s.id).set(slug, latest(when, s.joined));
  };
  for (const c of taught) {
    // Most join in the first week; a few join late and miss the early work.
    for (const s of sample(students, Math.floor(between(15, 20)))) {
      enroll(s, c.slug, at(chance(0.85) ? between(-38, -31) : between(-24, -10), Math.floor(between(8, 22))));
    }
  }
  for (const s of students) {
    for (const slug of sample(demo.extraCourses, Math.floor(between(0, 3)))) enroll(s, slug, at(between(-40, -3), Math.floor(between(8, 22))));
    if (!enrollments.has(s.id)) enroll(s, pick(taught.map((c) => c.slug)), at(between(-30, -5), 12));
  }
  const enrolledIn = (slug) => students.filter((s) => enrollments.get(s.id)?.has(slug)).map((s) => ({ ...s, since: enrollments.get(s.id).get(slug) }));

  // Progress through lessons, and the built-in quizzes that go with them.
  for (const s of students) {
    for (const [slug, since] of enrollments.get(s.id)) {
      count("enrollments");
      await insert("enrollments", { student_id: s.id, course_slug: slug, enrolled_at: since });
      const course = bySlug.get(slug);
      const daysIn = (NOW - since) / DAY;
      const done = Math.round(clamp((daysIn / 35) * s.pace * between(0.8, 1.2), 0, 1) * course.lessonCount);
      const finishedAt = [];
      for (let i = 0; i < done; i++) {
        const when = sometime(plus(since, (i / Math.max(done, 1)) * (NOW - since) * 0.9), plus(since, ((i + 1) / done) * (NOW - since)));
        finishedAt.push(when);
        count("lesson_progress");
        await insert("lesson_progress", { student_id: s.id, course_slug: slug, lesson_index: i, completed_at: when });
      }
      for (const quiz of course.quizzes) {
        const { end } = quiz;
        if (done < end || !chance(0.85)) continue;
        const total = quiz.questionCount;
        let score = Math.round(clamp(s.skill + between(-0.2, 0.1), 0.2, 1) * total);
        let when = sometime(finishedAt[end - 1], plus(finishedAt[end - 1], 2 * DAY));
        for (let attempt = 0; attempt < (score < total && chance(0.3) ? 2 : 1); attempt++) {
          if (attempt) {
            score = Math.min(total, score + Math.ceil(between(0, 2)));
            when = sometime(when, plus(when, DAY));
          }
          count("quiz_attempts");
          await insert("quiz_attempts", { student_id: s.id, course_slug: slug, quiz_key: `builtin:${quiz.slug}`, score, total, answers: null, created_at: when });
        }
      }
    }
  }

  // Each taught course: its teacher and everything they share.
  for (const c of taught) {
    const teacher = teacherIds[c.teacher];
    const roster = enrolledIn(c.slug);
    const items = { material: [], assignment: [], quiz: [], live: [] };
    count("course_teachers");
    await insert("course_teachers", { course_slug: c.slug, teacher_id: teacher, assigned_at: at(-40, 9) });

    for (const m of c.materials) {
      const created = at(m.days, 12, 30);
      const fileRow = m.kind === "link" ? noFile : storeFile(m.file);
      count("materials");
      items.material.push(await insert("materials", { course_slug: c.slug, title: m.title, description: m.description, kind: m.kind, ...fileRow, url: m.url ?? null, created_by: teacher, created_at: created }));
    }

    for (const l of c.live) {
      const starts = l.hour === null ? plus(NOW, -20 * 60e3) : at(l.days, l.hour);
      count("live_sessions");
      items.live.push(await insert("live_sessions", {
        course_slug: c.slug, title: l.title, description: l.description, starts_at: starts, duration_min: l.duration,
        meeting_url: `https://meet.jit.si/coursework-${c.slug}-${crypto.randomBytes(4).toString("hex")}`,
        created_by: teacher, created_at: earliest(plus(starts, -5 * DAY), plus(NOW, -HOUR)),
      }));
    }

    for (const a of c.assignments) {
      const created = at(a.created, 10);
      const due = at(a.days, 23, 59);
      count("assignments");
      const id = await insert("assignments", { course_slug: c.slug, title: a.title, instructions: a.instructions, due_at: due, max_points: a.maxPoints, created_by: teacher, created_at: created });
      items.assignment.push(id);
      if (!a.answers.length && !a.file) continue;
      const past = due < NOW;
      const rate = past ? 0.88 : due - NOW < 4 * DAY ? 0.45 : 0.12;
      for (const s of roster) {
        if (s.since > (past ? due : NOW) || !chance(rate)) continue;
        const late = past && chance(0.12);
        const submitted = late ? sometime(due, plus(due, between(2, 60) * HOUR)) : sometime(latest(created, s.since), past ? due : NOW);
        const withFile = a.file && chance(a.answers.length ? 0.35 : 1);
        const graded = past && due < plus(NOW, -2 * DAY) && chance(0.9);
        const gradedAt = graded ? sometime(latest(submitted, due), plus(latest(submitted, due), between(1, 4) * DAY)) : null;
        count("submissions");
        await insert("submissions", {
          assignment_id: id, student_id: s.id,
          text_answer: a.answers.length && (!withFile || chance(0.5)) ? pick(a.answers) : null,
          ...(withFile ? storeFile(a.file) : noFile),
          submitted_at: submitted,
          grade: graded ? Math.round(a.maxPoints * clamp(s.skill + between(-0.12, 0.08) - (late ? 0.1 : 0), 0.4, 1)) : null,
          feedback: graded && a.feedback.length && chance(0.75) ? pick(a.feedback) : null,
          graded_at: gradedAt, graded_by: graded ? teacher : null,
        });
      }
    }

    for (const qz of c.quizzes) {
      const created = at(qz.days, 9, 15);
      const questions = cleanQuestions(qz.questions);
      const due = qz.dueDays === undefined ? null : at(qz.dueDays, 23, 59);
      count("class_quizzes");
      const id = await insert("class_quizzes", {
        course_slug: c.slug, kind: qz.kind, title: qz.title, description: qz.description, due_at: due,
        questions: JSON.stringify(questions), published: qz.published, time_limit_min: qz.timeLimitMin ?? null,
        max_attempts: qz.maxAttempts ?? null, created_by: teacher, created_at: created,
      });
      items.quiz.push(id);
      if (!qz.published) continue;
      const open = due && due < NOW ? due : NOW;
      const rate = qz.kind === "test" ? (due && due < NOW ? 0.85 : 0.35) : 0.75;
      for (const s of roster) {
        if (s.since > open || !chance(rate)) continue;
        const tries = qz.kind === "test" ? Math.min(qz.maxAttempts ?? 1, chance(0.25) ? 2 : 1) : chance(0.2) ? 2 : 1;
        let when = sometime(latest(created, s.since), open);
        for (let t = 0; t < tries; t++) {
          const answers = Object.fromEntries(questions.map((qq) => {
            const right = chance(clamp(s.skill + t * 0.08 + between(-0.15, 0.1), 0.15, 0.98));
            return [qq.id, right ? qq.correct : pick(qq.options.filter((o) => o.id !== qq.correct)).id];
          }));
          const score = questions.filter((qq) => answers[qq.id] === qq.correct).length;
          if (qz.kind === "test") {
            const submitted = earliest(plus(when, between(0.35, 0.95) * qz.timeLimitMin * 60e3), plus(NOW, -60e3));
            count("quiz_sessions");
            await insert("quiz_sessions", { quiz_id: id, student_id: s.id, started_at: when, submitted_at: submitted });
            when = submitted;
          }
          count("quiz_attempts");
          await insert("quiz_attempts", { student_id: s.id, course_slug: c.slug, quiz_key: `class:${id}`, score, total: questions.length, answers: JSON.stringify(answers), created_at: when });
          when = sometime(when, plus(when, 2 * DAY));
        }
      }
    }

    for (const a of c.announcements) {
      const [type, index] = a.ref?.split(":") ?? [];
      const relatedId = type ? items[type].at(Number(index)) : null;
      const publishAt = a.draft ? null : a.scheduled ? at(a.days, 9) : a.days === 0 ? plus(NOW, -2 * HOUR) : at(a.days, 9, 30);
      const related = { assignment: "assignment", quiz: "quiz", live: "session", material: "material" }[type] ?? null;
      count("announcements");
      await insert("announcements", {
        course_slug: c.slug, title: a.title, body: a.body, category: a.category, pinned: Boolean(a.pinned),
        related_type: related, related_id: relatedId, publish_at: publishAt,
        created_by: teacher, created_at: publishAt && publishAt < NOW ? publishAt : plus(NOW, -DAY),
      });
    }
  }

  // Contact page messages, some already handled.
  for (const m of demo.contactMessages) {
    const s = m.student === undefined ? null : students.at(m.student);
    count("contact_messages");
    await insert("contact_messages", {
      user_id: s?.id ?? null, name: s?.name ?? m.name, email: email(s?.local ?? m.email),
      topic: m.topic, message: m.message, handled: m.handled, created_at: at(m.days, 14, 20),
    });
  }
  return counts;
}

// --- Run ------------------------------------------------------------------------------

try {
  // Read the catalog before touching anything, so a missing catalog changes nothing.
  const allCourses = args.includes("--remove") ? null : await loadCourses();
  const removed = await removeDemo();
  if (args.includes("--remove")) {
    console.log(`Removed the demo data: ${removed.users} accounts, ${removed.messages} contact messages, ${removed.files} files.`);
  } else {
    if (removed.users) console.log(`Replaced the previous demo data (${removed.users} accounts).`);
    const counts = await seedDemo(allCourses);
    console.log("Added demo data:");
    for (const [table, n] of Object.entries(counts)) console.log(`  ${table.padEnd(18)} ${n}`);
    console.log(`\nSign in with any demo account, password ${demo.DEMO_PASSWORD}:`);
    console.log(`  admin    ${email(demo.admin.email)}`);
    for (const t of demo.teachers) console.log(`  teacher  ${email(t.email)}`);
    console.log(`  student  ${email(slugify(demo.students[0]))} (and ${demo.students.length - 1} more)`);
    console.log("\nRemove it all with: npm run seed:demo -- --remove");
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await db.end();
  await catalogDb.end().catch(() => {}); // already reported if the catalog failed
}
