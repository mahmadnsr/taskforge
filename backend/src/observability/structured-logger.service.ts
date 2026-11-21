import type { LoggerService, LogLevel } from '@nestjs/common';
import { currentRequestId } from './request-context.js';

const SENSITIVE_KEY =
  /(?:authorization|body|cookie|credential|database_?url|graphql_?variables|headers?|jwt|pass(?:word)?|payload|refresh_?token|secret|smtp_?pass|token|variables)/i;
const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/;
const MAX_STRING_LENGTH = 2_000;

function sanitizeString(value: string): string {
  const withoutControls = Array.from(value)
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : character;
    })
    .join('');
  return withoutControls
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      '[REDACTED_JWT]',
    )
    .replace(
      /\b(?:postgres(?:ql)?|redis):\/\/[^\s'"<>]+/gi,
      '[REDACTED_CONNECTION_STRING]',
    )
    .replace(
      /\b(authorization|body|cookie|graphql_?variables|headers?|payload|variables)\s*[:=].*$/gi,
      '$1=[REDACTED]',
    )
    .replace(
      /\b(password|pass|token|secret|cookie|authorization|database_?url)\s*[:=]\s*([^\s&,;]+)/gi,
      '$1=[REDACTED]',
    )
    .slice(0, MAX_STRING_LENGTH);
}

function sanitize(value: unknown, depth = 0): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return sanitizeString(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: sanitizeString(value.name),
      message: sanitizeString(value.message),
    };
  }
  if (depth >= 4) return '[TRUNCATED]';
  if (Array.isArray(value))
    return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    ).slice(0, 50)) {
      output[key] = SENSITIVE_KEY.test(key)
        ? '[REDACTED]'
        : sanitize(item, depth + 1);
    }
    return output;
  }
  return typeof value === 'symbol'
    ? sanitizeString(value.description ?? 'symbol')
    : '[UNSUPPORTED]';
}

export class StructuredLogger implements LoggerService {
  private levels: LogLevel[] | undefined;

  constructor(private readonly processName: 'api' | 'worker') {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('verbose', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  setLogLevels(levels: LogLevel[]): void {
    this.levels = levels;
  }

  private write(
    severity: 'info' | 'warn' | 'error' | 'debug' | 'verbose' | 'fatal',
    message: unknown,
    optionalParams: unknown[],
  ): void {
    const nestLevel: LogLevel = severity === 'info' ? 'log' : severity;
    if (this.levels && !this.levels.includes(nestLevel)) return;

    const possibleContext = optionalParams.at(-1);
    const hasContext =
      typeof possibleContext === 'string' && SAFE_NAME.test(possibleContext);
    const component = hasContext
      ? possibleContext
      : this.processName === 'api'
        ? 'TaskForgeApi'
        : 'TaskForgeWorker';
    const detailParams = hasContext
      ? optionalParams.slice(0, -1)
      : optionalParams;
    const sanitized = sanitize(message);
    const event =
      typeof sanitized === 'object' &&
      sanitized !== null &&
      !Array.isArray(sanitized) &&
      typeof (sanitized as Record<string, unknown>).event === 'string' &&
      SAFE_NAME.test((sanitized as Record<string, unknown>).event as string)
        ? ((sanitized as Record<string, unknown>).event as string)
        : 'application.message';
    const fields =
      typeof sanitized === 'object' &&
      sanitized !== null &&
      !Array.isArray(sanitized)
        ? (sanitized as Record<string, unknown>)
        : { message: sanitized };
    const {
      event: _event,
      timestamp: _timestamp,
      severity: _severity,
      process: _process,
      component: _component,
      request_id: _requestId,
      ...safeFields
    } = fields;
    const requestId = currentRequestId();
    const record = {
      timestamp: new Date().toISOString(),
      severity,
      process: this.processName,
      component,
      event,
      ...(requestId ? { request_id: requestId } : {}),
      ...safeFields,
      ...(detailParams.length > 0 ? { details: sanitize(detailParams) } : {}),
    };
    const line = `${JSON.stringify(record)}\n`;
    if (severity === 'error' || severity === 'fatal' || severity === 'warn')
      process.stderr.write(line);
    else process.stdout.write(line);
  }
}

export const observabilitySanitizeForTest = sanitize;
