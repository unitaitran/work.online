// Đóng gói server thành một file ESM chạy bằng `node dist/index.js`.
// Gói nội bộ @dilam/* (mã nguồn TypeScript) được gộp vào bundle;
// các gói npm khác giữ nguyên là import ngoài, lấy từ node_modules lúc chạy.
import { rmSync } from 'node:fs';
import { build, type Plugin } from 'esbuild';

const externalizeNpmPackages: Plugin = {
  name: 'externalize-npm-packages',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.kind === 'entry-point' || args.path.startsWith('@dilam/')) {
        return undefined;
      }
      return { path: args.path, external: true };
    });
  },
};

rmSync('dist', { recursive: true, force: true });

// Server + công cụ vận hành (sao lưu, khôi phục).
await build({
  entryPoints: {
    index: 'src/index.ts',
    backup: 'src/ops/backup.ts',
    restore: 'src/ops/restore.ts',
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
  plugins: [externalizeNpmPackages],
});
