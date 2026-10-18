import path from 'node:path';
import type { FileInfo } from '../../common/files/file-info.js';
import { normalizeFileName } from '../../common/names/normalize-file-name.js';
import { compareCandidates } from '../../common/selection/compare-candidates.js';

export function keepRepeatCandidates(info: FileInfo, files: Map<string, FileInfo>, onlyHash: boolean): FileInfo[] {
    const name = path.parse(normalizeFileName(info.fileName).name).name;
    return [...files.values()].filter((candidate) => candidate.hash === info.hash
        || (!onlyHash && name.length > 0 && path.parse(candidate.fileName).name.includes(name)))
        .sort(compareCandidates);
}
