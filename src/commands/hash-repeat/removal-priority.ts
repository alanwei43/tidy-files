import { compareText } from '../../common/compare-text.js';
import type { FileInfo } from '../../common/files/file-info.js';
import { normalizeFileName } from '../../common/names/normalize-file-name.js';

const DUPLICATE_MARKER = /(?:\(\d+\)|（\d+）)/u;

export function removalPriority(a: FileInfo, b: FileInfo): number {
    const aHash = normalizeFileName(a.fileName).hasHash ? 1 : 0;
    const bHash = normalizeFileName(b.fileName).hasHash ? 1 : 0;
    if (aHash !== bHash)
        return bHash - aHash;
    const aDuplicate = DUPLICATE_MARKER.test(a.fileName) ? 1 : 0;
    const bDuplicate = DUPLICATE_MARKER.test(b.fileName) ? 1 : 0;
    if (aDuplicate !== bDuplicate)
        return bDuplicate - aDuplicate;
    if (a.fileName.length !== b.fileName.length)
        return a.fileName.length - b.fileName.length;
    return compareText(b.fullPath, a.fullPath);
}
