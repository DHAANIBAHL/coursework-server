import mysql from "mysql2/promise";

// A pool keeps a few connections open and reuses them for each request.
export const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

// The course catalog lives in the data-model database (see
// coursework-app/database/). Only routes/courses.js uses it, and only to read.
export const catalogDb = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.CATALOG_DB_NAME || "learning_platform",
  waitForConnections: true,
  connectionLimit: 5,
});
