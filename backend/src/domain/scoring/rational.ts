/**
 * Exact rational arithmetic over BigInt.
 *
 * `class-domain.md` forbids quantizing intermediate scoring values to integer
 * hundredths, so every scoring computation (configured weights, match values
 * in {1, 0.5, 0}, the 0.55/0.30/0.15 policy coefficients, `months/12`) is
 * carried as an exact fraction. Only the final displayed columns are rounded,
 * once, at the very end (`allocateDisplayed` in `./index.ts`).
 *
 * All values used by the scoring domain are non-negative (scores, weights,
 * years, contributions); the cents helpers below assume that and throw on a
 * negative input rather than silently mishandling a sign.
 */

export interface Rational {
  readonly num: bigint;
  readonly den: bigint; // always > 0
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) {
    [a, b] = [b, a % b];
  }
  return a === 0n ? 1n : a;
}

function normalize(num: bigint, den: bigint): Rational {
  if (den === 0n) throw new Error("Rational: division by zero.");
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  if (num === 0n) return { num: 0n, den: 1n };
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

export const ZERO: Rational = { num: 0n, den: 1n };

export function fromInt(n: number | bigint): Rational {
  return normalize(BigInt(n), 1n);
}

/** Parses a `Decimal`-shaped string (openapi.yaml pattern `^-?(0|[1-9][0-9]*)(\.[0-9]+)?$`) into an exact fraction. */
export function fromDecimal(s: string): Rational {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s.trim());
  if (!match) throw new Error(`Rational.fromDecimal: not a decimal string: "${s}"`);
  const [, sign, intPart, fracPart = ""] = match;
  const den = 10n ** BigInt(fracPart.length);
  const num = BigInt(intPart) * den + BigInt(fracPart || "0");
  return normalize(sign === "-" ? -num : num, den);
}

export function add(a: Rational, b: Rational): Rational {
  return normalize(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function sub(a: Rational, b: Rational): Rational {
  return normalize(a.num * b.den - b.num * a.den, a.den * b.den);
}

export function mul(a: Rational, b: Rational): Rational {
  return normalize(a.num * b.num, a.den * b.den);
}

export function div(a: Rational, b: Rational): Rational {
  if (b.num === 0n) throw new Error("Rational: division by zero.");
  return normalize(a.num * b.den, a.den * b.num);
}

export function cmp(a: Rational, b: Rational): -1 | 0 | 1 {
  const lhs = a.num * b.den;
  const rhs = b.num * a.den;
  if (lhs < rhs) return -1;
  if (lhs > rhs) return 1;
  return 0;
}

export function min(a: Rational, b: Rational): Rational {
  return cmp(a, b) <= 0 ? a : b;
}

export function max(a: Rational, b: Rational): Rational {
  return cmp(a, b) >= 0 ? a : b;
}

/**
 * Renders at a fixed decimal `scale`, truncating toward zero. Values in this
 * domain are non-negative, so truncation never needs a sign correction.
 * Callers that need rounding (the displayed columns) go through
 * `roundTo2`/`floorTo2` — or, for cent-accurate remainder distribution,
 * `toCentsRoundHalfUp`/`toCentsFloor` — before formatting.
 */
export function toDecimalString(r: Rational, scale: number): string {
  if (r.num < 0n) throw new Error("toDecimalString: negative values are not used in scoring.");
  const scaleFactor = 10n ** BigInt(scale);
  const scaled = (r.num * scaleFactor) / r.den; // truncates
  const s = scaled.toString().padStart(scale + 1, "0");
  const intPart = s.slice(0, s.length - scale) || "0";
  return scale > 0 ? `${intPart}.${s.slice(s.length - scale)}` : intPart;
}

/** Floors to 2 decimal places (== truncation, since values are non-negative), as an exact Rational. */
export function floorTo2(r: Rational): Rational {
  return normalize(toCentsFloor(r), 100n);
}

/** Rounds half-up to 2 decimal places, as an exact Rational. */
export function roundTo2(r: Rational): Rational {
  return normalize(toCentsRoundHalfUp(r), 100n);
}

/** `r` truncated to whole cents (hundredths), as a bigint — the floor, since `r >= 0`. */
export function toCentsFloor(r: Rational): bigint {
  if (r.num < 0n) throw new Error("toCentsFloor: negative values are not used in scoring.");
  return (r.num * 100n) / r.den;
}

/** `r` rounded half-up to whole cents (hundredths), as a bigint. */
export function toCentsRoundHalfUp(r: Rational): bigint {
  if (r.num < 0n) throw new Error("toCentsRoundHalfUp: negative values are not used in scoring.");
  const scaled = r.num * 100n;
  const q = scaled / r.den;
  const rem = scaled % r.den;
  return 2n * rem >= r.den ? q + 1n : q;
}
