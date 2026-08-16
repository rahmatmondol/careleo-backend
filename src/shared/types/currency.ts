/**
 * The one place that says what money means here.
 *
 * Amounts are stored as bare decimals with no currency attached, so every
 * consumer used to decide for itself: the app and admin panel print `$`, while
 * the AI — given tool output that was just `total: 1550` and a conversation
 * full of Bangladeshi addresses — reasonably inferred `৳`. Same order, two
 * different currencies depending on where you looked at it.
 *
 * Anything that formats or reports money should read this rather than
 * hardcoding a symbol.
 */
export const CURRENCY_CODE = process.env.APP_CURRENCY || 'USD';

const SYMBOLS: Record<string, string> = {
  USD: '$',
  BDT: '৳',
  EUR: '€',
  GBP: '£',
  INR: '₹',
};

export const CURRENCY_SYMBOL = SYMBOLS[CURRENCY_CODE] ?? CURRENCY_CODE;

/** `$1,850.00` — for anything a person reads. */
export const formatMoney = (amount: unknown): string => {
  const value = Number(amount ?? 0);
  const safe = Number.isFinite(value) ? value : 0;
  return `${CURRENCY_SYMBOL}${safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};
