import { randomBytes } from 'crypto';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // space/special chars -> "-"
    .replace(/^-+|-+$/g, '')     // start/end ke "-" hata do
    .slice(0, 40);
}

export function generateSlug(name: string): string {
  const base = slugify(name) || 'org';
  const suffix = randomBytes(3).toString('hex'); // e.g. "a3f9c1"
  return `${base}-${suffix}`;
}