import path from 'node:path';
import { promises as fs } from 'node:fs';
import { cachePath } from './cache-path.js';

export async function discardCachedHash(filePath: string): Promise<void> {
    try {
        await fs.rm(cachePath(path.resolve(filePath)), { force: true });
    }
    catch {
        // Cache failures must not interrupt file operations.
    }
}
