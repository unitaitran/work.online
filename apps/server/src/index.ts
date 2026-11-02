import { fileURLToPath } from 'node:url';
import { GAME_NAME } from '@dilam/shared';
import { buildApp } from './app';
import { loadConfig, loadDotEnvIfPresent } from './config';

// .env nằm ở gốc repo. src/index.ts (dev) và dist/index.js (build) đều sâu 3 cấp.
loadDotEnvIfPresent(fileURLToPath(new URL('../../../.env', import.meta.url)));

const config = loadConfig(process.env);
const app = buildApp({ config });

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
}
process.once('SIGINT', (signal) => void shutdown(signal));
process.once('SIGTERM', (signal) => void shutdown(signal));

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`${GAME_NAME} server ready`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
