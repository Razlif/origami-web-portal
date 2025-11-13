import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '..', '.env');

const result = config({ path: envPath });

if (result.error) {
  console.warn('⚠️ No .env file found at server/.env. Environment variables will rely on the host process.');
} else {
  console.log('✅ .env loaded successfully');
}

console.log('Loaded ORIGAMI_ENVIRONMENT:', process.env.ORIGAMI_ENVIRONMENT || '(not set)');
