import path from 'node:path';
export type ResolvedHashFileName = {
    hashValue: string;
    fileNameWithoutHash: string;
    hashInEnd: string;
};
const HASH = '[a-fA-F0-9]{32}';
const LEADING_HASH = new RegExp(`^(?:\\[(${HASH})\\]|(${HASH}))\\s+(.+)$`);
const TRAILING_HASH = new RegExp(`^(.+?)\\s+(?:\\[(${HASH})\\]|(${HASH}))$`);
const DUPLICATE_SUFFIX = /\s*(?:\(\d+\)|（\d+）)$/u;
export const DUPLICATE_MARKER = /(?:\(\d+\)|（\d+）)/u;
/** Resolve a standalone 32-character hex hash at the start or end of a basename. */
export function resolveHashFileName(fileName: string): false | ResolvedHashFileName {
    const { name, ext } = path.parse(path.basename(fileName));
    const leading = LEADING_HASH.exec(name);
    const trailing = leading ? null : TRAILING_HASH.exec(name);
    const hashValue = leading?.[1] ?? leading?.[2] ?? trailing?.[2] ?? trailing?.[3];
    const withoutHash = leading?.[3] ?? trailing?.[1];
    if (!hashValue || !withoutHash?.trim())
        return false;
    const stem = withoutHash.trim();
    return {
        hashValue,
        fileNameWithoutHash: `${stem}${ext}`,
        hashInEnd: `${stem} [${hashValue}]${ext}`,
    };
}
export function stripDuplicateSuffix(fileName: string): string | false {
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
