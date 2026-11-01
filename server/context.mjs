import { AsyncLocalStorage } from 'node:async_hooks';
const key = Symbol.for('cashtech.requestContext');
export const requestContext = globalThis[key] ?? (globalThis[key] = new AsyncLocalStorage());
