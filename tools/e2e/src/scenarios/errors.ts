export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

function validate(input: string): void {
  if (input === 'boom') {
    // line 21 — set breakpoint + condition "input === 'boom'"
    throw new AppError(`Invalid input: "${input}"`, 'VALIDATION_ERROR');
  }
  if (input.length === 0) {
    throw new AppError('Input cannot be empty', 'EMPTY_INPUT');
  }
}

function transform(input: string): string {
  validate(input); // line 29 — step-into to reach validate()
  const trimmed = input.trim();
  const result = trimmed.split('').reverse().join('');
  return result;
}

export function riskyOperation(input: string): string {
  const step1 = `processing: ${input}`;
  console.log('[errors]', step1);

  const step2 = transform(input); // line 38 — inspect step1/step2 variables
  console.log('[errors] result:', step2);

  return step2;
}
