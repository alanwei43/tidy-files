import path from 'node:path';
import { promises as fs } from 'node:fs';
import { readCachedHash } from './cache/read-cached-hash.js';
import { updateMovedCache } from './cache/update-moved-cache.js';
import { exists } from './exists.js';
import type { FileInfo } from './file-info.js';

export async function renameInPlace(info: FileInfo, newFileName: string): Promise<string | false> {
    const destination = path.join(info.directory, newFileName);
    if (destination === info.fullPath)
        return destination;
    if (await exists(destination))
        return false;
    const hash = info.hash || await readCachedHash(info.fullPath, info.stat) || '';
    await fs.rename(info.fullPath, destination);
    await updateMovedCache(info.fullPath, destination, hash);
    return destination;
}
