import path from 'node:path';
import { ensureSourceFolder } from '../../common/files/ensure-source-folder.js';
import { moveToTarget } from '../../common/files/move-to-target.js';
import { prepareTarget } from '../../common/files/prepare-target.js';
import { removeFile } from '../../common/files/remove-file.js';
import { scanFiles } from '../../common/files/scan-files.js';

export async function removeExtensions(folder: string, extensionList?: string, target?: string, noExtension = false): Promise<void> {
    if (extensionList === undefined && !noExtension)
        throw new Error('必须提供 --ext 或 --no-ext');
    const extensions = extensionList === undefined ? [] : extensionList.split(',').map((extension) => extension.trim().toLowerCase().replace(/^\./, ''));
    if (extensions.some((extension) => !extension || extension.includes('.'))) {
        throw new Error('--ext 必须是用逗号分隔的扩展名，例如 mp3,.flac');
    }
    const source = await ensureSourceFolder(folder);
    const destination = target ? await prepareTarget(source, target) : undefined;
    const files = await scanFiles(source, destination, !!destination);
    const selected = new Set(extensions);
    for (const info of files.values()) {
        const extension = path.extname(info.fileName).toLowerCase();
        const matched = (!extension && noExtension) || selected.has(extension.slice(1));
        if (matched) {
            if (destination) {
                const moved = await moveToTarget(info, destination);
                console.log(`已移动: ${info.fullPath} -> ${moved}`);
            }
            else {
                await removeFile(info.fullPath);
                console.log(`已删除: ${info.fullPath}`);
            }
        }
    }
}
