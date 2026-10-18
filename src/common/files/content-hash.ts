import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { Stats } from 'node:fs';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { readCachedHash } from './cache/read-cached-hash.js';
import { writeCachedHash } from './cache/write-cached-hash.js';

export async function contentHash(filePath: string, knownStat?: Stats): Promise<string> {
    const absolute = path.resolve(filePath);
    const stat = knownStat ?? await fs.stat(absolute);
    const cached = await readCachedHash(absolute, stat);
    if (cached !== undefined)
        return cached;
    const hash = createHash('md5');
    for await (const chunk of createReadStream(absolute))
        hash.update(chunk);
    const digest = hash.digest('hex');
    await writeCachedHash(absolute, stat, digest);
    return digest;
}
