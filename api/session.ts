import { isAuthed, json, passwordConfigured } from '../server/auth.js';
import { INDEX_PATH, storage, storageConfigured } from '../server/store.js';

/** Always 200: tells the app whether it is signed in and whether server storage actually works. */
export default {
  async fetch(req: Request): Promise<Response> {
    const configured = passwordConfigured();
    const auth = configured && (await isAuthed(req));
    if (!auth) return json({ app: '2ndhome', configured, auth });
    let ok = false;
    let storageError: string | undefined;
    if (storageConfigured()) {
      try {
        await storage(req).stat(INDEX_PATH); // one cheap call proves the credentials and the store
        ok = true;
      } catch (e) {
        storageError = String((e as Error)?.message ?? e).slice(0, 300);
        console.error('storage probe', e);
      }
    } else storageError = 'not_configured';
    return json({ app: '2ndhome', configured, auth, storage: ok, storageError });
  },
};
