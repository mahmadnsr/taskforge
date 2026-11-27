import { createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';

const PREFIX = 'tf-sha256-bcrypt-v1:';
const DUMMY_DIGEST = createHash('sha256')
  .update('taskforge-dummy-password-v1', 'utf8')
  .digest('hex');
const DUMMY_HASH_PROMISE = bcrypt.hash(DUMMY_DIGEST, 12);

export function hashPasswordInput(password: string): string {
  return createHash('sha256')
    .update('taskforge-password-v1\0', 'utf8')
    .update(password, 'utf8')
    .digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  const digest = hashPasswordInput(password);
  return `${PREFIX}${await bcrypt.hash(digest, 12)}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  if (storedHash.startsWith(PREFIX)) {
    const bcryptHash = storedHash.slice(PREFIX.length);
    if (!/^\$2[aby]\$/.test(bcryptHash)) return false;

    return bcrypt.compare(hashPasswordInput(password), bcryptHash);
  }

  // Backward compatibility for accounts created before versioned hashing.
  if (/^\$2[aby]\$/.test(storedHash)) {
    return bcrypt.compare(password, storedHash);
  }

  return false;
}

export async function verifyDummyPassword(password: string): Promise<void> {
  await bcrypt.compare(hashPasswordInput(password), await DUMMY_HASH_PROMISE);
}
