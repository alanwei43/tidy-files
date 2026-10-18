import { promises as fs } from 'node:fs';
import { discardCachedHash } from './cache/discard-cached-hash.js';

export async function removeFile(filePath: string): Promise<void> {
    await fs.unlink(filePath);
    await discardCachedHash(filePath);
}
