-- Tests: teacher quizzes with a time limit and a limited number of attempts.
-- Quizzes and tests share class_quizzes; `kind` tells them apart.
ALTER TABLE class_quizzes
  ADD COLUMN kind ENUM('quiz', 'test') NOT NULL DEFAULT 'quiz' AFTER course_slug,
  ADD COLUMN time_limit_min INT NULL,  -- tests only; NULL = untimed
  ADD COLUMN max_attempts INT NULL;    -- NULL = unlimited

-- One row per started test attempt, so the time limit and attempt count are
-- enforced on the server (a reload can't restart the clock).
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  quiz_id      INT NOT NULL,
  student_id   INT NOT NULL,
  started_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  submitted_at TIMESTAMP NULL,
  INDEX (quiz_id, student_id),
  FOREIGN KEY (quiz_id) REFERENCES class_quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);
