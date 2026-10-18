import { promises as fs } from 'node:fs';
import { discardCachedHash } from './discard-cached-hash.js';
import { writeCachedHash } from './write-cached-hash.js';

export async function updateMovedCache(source: string, destination: string, hash: string): Promise<void> {
    await discardCachedHash(source);
    await discardCachedHash(destination);
    if (hash) {
        try {
            await writeCachedHash(destination, await fs.stat(destination), hash);
        }
        catch {
            // The move succeeded; failure to refresh its cache is harmless.
        }
    }
}
