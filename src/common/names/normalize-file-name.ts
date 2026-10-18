import path from 'node:path';
import { resolveHashFileName } from './resolve-hash-file-name.js';

const DUPLICATE_SUFFIX = /\s*(?:\(\d+\)|（\d+）)$/u;

function stripDuplicateSuffix(fileName: string): string | false {
    const { name, ext } = path.parse(fileName);
    const stem = name.replace(DUPLICATE_SUFFIX, '');
    return stem === name ? false : `${stem}${ext}`;
}

export function normalizeFileName(fileName: string): { name: string; hasHash: boolean; hasDuplicateSuffix: boolean } {
    let name = fileName;
    let hasHash = false;
    let hasDuplicateSuffix = false;
    // Both "song [hash] (1)" and "song (1) [hash]" are handled.
    for (let i = 0; i < 4; i += 1) {
        const withoutSuffix = stripDuplicateSuffix(name);
        if (withoutSuffix) {
            name = withoutSuffix;
            hasDuplicateSuffix = true;
            continue;
        }
        const resolved = resolveHashFileName(name);
        if (resolved) {
            name = resolved.fileNameWithoutHash;
            hasHash = true;
            continue;
        }
        break;
    }
    return { name, hasHash, hasDuplicateSuffix };
}
