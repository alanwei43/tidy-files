#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { flattenFiles, hashToEnd, listExtensions, organizeNames, removeExtensions, removeRepeatedHashes, trimNames, } from './commands.js';
try {
    await yargs(hideBin(process.argv))
        .scriptName('tidy-files')
        .usage('$0 <command> <folder> [options]')
        .command('ls-ext <folder>', '列出递归目录中的扩展名和文件数量', (builder) => builder.positional('folder', { type: 'string', demandOption: true }), async (argv) => listExtensions(argv.folder))
        .command('rm-ext <folder>', '按扩展名删除或移动文件', (builder) => builder
        .parserConfiguration({ 'boolean-negation': false })
        .positional('folder', { type: 'string', demandOption: true })
        .option('ext', { type: 'string', describe: '逗号分隔的扩展名' })
        .option('no-ext', { type: 'boolean', describe: '匹配没有扩展名的文件' })
        .option('target', { type: 'string', describe: '移动匹配的文件到该目录' }), async (argv) => removeExtensions(argv.folder, argv.ext, argv.target, argv.noExt))
        .command('h2e <folder>', '将文件名开头的 hash 移到末尾', (builder) => builder.positional('folder', { type: 'string', demandOption: true }), async (argv) => hashToEnd(argv.folder))
        .command('hash-repeat <folder>', '删除或移动内容重复的文件', (builder) => builder
        .positional('folder', { type: 'string', demandOption: true })
        .option('target', { type: 'string', describe: '移动重复文件到该目录' }), async (argv) => removeRepeatedHashes(argv.folder, argv.target))
        .command('flat-files <folder>', '将子目录中的文件移到根目录', (builder) => builder.positional('folder', { type: 'string', demandOption: true }), async (argv) => flattenFiles(argv.folder))
        .command('trim-name <folder>', '去掉文件名首尾空白', (builder) => builder.positional('folder', { type: 'string', demandOption: true }), async (argv) => trimNames(argv.folder))
        .command('organize-name <folder>', '交互式整理重复文件名', (builder) => builder
        .positional('folder', { type: 'string', demandOption: true })
        .option('target', { type: 'string', describe: '移动未选中的文件到该目录' }), async (argv) => organizeNames(argv.folder, argv.target))
        .demandCommand(1)
        .strict()
        .help()
        .parseAsync();
}
catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
}
