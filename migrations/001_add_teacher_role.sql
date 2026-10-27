-- Adds the teacher role. Existing students and admins keep their roles.
ALTER TABLE users
  MODIFY role ENUM('student', 'teacher', 'admin') NOT NULL DEFAULT 'student';
