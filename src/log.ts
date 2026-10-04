import { promises as fs } from 'node:fs';
import path from 'node:path';

export type Log = {
    filePath?: string;
    write(message: string): Promise<void>;
};

export const noLog: Log = { async write() {} };

function timestamp(): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export async function withFileLog(command: string, folder: string, action: (log: Log) => Promise<void>): Promise<void> {
    const filePath = path.resolve('tidy-files.log');
    const handle = await fs.open(filePath, 'a');
    const log: Log = {
        filePath,
        async write(message) {
            await handle.write(`[${timestamp()}] ${message.replaceAll(/[\r\n]/g, ' ')}\n`);
        },
    };
    try {
        await log.write(`开始执行 ${command}，源目录 ${path.resolve(folder)}`);
        await action(log);
        await log.write(`执行完成 ${command}`);
    }
    catch (error) {
        await log.write(`执行失败 ${command}: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
    finally {
        await handle.close();
    }
}
