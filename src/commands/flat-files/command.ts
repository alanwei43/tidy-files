import { ensureSourceFolder } from '../../common/files/ensure-source-folder.js';
import { moveToTarget } from '../../common/files/move-to-target.js';
import { scanFiles } from '../../common/files/scan-files.js';
import { removeEmptySubdirectories } from './remove-empty-subdirectories.js';

export async function flattenFiles(folder: string): Promise<void> {
    const source = await ensureSourceFolder(folder);
    const files = await scanFiles(source, undefined, true);
    for (const info of files.values()) {
        if (info.directory === source)
            continue;
        const moved = await moveToTarget(info, source);
        console.log(`已移动: ${info.fullPath} -> ${moved}`);
    }
    await removeEmptySubdirectories(source);
}
