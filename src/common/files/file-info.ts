import type { Stats } from 'node:fs';

export type FileInfo = {
    stat: Stats;
    fullPath: string;
    directory: string;
    fileName: string;
    size: number;
    hash: string;
};
