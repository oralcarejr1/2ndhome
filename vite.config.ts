import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';

// `APP_PASSWORD=… npm run dev` runs the real middleware + api/ handlers locally, with a folder
// (.local-store/) standing in for the private Blob store. Without APP_PASSWORD the dev server is a
// plain static app (local-only storage), same as before.
function devServerApi(): Plugin {
  return {
    name: '2ndhome-dev-api',
    apply: 'serve',
    async configureServer(server: ViteDevServer) {
      if (!process.env.APP_PASSWORD) return;
      const load = (p: string) => server.ssrLoadModule(p);
      let ready: Promise<void> | null = null;
      const prepare = () =>
        (ready ??= (async () => {
          const { fsStorage } = await load('/server/fsStorage.ts');
          const { setStorage } = await load('/server/store.ts');
          setStorage(fsStorage(process.env.LOCAL_STORE_DIR || '.local-store'));
        })());

      const toRequest = async (req: IncomingMessage) => {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
        const body = chunks.length && req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.concat(chunks) : undefined;
        return new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body });
      };
      const send = async (res: ServerResponse, r: Response) => {
        res.statusCode = r.status;
        r.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await r.arrayBuffer()));
      };

      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '/').split('?')[0];
        const isPage = path === '/' || path === '/index.html';
        const api = /^\/api\/([a-z]+)$/.exec(path);
        if (!isPage && !api) return next(); // Vite's own module requests in dev
        try {
          await prepare();
          const request = await toRequest(req);
          const mw = (await load('/middleware.ts')).default as (r: Request) => Promise<Response>;
          const gate = await mw(request.clone());
          if (gate.headers.get('x-middleware-next') !== '1') return send(res, gate);
          if (!api) return next();
          const mod = await load(`/api/${api[1]}.ts`).catch(() => null);
          if (!mod?.default?.fetch) {
            res.statusCode = 404;
            return res.end();
          }
          return send(res, await mod.default.fetch(request));
        } catch (e) {
          console.error(e);
          res.statusCode = 500;
          res.end('dev api error');
        }
      });
    },
  };
}

// base './' so the build works from any sub-path (static hosting, file preview, claude.ai artifact).
export default defineConfig({
  base: './',
  plugins: [react(), devServerApi()],
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
  test: { environment: 'node' },
} as any);
