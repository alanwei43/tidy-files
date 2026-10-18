import { ensureSourceFolder } from '../../common/files/ensure-source-folder.js';
import type { FileInfo } from '../../common/files/file-info.js';
import { moveToTarget } from '../../common/files/move-to-target.js';
import { prepareTarget } from '../../common/files/prepare-target.js';
import { removeFile } from '../../common/files/remove-file.js';
import { scanFiles } from '../../common/files/scan-files.js';
import { DirectoryPriority } from './directory-priority.js';
import { removalPriority } from './removal-priority.js';

export async function removeRepeatedHashes(folder: string, target?: string, dirPriority?: string): Promise<void> {
    let scanned = 0;
    let processed = 0;
    let interrupted = false;
    const interrupt = () => {
        interrupted = true;
        process.exitCode = 130;
        priority?.close();
    };
    const checkInterrupted = () => {
        if (interrupted)
            throw new Error('操作已中止');
    };
    const priority = dirPriority === undefined ? undefined : new DirectoryPriority(dirPriority, interrupt);
    process.on('SIGINT', interrupt);
    try {
        const source = await ensureSourceFolder(folder);
        await priority?.prepare();
        checkInterrupted();
        const destination = target ? await prepareTarget(source, target) : undefined;
        const files = await scanFiles(source, destination, true, {
            excludedFile: priority?.file,
            onFile: () => { checkInterrupted(); scanned += 1; },
        });
        const groups = new Map<string, FileInfo[]>();
        for (const info of files.values()) {
            const key = `${info.size}:${info.hash}`;
            groups.set(key, [...(groups.get(key) ?? []), info]);
        }
        for (const group of groups.values()) {
            checkInterrupted();
            if (group.length < 2)
                continue;
            const directories = [...new Set(group.map((info) => info.directory))];
            const preferred = priority && directories.length > 1
                ? await priority.preferredDirectory(directories) : undefined;
            checkInterrupted();
            const keep = group.filter((info) => preferred === undefined || info.directory === preferred)
                .sort(removalPriority).at(-1)!;
            // Preserve the existing processing order when no directory override applies.
            for (const info of group.sort(removalPriority)) {
                if (info === keep)
                    continue;
                checkInterrupted();
                if (destination) {
                    const moved = await moveToTarget(info, destination);
                    processed += 1;
                    console.log(`已移动: ${info.fullPath} -> ${moved}`);
                }
                else {
                    await removeFile(info.fullPath);
                    processed += 1;
                    console.log(`已删除: ${info.fullPath}`);
                }
            }
        }
    }
    finally {
        priority?.close();
        process.off('SIGINT', interrupt);
        console.log(`读取检测了 ${scanned} 个文件，${target ? '移动' : '删除'} ${processed} 个文件`);
    }
}
