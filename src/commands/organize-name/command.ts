import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { ensureSourceFolder } from '../../common/files/ensure-source-folder.js';
import { exists } from '../../common/files/exists.js';
import type { FileInfo } from '../../common/files/file-info.js';
import { moveToTarget } from '../../common/files/move-to-target.js';
import { prepareTarget } from '../../common/files/prepare-target.js';
import { removeFile } from '../../common/files/remove-file.js';
import { renameInPlace } from '../../common/files/rename-in-place.js';
import { scanFiles } from '../../common/files/scan-files.js';
import { normalizeFileName } from '../../common/names/normalize-file-name.js';
import { compareCandidates } from '../../common/selection/compare-candidates.js';
import { printCandidates } from '../../common/selection/print-candidates.js';
import { printSelectionSummary } from '../../common/selection/print-selection-summary.js';
import { getCandidates } from './get-candidates.js';

export async function organizeNames(folder: string, target?: string): Promise<void> {
    const source = await ensureSourceFolder(folder);
    const destination = target ? await prepareTarget(source, target) : undefined;
    const FILES_INFO: Map<string, FileInfo> = await scanFiles(source, destination, true);
    const promptedGroups = new Set<string>();
    const input = createInterface({ input: process.stdin, output: process.stdout });
    try {
        for (const scanned of [...FILES_INFO.values()]) {
            const info = FILES_INFO.get(scanned.fullPath);
            if (!info)
                continue;
            const normalized = normalizeFileName(info.fileName);
            if (!normalized.hasHash && !normalized.hasDuplicateSuffix)
                continue;
            const candidates = getCandidates(info, FILES_INFO).sort(compareCandidates);
            const groupKey = candidates.map((candidate) => candidate.fullPath).join('\0');
            if (promptedGroups.has(groupKey))
                continue;
            promptedGroups.add(groupKey);
            printCandidates(candidates);
            let answer;
            try {
                answer = (await input.question('输入要保留的文件序号（回车跳过）: ')).trim();
            }
            catch {
                break;
            }
            if (!/^[1-9]\d*$/.test(answer))
                continue;
            const index = Number(answer) - 1;
            if (!Number.isSafeInteger(index) || index >= candidates.length)
                continue;
            const selected = candidates[index];
            const cleanedName = normalizeFileName(selected.fileName).name;
            const cleanedPath = path.join(selected.directory, cleanedName);
            // A candidate occupying the cleaned name will be moved or deleted first.
            if (cleanedPath !== selected.fullPath && await exists(cleanedPath)
                && !candidates.some((candidate) => candidate.fullPath === cleanedPath)) {
                console.error(`重命名冲突，已跳过该组: ${cleanedPath}`);
                continue;
            }
            for (const candidate of candidates) {
                if (candidate.fullPath === selected.fullPath)
                    continue;
                if (destination) {
                    const moved = await moveToTarget(candidate, destination);
                    console.log(`已移动: ${candidate.fullPath} -> ${moved}`);
                }
                else {
                    await removeFile(candidate.fullPath);
                    console.log(`已删除: ${candidate.fullPath}`);
                }
                FILES_INFO.delete(candidate.fullPath);
            }
            if (cleanedPath !== selected.fullPath) {
                const renamed = await renameInPlace(selected, cleanedName);
                if (!renamed)
                    throw new Error(`重命名冲突: ${cleanedPath}`);
                FILES_INFO.delete(selected.fullPath);
                FILES_INFO.set(renamed, {
                    ...selected, fullPath: renamed, fileName: cleanedName,
                });
                console.log(`${selected.fullPath} -> ${renamed}`);
            }
            printSelectionSummary(1, candidates.length - 1, !!destination);
        }
    }
    finally {
        input.close();
    }
}
