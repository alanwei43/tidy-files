import path from 'node:path';
import { promises as fs } from 'node:fs';

export async function ensureSourceFolder(folder: string): Promise<string> {
    const absolute = path.resolve(folder);
    const stat = await fs.lstat(absolute);
    if (!stat.isDirectory())
        throw new Error(`源路径不是普通目录: ${absolute}`);
    return absolute;
}
