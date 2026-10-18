import path from 'node:path';
import { compareText } from '../../common/compare-text.js';
import { ensureSourceFolder } from '../../common/files/ensure-source-folder.js';
import { scanFiles } from '../../common/files/scan-files.js';

export async function listExtensions(folder: string): Promise<void> {
    const source = await ensureSourceFolder(folder);
    const files = await scanFiles(source, undefined, false);
    const counts = new Map<string, number>();
    for (const info of files.values()) {
        const extension = path.extname(info.fileName).toLowerCase() || '无扩展名';
        counts.set(extension, (counts.get(extension) ?? 0) + 1);
    }
    for (const extension of [...counts.keys()].sort(compareText))
        console.log(`${extension}: ${counts.get(extension)}`);
}
