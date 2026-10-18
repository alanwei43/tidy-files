import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createInterface, type Interface } from 'node:readline';
import type { FileInfo } from '../../common/files/file-info.js';

// Owns both the persisted order and the questions needed to complete it.
export class DirectoryPriority {
    readonly file: string;
    private input?: Interface;
    private answers: string[] = [];
    private waiting?: (answer: string | undefined) => void;
    private closed = false;

    constructor(file: string, private readonly onInterrupt: () => void) {
        this.file = path.resolve(file);
    }

    async prepare(): Promise<void> {
        await fs.mkdir(path.dirname(this.file), { recursive: true });
        try {
            const handle = await fs.open(this.file, 'wx');
            await handle.close();
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
                throw error;
        }
        if (!(await fs.lstat(this.file)).isFile())
            throw new Error(`目录优先级路径不是普通文件: ${this.file}`);
        await this.read();
    }

    private async read(): Promise<string[]> {
        const contents = await fs.readFile(this.file, 'utf8');
        const directories: string[] = [];
        const seen = new Set<string>();
        for (const [index, line] of contents.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
            if (!line.trim())
                continue;
            if (!path.isAbsolute(line))
                throw new Error(`目录优先级文件第 ${index + 1} 行必须是绝对路径: ${this.file}`);
            const directory = path.resolve(line);
            if (!seen.has(directory)) {
                seen.add(directory);
                directories.push(directory);
            }
        }
        return directories;
    }

    private async write(directories: string[]): Promise<void> {
        const temporary = path.join(path.dirname(this.file), `.${path.basename(this.file)}.${randomUUID()}.tmp`);
        try {
            const { mode } = await fs.stat(this.file);
            await fs.writeFile(temporary, `${directories.join('\n')}\n`, { flag: 'wx', mode });
            await fs.rename(temporary, this.file);
        }
        finally {
            await fs.rm(temporary, { force: true });
        }
    }

    private async answer(): Promise<string> {
        if (!this.input && !this.closed) {
            this.input = createInterface({ input: process.stdin, output: process.stdout });
            this.input.on('line', (line) => {
                if (this.waiting) {
                    const resolve = this.waiting;
                    this.waiting = undefined;
                    resolve(line);
                }
                else {
                    this.answers.push(line);
                }
            });
            this.input.on('close', () => {
                this.closed = true;
                this.waiting?.(undefined);
                this.waiting = undefined;
            });
            this.input.on('SIGINT', this.onInterrupt);
        }
        process.stdout.write('输入优先保留的目录序号（1 或 2），或 R 重新加载优先级文件: ');
        const answer = this.answers.length ? this.answers.shift()
            : this.closed ? undefined
            : await new Promise<string | undefined>((resolve) => { this.waiting = resolve; });
        if (answer === undefined)
            throw new Error('输入已结束，操作已中止');
        return answer.trim();
    }

    private async compare(first: string, second: string, files: FileInfo[]): Promise<void> {
        let directories = await this.read();
        if (directories.includes(first) && directories.includes(second))
            return;
        console.log('需要确定目录优先级:');
        for (const [index, directory] of [first, second].entries()) {
            console.log(`${index + 1}. ${directory}`);
            for (const file of files.filter((info) => info.directory === directory))
                console.log(`   文件: ${file.fileName}`);
        }
        console.log('R - 重新加载优先级文件');
        let answer = await this.answer();
        while (answer !== '1' && answer !== '2' && answer.toLowerCase() !== 'r') {
            console.error('输入无效，请输入 1、2 或 R');
            answer = await this.answer();
        }
        // Re-evaluate the entire group using the latest order in preferredDirectory.
        if (answer.toLowerCase() === 'r')
            return;
        // Manual edits made while waiting take precedence over the old question.
        directories = await this.read();
        if (directories.includes(first) && directories.includes(second))
            return;
        const winner = answer === '1' ? first : second;
        const loser = answer === '1' ? second : first;
        const winnerIndex = directories.indexOf(winner);
        const loserIndex = directories.indexOf(loser);
        if (winnerIndex !== -1)
            directories.splice(winnerIndex + 1, 0, loser);
        else if (loserIndex !== -1)
            directories.splice(loserIndex, 0, winner);
        else
            directories.push(winner, loser);
        await this.write(directories);
    }

    async preferredDirectory(files: FileInfo[]): Promise<string> {
        const directories = [...new Set(files.map((info) => info.directory))];
        while (true) {
            // This also rechecks the complete order immediately before returning
            // a winner, rather than retaining rankings from earlier questions.
            const order = await this.read();
            const first = order.find((directory) => directories.includes(directory)) ?? directories[0];
            const missing = directories.find((directory) => directory !== first && !order.includes(directory));
            if (missing === undefined && order.includes(first))
                return first;
            await this.compare(first, missing!, files);
        }
    }

    close(): void {
        this.closed = true;
        this.answers = [];
        this.waiting?.(undefined);
        this.waiting = undefined;
        this.input?.close();
    }
}
