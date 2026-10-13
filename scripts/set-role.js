// Changes an existing account's role from the command line.
// Run with: npm run set-role -- you@example.com admin
// Use it to create the first admin; after that, admins can change roles
// from the admin panel.
import { db } from "../db.js";
import { ROLES } from "../lib/session.js";

const [email, role] = process.argv.slice(2);

if (!email || !ROLES.includes(role)) {
  console.error(`Usage: npm run set-role -- <email> <${ROLES.join("|")}>`);
  process.exit(1);
}

const [result] = await db.query("UPDATE users SET role = ? WHERE email = ?", [role, email.trim().toLowerCase()]);
if (result.affectedRows === 0) {
  console.error(`No account found for ${email}. Sign up on the website first, then run this again.`);
  process.exitCode = 1;
} else {
  console.log(`${email} is now ${role === "admin" ? "an" : "a"} ${role}.`);
}
await db.end();
