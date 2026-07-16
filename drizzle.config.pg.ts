import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config for the Postgres dialect migration generator.
 *
 * Usage:
 *   pnpm db:generate:pg
 *
 * See app/_db/schema.postgres.ts for why this is a separate schema file from
 * the one application code queries against.
 */
export default defineConfig({
  schema: './app/_db/schema.postgres.ts',
  out: './migrations/postgres',
  dialect: 'postgresql',
  verbose: true,
});
