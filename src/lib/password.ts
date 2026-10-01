import bcrypt from 'bcryptjs';

// Cost factor 12 is ~250ms on modern server hardware: expensive enough to make
// offline cracking impractical, fast enough for an interactive login.
const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * Burn roughly the same amount of CPU as a real bcrypt comparison.
 * Called on the "user not found" branch of login so that response timing does
 * not reveal which emails are registered.
 */
export async function fakeVerify(): Promise<void> {
  await bcrypt.compare(
    'timing-attack-mitigation',
    '$2b$12$C6UzMDM.H6dfI/f/IKcEe.5q5cM4Z0Y8O3nFQrM4k1y2z3a4b5c6d7',
  );
}

export interface PasswordCheck {
  ok: boolean;
  message?: string;
}

/** Server-side policy check. The client mirrors this for instant feedback. */
export function checkPasswordStrength(password: string): PasswordCheck {
  if (password.length < 10) {
    return { ok: false, message: 'Password must be at least 10 characters long.' };
  }
  if (password.length > 200) {
    return { ok: false, message: 'Password must be under 200 characters.' };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, message: 'Include at least one lowercase letter.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, message: 'Include at least one uppercase letter.' };
  }
  if (!/\d/.test(password)) {
    return { ok: false, message: 'Include at least one number.' };
  }
  return { ok: true };
}