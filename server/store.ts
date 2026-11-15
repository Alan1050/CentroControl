import { link, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface Store {
  get<T>(key: string): Promise<T | null>;
  put(key: string, value: unknown): Promise<void>;
  list<T>(prefix: string): Promise<T[]>;
}

export class MemoryStore implements Store {
  data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | null> { return structuredClone(this.data.get(key) as T ?? null); }
  async put(key: string, value: unknown) { this.data.set(key, structuredClone(value)); }
  async list<T>(prefix: string): Promise<T[]> {
    return structuredClone([...this.data].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v as T));
  }
}

/** Local development only. Events have unique keys so concurrent writes never replace each other. */
export class FileStore implements Store {
  directory: string;
  constructor(directory: string) { this.directory = directory; }
  filename(key: string) { return join(this.directory, Buffer.from(key).toString('base64url') + '.json'); }
  async get<T>(key: string): Promise<T | null> {
    try { return JSON.parse(await readFile(this.filename(key), 'utf8')) as T; }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
  }
  async put(key: string, value: unknown) {
    await mkdir(this.directory, { recursive: true });
    const temp = join(this.directory, `${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(value), { flag: 'wx' });
    try { await link(temp, this.filename(key)); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
    finally { await unlink(temp); }
  }
  async list<T>(prefix: string): Promise<T[]> {
    let names: string[];
    try { names = await readdir(this.directory); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e; }
    const selected = names.filter(n => n.endsWith('.json') && Buffer.from(n.slice(0, -5), 'base64url').toString().startsWith(prefix));
    return Promise.all(selected.map(async n => JSON.parse(await readFile(join(this.directory, n), 'utf8')) as T));
  }
}
