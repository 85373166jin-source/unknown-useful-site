export interface Env {
  DB: D1Database;
  SCREENSHOTS: R2Bucket;
  SESSION_PEPPER: string;
  CONTACT_HMAC_SECRET: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD_HASH: string;
  SUPER_COURSE_PASSWORD_HASH: string;
  ANBU_COURSE_PASSWORD_HASH: string;
  ALLOWED_ORIGINS: string;
  SEED_TOKEN?: string;
}
