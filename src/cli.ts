#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { flattenFiles, hashToEnd, listExtensions, organizeNames, removeExtensions, removeRepeatedHashes, trimNames, } from './commands.js';
import { withFileLog } from './log.js';
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
try {
    await yargs(hideBin(process.argv))
        .scriptName('tidy-files')
        .usage('$0 <command> <folder> [options]')
        .command('ls-ext <folder>', '列出递归目录中的扩展名和文件数量', (builder) => builder.positional('folder', { type: 'string', demandOption: true }), async (argv) => withFileLog('ls-ext', argv.folder, (log) => listExtensions(argv.folder, log)))
        .command('rm-ext <folder>', '按扩展名删除或移动文件', (builder) => builder
        .parserConfiguration({ 'boolean-negation': false })
        .positional('folder', { type: 'string', demandOption: true })
        .option('ext', { type: 'string', describe: '逗号分隔的扩展名' })
        .option('no-ext', { type: 'boolean', describe: '匹配没有扩展名的文件' })
        .option('target', { type: 'string', describe: '移动匹配的文件到该目录' }), async (argv) => withFileLog('rm-ext', argv.folder, (log) => removeExtensions(argv.folder, argv.ext, argv.target, argv.noExt, log)))
        .command('h2e <folder>', '将文件名开头的 hash 移到末尾', (builder) => builder.positional('folder', { type: 'string', demandOption: true }), async (argv) => withFileLog('h2e', argv.folder, (log) => hashToEnd(argv.folder, log)))
        .command('hash-repeat <folder>', '删除或移动内容重复的文件', (builder) => builder
        .positional('folder', { type: 'string', demandOption: true })
        .option('target', { type: 'string', describe: '移动重复文件到该目录' }), async (argv) => withFileLog('hash-repeat', argv.folder, (log) => removeRepeatedHashes(argv.folder, argv.target, log)))
        .command('flat-files <folder>', '将子目录中的文件移到根目录', (builder) => builder.positional('folder', { type: 'string', demandOption: true }), async (argv) => withFileLog('flat-files', argv.folder, (log) => flattenFiles(argv.folder, log)))
        .command('trim-name <folder>', '去掉文件名首尾空白', (builder) => builder.positional('folder', { type: 'string', demandOption: true }), async (argv) => withFileLog('trim-name', argv.folder, (log) => trimNames(argv.folder, log)))
        .command('organize-name <folder>', '交互式整理重复文件名', (builder) => builder
        .positional('folder', { type: 'string', demandOption: true })
        .option('target', { type: 'string', describe: '移动未选中的文件到该目录' }), async (argv) => withFileLog('organize-name', argv.folder, (log) => organizeNames(argv.folder, argv.target, log)))
        .demandCommand(1)
        .strict()
        .epilogue(`版本：${version}`)
        .version('version', '显示版本号', version)
        .help()
        .parseAsync();
}
catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
}
