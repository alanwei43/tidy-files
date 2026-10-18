import { ensureSourceFolder } from '../../common/files/ensure-source-folder.js';
import { renameInPlace } from '../../common/files/rename-in-place.js';
import { scanFiles } from '../../common/files/scan-files.js';
import { resolveHashFileName } from '../../common/names/resolve-hash-file-name.js';

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
