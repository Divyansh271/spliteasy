/**
 * Converts a rupee string (e.g. "1,234.50", "99", "₹50.5") to integer paise
 * without using floating-point arithmetic.
 */
export function toPaise(rupeesString: string): number {
  const cleaned = rupeesString.replace(/[₹,\s]/g, '');
  if (!cleaned) {
    throw new Error('Amount is required');
  }

  // Normalize leading decimal like ".50" -> "0.50"
  const normalized = cleaned.startsWith('.') ? `0${cleaned}` : cleaned;
  const match = normalized.match(/^(\d+)(?:\.(\d{1,2}))?$/);

  if (!match) {
    throw new Error('Enter a valid amount with up to 2 decimal places');
  }

  const wholeRupees = Number.parseInt(match[1], 10);
  const paiseDigits = (match[2] ?? '').padEnd(2, '0');
  const fractionalPaise = Number.parseInt(paiseDigits, 10);

  return wholeRupees * 100 + fractionalPaise;
}

/**
 * Formats integer paise as Indian Rupee currency with Indian digit grouping,
 * e.g. 123450 -> "₹1,234.50", 10000000 -> "₹1,00,000.00".
 */
export function formatINR(paise: number): string {
  if (!Number.isFinite(paise)) {
    return '₹0.00';
  }

  const truncated = Math.trunc(paise);
  const isNegative = truncated < 0;
  const absPaise = Math.abs(truncated);
  const rupees = Math.floor(absPaise / 100);
  const remainder = absPaise % 100;

  const formattedRupees = new Intl.NumberFormat('en-IN').format(rupees);
  const formattedPaise = String(remainder).padStart(2, '0');

  return `${isNegative ? '-' : ''}₹${formattedRupees}.${formattedPaise}`;
}
