import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_ERROR_MESSAGES } from './format-error.js';
import { APPROVED_FIELDS, CONSTRAINT_MESSAGES } from './safe-validation.js';

/**
 * Keeps PUBLIC_ERROR_MESSAGES honest against the real application code:
 * - every message thrown in src/ must be a deliberate allowlist entry,
 * - every allowlist entry must still be thrown somewhere,
 * - messages must be static (no template strings / variables).
 */

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const SELF = 'common/graphql/format-error.ts';

const KNOWN_CLASSES = [
  'BadRequestException',
  'UnauthorizedException',
  'ForbiddenException',
  'NotFoundException',
  'ConflictException',
  'ServiceUnavailableException',
] as const;

/** Nest's default message when an exception is created without arguments. */
const DEFAULT_MESSAGE: Record<string, string> = {
  BadRequestException: 'Bad Request',
  UnauthorizedException: 'Unauthorized',
  ForbiddenException: 'Forbidden',
  NotFoundException: 'Not Found',
  ConflictException: 'Conflict',
  ServiceUnavailableException: 'Service Unavailable',
};

function sourceFiles(): string[] {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && f !== SELF)
    .map((f) => join(SRC, f));
}

type Thrown = {
  file: string;
  className: string;
  message: string | null;
  problem?: string;
};

function collectThrown(): Thrown[] {
  const result: Thrown[] = [];
  const classAlternation = '[A-Za-z]*Exception';
  const call = new RegExp(
    `new\\s+(${classAlternation})\\s*\\(\\s*([^)]*?)\\s*\\)`,
    'gs',
  );

  for (const path of sourceFiles()) {
    const file = relative(SRC, path);
    const text = readFileSync(path, 'utf8');

    const constants = new Map<string, string>();
    for (const m of text.matchAll(
      /^const\s+([A-Z][A-Z0-9_]*)\s*=\s*(['"])((?:(?!\2).)*)\2\s*;/gm,
    )) {
      constants.set(m[1], m[3]);
    }

    for (const m of text.matchAll(call)) {
      const className = m[1];
      const arg = m[2].trim();

      if (!(KNOWN_CLASSES as readonly string[]).includes(className)) {
        result.push({
          file,
          className,
          message: null,
          problem: `unexpected exception class ${className}`,
        });
        continue;
      }

      if (
        className === 'ServiceUnavailableException' &&
        arg === 'result'
      ) {
        // Readiness response payload, not a client-facing exception message.
        continue;
      }

      if (arg === '') {
        result.push({ file, className, message: DEFAULT_MESSAGE[className] });
        continue;
      }

      const literal = /^(['"])((?:(?!\1).)*)\1,?$/s.exec(arg);
      if (literal) {
        result.push({ file, className, message: literal[2] });
        continue;
      }

      const constant = /^([A-Z][A-Z0-9_]*)$/.exec(arg);
      if (constant && constants.has(constant[1])) {
        result.push({ file, className, message: constants.get(constant[1])! });
        continue;
      }

      result.push({
        file,
        className,
        message: null,
        problem: `non-static message: ${arg.slice(0, 60)}`,
      });
    }

    if (/new\s+HttpException\s*\(/.test(text)) {
      result.push({
        file,
        className: 'HttpException',
        message: null,
        problem: 'direct HttpException is not covered by the status policy',
      });
    }
  }

  return result;
}

describe('public error messages vs. actual application code', () => {
  const thrown = collectThrown();

  it('finds the application exceptions (guards against a broken scanner)', () => {
    expect(thrown.length).toBeGreaterThan(20);
  });

  it('every thrown exception uses a known class and a static message', () => {
    expect(
      thrown.filter((t) => t.problem).map((t) => `${t.file}: ${t.problem}`),
    ).toEqual([]);
  });

  it('every thrown message is in PUBLIC_ERROR_MESSAGES', () => {
    const missing = thrown
      .filter(
        (t) => t.message !== null && !PUBLIC_ERROR_MESSAGES.has(t.message),
      )
      .map((t) => `${t.file}: "${t.message}"`);

    expect(missing).toEqual([]);
  });

  it('every PUBLIC_ERROR_MESSAGES entry is still thrown somewhere', () => {
    const used = new Set(thrown.map((t) => t.message));
    const unused = [...PUBLIC_ERROR_MESSAGES].filter((m) => !used.has(m));

    expect(unused).toEqual([]);
  });
});

/**
 * Keeps the validation feedback allowlists (safe-validation.ts) honest against
 * the real DTOs. Production feedback is generated only for APPROVED_FIELDS and
 * CONSTRAINT_MESSAGES, so a DTO that adds a field or uses another rule would
 * silently degrade to the generic fallback; this fails first so the addition
 * is reviewed on purpose.
 */
describe('DTO fields and rules vs. the validation feedback allowlists', () => {
  /** decorator used in DTOs -> constraint name class-validator reports */
  const DECORATOR_TO_CONSTRAINT: Record<string, string | null> = {
    IsNotEmpty: 'isNotEmpty',
    IsString: 'isString',
    IsEmail: 'isEmail',
    IsDate: 'isDate',
    IsUUID: 'isUuid',
    MaxLength: 'maxLength',
    MinLength: 'minLength',
    Length: 'isLength',
    Matches: 'matches',
    IsEnum: 'isEnum',
    IsInt: 'isInt',
    IsBoolean: 'isBoolean',
    IsArray: 'isArray',
    ArrayMaxSize: 'arrayMaxSize',
    Min: 'min',
    Max: 'max',
    IsOptional: null, // reports no constraint
  };

  const texts = sourceFiles().map((path) => ({
    file: relative(SRC, path),
    text: readFileSync(path, 'utf8'),
  }));

  const dtoTexts = texts.filter(({ text }) =>
    /from 'class-validator'/.test(text),
  );

  it('finds the DTO files (guards against a broken scanner)', () => {
    expect(dtoTexts.length).toBeGreaterThanOrEqual(8);
  });

  it('every class-validator decorator in src/ maps to an approved constraint', () => {
    const decorator =
      /@((?:Is|Min|Max|Length|Matches|Array|Validat|Contains|NotContains|Equals|NotEquals|Allow|Ignore|Custom)\w*)\s*\(/g;

    const unknown = dtoTexts.flatMap(({ file, text }) =>
      [...text.matchAll(decorator)]
        .map((m) => m[1])
        .filter((name) => !(name in DECORATOR_TO_CONSTRAINT))
        .map((name) => `${file}: @${name}`),
    );

    expect(unknown).toEqual([]);
  });

  it('no custom validators are registered in src/', () => {
    const offenders = texts
      .filter(({ text }) =>
        /registerDecorator|ValidatorConstraint|ValidateBy\b/.test(text),
      )
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it('every approved constraint is used by some DTO, and every used one is approved', () => {
    const used = new Set<string>();

    for (const { text } of dtoTexts) {
      for (const m of text.matchAll(
        /@(Is\w+|Min\w*|Max\w*|Array\w*|Length|Matches)\s*\(/g,
      )) {
        const constraint = DECORATOR_TO_CONSTRAINT[m[1]];
        if (constraint) used.add(constraint);
      }
    }

    expect([...used].sort()).toEqual([...CONSTRAINT_MESSAGES.keys()].sort());
  });

  it('APPROVED_FIELDS is exactly the set of DTO properties', () => {
    const props = new Set<string>();

    for (const { text } of dtoTexts) {
      // Include both multiline and inline decorator/property declarations.
      for (const m of text.matchAll(/\b([a-z_]\w*)[!?]\s*:\s*[^;]+;/g)) {
        props.add(m[1]);
      }
    }

    expect([...props].sort()).toEqual([...APPROVED_FIELDS].sort());
  });
});
