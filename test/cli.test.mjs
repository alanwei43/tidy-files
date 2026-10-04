import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveHashFileName } from '../dist/index.js';

const project = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cli = path.join(project, 'dist', 'cli.js');
const embeddedHash = '638e29d7d72ffa2611c10a7e0eb97282';
const testCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'tidy-files-test-cwd-'));
const testEnv = { ...process.env, HOME: testCwd, USERPROFILE: testCwd };
after(() => fs.rm(testCwd, { recursive: true, force: true }));

async function fixture(t) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'tidy-files-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  return folder;
}

async function put(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}

async function present(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: testCwd, env: testEnv, encoding: 'utf8' });
}

function cacheFile(filePath) {
  return path.join(testCwd, '.tidy-files-caches', createHash('md5').update(filePath).digest('hex'));
}

test('--help displays the current package version', async () => {
  const { version } = JSON.parse(await fs.readFile(path.join(project, 'package.json'), 'utf8'));
  const result = run('--help');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`版本：${version}`), result.stdout);
});

test('commands do not create log files', async (t) => {
  const folder = await fixture(t);
  const logPath = path.join(folder, 'tidy-files.log');
  const runHere = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: folder, env: testEnv, encoding: 'utf8' });
  await put(path.join(folder, 'nested', 'song.MP3'), 'music');

  assert.equal(runHere('--help').status, 0);
  assert.equal(runHere('--version').status, 0);
  assert.equal(await present(logPath), false);

  const listed = runHere('ls-ext', folder);
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(listed.stdout.trim(), '.mp3: 1');
  const removed = runHere('rm-ext', folder, '--ext', 'mp3');
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(await present(path.join(folder, 'nested', 'song.MP3')), false);
  await put(path.join(folder, 'another.mp3'), 'music');
  assert.equal(runHere('hash-repeat', folder).status, 0);
  assert.notEqual(runHere('rm-ext', folder).status, 0);
  assert.equal(await present(logPath), false);
});

function runInteractive(args, response) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: testCwd, env: testEnv, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let answered = false;
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (!answered && stdout.includes('输入要保留的文件序号')) {
        answered = true;
        child.stdin.write(`${response}\n`);
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

test('resolveHashFileName supports the documented prefix, suffix, and path forms', () => {
  for (const fileName of [`[${embeddedHash}] Step Off - 未知歌手.mp3`, `${embeddedHash} Step Off - 未知歌手.mp3`,
    `Step Off - 未知歌手 [${embeddedHash}].mp3`, `Step Off - 未知歌手 ${embeddedHash}.mp3`]) {
    const resolved = resolveHashFileName(path.join('/music', fileName));
    assert.deepEqual(resolved, {
      hashValue: embeddedHash,
      fileNameWithoutHash: 'Step Off - 未知歌手.mp3',
      hashInEnd: `Step Off - 未知歌手 [${embeddedHash}].mp3`,
    });
  }
  assert.equal(resolveHashFileName('normal.mp3'), false);
  assert.equal(resolveHashFileName('song deadbeef.mp3'), false);
});

test('ls-ext and rm-ext recurse, normalize case, and require a selection', async (t) => {
  const folder = await fixture(t);
  await put(path.join(folder, 'one.MP3'), 'one');
  await put(path.join(folder, 'nested', 'two.mp3'), 'two');
  await put(path.join(folder, 'nested', 'three.FlAc'), 'three');
  await put(path.join(folder, 'README'), 'readme');
  const listed = run('ls-ext', folder);
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(listed.stdout.trim().split('\n'), ['.flac: 1', '.mp3: 2', '无扩展名: 1']);
  assert.notEqual(run('rm-ext', folder).status, 0);
  const removed = run('rm-ext', folder, '--ext', 'MP3,.flac');
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(await present(path.join(folder, 'one.MP3')), false);
  assert.equal(await present(path.join(folder, 'nested', 'two.mp3')), false);
  assert.equal(await present(path.join(folder, 'nested', 'three.FlAc')), false);
  assert.equal(await present(path.join(folder, 'README')), true);
});

test('rm-ext --no-ext deletes files without an extension', async (t) => {
  const folder = await fixture(t);
  await put(path.join(folder, 'README'), 'readme');
  await put(path.join(folder, 'nested', '.gitignore'), 'ignored');
  await put(path.join(folder, 'nested', 'keep.mp3'), 'music');
  await put(path.join(folder, 'trailing.'), 'trailing dot');
  const result = run('rm-ext', folder, '--no-ext');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await present(path.join(folder, 'README')), false);
  assert.equal(await present(path.join(folder, 'nested', '.gitignore')), false);
  assert.equal(await present(path.join(folder, 'nested', 'keep.mp3')), true);
  assert.equal(await present(path.join(folder, 'trailing.')), true);
});

test('rm-ext moves matches to an in-tree target and excludes that target on rerun', async (t) => {
  const folder = await fixture(t);
  const target = path.join(folder, 'removed');
  await put(path.join(folder, 'one.MP3'), 'first');
  await put(path.join(folder, 'nested', 'two.mp3'), 'second');
  await put(path.join(folder, 'nested', 'README'), 'readme');
  await put(path.join(folder, 'nested', 'keep.flac'), 'keep');
  const result = run('rm-ext', folder, '--ext', '.MP3', '--no-ext', '--target', target);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await present(path.join(folder, 'one.MP3')), false);
  assert.equal(await present(path.join(folder, 'nested', 'two.mp3')), false);
  assert.equal(await fs.readFile(path.join(target, 'one.MP3'), 'utf8'), 'first');
  assert.equal(await fs.readFile(path.join(target, 'two.mp3'), 'utf8'), 'second');
  assert.equal(await fs.readFile(path.join(target, 'README'), 'utf8'), 'readme');
  assert.equal(await present(path.join(folder, 'nested', 'keep.flac')), true);
  const rerun = run('rm-ext', folder, '--ext', 'mp3', '--no-ext', '--target', target);
  assert.equal(rerun.status, 0, rerun.stderr);
  assert.equal(rerun.stdout.trim(), '');
});

test('rm-ext uses the content hash when target names collide', async (t) => {
  const folder = await fixture(t);
  const target = path.join(folder, 'removed');
  await put(path.join(folder, 'a', 'song.mp3'), 'first');
  await put(path.join(folder, 'b', 'song.mp3'), 'second');
  const hash = createHash('md5').update('second').digest('hex');
  const result = run('rm-ext', folder, '--ext', 'mp3', '--target', target);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await fs.readFile(path.join(target, 'song.mp3'), 'utf8'), 'first');
  assert.equal(await fs.readFile(path.join(target, `song [${hash}].mp3`), 'utf8'), 'second');
});

test('h2e moves only a leading hash and trim-name changes only edge whitespace', async (t) => {
  const folder = await fixture(t);
  await put(path.join(folder, `${embeddedHash} song.mp3`), 'song');
  await put(path.join(folder, '  track  .mp3'), 'track');
  await put(path.join(folder, 'middle space.mp3'), 'middle');
  assert.equal(run('h2e', folder).status, 0);
  assert.equal(await present(path.join(folder, `song [${embeddedHash}].mp3`)), true);
  const trimmed = run('trim-name', folder);
  assert.equal(trimmed.status, 0, trimmed.stderr);
  assert.equal(await present(path.join(folder, 'track.mp3')), true);
  assert.equal(trimmed.stdout.includes('middle space.mp3'), false);
});

test('hash-repeat retains the preferred name and excludes an in-tree target', async (t) => {
  const folder = await fixture(t);
  const target = path.join(folder, 'duplicates');
  await put(path.join(folder, 'original.mp3'), 'same-content');
  await put(path.join(folder, 'nested', `original [${embeddedHash}].mp3`), 'same-content');
  await put(path.join(folder, 'nested', 'original (1).mp3'), 'same-content');
  const result = run('hash-repeat', folder, '--target', target);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await present(path.join(folder, 'original.mp3')), true);
  assert.equal(await present(path.join(target, `original [${embeddedHash}].mp3`)), true);
  assert.equal(await present(path.join(target, 'original (1).mp3')), true);
  const rerun = run('hash-repeat', folder, '--target', target);
  assert.equal(rerun.status, 0, rerun.stderr);
  assert.equal(rerun.stdout.trim(), '');
});

test('hash-repeat deletes lower-priority duplicates when no target is given', async (t) => {
  const folder = await fixture(t);
  await put(path.join(folder, 'tune.mp3'), 'same');
  await put(path.join(folder, 'sub', 'tune (1).mp3'), 'same');
  await put(path.join(folder, 'sub', `[${embeddedHash}] tune.mp3`), 'same');
  const result = run('hash-repeat', folder);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await present(path.join(folder, 'tune.mp3')), true);
  assert.equal(await present(path.join(folder, 'sub', 'tune (1).mp3')), false);
  assert.equal(await present(path.join(folder, 'sub', `[${embeddedHash}] tune.mp3`)), false);
});

test('flat-files handles name collisions using content MD5 and removes empty directories', async (t) => {
  const folder = await fixture(t);
  await put(path.join(folder, 'song.mp3'), 'root');
  await put(path.join(folder, 'nested', 'song.mp3'), 'nested');
  const hash = createHash('md5').update('nested').digest('hex');
  const result = run('flat-files', folder);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await fs.readFile(path.join(folder, 'song.mp3'), 'utf8'), 'root');
  assert.equal(await fs.readFile(path.join(folder, `song [${hash}].mp3`), 'utf8'), 'nested');
  assert.equal(await present(path.join(folder, 'nested')), false);
});

test('a second target-name collision overwrites only when MD5 and size match', async (t) => {
  const folder = await fixture(t);
  const hash = createHash('md5').update('nested').digest('hex');
  await put(path.join(folder, 'song.mp3'), 'root');
  await put(path.join(folder, `song [${hash}].mp3`), 'nested');
  await put(path.join(folder, 'nested', 'song.mp3'), 'nested');
  const result = run('flat-files', folder);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await fs.readFile(path.join(folder, `song [${hash}].mp3`), 'utf8'), 'nested');
  assert.equal(await present(path.join(folder, 'nested')), false);

  const other = await fixture(t);
  await put(path.join(other, 'song.mp3'), 'root');
  await put(path.join(other, `song [${hash}].mp3`), 'unrelated');
  await put(path.join(other, 'nested', 'song.mp3'), 'nested');
  const conflict = run('flat-files', other);
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /不能覆盖/);
  assert.equal(await fs.readFile(path.join(other, 'nested', 'song.mp3'), 'utf8'), 'nested');
  assert.equal(await fs.readFile(path.join(other, `song [${hash}].mp3`), 'utf8'), 'unrelated');
});

test('organize-name keeps the selected file, moves the rest, and removes both markers', async (t) => {
  const folder = await fixture(t);
  const target = path.join(folder, 'removed');
  await put(path.join(folder, `song [${embeddedHash}] (1).mp3`), 'chosen');
  await put(path.join(folder, 'song.mp3'), 'other');
  const result = await runInteractive(['organize-name', folder, '--target', target], '1');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1\. .* \| \d+ B \| /);
  assert.equal(await fs.readFile(path.join(folder, 'song.mp3'), 'utf8'), 'chosen');
  assert.equal(await fs.readFile(path.join(target, 'song.mp3'), 'utf8'), 'other');
  assert.equal(await present(path.join(folder, `song [${embeddedHash}] (1).mp3`)), false);
});

test('organize-name lists larger candidates first and uses path order for equal sizes', async (t) => {
  const folder = await fixture(t);
  await put(path.join(folder, 'song (1).mp3'), 'a');
  await put(path.join(folder, 'song (2).mp3'), 'largest');
  await put(path.join(folder, 'song (3).mp3'), 'b');
  await put(path.join(folder, 'song.mp3'), 'medium');

  const result = await runInteractive(['organize-name', folder], '1');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.split('\n').filter((line) => /^\d+\. /.test(line)), [
    `1. song (2).mp3 | 7 B | ${folder}`,
    `2. song.mp3 | 6 B | ${folder}`,
    `3. song (1).mp3 | 1 B | ${folder}`,
    `4. song (3).mp3 | 1 B | ${folder}`,
  ]);
  assert.equal(await fs.readFile(path.join(folder, 'song.mp3'), 'utf8'), 'largest');
});

test('organize-name skips a group after an invalid answer', async (t) => {
  const folder = await fixture(t);
  await put(path.join(folder, `song [${embeddedHash}].mp3`), 'same');
  await put(path.join(folder, 'song (1).mp3'), 'same');
  const result = await runInteractive(['organize-name', folder], '9');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.match(/输入要保留的文件序号/g)?.length, 1);
  assert.equal(await present(path.join(folder, `song [${embeddedHash}].mp3`)), true);
  assert.equal(await present(path.join(folder, 'song (1).mp3')), true);
});

test('organize-name deletes unselected files when no target is given', async (t) => {
  const folder = await fixture(t);
  await put(path.join(folder, 'song (1).mp3'), 'chosen');
  await put(path.join(folder, 'song.mp3'), 'other');
  const result = await runInteractive(['organize-name', folder], '1');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await fs.readFile(path.join(folder, 'song.mp3'), 'utf8'), 'chosen');
  assert.equal(await present(path.join(folder, 'song (1).mp3')), false);
});

test('a conflicting in-place rename is skipped without overwriting', async (t) => {
  const folder = await fixture(t);
  await put(path.join(folder, '  song.mp3'), 'trimmed');
  await put(path.join(folder, 'song.mp3'), 'existing');
  const result = run('trim-name', folder);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /重命名冲突/);
  assert.equal(await fs.readFile(path.join(folder, 'song.mp3'), 'utf8'), 'existing');
  assert.equal(await fs.readFile(path.join(folder, '  song.mp3'), 'utf8'), 'trimmed');
});

test('content hashes use matching cache metadata and refresh invalid entries', async (t) => {
  const folder = await fixture(t);
  const filePath = path.join(folder, 'song.mp3');
  const actualHash = createHash('md5').update('first').digest('hex');
  const otherHash = createHash('md5').update('other').digest('hex');
  await put(filePath, 'first');

  assert.equal(run('hash-repeat', folder).status, 0);
  const cachePath = cacheFile(filePath);
  const entry = JSON.parse(await fs.readFile(cachePath, 'utf8'));
  const stat = await fs.stat(filePath);
  assert.deepEqual(entry, {
    filePath,
    size: stat.size,
    mtime: stat.mtime.toISOString(),
    ctime: stat.ctime.toISOString(),
    crtime: stat.birthtime.toISOString(),
    hash: actualHash,
  });

  await fs.writeFile(cachePath, JSON.stringify({ ...entry, hash: otherHash }));
  assert.equal(run('hash-repeat', folder).status, 0);
  assert.equal(JSON.parse(await fs.readFile(cachePath, 'utf8')).hash, otherHash);

  for (const change of [
    { filePath: `${filePath}.different` },
    { size: stat.size + 1 },
    { mtime: '2000-01-01T00:00:00.000Z' },
    { ctime: '2000-01-01T00:00:00.000Z' },
    { crtime: '2000-01-01T00:00:00.000Z' },
    { ctime: undefined },
  ]) {
    await fs.writeFile(cachePath, JSON.stringify({ ...entry, ...change, hash: otherHash }));
    assert.equal(run('hash-repeat', folder).status, 0);
    assert.equal(JSON.parse(await fs.readFile(cachePath, 'utf8')).hash, actualHash);
  }

  await fs.writeFile(cachePath, 'invalid json');
  assert.equal(run('hash-repeat', folder).status, 0);
  assert.equal(JSON.parse(await fs.readFile(cachePath, 'utf8')).hash, actualHash);

  await fs.writeFile(filePath, 'other');
  const changed = new Date(stat.mtimeMs + 5000);
  await fs.utimes(filePath, changed, changed);
  assert.equal(run('hash-repeat', folder).status, 0);
  assert.equal(JSON.parse(await fs.readFile(cachePath, 'utf8')).hash, otherHash);
});

test('moves and deletes maintain path-specific hash caches', async (t) => {
  const folder = await fixture(t);
  const oldPath = path.join(folder, 'nested', 'song.mp3');
  const movedPath = path.join(folder, 'song.mp3');
  await put(oldPath, 'nested');
  assert.equal(run('flat-files', folder).status, 0);
  assert.equal(await present(cacheFile(oldPath)), false);
  assert.equal(JSON.parse(await fs.readFile(cacheFile(movedPath), 'utf8')).hash,
    createHash('md5').update('nested').digest('hex'));

  assert.equal(run('rm-ext', folder, '--ext', 'mp3').status, 0);
  assert.equal(await present(cacheFile(movedPath)), false);

  const spacedPath = path.join(folder, '  track.mp3');
  const trimmedPath = path.join(folder, 'track.mp3');
  await put(spacedPath, 'track');
  assert.equal(run('hash-repeat', folder).status, 0);
  assert.equal(await present(cacheFile(spacedPath)), true);
  assert.equal(run('trim-name', folder).status, 0);
  assert.equal(await present(cacheFile(spacedPath)), false);
  assert.equal(JSON.parse(await fs.readFile(cacheFile(trimmedPath), 'utf8')).hash,
    createHash('md5').update('track').digest('hex'));
});

test('an unavailable cache directory does not stop content hashing', async (t) => {
  const folder = await fixture(t);
  const home = await fixture(t);
  await put(path.join(home, '.tidy-files-caches'), 'blocked');
  await put(path.join(folder, 'song.mp3'), 'music');
  const result = spawnSync(process.execPath, [cli, 'hash-repeat', folder], {
    cwd: testCwd,
    env: { ...testEnv, HOME: home, USERPROFILE: home },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
});
