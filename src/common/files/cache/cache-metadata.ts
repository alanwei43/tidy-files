import type { Stats } from 'node:fs';

export type HashCacheEntry = {
    filePath: string;
    size: number;
    hash: string;
    mtime: string;
    ctime: string;
    crtime: string;
};

export function cacheMetadata(filePath: string, stat: Stats): Omit<HashCacheEntry, 'hash'> {
    return {
        filePath,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        ctime: stat.ctime.toISOString(),
        crtime: stat.birthtime.toISOString(),
    };
}
