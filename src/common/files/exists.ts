import { lstatIfExists } from './lstat-if-exists.js';

export async function exists(filePath: string): Promise<boolean> {
    return (await lstatIfExists(filePath)) !== undefined;
}
