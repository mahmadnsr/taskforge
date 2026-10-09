import { randomBytes } from 'crypto';
export function slugify(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
}
export function generateSlug(name) {
    const base = slugify(name) || 'org';
    const suffix = randomBytes(3).toString('hex');
    return `${base}-${suffix}`;
}
//# sourceMappingURL=slug.util.js.map