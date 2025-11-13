import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.resolve(__dirname, '..', 'client', 'public');
const FAVICON_PATH = path.join(PUBLIC_DIR, 'favicon.ico');

const FAVICON_BASE64 = 'AAABAAEAAQEAAAEAIABEAAAAFgAAAIlQTkcNChoKAAAADUlIRFIAAAABAAAAAQgEAAAAtRwMAgAAAAtJREFUeJxjYGAAAAADAAErCU2EAAAAAElFTkSuQmCC';

const ensureFavicon = async () => {
  await fs.mkdir(PUBLIC_DIR, { recursive: true });

  try {
    await fs.access(FAVICON_PATH);
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const buffer = Buffer.from(FAVICON_BASE64, 'base64');
  await fs.writeFile(FAVICON_PATH, buffer);
  console.log('[favicon] Generated placeholder favicon.ico');
};

ensureFavicon().catch((error) => {
  console.error('[favicon] Failed to generate favicon.ico', error);
  process.exit(1);
});
