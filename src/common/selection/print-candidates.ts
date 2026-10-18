import type { FileInfo } from '../files/file-info.js';

function formatFileSize(size: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = size;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    const humanSize = unit === 0 ? `${size}B` : `${value.toFixed(2)}${units[unit]}`;
    return `${humanSize}(${size}B)`;
}

export function printCandidates(candidates: FileInfo[]): void {
    console.log('序号 | hash | 文件大小 | 文件名 | 文件路径');
    for (const [index, candidate] of candidates.entries())
        console.log(`${index + 1} | ${candidate.hash} | ${formatFileSize(candidate.size)} | ${candidate.fileName} | ${candidate.fullPath}`);
}
