import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { ensureSourceFolder, exists, moveToTarget, prepareTarget, removeEmptySubdirectories, renameInPlace, sameContent, scanFiles, type FileInfo } from './files.js';
import { DUPLICATE_MARKER, normalizeFileName, resolveHashFileName } from './names.js';
import { noLog, type Log } from './log.js';
function compareText(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}
export async function listExtensions(folder: string, log: Log = noLog): Promise<void> {
    const source = await ensureSourceFolder(folder);
    const files = await scanFiles(source, undefined, false, log);
    const counts = new Map<string, number>();
    for (const info of files.values()) {
        const extension = path.extname(info.fileName).toLowerCase() || '无扩展名';
        await log.write(`匹配结果 ${info.fullPath}: ${extension}`);
        counts.set(extension, (counts.get(extension) ?? 0) + 1);
    }
    for (const extension of [...counts.keys()].sort(compareText))
        console.log(`${extension}: ${counts.get(extension)}`);
}
export async function removeExtensions(folder: string, extensionList?: string, target?: string, noExtension = false, log: Log = noLog): Promise<void> {
    if (extensionList === undefined && !noExtension)
        throw new Error('必须提供 --ext 或 --no-ext');
    const extensions = extensionList === undefined ? [] : extensionList.split(',').map((extension) => extension.trim().toLowerCase().replace(/^\./, ''));
    if (extensions.some((extension) => !extension || extension.includes('.'))) {
        throw new Error('--ext 必须是用逗号分隔的扩展名，例如 mp3,.flac');
    }
    const source = await ensureSourceFolder(folder);
    const destination = target ? await prepareTarget(source, target) : undefined;
    const files = await scanFiles(source, destination, !!destination, log);
    const selected = new Set(extensions);
    for (const info of files.values()) {
        const extension = path.extname(info.fileName).toLowerCase();
        const matched = (!extension && noExtension) || selected.has(extension.slice(1));
        await log.write(`匹配结果 ${info.fullPath}: ${matched ? '匹配' : '未匹配'}${extension ? ` (${extension})` : ' (无扩展名)'}`);
        if (matched) {
            if (destination) {
                const moved = await moveToTarget(info, destination);
                console.log(`已移动: ${info.fullPath} -> ${moved}`);
                await log.write(`已移动文件 ${info.fullPath} -> ${moved}`);
            }
            else {
                await fs.unlink(info.fullPath);
                console.log(`已删除: ${info.fullPath}`);
                await log.write(`已删除文件 ${info.fullPath}`);
            }
        }
    }
}
export async function hashToEnd(folder: string, log: Log = noLog): Promise<void> {
    const source = await ensureSourceFolder(folder);
    const files = await scanFiles(source, undefined, false, log);
    for (const info of files.values()) {
        const resolved = resolveHashFileName(info.fileName);
        if (!resolved || !info.fileName.startsWith(`[${resolved.hashValue}]`) && !info.fileName.startsWith(resolved.hashValue)) {
            await log.write(`匹配结果 ${info.fullPath}: 未匹配开头 hash`);
            continue;
        }
        await log.write(`匹配结果 ${info.fullPath}: 匹配开头 hash ${resolved.hashValue}`);
        const renamed = await renameInPlace(info, resolved.hashInEnd);
        if (renamed) {
            console.log(`${info.fullPath} -> ${renamed}`);
            await log.write(`已重命名文件 ${info.fullPath} -> ${renamed}`);
        }
        else {
            console.error(`重命名冲突，已跳过: ${info.fullPath}`);
            await log.write(`重命名冲突，已跳过 ${info.fullPath}`);
        }
    }
}
function removalPriority(a: FileInfo, b: FileInfo): number {
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
export async function removeRepeatedHashes(folder: string, target?: string, log: Log = noLog): Promise<void> {
    const source = await ensureSourceFolder(folder);
    const destination = target ? await prepareTarget(source, target) : undefined;
    const files = await scanFiles(source, destination, true, log);
    const groups = new Map<string, FileInfo[]>();
    for (const info of files.values()) {
        const key = `${info.size}:${info.hash}`;
        groups.set(key, [...(groups.get(key) ?? []), info]);
    }
    for (const group of groups.values()) {
        if (group.length < 2) {
            await log.write(`匹配结果 ${group[0].fullPath}: 未发现重复文件`);
            continue;
        }
        group.sort(removalPriority);
        await log.write(`匹配结果 ${group.map((info) => info.fullPath).join('、')}: 内容重复，保留 ${group.at(-1)!.fullPath}`);
        for (const info of group.slice(0, -1)) {
            if (destination) {
                const moved = await moveToTarget(info, destination);
                console.log(`已移动: ${info.fullPath} -> ${moved}`);
                await log.write(`已移动文件 ${info.fullPath} -> ${moved}`);
            }
            else {
                await fs.unlink(info.fullPath);
                console.log(`已删除: ${info.fullPath}`);
                await log.write(`已删除文件 ${info.fullPath}`);
            }
        }
    }
}
export async function flattenFiles(folder: string, log: Log = noLog): Promise<void> {
    const source = await ensureSourceFolder(folder);
    const files = await scanFiles(source, undefined, true, log);
    for (const info of files.values()) {
        if (info.directory === source) {
            await log.write(`匹配结果 ${info.fullPath}: 已在根目录`);
            continue;
        }
        await log.write(`匹配结果 ${info.fullPath}: 位于子目录，需移动`);
        const moved = await moveToTarget(info, source);
        console.log(`已移动: ${info.fullPath} -> ${moved}`);
        await log.write(`已移动文件 ${info.fullPath} -> ${moved}`);
    }
    await removeEmptySubdirectories(source, log);
}
export async function trimNames(folder: string, log: Log = noLog): Promise<void> {
    const source = await ensureSourceFolder(folder);
    const files = await scanFiles(source, undefined, false, log);
    for (const info of files.values()) {
        const { name, ext } = path.parse(info.fileName);
        const trimmed = name.trim();
        if (trimmed === name) {
            await log.write(`匹配结果 ${info.fullPath}: 文件名无需去空白`);
            continue;
        }
        await log.write(`匹配结果 ${info.fullPath}: 文件名首尾有空白`);
        if (!trimmed) {
            console.error(`文件名去空白后为空，已跳过: ${info.fullPath}`);
            await log.write(`文件名去空白后为空，已跳过 ${info.fullPath}`);
            continue;
        }
        const renamed = await renameInPlace(info, `${trimmed}${ext}`);
        if (renamed) {
            console.log(`${info.fullPath} -> ${renamed}`);
            await log.write(`已重命名文件 ${info.fullPath} -> ${renamed}`);
        }
        else {
            console.error(`重命名冲突，已跳过: ${info.fullPath}`);
            await log.write(`重命名冲突，已跳过 ${info.fullPath}`);
        }
    }
}
function getCandidates(info: FileInfo, files: Map<string, FileInfo>): FileInfo[] {
    const normalized = normalizeFileName(info.fileName);
    return [...files.values()].filter((candidate) => sameContent(info, candidate)
        || ((normalized.hasHash || normalized.hasDuplicateSuffix)
            && normalizeFileName(candidate.fileName).name === normalized.name));
}
export async function organizeNames(folder: string, target?: string, log: Log = noLog): Promise<void> {
    const source = await ensureSourceFolder(folder);
    const destination = target ? await prepareTarget(source, target) : undefined;
    const FILES_INFO: Map<string, FileInfo> = await scanFiles(source, destination, true, log);
    const promptedGroups = new Set<string>();
    const input = createInterface({ input: process.stdin, output: process.stdout });
    try {
        for (const scanned of [...FILES_INFO.values()]) {
            const info = FILES_INFO.get(scanned.fullPath);
            if (!info)
                continue;
            const normalized = normalizeFileName(info.fileName);
            if (!normalized.hasHash && !normalized.hasDuplicateSuffix) {
                await log.write(`匹配结果 ${info.fullPath}: 文件名无需整理`);
                continue;
            }
            const candidates = getCandidates(info, FILES_INFO).sort((a, b) => compareText(a.fullPath, b.fullPath));
            const groupKey = candidates.map((candidate) => candidate.fullPath).join('\0');
            if (promptedGroups.has(groupKey))
                continue;
            promptedGroups.add(groupKey);
            await log.write(`匹配结果 ${info.fullPath}: 候选文件 ${candidates.map((candidate) => candidate.fullPath).join('、')}`);
            for (const [index, candidate] of candidates.entries()) {
                console.log(`${index + 1}. ${candidate.fileName} | ${candidate.size} B | ${candidate.directory}`);
            }
            let answer;
            try {
                answer = (await input.question('输入要保留的文件序号（回车跳过）: ')).trim();
            }
            catch {
                await log.write(`输入结束，停止整理 ${info.fullPath}`);
                break;
            }
            if (!/^[1-9]\d*$/.test(answer)) {
                await log.write(`已跳过候选组 ${groupKey.replaceAll('\0', '、')}: 未选择有效序号`);
                continue;
            }
            const index = Number(answer) - 1;
            if (!Number.isSafeInteger(index) || index >= candidates.length) {
                await log.write(`已跳过候选组 ${groupKey.replaceAll('\0', '、')}: 序号超出范围`);
                continue;
            }
            const selected = candidates[index];
            await log.write(`已选择保留文件 ${selected.fullPath}`);
            const cleanedName = normalizeFileName(selected.fileName).name;
            const cleanedPath = path.join(selected.directory, cleanedName);
            // A candidate occupying the cleaned name will be moved or deleted first.
            if (cleanedPath !== selected.fullPath && await exists(cleanedPath)
                && !candidates.some((candidate) => candidate.fullPath === cleanedPath)) {
                console.error(`重命名冲突，已跳过该组: ${cleanedPath}`);
                await log.write(`重命名冲突，已跳过该组 ${cleanedPath}`);
                continue;
            }
            for (const candidate of candidates) {
                if (candidate.fullPath === selected.fullPath)
                    continue;
                if (destination) {
                    const moved = await moveToTarget(candidate, destination);
                    console.log(`已移动: ${candidate.fullPath} -> ${moved}`);
                    await log.write(`已移动文件 ${candidate.fullPath} -> ${moved}`);
                }
                else {
                    await fs.unlink(candidate.fullPath);
                    console.log(`已删除: ${candidate.fullPath}`);
                    await log.write(`已删除文件 ${candidate.fullPath}`);
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
                await log.write(`已重命名文件 ${selected.fullPath} -> ${renamed}`);
            }
        }
    }
    finally {
        input.close();
    }
}
