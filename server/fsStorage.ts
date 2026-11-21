// Local stand-in for the Blob store (dev server and tests only; never imported by api/).
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { Conflict, type FileStat, type Storage } from './store.js';

export function fsStorage(root: string): Storage {
  const full = (p: string) => join(root, ...p.split('/'));
  const etagOf = (b: Uint8Array) => '"' + createHash('sha1').update(b).digest('hex') + '"';
  const st = async (p: string): Promise<FileStat | null> => {
    try {
      const f = full(p);
      const [b, s] = await Promise.all([readFile(f), stat(f)]);
      return { path: p, etag: etagOf(b), size: s.size, at: s.mtimeMs };
    } catch {
      return null;
    }
  };
  return {
    async read(p) {
      try {
        const b = new Uint8Array(await readFile(full(p)));
        const type = await readFile(full(p) + '.type', 'utf8').catch(() => 'application/octet-stream');
        return { body: b, type, etag: etagOf(b) };
      } catch {
        return null;
      }
    },
    stat: st,
    async write(p, body, type, ifMatch) {
      if (ifMatch) {
        const cur = await st(p);
        if (!cur || cur.etag !== ifMatch) throw new Conflict();
      }
      await mkdir(dirname(full(p)), { recursive: true });
      await writeFile(full(p), body);
      await writeFile(full(p) + '.type', type);
      return { etag: etagOf(body) };
    },
    async remove(p) {
      await rm(full(p), { force: true });
      await rm(full(p) + '.type', { force: true });
    },
    async listPrefix(prefix) {
      const out: FileStat[] = [];
      const walk = async (d: string) => {
        let ents;
        try {
          ents = await readdir(d, { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of ents) {
          const f = join(d, e.name);
          if (e.isDirectory()) await walk(f);
          else if (!e.name.endsWith('.type')) {
            const p = relative(root, f).split(sep).join('/');
            if (p.startsWith(prefix)) {
              const s = await st(p);
              if (s) out.push(s);
            }
          }
        }
      };
      await walk(root);
      return out;
    },
  };
}
