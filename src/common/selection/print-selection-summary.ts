

export function printSelectionSummary(kept: number, processed: number, moved: boolean): void {
    console.log(`保留${kept}个文件，${moved ? '移动' : '删除'}${processed}个文件\n`);
}
