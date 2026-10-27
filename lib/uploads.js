import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";

// Uploaded files live in coursework-server/uploads (ignored by git). They are
// never served directly: routes/files.js checks who is asking first.
export const UPLOAD_DIR = path.join(import.meta.dirname, "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MB = 1024 * 1024;

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  // A random name, keeping the extension, so uploads can't overwrite each other
  // or be guessed.
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

// Teaching material, including lesson videos.
export const materialUpload = multer({ storage, limits: { fileSize: 500 * MB, files: 1 } }).single("file");
// Student submissions.
export const submissionUpload = multer({ storage, limits: { fileSize: 25 * MB, files: 1 } }).single("file");

// Wraps a multer middleware so upload problems become friendly JSON errors.
export function handleUpload(upload) {
  return (req, res, next) =>
    upload(req, res, (err) => {
      if (!err) return next();
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "That file is too big.", code: "FILE_TOO_BIG" });
      }
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: "The upload didn't work. Try again with a single file." });
      }
      next(err);
    });
}

export function fileFields(file) {
  if (!file) return { file_name: null, original_name: null, mime_type: null, size_bytes: null };
  return {
    file_name: file.filename,
    original_name: file.originalname.slice(0, 255),
    mime_type: file.mimetype.slice(0, 150),
    size_bytes: file.size,
  };
}

// Removes a stored upload; missing files are ignored.
export function deleteUpload(fileName) {
  if (!fileName) return;
  fs.rm(path.join(UPLOAD_DIR, path.basename(fileName)), { force: true }, () => {});
}
