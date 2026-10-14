// Keep Django's 64-bit integer quantities exact, including values above JS safe integers.
export const MAX_QUANTITY = "9223372036854775807";
export function steppedQuantity(
  value: string,
  direction: -1 | 1,
  min = "0",
  max = MAX_QUANTITY,
): string | null {
  const lower = BigInt(min),
    upper = BigInt(max);
  if (value === "") {
    const first = lower > 0n ? lower : 1n;
    return direction === 1 && first <= upper ? String(first) : null;
  }
  if (!/^\d{1,19}$/.test(value)) return null;
  const next = BigInt(value) + BigInt(direction);
  return next >= lower && next <= upper ? String(next) : null;
}
