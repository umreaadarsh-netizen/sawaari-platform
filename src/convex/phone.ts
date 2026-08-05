// Shared Indian phone number helpers (pure — usable from any Convex runtime).

/** Normalize an Indian phone number to `91` + 10 digits (E.164-ish). */
export function normalizeIndianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const withoutCc = digits.startsWith("91") ? digits.slice(2) : digits;
  return `91${withoutCc}`;
}

export function isValidIndianPhone(phone: string): boolean {
  return /^91[6-9]\d{9}$/.test(phone);
}

/** Mask a number for display: 91XXXXXXXXXX -> +91 XXXXX-XXXXX */
export function maskPhone(phone: string): string {
  const local = phone.slice(2);
  return `+91 ${local.slice(0, 5)}-${local.slice(5)}`;
}

/** Strip a number for a wa.me deep link (digits only, 91 prefix). */
export function waNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("91") ? digits : `91${digits}`;
}
