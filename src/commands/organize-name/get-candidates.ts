import type { FileInfo } from '../../common/files/file-info.js';
import { sameContent } from '../../common/files/same-content.js';
import { normalizeFileName } from '../../common/names/normalize-file-name.js';

export function getCandidates(info: FileInfo, files: Map<string, FileInfo>): FileInfo[] {
    const normalized = normalizeFileName(info.fileName);
    return [...files.values()].filter((candidate) => sameContent(info, candidate)
        || ((normalized.hasHash || normalized.hasDuplicateSuffix)
            && normalizeFileName(candidate.fileName).name === normalized.name));
}
