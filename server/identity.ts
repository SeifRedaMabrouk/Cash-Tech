import { requestContext } from './context.mjs';
export async function getAuthenticatedAdmin() {
  return requestContext.getStore()?.user ?? null;
}
