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

function tokenize(expression: string) {
  const tokens: Token[] = [];
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
        return null;
      }

      const columnLabel = expression.slice(index + 2, end).trim();
      if (!columnLabel) {
        return null;
      }

      tokens.push({ type: 'column', value: columnLabel });
      index = end + 2;
      continue;
    }

    if (/[0-9.]/.test(current)) {
      let end = index + 1;
      while (end < expression.length && /[0-9.]/.test(expression[end])) {
        end += 1;
      }

      const raw = expression.slice(index, end);
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        return null;
      }

      tokens.push({ type: 'number', value: parsed });
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

    return null;
  }

  return tokens;
}

function toRpn(tokens: Token[]) {
  const output: Token[] = [];
  const operators: Token[] = [];
  let previous: Token | null = null;

  for (const token of tokens) {
    if (token.type === 'number' || token.type === 'column') {
      output.push(token);
      previous = token;
      continue;
    }

    if (token.type === 'operator') {
      const unaryMinus =
        token.value === '-' &&
        (previous === null || previous.type === 'operator' || previous.type === 'left_paren');

      if (unaryMinus) {
        output.push({ type: 'number', value: 0 });
      }

      while (operators.length > 0) {
        const top = operators[operators.length - 1];
        if (top.type !== 'operator') {
          break;
        }

        if (operatorPrecedence[top.value] >= operatorPrecedence[token.value]) {
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
      let found = false;
      while (operators.length > 0) {
        const top = operators.pop() as Token;
        if (top.type === 'left_paren') {
          found = true;
          break;
        }
        output.push(top);
      }

      if (!found) {
        return null;
      }
      previous = token;
    }
  }

  while (operators.length > 0) {
    const top = operators.pop() as Token;
    if (top.type !== 'operator') {
      return null;
    }
    output.push(top);
  }

  return output;
}

function parseNumeric(value: string | null | undefined) {
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

export function evaluateFormulaExpression(input: {
  expression: string;
  row: Record<string, string | null>;
}) {
  const tokens = tokenize(input.expression.trim());
  if (!tokens) {
    return {
      value: null as number | null,
      error: 'syntax'
    };
  }

  const rpn = toRpn(tokens);
  if (!rpn) {
    return {
      value: null as number | null,
      error: 'syntax'
    };
  }

  const stack: number[] = [];
  const normalizedRow = new Map(
    Object.entries(input.row).map(([key, value]) => [normalizeLabel(key), value] as const)
  );

  for (const token of rpn) {
    if (token.type === 'number') {
      stack.push(token.value);
      continue;
    }

    if (token.type === 'column') {
      const rawValue = normalizedRow.get(normalizeLabel(token.value));
      const parsed = parseNumeric(rawValue);
      if (parsed === null) {
        return {
          value: null as number | null,
          error: 'type'
        };
      }
      stack.push(parsed);
      continue;
    }

    if (token.type === 'operator') {
      const right = stack.pop();
      const left = stack.pop();

      if (left === undefined || right === undefined) {
        return {
          value: null as number | null,
          error: 'syntax'
        };
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
            return {
              value: null as number | null,
              error: 'divide_by_zero'
            };
          }
          stack.push(left / right);
          break;
      }
    }
  }

  if (stack.length !== 1) {
    return {
      value: null as number | null,
      error: 'syntax'
    };
  }

  return {
    value: stack[0],
    error: null as null
  };
}

