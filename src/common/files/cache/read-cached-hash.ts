import { promises as fs } from 'node:fs';
import type { Stats } from 'node:fs';
import { type HashCacheEntry, cacheMetadata } from './cache-metadata.js';
import { cachePath } from './cache-path.js';

export async function readCachedHash(filePath: string, stat: Stats): Promise<string | undefined> {
    try {
        const entry: HashCacheEntry = JSON.parse(await fs.readFile(cachePath(filePath), 'utf8'));
        const metadata = cacheMetadata(filePath, stat);
        if (entry.filePath === metadata.filePath && entry.size === metadata.size
            && entry.mtime === metadata.mtime && entry.ctime === metadata.ctime
            && entry.crtime === metadata.crtime
            && typeof entry.hash === 'string' && /^[0-9a-f]{32}$/.test(entry.hash))
            return entry.hash;
    }
    catch {
        // Missing or unreadable caches are treated as misses.
    }
    return undefined;
}
