import type {
  ComputedFormulaIssue,
  ComputedFormulaPreviewResponse
} from './column-config.types';

type Token =
  | { type: 'number'; value: number }
  | { type: 'column'; value: string }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' }
  | { type: 'left_paren' }
  | { type: 'right_paren' };

const operatorPrecedence: Record<'+' | '-' | '*' | '/', number> = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2
};

function normalizeLabel(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenize(expression: string): { tokens: Token[]; issues: ComputedFormulaIssue[] } {
  const tokens: Token[] = [];
  const issues: ComputedFormulaIssue[] = [];
  let index = 0;

  while (index < expression.length) {
    const current = expression[index];

    if (/\s/.test(current)) {
      index += 1;
      continue;
    }

    if (current === '{' && expression[index + 1] === '{') {
      const end = expression.indexOf('}}', index + 2);

      if (end === -1) {
        issues.push({
          code: 'syntax',
          message: 'Unclosed column reference. Use {{Column Name}}.'
        });
        break;
      }

      const columnLabel = expression.slice(index + 2, end).trim();
      if (!columnLabel) {
        issues.push({
          code: 'syntax',
          message: 'Column reference cannot be empty.'
        });
      } else {
        tokens.push({ type: 'column', value: columnLabel });
      }

      index = end + 2;
      continue;
    }

    if (/[0-9.]/.test(current)) {
      let end = index + 1;
      while (end < expression.length && /[0-9.]/.test(expression[end])) {
        end += 1;
      }

      const rawNumber = expression.slice(index, end);
      const parsed = Number(rawNumber);
      if (!Number.isFinite(parsed)) {
        issues.push({
          code: 'syntax',
          message: `Invalid number "${rawNumber}".`
        });
      } else {
        tokens.push({ type: 'number', value: parsed });
      }

      index = end;
      continue;
    }

    if (current === '+' || current === '-' || current === '*' || current === '/') {
      tokens.push({ type: 'operator', value: current });
      index += 1;
      continue;
    }

    if (current === '(') {
      tokens.push({ type: 'left_paren' });
      index += 1;
      continue;
    }

    if (current === ')') {
      tokens.push({ type: 'right_paren' });
      index += 1;
      continue;
    }

    issues.push({
      code: 'syntax',
      message: `Unsupported character "${current}".`
    });
    index += 1;
  }

  return { tokens, issues };
}

function toRpn(tokens: Token[]): { rpn: Token[]; issues: ComputedFormulaIssue[] } {
  const output: Token[] = [];
  const operators: Token[] = [];
  const issues: ComputedFormulaIssue[] = [];
  let previous: Token | null = null;

  for (const token of tokens) {
    if (token.type === 'number' || token.type === 'column') {
      output.push(token);
      previous = token;
      continue;
    }

    if (token.type === 'operator') {
      const isUnaryMinus =
        token.value === '-' &&
        (previous === null ||
          previous.type === 'operator' ||
          previous.type === 'left_paren');

      if (isUnaryMinus) {
        output.push({ type: 'number', value: 0 });
      }

      while (operators.length > 0) {
        const top = operators[operators.length - 1];
        if (top.type !== 'operator') {
          break;
        }

        if (
          operatorPrecedence[top.value] >= operatorPrecedence[token.value]
        ) {
          output.push(operators.pop() as Token);
          continue;
        }

        break;
      }

      operators.push(token);
      previous = token;
      continue;
    }

    if (token.type === 'left_paren') {
      operators.push(token);
      previous = token;
      continue;
    }

    if (token.type === 'right_paren') {
      let foundLeftParen = false;
      while (operators.length > 0) {
        const top = operators.pop() as Token;
        if (top.type === 'left_paren') {
          foundLeftParen = true;
          break;
        }
        output.push(top);
      }

      if (!foundLeftParen) {
        issues.push({
          code: 'syntax',
          message: 'Mismatched parenthesis in expression.'
        });
      }

      previous = token;
    }
  }

  while (operators.length > 0) {
    const top = operators.pop() as Token;
    if (top.type === 'left_paren' || top.type === 'right_paren') {
      issues.push({
        code: 'syntax',
        message: 'Mismatched parenthesis in expression.'
      });
      continue;
    }
    output.push(top);
  }

  return { rpn: output, issues };
}

function parseNumeric(value: string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return 0;
  }

  const normalized = String(value).replace(/,/g, '').trim();
  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function evaluateRpn(
  rpn: Token[],
  row: Record<string, string | null>,
  availableColumns: Set<string>
) {
  const stack: number[] = [];
  const issues: ComputedFormulaIssue[] = [];
  const referencedColumns = new Set<string>();
  const normalizedRow = new Map(
    Object.entries(row).map(([key, value]) => [normalizeLabel(key), value] as const)
  );
  const normalizedAvailable = new Set(
    Array.from(availableColumns).map(column => normalizeLabel(column))
  );

  for (const token of rpn) {
    if (token.type === 'number') {
      stack.push(token.value);
      continue;
    }

    if (token.type === 'column') {
      referencedColumns.add(token.value);
      const normalizedColumn = normalizeLabel(token.value);
      if (!normalizedAvailable.has(normalizedColumn)) {
        issues.push({
          code: 'column_missing',
          message: `Column "${token.value}" is not available from Meta columns.`
        });
        stack.push(0);
        continue;
      }

      const rawValue = normalizedRow.get(normalizedColumn);
      const parsed = parseNumeric(rawValue);
      if (parsed === null) {
        issues.push({
          code: 'type',
          message: `Column "${token.value}" has non-numeric value "${rawValue ?? ''}".`
        });
        stack.push(0);
        continue;
      }

      stack.push(parsed);
      continue;
    }

    if (token.type === 'operator') {
      const right = stack.pop();
      const left = stack.pop();

      if (left === undefined || right === undefined) {
        issues.push({
          code: 'syntax',
          message: 'Invalid operator placement in expression.'
        });
        continue;
      }

      switch (token.value) {
        case '+':
          stack.push(left + right);
          break;
        case '-':
          stack.push(left - right);
          break;
        case '*':
          stack.push(left * right);
          break;
        case '/':
          if (right === 0) {
            issues.push({
              code: 'divide_by_zero',
              message: 'Divide by zero detected in expression.'
            });
            stack.push(0);
            break;
          }
          stack.push(left / right);
          break;
      }
    }
  }

  if (stack.length !== 1) {
    issues.push({
      code: 'syntax',
      message: 'Expression could not be resolved to a single value.'
    });
  }

  return {
    result: stack.length > 0 ? stack[stack.length - 1] : null,
    issues,
    referencedColumns: Array.from(referencedColumns)
  };
}

export function previewFormulaExpression(input: {
  expression: string;
  row: Record<string, string | null>;
  availableColumns: string[];
}): ComputedFormulaPreviewResponse {
  const normalizedExpression = input.expression.trim();
  const availableColumns = new Set(input.availableColumns.map(column => column.trim()));

  if (!normalizedExpression) {
    return {
      isValid: false,
      result: null,
      referencedColumns: [],
      issues: [
        {
          code: 'syntax',
          message: 'Expression is required.'
        }
      ]
    };
  }

  const tokenized = tokenize(normalizedExpression);
  if (tokenized.issues.length > 0) {
    return {
      isValid: false,
      result: null,
      referencedColumns: [],
      issues: tokenized.issues
    };
  }

  const parsed = toRpn(tokenized.tokens);
  if (parsed.issues.length > 0) {
    return {
      isValid: false,
      result: null,
      referencedColumns: [],
      issues: parsed.issues
    };
  }

  const evaluated = evaluateRpn(parsed.rpn, input.row, availableColumns);
  const allIssues = evaluated.issues;

  return {
    isValid: allIssues.length === 0,
    result: allIssues.length === 0 ? evaluated.result : null,
    referencedColumns: evaluated.referencedColumns,
    issues: allIssues
  };
}

