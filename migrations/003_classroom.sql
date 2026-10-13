-- Everything teachers and students do around a course.
-- Courses themselves live in the website's code, so they're referenced by
-- their slug (e.g. 'web-design') rather than by a row in this database.

-- Which teachers teach which course (assigned by an admin).
CREATE TABLE IF NOT EXISTS course_teachers (
  course_slug VARCHAR(100) NOT NULL,
  teacher_id  INT NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (course_slug, teacher_id),
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Which students have joined which course.
CREATE TABLE IF NOT EXISTS enrollments (
  student_id  INT NOT NULL,
  course_slug VARCHAR(100) NOT NULL,
  enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, course_slug),
  INDEX (course_slug),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Lessons a student has marked complete (lesson_index is 0-based).
CREATE TABLE IF NOT EXISTS lesson_progress (
  student_id   INT NOT NULL,
  course_slug  VARCHAR(100) NOT NULL,
  lesson_index INT NOT NULL,
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, course_slug, lesson_index),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Teaching material: an uploaded file (documents, slides, videos) or a link.
CREATE TABLE IF NOT EXISTS materials (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  course_slug   VARCHAR(100) NOT NULL,
  title         VARCHAR(200) NOT NULL,
  description   TEXT,
  kind          ENUM('file', 'video', 'link') NOT NULL,
  file_name     VARCHAR(255) NULL,   -- stored name inside uploads/
  original_name VARCHAR(255) NULL,   -- name the teacher uploaded it with
  mime_type     VARCHAR(150) NULL,
  size_bytes    BIGINT NULL,
  url           VARCHAR(1000) NULL,  -- for links
  created_by    INT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (course_slug),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS announcements (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  course_slug VARCHAR(100) NOT NULL,
  title       VARCHAR(200) NOT NULL,
  body        TEXT NOT NULL,
  created_by  INT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (course_slug),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  course_slug  VARCHAR(100) NOT NULL,
  title        VARCHAR(200) NOT NULL,
  instructions TEXT NOT NULL,
  due_at       DATETIME NOT NULL,
  max_points   INT NOT NULL DEFAULT 100,
  created_by   INT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (course_slug),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- One submission per student per assignment; resubmitting replaces it until graded.
CREATE TABLE IF NOT EXISTS submissions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  student_id    INT NOT NULL,
  text_answer   TEXT,
  file_name     VARCHAR(255) NULL,
  original_name VARCHAR(255) NULL,
  mime_type     VARCHAR(150) NULL,
  size_bytes    BIGINT NULL,
  submitted_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  grade         INT NULL,
  feedback      TEXT NULL,
  graded_at     TIMESTAMP NULL,
  graded_by     INT NULL,
  UNIQUE (assignment_id, student_id),
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Quizzes written by teachers. `questions` is a JSON array of
-- { id, prompt, options: [{ id, text }], correct, explanation }.
CREATE TABLE IF NOT EXISTS class_quizzes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  course_slug VARCHAR(100) NOT NULL,
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  due_at      DATETIME NULL,
  questions   JSON NOT NULL,
  published   BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  INT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (course_slug),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Every quiz a student finishes: built-in course quizzes (quiz_key
-- 'builtin:<quiz id>') and teacher quizzes (quiz_key 'class:<id>').
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  student_id  INT NOT NULL,
  course_slug VARCHAR(100) NOT NULL,
  quiz_key    VARCHAR(120) NOT NULL,
  score       INT NOT NULL,
  total       INT NOT NULL,
  answers     JSON NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (student_id, course_slug),
  INDEX (course_slug, quiz_key),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS live_sessions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  course_slug  VARCHAR(100) NOT NULL,
  title        VARCHAR(200) NOT NULL,
  description  TEXT,
  starts_at    DATETIME NOT NULL,
  duration_min INT NOT NULL DEFAULT 60,
  meeting_url  VARCHAR(1000) NOT NULL,
  created_by   INT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (course_slug, starts_at),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
