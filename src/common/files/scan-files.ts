import path from 'node:path';
import { promises as fs } from 'node:fs';
import { compareText } from '../compare-text.js';
import { cacheDirectory } from './cache/cache-directory.js';
import { contentHash } from './content-hash.js';
import type { FileInfo } from './file-info.js';

function isWithin(directory: string, possibleChild: string): boolean {
    const relative = path.relative(directory, possibleChild);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export async function scanFiles(folder: string, excludedDirectory?: string, includeHash = true, options?: {
    excludedFile?: string;
    onFile?: () => void;
}): Promise<Map<string, FileInfo>> {
    const files = new Map<string, FileInfo>();
    async function visit(directory: string): Promise<void> {
        if (isWithin(cacheDirectory, directory) || (excludedDirectory && isWithin(excludedDirectory, directory)))
            return;
        const entries = (await fs.readdir(directory, { withFileTypes: true }))
            .sort((a, b) => compareText(a.name, b.name));
        for (const entry of entries) {
            const fullPath = path.join(directory, entry.name);
            if (entry.isSymbolicLink())
                continue;
            if (entry.isDirectory()) {
                await visit(fullPath);
            }
            else if (entry.isFile()) {
                if (fullPath === options?.excludedFile)
                    continue;
                const stat = await fs.stat(fullPath);
                options?.onFile?.();
                files.set(fullPath, {
                    stat,
                    fullPath,
                    directory,
                    fileName: entry.name,
                    size: stat.size,
                    hash: includeHash ? await contentHash(fullPath, stat) : '',
                });
            }
        }
    }
    await visit(folder);
    return files;
}
