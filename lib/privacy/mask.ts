const SENSITIVE_KEY_PATTERN =
  /^(password|pass|token|secret|apikey|api_key|authorization|cookie|p256dh|auth|private_key|service_role)$/i;

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const SECRET_PREFIX_PATTERN = /\b(?:sk-|sbp_|AIza|ghp_|gho_|whsec_)[A-Za-z0-9_-]{8,}\b/g;
const EMAIL_PATTERN = /\b([A-Za-z0-9._%+-]{1,64})@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
const RUT_PATTERN = /\b(\d{1,2})\.?(\d{3})\.?(\d{3})-([\dkK])\b/g;
const PHONE_PATTERN = /(?:\+\d{1,3}[\s-]?)?\b(?:9[\s-]?\d{4}[\s-]?\d{4}|\d{9,12})\b/g;

export function maskRUT(value?: string | null): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  const clean = raw.replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length < 4) return '•••-•';
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const leading = body.length > 7 ? body.slice(0, 2) : body.slice(0, 1);
  const trailing = body.slice(-1);
  return `${leading}.•••.••${trailing}-${dv}`;
}

export function maskPhone(value?: string | null): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 6) return '••••';
  const last4 = digits.slice(-4);
  if (digits.startsWith('56') && digits.length >= 11) {
    return `+56 ${digits[2]} •••• ${last4}`;
  }
  if (raw.startsWith('+') && digits.length >= 8) {
    return `+${digits.slice(0, 2)} •••• ${last4}`;
  }
  return `••• •••• ${last4}`;
}

export function maskEmail(value?: string | null): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  const atIndex = raw.indexOf('@');
  if (atIndex <= 0 || atIndex === raw.length - 1) return '•••';
  const local = raw.slice(0, atIndex);
  const domain = raw.slice(atIndex + 1);
  const visible = local.slice(0, local.length <= 2 ? 1 : 2);
  return `${visible}•••@${domain}`;
}

export function redactSensitiveText(text: string): string {
  if (!text) return '';
  return text
    .replace(JWT_PATTERN, '[JWT_REDACTED]')
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(SECRET_PREFIX_PATTERN, '[SECRET_REDACTED]')
    .replace(EMAIL_PATTERN, (full) => maskEmail(full))
    .replace(RUT_PATTERN, (full) => maskRUT(full))
    .replace(PHONE_PATTERN, (full) => maskPhone(full));
}

export function sanitizeLogData(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (typeof value === 'string') return redactSensitiveText(value.slice(0, 400));
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeLogData(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>).slice(0, 25)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = sanitizeLogData(val, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

export function sanitizeErrorForLog(error: unknown): {
  name: string;
  code?: string;
  message: string;
} {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return {
      name: error.name || 'Error',
      ...(typeof code === 'string' || typeof code === 'number' ? { code: String(code) } : {}),
      message: redactSensitiveText(error.message || 'Unknown error').slice(0, 240),
    };
  }
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    return {
      name: typeof obj.name === 'string' ? obj.name : 'DatabaseError',
      ...(obj.code != null ? { code: String(obj.code) } : {}),
      message: redactSensitiveText(
        typeof obj.message === 'string' ? obj.message : JSON.stringify(sanitizeLogData(obj)),
      ).slice(0, 240),
    };
  }
  return {
    name: 'UnknownError',
    message: redactSensitiveText(String(error ?? 'Unknown')).slice(0, 240),
  };
}
