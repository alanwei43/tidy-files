import path from 'node:path';
import { createHash } from 'node:crypto';
import { cacheDirectory } from './cache-directory.js';

export function cachePath(filePath: string): string {
    return path.join(cacheDirectory, createHash('md5').update(filePath).digest('hex'));
}
