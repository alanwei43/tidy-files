import path from 'node:path';
import { promises as fs } from 'node:fs';

export async function removeEmptySubdirectories(folder: string): Promise<void> {
    async function visit(directory: string): Promise<void> {
        const entries = await fs.readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory())
                await visit(path.join(directory, entry.name));
        }
        if (directory !== folder) {
            try {
                await fs.rmdir(directory);
            }
            catch (error) {
                const code = (error as NodeJS.ErrnoException).code;
                if (code !== 'ENOTEMPTY' && code !== 'EEXIST')
                    throw error;
            }
        }
    }
    await visit(folder);
}
