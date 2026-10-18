import { createInterface } from 'node:readline/promises';

export function askKeepRepeatSelection(input: ReturnType<typeof createInterface>): Promise<string | undefined> {
    return new Promise((resolve) => {
        const onClose = () => resolve(undefined);
        input.once('close', onClose);
        input.question('输入要保留的文件序号（空格或英文逗号分隔，回车跳过）: ').then(
            (answer) => {
                input.off('close', onClose);
                resolve(answer);
            },
            () => {
                input.off('close', onClose);
                resolve(undefined);
            },
        );
    });
}
