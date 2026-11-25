/**
 * Deterministic checking of numerical answers. Arithmetic is verified by
 * computation, never by asking a language model, so an arithmetic slip can be
 * told apart from a wrong method.
 */

export interface ParsedQuantity {
  value: number;
  unit: string | null;
}

export function parseQuantity(input: string): ParsedQuantity | null {
  let s = input.trim().replace(/−/g, '-');
  s = s.replace(/(\d),(?=\d{3}(?!\d))/g, '$1'); // thousands separators
  const m = /^(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*([^\d\s][^\s]*)?$/i.exec(s);
  if (!m) return null;
  return { value: Number(m[1]), unit: m[2] ? m[2].toLowerCase() : null };
}

export interface NumericComparison {
  equal: boolean;
  reason?: 'UNIT_MISMATCH' | 'OUT_OF_TOLERANCE' | 'UNPARSEABLE';
  relativeError?: number;
}

export function compareQuantities(
  expected: string,
  given: string,
  options: { relativeTolerance?: number; absoluteTolerance?: number } = {},
): NumericComparison {
  const e = parseQuantity(expected);
  const g = parseQuantity(given);
  if (!e || !g) return { equal: false, reason: 'UNPARSEABLE' };
  if (e.unit && g.unit && e.unit !== g.unit) return { equal: false, reason: 'UNIT_MISMATCH' };
  const absTol = options.absoluteTolerance ?? 1e-9;
  const relTol = options.relativeTolerance ?? 0.01;
  const diff = Math.abs(e.value - g.value);
  const relativeError = e.value === 0 ? diff : diff / Math.abs(e.value);
  const equal = diff <= absTol || relativeError <= relTol;
  return equal ? { equal, relativeError } : { equal, reason: 'OUT_OF_TOLERANCE', relativeError };
}

// ───────────────────────── safe arithmetic evaluation ─────────────────────────

type Token = { t: 'num'; v: number } | { t: 'op'; v: string } | { t: 'lp' } | { t: 'rp' };

function tokenize(expr: string): Token[] | null {
  const s = expr.replace(/[×x·]/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '');
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const v = Number(s.slice(i, j));
      if (!Number.isFinite(v)) return null;
      tokens.push({ t: 'num', v });
      i = j;
    } else if ('+-*/^'.includes(ch)) {
      tokens.push({ t: 'op', v: ch });
      i++;
    } else if (ch === '(') {
      tokens.push({ t: 'lp' });
      i++;
    } else if (ch === ')') {
      tokens.push({ t: 'rp' });
      i++;
    } else {
      return null; // unknown symbol: refuse rather than guess
    }
  }
  return tokens;
}

const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3, neg: 4 };

/** Evaluates + - * / ^ and parentheses. Returns null for anything it cannot evaluate exactly. */
export function evaluateArithmetic(expr: string): number | null {
  const tokens = tokenize(expr);
  if (!tokens || tokens.length === 0) return null;
  const output: Token[] = [];
  const ops: Token[] = [];
  let prevWasValue = false;
  for (const tok of tokens) {
    if (tok.t === 'num') {
      output.push(tok);
      prevWasValue = true;
    } else if (tok.t === 'op') {
      let op = tok.v;
      if (!prevWasValue && op === '-') op = 'neg';
      else if (!prevWasValue) return null;
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.t !== 'op') break;
        const higher = PRECEDENCE[top.v] > PRECEDENCE[op] || (PRECEDENCE[top.v] === PRECEDENCE[op] && op !== '^' && op !== 'neg');
        if (!higher) break;
        output.push(ops.pop() as Token);
      }
      ops.push({ t: 'op', v: op });
      prevWasValue = false;
    } else if (tok.t === 'lp') {
      ops.push(tok);
      prevWasValue = false;
    } else {
      while (ops.length && ops[ops.length - 1].t !== 'lp') output.push(ops.pop() as Token);
      if (!ops.length) return null;
      ops.pop();
      prevWasValue = true;
    }
  }
  while (ops.length) {
    const top = ops.pop() as Token;
    if (top.t === 'lp') return null;
    output.push(top);
  }
  const stack: number[] = [];
  for (const tok of output) {
    if (tok.t === 'num') stack.push(tok.v);
    else if (tok.t === 'op' && tok.v === 'neg') {
      if (stack.length < 1) return null;
      stack.push(-(stack.pop() as number));
    } else if (tok.t === 'op') {
      if (stack.length < 2) return null;
      const b = stack.pop() as number;
      const a = stack.pop() as number;
      switch (tok.v) {
        case '+': stack.push(a + b); break;
        case '-': stack.push(a - b); break;
        case '*': stack.push(a * b); break;
        case '/': if (b === 0) return null; stack.push(a / b); break;
        case '^': stack.push(Math.pow(a, b)); break;
        default: return null;
      }
    }
  }
  return stack.length === 1 && Number.isFinite(stack[0]) ? stack[0] : null;
}

export interface StepCheck {
  index: number;
  expression: string;
  claimed: number | null;
  actual: number | null;
  ok: boolean;
}

/** Verifies each written step of the form "<expression> = <value>". */
export function checkCalculationSteps(steps: string[], relativeTolerance = 0.005): StepCheck[] {
  return steps.map((step, index) => {
    const cut = step.lastIndexOf('=');
    if (cut < 0) return { index, expression: step, claimed: null, actual: null, ok: true }; // not a checkable equation
    const expression = step.slice(0, cut).trim();
    const claimed = parseQuantity(step.slice(cut + 1))?.value ?? null;
    const actual = evaluateArithmetic(expression);
    if (claimed === null || actual === null) return { index, expression, claimed, actual, ok: true }; // cannot be judged; not a failure
    const rel = actual === 0 ? Math.abs(claimed) : Math.abs(claimed - actual) / Math.abs(actual);
    return { index, expression, claimed, actual, ok: rel <= relativeTolerance };
  });
}

export type NumericErrorKind = 'CORRECT' | 'ARITHMETIC' | 'CONCEPTUAL' | 'UNIT' | 'UNKNOWN';

/**
 * Separates a slip in arithmetic (a written step does not compute) from a wrong
 * method (every step computes but the result is not the expected one).
 */
export function classifyNumericAnswer(expected: string, given: string, steps: string[] = []): NumericErrorKind {
  const cmp = compareQuantities(expected, given);
  if (cmp.equal) return 'CORRECT';
  if (cmp.reason === 'UNIT_MISMATCH') return 'UNIT';
  if (cmp.reason === 'UNPARSEABLE') return 'UNKNOWN';
  const checks = checkCalculationSteps(steps);
  if (checks.some((c) => !c.ok)) return 'ARITHMETIC';
  return steps.length > 0 ? 'CONCEPTUAL' : 'UNKNOWN';
}
