/**
 * Currency utilities strictly enforcing integer paise representation.
 * All backend and database calculations must remain in integer paise.
 */

/**
 * Converts rupees to integer paise without float imprecision.
 * Example: 500.50 -> 50050
 */
export function rupeesToPaise(rupees: number | string): number {
  const num = typeof rupees === 'string' ? parseFloat(rupees) : rupees;
  if (isNaN(num)) {
    throw new Error('Invalid rupee amount provided');
  }
  return Math.round(num * 100);
}

/**
 * Converts integer paise to rupees for UI display purposes.
 * Example: 50050 -> 500.5
 */
export function paiseToRupees(paise: number | bigint): number {
  return Number(paise) / 100;
}

/**
 * Formats integer paise into Indian Rupee (INR) currency string with ₹ symbol.
 * Example: 5000000 -> "₹50,000" or "₹50,000.00"
 */
export function formatPaiseToINR(
  paise: number | bigint,
  options?: { showDecimals?: boolean; includeSymbol?: boolean },
): string {
  const showDecimals = options?.showDecimals ?? false;
  const includeSymbol = options?.includeSymbol ?? true;
  const rupees = Number(paise) / 100;

  const formatted = new Intl.NumberFormat('en-IN', {
    style: includeSymbol ? 'currency' : 'decimal',
    currency: 'INR',
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(rupees);

  return formatted;
}

