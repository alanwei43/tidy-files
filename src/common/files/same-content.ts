import type { FileInfo } from './file-info.js';

export function sameContent(a: Pick<FileInfo, 'size' | 'hash'>, b: Pick<FileInfo, 'size' | 'hash'>): boolean {
    return a.size === b.size && a.hash === b.hash;
}
