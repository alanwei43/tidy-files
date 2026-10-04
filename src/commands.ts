import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { ensureSourceFolder, exists, moveToTarget, prepareTarget, removeEmptySubdirectories, renameInPlace, sameContent, scanFiles, type FileInfo } from './files.js';
import { DUPLICATE_MARKER, normalizeFileName, resolveHashFileName } from './names.js';
function compareText(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}
export async function listExtensions(folder: string): Promise<void> {
    const source = await ensureSourceFolder(folder);
    const files = await scanFiles(source, undefined, false);
    const extensions = new Set([...files.values()].map((info) => path.extname(info.fileName).toLowerCase() || '无扩展名'));
    for (const extension of [...extensions].sort(compareText))
        console.log(extension);
}
export async function removeExtensions(folder: string, extensionList: string, target?: string): Promise<void> {
    const extensions = extensionList.split(',').map((extension) => extension.trim().toLowerCase().replace(/^\./, ''));
    if (extensions.some((extension) => !extension || extension.includes('.'))) {
        throw new Error('--ext 必须是用逗号分隔的扩展名，例如 mp3,.flac');
    }
    const source = await ensureSourceFolder(folder);
    const destination = target ? await prepareTarget(source, target) : undefined;
    const files = await scanFiles(source, destination, !!destination);
    const selected = new Set(extensions);
    for (const info of files.values()) {
        const extension = path.extname(info.fileName).slice(1).toLowerCase();
        if (extension && selected.has(extension)) {
            if (destination) {
                const moved = await moveToTarget(info, destination);
                console.log(`已移动: ${info.fullPath} -> ${moved}`);
            }
            else {
                await fs.unlink(info.fullPath);
                console.log(`已删除: ${info.fullPath}`);
            }
        }
    }
}
export async function hashToEnd(folder: string): Promise<void> {
    const source = await ensureSourceFolder(folder);
    const files = await scanFiles(source, undefined, false);
    for (const info of files.values()) {
        const resolved = resolveHashFileName(info.fileName);
        if (!resolved || !info.fileName.startsWith(`[${resolved.hashValue}]`) && !info.fileName.startsWith(resolved.hashValue))
            continue;
        const renamed = await renameInPlace(info, resolved.hashInEnd);
        if (renamed)
            console.log(`${info.fullPath} -> ${renamed}`);
        else
            console.error(`重命名冲突，已跳过: ${info.fullPath}`);
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
export async function removeRepeatedHashes(folder: string, target?: string): Promise<void> {
    const source = await ensureSourceFolder(folder);
    const destination = target ? await prepareTarget(source, target) : undefined;
    const files = await scanFiles(source, destination);
    const groups = new Map<string, FileInfo[]>();
    for (const info of files.values()) {
        const key = `${info.size}:${info.hash}`;
        groups.set(key, [...(groups.get(key) ?? []), info]);
    }
    for (const group of groups.values()) {
        if (group.length < 2)
            continue;
        group.sort(removalPriority);
        for (const info of group.slice(0, -1)) {
            if (destination) {
                const moved = await moveToTarget(info, destination);
                console.log(`已移动: ${info.fullPath} -> ${moved}`);
            }
            else {
                await fs.unlink(info.fullPath);
                console.log(`已删除: ${info.fullPath}`);
            }
        }
    }
}
export async function flattenFiles(folder: string): Promise<void> {
    const source = await ensureSourceFolder(folder);
    const files = await scanFiles(source);
    for (const info of files.values()) {
        if (info.directory === source)
            continue;
        const moved = await moveToTarget(info, source);
        console.log(`已移动: ${info.fullPath} -> ${moved}`);
    }
    await removeEmptySubdirectories(source);
}
export async function trimNames(folder: string): Promise<void> {
    const source = await ensureSourceFolder(folder);
    const files = await scanFiles(source, undefined, false);
    for (const info of files.values()) {
        const { name, ext } = path.parse(info.fileName);
        const trimmed = name.trim();
        if (trimmed === name)
            continue;
        if (!trimmed) {
            console.error(`文件名去空白后为空，已跳过: ${info.fullPath}`);
            continue;
        }
        const renamed = await renameInPlace(info, `${trimmed}${ext}`);
        if (renamed)
            console.log(`${info.fullPath} -> ${renamed}`);
        else
            console.error(`重命名冲突，已跳过: ${info.fullPath}`);
    }
}
function getCandidates(info: FileInfo, files: Map<string, FileInfo>): FileInfo[] {
    const normalized = normalizeFileName(info.fileName);
    return [...files.values()].filter((candidate) => sameContent(info, candidate)
        || ((normalized.hasHash || normalized.hasDuplicateSuffix)
            && normalizeFileName(candidate.fileName).name === normalized.name));
}
export async function organizeNames(folder: string, target?: string): Promise<void> {
    const source = await ensureSourceFolder(folder);
    const destination = target ? await prepareTarget(source, target) : undefined;
    const FILES_INFO: Map<string, FileInfo> = await scanFiles(source, destination);
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
            const candidates = getCandidates(info, FILES_INFO).sort((a, b) => compareText(a.fullPath, b.fullPath));
            const groupKey = candidates.map((candidate) => candidate.fullPath).join('\0');
            if (promptedGroups.has(groupKey))
                continue;
            promptedGroups.add(groupKey);
            for (const [index, candidate] of candidates.entries()) {
                console.log(`${index + 1}. ${candidate.fileName} | ${candidate.size} B | ${candidate.directory}`);
            }
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
                    await fs.unlink(candidate.fullPath);
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
        }
    }
    finally {
        input.close();
    }
}
