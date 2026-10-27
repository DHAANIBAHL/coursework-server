// Applies any database changes in migrations/ that haven't run yet.
// Run with: npm run migrate
// Each .sql file runs once, in filename order, and is recorded in the
// schema_migrations table so it is never applied twice.
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";

const dir = path.join(import.meta.dirname, "..", "migrations");

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: true, // a migration file can hold several statements
});

try {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const [rows] = await connection.query("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.name));

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log("Database is up to date.");
  }
  for (const file of pending) {
    console.log(`Applying ${file}...`);
    await connection.query(fs.readFileSync(path.join(dir, file), "utf8"));
    await connection.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
  }
  if (pending.length > 0) console.log(`Done: applied ${pending.length} migration(s).`);
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await connection.end();
}
