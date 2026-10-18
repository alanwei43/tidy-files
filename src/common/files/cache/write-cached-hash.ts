import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { Stats } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { cacheDirectory } from './cache-directory.js';
import { cacheMetadata } from './cache-metadata.js';
import { cachePath } from './cache-path.js';

export async function writeCachedHash(filePath: string, stat: Stats, hash: string): Promise<void> {
    const temporary = path.join(cacheDirectory, `.${randomUUID()}.tmp`);
    try {
        await fs.mkdir(cacheDirectory, { recursive: true });
        const { size, mtime, ctime, crtime } = cacheMetadata(filePath, stat);
        await fs.writeFile(temporary, JSON.stringify({ filePath, size, hash, mtime, ctime, crtime }), { flag: 'wx' });
        await fs.rename(temporary, cachePath(filePath));
    }
    catch {
        // Cache failures must not interrupt file operations.
    }
    finally {
        try {
            await fs.rm(temporary, { force: true });
        }
        catch {
            // The cache directory may be unavailable.
        }
    }
}
