// Load .env first so real DATABASE_URL is available for integration tests
import { config } from 'dotenv';
config();

// Then set test defaults only for vars not in .env
if (!process.env.GEMINIGEN_API_KEY) {
  process.env.GEMINIGEN_API_KEY = 'test-geminigen-key';
}
if (!process.env.DEMO_MODE) {
  process.env.DEMO_MODE = 'false';
}
if (!process.env.BOT_TOKEN) {
  process.env.BOT_TOKEN = 'test-token:AAtest';
}
if (!process.env.DUITKU_MERCHANT_CODE) {
  process.env.DUITKU_MERCHANT_CODE = 'TEST001';
}
if (!process.env.DUITKU_API_KEY) {
  process.env.DUITKU_API_KEY = 'test-api-key';
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-characters-long';
}
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
}
if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = 'redis://localhost:6379';
}
if (!process.env.ADMIN_PASSWORD) {
  process.env.ADMIN_PASSWORD = 'test-admin-password';
}
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}
