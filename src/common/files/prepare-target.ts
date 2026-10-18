import path from 'node:path';
import { promises as fs } from 'node:fs';

export async function prepareTarget(source: string, target: string): Promise<string> {
    const absolute = path.resolve(target);
    if (absolute === source)
        throw new Error('目标目录不能与源目录相同');
    await fs.mkdir(absolute, { recursive: true });
    const stat = await fs.lstat(absolute);
    if (!stat.isDirectory())
        throw new Error(`目标路径不是普通目录: ${absolute}`);
    return absolute;
}
