// Checks shared by sign-up and admin-created accounts.
export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

// Returns an error message, or null if the password is acceptable.
// bcrypt only uses the first 72 bytes, hence the upper limit.
export function passwordProblem(password) {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 72) return "Password must be 72 characters or fewer.";
  return null;
}
