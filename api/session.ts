import { isAuthed, json, passwordConfigured } from '../server/auth.js';
import { storageConfigured } from '../server/store.js';

/** Always 200: tells the app whether it is signed in and whether server storage is connected. */
export default {
  async fetch(req: Request): Promise<Response> {
    const configured = passwordConfigured();
    const auth = configured && (await isAuthed(req));
    return json({ app: '2ndhome', configured, auth, storage: auth ? storageConfigured() : undefined });
  },
};
