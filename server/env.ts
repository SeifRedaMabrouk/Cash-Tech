export const env = {
  get DB() {
    return (globalThis as any).__cashtechEnv.DB as D1Database;
  },
  get BUCKET() {
    return (globalThis as any).__cashtechEnv.BUCKET as R2Bucket;
  },
};
