import { compareText } from '../compare-text.js';
import type { FileInfo } from '../files/file-info.js';

export function compareCandidates(a: FileInfo, b: FileInfo): number {
    return b.size - a.size || compareText(a.fullPath, b.fullPath);
}
