import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    test: {
      setupFiles: ['./tests/apply-migrations.ts'],
      poolOptions: {
        workers: {
          wrangler: { configPath: './wrangler.toml' },
          miniflare: {
            bindings: {
              TEST_MIGRATIONS: migrations,
              SESSION_PEPPER: 'test-session-pepper',
              CONTACT_HMAC_SECRET: 'test-contact-secret',
              ADMIN_PASSWORD_HASH: 'test-admin-password-hash',
              ALLOWED_ORIGINS: 'https://example.com,https://admin.example.com'
            }
          }
        }
      }
    }
  };
});
