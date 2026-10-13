import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { ROLES, publicUser, requireAuth, requireRole } from "../lib/session.js";
import { cleanEmail, emailPattern, passwordProblem } from "../lib/validate.js";
import { isSlug } from "../lib/classroom.js";

const router = Router();

// Everything here is for admins only.
router.use(requireAuth, requireRole("admin"));

const PAGE_SIZE = 20;

function userRow(row) {
  return { ...publicUser(row), createdAt: row.created_at };
}

async function findUser(id) {
  const [rows] = await db.query("SELECT id, name, email, role, created_at FROM users WHERE id = ?", [id]);
  return rows[0] ?? null;
}

async function adminCount() {
  const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'");
  return n;
}

// GET /api/admin/stats — numbers for the overview page.
router.get("/stats", async (req, res) => {
  const [byRole] = await db.query("SELECT role, COUNT(*) AS n FROM users GROUP BY role");
  const [[signups]] = await db.query(`
    SELECT
      SUM(created_at >= NOW() - INTERVAL 7 DAY)  AS last7,
      SUM(created_at >= NOW() - INTERVAL 30 DAY) AS last30
    FROM users
  `);
  const [recent] = await db.query(
    "SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC, id DESC LIMIT 5"
  );
  const [[messages]] = await db.query(
    "SELECT COUNT(*) AS total, COALESCE(SUM(NOT handled), 0) AS unhandled FROM contact_messages"
  );

  const [[classroom]] = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM enrollments) AS enrollments,
      (SELECT COUNT(*) FROM submissions) AS submissions,
      (SELECT COUNT(*) FROM materials) AS materials,
      (SELECT COUNT(*) FROM live_sessions WHERE starts_at >= NOW()) AS upcomingSessions,
      (SELECT COUNT(*) FROM quiz_attempts) AS quizAttempts
  `);

  const users = Object.fromEntries(ROLES.map((r) => [r, 0]));
  for (const row of byRole) users[row.role] = row.n;

  res.json({
    users: { ...users, total: Object.values(users).reduce((a, b) => a + b, 0) },
    signups: { last7: Number(signups.last7 ?? 0), last30: Number(signups.last30 ?? 0) },
    recentUsers: recent.map(userRow),
    messages: { total: messages.total, unhandled: Number(messages.unhandled) },
    classroom,
  });
});

// GET /api/admin/users?search=&role=&page= — searchable, paginated user list.
router.get("/users", async (req, res) => {
  const search = String(req.query.search ?? "").trim();
  const role = String(req.query.role ?? "");
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

  const where = [];
  const params = [];
  if (search) {
    where.push("(name LIKE ? OR email LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }
  if (ROLES.includes(role)) {
    where.push("role = ?");
    params.push(role);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM users ${whereSql}`, params);
  const [rows] = await db.query(
    `SELECT id, name, email, role, created_at FROM users ${whereSql}
     ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE]
  );

  res.json({ users: rows.map(userRow), total, page, pageSize: PAGE_SIZE });
});

// POST /api/admin/users — create an account, e.g. for a new teacher.
router.post("/users", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const email = cleanEmail(req.body?.email);
  const password = String(req.body?.password ?? "");
  const role = String(req.body?.role ?? "student");

  if (!name) return res.status(400).json({ error: "Enter a name." });
  if (!emailPattern.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  const badPassword = passwordProblem(password);
  if (badPassword) return res.status(400).json({ error: badPassword });
  if (!ROLES.includes(role)) return res.status(400).json({ error: "Choose a valid role." });

  try {
    const [result] = await db.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
      [name, email, await bcrypt.hash(password, 12), role]
    );
    res.status(201).json({ user: userRow(await findUser(result.insertId)) });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    throw err;
  }
});

// PATCH /api/admin/users/:id — change role.
router.patch("/users/:id", async (req, res) => {
  const target = await findUser(req.params.id);
  if (!target) return res.status(404).json({ error: "That account no longer exists." });

  const role = String(req.body?.role ?? "");
  if (!ROLES.includes(role)) return res.status(400).json({ error: "Choose a valid role." });
  if (target.id === req.user.id && role !== "admin") {
    return res.status(400).json({ error: "You can't remove your own admin role. Ask another admin to do it." });
  }

  await db.query("UPDATE users SET role = ? WHERE id = ?", [role, target.id]);
  res.json({ user: userRow(await findUser(target.id)) });
});

// POST /api/admin/users/:id/password — set a new password for someone who forgot theirs.
router.post("/users/:id/password", async (req, res) => {
  const target = await findUser(req.params.id);
  if (!target) return res.status(404).json({ error: "That account no longer exists." });

  const password = String(req.body?.password ?? "");
  const badPassword = passwordProblem(password);
  if (badPassword) return res.status(400).json({ error: badPassword });

  await db.query("UPDATE users SET password_hash = ? WHERE id = ?", [await bcrypt.hash(password, 12), target.id]);
  res.json({ ok: true });
});

// DELETE /api/admin/users/:id
router.delete("/users/:id", async (req, res) => {
  const target = await findUser(req.params.id);
  if (!target) return res.status(404).json({ error: "That account no longer exists." });
  if (target.id === req.user.id) {
    return res.status(400).json({ error: "You can't delete your own account here." });
  }
  if (target.role === "admin" && (await adminCount()) <= 1) {
    return res.status(400).json({ error: "This is the only admin. Make someone else an admin first." });
  }

  await db.query("DELETE FROM users WHERE id = ?", [target.id]);
  res.json({ ok: true });
});

// --- Course teachers ---------------------------------------------------------

// GET /api/admin/course-teachers — every teacher assignment, plus all teachers
// so the panel can offer them in a dropdown.
router.get("/course-teachers", async (req, res) => {
  const [assignments] = await db.query(
    `SELECT t.course_slug, t.assigned_at, u.id, u.name, u.email,
       (SELECT COUNT(*) FROM enrollments e WHERE e.course_slug = t.course_slug) AS students
     FROM course_teachers t JOIN users u ON u.id = t.teacher_id ORDER BY t.course_slug, u.name`
  );
  const [teachers] = await db.query("SELECT id, name, email FROM users WHERE role = 'teacher' ORDER BY name");
  const [enrollments] = await db.query("SELECT course_slug, COUNT(*) AS n FROM enrollments GROUP BY course_slug");
  res.json({
    assignments: assignments.map((a) => ({
      courseSlug: a.course_slug,
      teacher: { id: a.id, name: a.name, email: a.email },
      assignedAt: a.assigned_at,
    })),
    teachers,
    enrollments: Object.fromEntries(enrollments.map((e) => [e.course_slug, e.n])),
  });
});

// POST /api/admin/course-teachers — { courseSlug, teacherId }
router.post("/course-teachers", async (req, res) => {
  const courseSlug = String(req.body?.courseSlug ?? "");
  if (!isSlug(courseSlug)) return res.status(400).json({ error: "Choose a course." });
  const teacher = await findUser(req.body?.teacherId);
  if (!teacher || teacher.role !== "teacher") {
    return res.status(400).json({ error: "Choose a teacher. Give them the teacher role first if needed." });
  }
  await db.query("INSERT IGNORE INTO course_teachers (course_slug, teacher_id) VALUES (?, ?)", [courseSlug, teacher.id]);
  res.status(201).json({ ok: true });
});

// DELETE /api/admin/course-teachers/:slug/:teacherId
router.delete("/course-teachers/:slug/:teacherId", async (req, res) => {
  await db.query("DELETE FROM course_teachers WHERE course_slug = ? AND teacher_id = ?", [
    req.params.slug,
    req.params.teacherId,
  ]);
  res.json({ ok: true });
});

// GET /api/admin/messages?status=open|handled|all
router.get("/messages", async (req, res) => {
  const status = String(req.query.status ?? "open");
  const where = status === "handled" ? "WHERE handled" : status === "all" ? "" : "WHERE NOT handled";
  const [rows] = await db.query(
    `SELECT id, user_id, name, email, topic, message, handled, created_at
     FROM contact_messages ${where} ORDER BY created_at DESC, id DESC LIMIT 200`
  );
  res.json({
    messages: rows.map((m) => ({
      id: m.id,
      userId: m.user_id,
      name: m.name,
      email: m.email,
      topic: m.topic,
      message: m.message,
      handled: Boolean(m.handled),
      createdAt: m.created_at,
    })),
  });
});

// PATCH /api/admin/messages/:id — mark handled or open again.
router.patch("/messages/:id", async (req, res) => {
  const [result] = await db.query("UPDATE contact_messages SET handled = ? WHERE id = ?", [
    Boolean(req.body?.handled),
    req.params.id,
  ]);
  if (result.affectedRows === 0) return res.status(404).json({ error: "That message no longer exists." });
  res.json({ ok: true });
});

export default router;
