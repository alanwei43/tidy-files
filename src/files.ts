import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { constants, promises as fs, type Stats } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
export type FileInfo = {
    stat: Stats;
    fullPath: string;
    directory: string;
    fileName: string;
    size: number;
    hash: string;
};
type HashCacheEntry = {
    filePath: string;
    size: number;
    hash: string;
    mtime: string;
    ctime: string;
    crtime: string;
};
const cacheDirectory = path.join(os.homedir(), '.tidy-files-caches');
function cachePath(filePath: string): string {
    return path.join(cacheDirectory, createHash('md5').update(filePath).digest('hex'));
}
function cacheMetadata(filePath: string, stat: Stats): Omit<HashCacheEntry, 'hash'> {
    return {
        filePath,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        ctime: stat.ctime.toISOString(),
        crtime: stat.birthtime.toISOString(),
    };
}
async function readCachedHash(filePath: string, stat: Stats): Promise<string | undefined> {
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
async function writeCachedHash(filePath: string, stat: Stats, hash: string): Promise<void> {
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
async function discardCachedHash(filePath: string): Promise<void> {
    try {
        await fs.rm(cachePath(path.resolve(filePath)), { force: true });
    }
    catch {
        // Cache failures must not interrupt file operations.
    }
}
async function updateMovedCache(source: string, destination: string, hash: string): Promise<void> {
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
function compareText(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}
export async function ensureSourceFolder(folder: string): Promise<string> {
    const absolute = path.resolve(folder);
    const stat = await fs.lstat(absolute);
    if (!stat.isDirectory())
        throw new Error(`源路径不是普通目录: ${absolute}`);
    return absolute;
}
export async function prepareTarget(source: string, target: string): Promise<string> {
    const absolute = path.resolve(target);
    if (absolute === source)
        throw new Error('目标目录不能与源目录相同');
    await fs.mkdir(absolute, { recursive: true });
    const stat = await fs.lstat(absolute);
    if (!stat.isDirectory())
        throw new Error(`目标路径不是普通目录: ${absolute}`);
    return absolute;
}
export function isWithin(directory: string, possibleChild: string): boolean {
    const relative = path.relative(directory, possibleChild);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
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
export async function scanFiles(folder: string, excludedDirectory?: string, includeHash = true): Promise<Map<string, FileInfo>> {
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
                const stat = await fs.stat(fullPath);
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
export function sameContent(a: Pick<FileInfo, 'size' | 'hash'>, b: Pick<FileInfo, 'size' | 'hash'>): boolean {
    return a.size === b.size && a.hash === b.hash;
}
async function lstatIfExists(filePath: string): Promise<Stats | undefined> {
    try {
        return await fs.lstat(filePath);
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return undefined;
        throw error;
    }
}
export async function exists(filePath: string): Promise<boolean> {
    return (await lstatIfExists(filePath)) !== undefined;
}
export async function removeFile(filePath: string): Promise<void> {
    await fs.unlink(filePath);
    await discardCachedHash(filePath);
}
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
export async function removeEmptySubdirectories(folder: string): Promise<void> {
    async function visit(directory: string): Promise<void> {
        const entries = await fs.readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory())
                await visit(path.join(directory, entry.name));
        }
        if (directory !== folder) {
            try {
                await fs.rmdir(directory);
            }
            catch (error) {
                const code = (error as NodeJS.ErrnoException).code;
                if (code !== 'ENOTEMPTY' && code !== 'EEXIST')
                    throw error;
            }
        }
    }
    await visit(folder);
}
