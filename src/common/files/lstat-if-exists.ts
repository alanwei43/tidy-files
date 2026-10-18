import { promises as fs } from 'node:fs';
import type { Stats } from 'node:fs';

export async function lstatIfExists(filePath: string): Promise<Stats | undefined> {
    try {
        return await fs.lstat(filePath);
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return undefined;
        throw error;
    }
}
