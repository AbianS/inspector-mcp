export function greetUser(name: string): string {
  const message = `Hello, ${name}!`; // line 14 — good breakpoint target
  const upper = message.toUpperCase();
  const result = `${message} (${upper})`;
  console.log('[greet] produced:', result);
  return result;
}

export function greetMany(names: string[]): string[] {
  const results: string[] = [];

  for (const name of names) {
    // line 22 — loop breakpoint target
    const greeting = greetUser(name);
    results.push(greeting);
  }

  return results;
}
