import path from 'node:path';
import os from 'node:os';

export const cacheDirectory = path.join(os.homedir(), '.tidy-files-caches');
