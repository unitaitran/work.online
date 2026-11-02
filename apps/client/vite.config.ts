import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

// .env dùng chung ở gốc repo. Chỉ biến có tiền tố VITE_ mới lộ ra code client.
const envDir = fileURLToPath(new URL('../..', import.meta.url));

/** Biến chưa đặt hoặc để rỗng ("PORT=") thì dùng giá trị mặc định. */
function envOr(value: string | undefined, fallback: string): string {
  return value === undefined || value === '' ? fallback : value;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, '');
  const serverTarget = `http://127.0.0.1:${envOr(env.PORT, '3000')}`;

  return {
    envDir,
    server: {
      port: Number(envOr(env.CLIENT_PORT, '5173')),
      strictPort: true,
      // Client gọi cùng origin; Vite chuyển tiếp sang server nên không cần CORS.
      proxy: {
        '/api': { target: serverTarget, changeOrigin: true },
        '/ws': { target: serverTarget, ws: true },
      },
    },
    build: {
      target: 'es2022',
      // Hai trang: game (index.html) và trang debug xem nhật ký sự kiện (events.html).
      rolldownOptions: {
        input: {
          main: fileURLToPath(new URL('index.html', import.meta.url)),
          events: fileURLToPath(new URL('events.html', import.meta.url)),
        },
      },
    },
  };
});
