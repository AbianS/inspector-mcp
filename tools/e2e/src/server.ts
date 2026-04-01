import { runAsync } from './scenarios/async.js';
import { riskyOperation } from './scenarios/errors.js';
import { greetUser } from './scenarios/greet.js';
import { processOrders } from './scenarios/orders.js';

// ─── Console scenarios ────────────────────────────────────────────────────────
// Test: debug_read_console with level filters

console.log('[server] Starting e2e test server');
console.info('[server] Node version:', process.version);
console.warn('[server] This is a WARNING — useful for level filter tests');
console.error('[server] This is an ERROR — useful for level filter tests');

// ─── Tick counter ─────────────────────────────────────────────────────────────
// Test: console buffer fills over time, pagination with offset/limit

let tick = 0;

setInterval(() => {
  tick++;
  console.log(`[tick] #${tick} — time: ${new Date().toISOString()}`);

  // Every 5 ticks run the greet scenario
  if (tick % 5 === 0) {
    const result = greetUser('world');
    console.log(`[tick] greet result: "${result}"`);
  }
}, 1000);

// ─── Order processing ─────────────────────────────────────────────────────────
// Test: breakpoints on loops, object inspection, step-over through iterations

setInterval(() => {
  const orders = [
    { id: 'A1', product: 'Widget', qty: 3, price: 9.99 },
    { id: 'B2', product: 'Gadget', qty: 1, price: 49.99 },
    { id: 'C3', product: 'Doohickey', qty: 7, price: 4.49 },
  ];
  processOrders(orders);
}, 3000);

// ─── Async scenario ───────────────────────────────────────────────────────────
// Test: step-into async functions, Promise chains, await expressions

setInterval(() => {
  runAsync().catch((err: unknown) => {
    console.error('[server] async error:', err);
  });
}, 7000);

// ─── Error scenario ───────────────────────────────────────────────────────────
// Test: debug_pause, exception breakpoints, error inspection

setInterval(() => {
  try {
    riskyOperation(Math.random() > 0.5 ? 'safe' : 'boom');
  } catch (err) {
    console.error('[server] caught error:', (err as Error).message);
  }
}, 5000);

console.log('[server] All intervals registered. Ready for debugging.');
console.log('[server] Tip: set a breakpoint in src/scenarios/greet.ts:5');
