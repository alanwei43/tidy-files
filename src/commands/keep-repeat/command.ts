import { createInterface } from 'node:readline/promises';
import { ensureSourceFolder } from '../../common/files/ensure-source-folder.js';
import { moveToTarget } from '../../common/files/move-to-target.js';
import { prepareTarget } from '../../common/files/prepare-target.js';
import { removeFile } from '../../common/files/remove-file.js';
import { renameInPlace } from '../../common/files/rename-in-place.js';
import { scanFiles } from '../../common/files/scan-files.js';
import { normalizeFileName } from '../../common/names/normalize-file-name.js';
import { printCandidates } from '../../common/selection/print-candidates.js';
import { printSelectionSummary } from '../../common/selection/print-selection-summary.js';
import { askKeepRepeatSelection } from './ask-keep-repeat-selection.js';
import { keepRepeatCandidates } from './keep-repeat-candidates.js';
import { parseKeepRepeatSelection } from './parse-keep-repeat-selection.js';

export async function keepRepeatedFiles(folder: string, target?: string, onlyHash = false): Promise<void> {
    const source = await ensureSourceFolder(folder);
    const destination = target ? await prepareTarget(source, target) : undefined;
    const files = await scanFiles(source, destination, true);
    const input = createInterface({ input: process.stdin, output: process.stdout });
    let inputClosed = false;
    input.on('close', () => { inputClosed = true; });
    try {
        for (const scanned of [...files.values()]) {
            if (inputClosed)
                break;
            const info = files.get(scanned.fullPath);
            if (info !== scanned)
                continue;
            const candidates = keepRepeatCandidates(info, files, onlyHash);
            const normalized = normalizeFileName(info.fileName);
            if (candidates.length === 1 && (onlyHash || (!normalized.hasHash && !normalized.hasDuplicateSuffix)))
                continue;
            printCandidates(candidates);
            const response = await askKeepRepeatSelection(input);
            if (response === undefined)
                break;
            const answer = response.trim();
            if (!answer)
                continue;
            const selectedIndexes = parseKeepRepeatSelection(answer, candidates.length);
            if (!selectedIndexes) {
                console.error('输入无效，已跳过该轮');
                continue;
            }
            for (const [index, candidate] of candidates.entries()) {
                if (selectedIndexes.has(index))
                    continue;
                if (destination) {
                    const moved = await moveToTarget(candidate, destination);
                    console.log(`已移动: ${candidate.fullPath} -> ${moved}`);
                }
                else {
                    await removeFile(candidate.fullPath);
                    console.log(`已删除: ${candidate.fullPath}`);
                }
                files.delete(candidate.fullPath);
            }
            for (const [index, candidate] of candidates.entries()) {
                if (!selectedIndexes.has(index))
                    continue;
                const cleanedName = normalizeFileName(candidate.fileName).name;
                if (cleanedName === candidate.fileName)
                    continue;
                const renamed = await renameInPlace(candidate, cleanedName);
                if (!renamed) {
                    console.error(`重命名冲突，已保留原名: ${candidate.fullPath}`);
                    continue;
                }
                files.delete(candidate.fullPath);
                files.set(renamed, { ...candidate, fullPath: renamed, fileName: cleanedName });
                console.log(`${candidate.fullPath} -> ${renamed}`);
            }
            printSelectionSummary(selectedIndexes.size, candidates.length - selectedIndexes.size, !!destination);
        }
    }
    finally {
        input.close();
    }
}
