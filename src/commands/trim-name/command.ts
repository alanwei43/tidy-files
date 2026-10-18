import path from 'node:path';
import { ensureSourceFolder } from '../../common/files/ensure-source-folder.js';
import { renameInPlace } from '../../common/files/rename-in-place.js';
import { scanFiles } from '../../common/files/scan-files.js';

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
