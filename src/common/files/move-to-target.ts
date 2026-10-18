import path from 'node:path';
import { promises as fs } from 'node:fs';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { discardCachedHash } from './cache/discard-cached-hash.js';
import { updateMovedCache } from './cache/update-moved-cache.js';
import { contentHash } from './content-hash.js';
import { exists } from './exists.js';
import type { FileInfo } from './file-info.js';
import { lstatIfExists } from './lstat-if-exists.js';
import { sameContent } from './same-content.js';

async function movePath(source: string, destination: string, overwrite: boolean): Promise<void> {
    try {
        await fs.rename(source, destination);
        return;
    }
    catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EXDEV') {
            if (!overwrite || (code !== 'EEXIST' && code !== 'EPERM'))
                throw error;
            await fs.unlink(destination);
            await discardCachedHash(destination);
            await fs.rename(source, destination);
            return;
        }
    }
    const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${randomUUID()}.tmp`);
    try {
        await fs.copyFile(source, temporary, constants.COPYFILE_EXCL);
        if (overwrite && await exists(destination)) {
            await fs.unlink(destination);
            await discardCachedHash(destination);
        }
        await fs.rename(temporary, destination);
        await discardCachedHash(destination);
        await fs.unlink(source);
    }
    finally {
        await fs.rm(temporary, { force: true });
    }
}

export async function moveToTarget(info: FileInfo, target: string): Promise<string> {
    const initial = path.join(target, info.fileName);
    let destination = initial;
    let overwrite = false;
    if (await exists(initial)) {
        const parsed = path.parse(info.fileName);
        destination = path.join(target, `${parsed.name} [${info.hash}]${parsed.ext}`);
        const existing = await lstatIfExists(destination);
        if (existing) {
            if (!existing.isFile())
                throw new Error(`目标路径不是普通文件: ${destination}`);
            const existingInfo = { size: existing.size, hash: await contentHash(destination, existing) };
            if (!sameContent(info, existingInfo))
                throw new Error(`目标文件内容不同，不能覆盖: ${destination}`);
            overwrite = true;
        }
    }
    await movePath(info.fullPath, destination, overwrite);
    await updateMovedCache(info.fullPath, destination, info.hash);
    return destination;
}
