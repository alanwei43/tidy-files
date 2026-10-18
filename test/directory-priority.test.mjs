import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const hash = '638e29d7d72ffa2611c10a7e0eb97282';
const prompt = '输入优先保留的目录序号（1 或 2），或 R 重新加载优先级文件: ';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tidy-priority-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  await fs.mkdir(source);
  return { root, source, priority: path.join(root, 'priority.txt') };
}

async function put(file, content = 'same') {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

function options(root) {
  return { cwd: root, env: { ...process.env, HOME: root, USERPROFILE: root }, encoding: 'utf8' };
}

function run(root, args, input = '') {
  return spawnSync(process.execPath, [cli, ...args], { ...options(root), input, timeout: 10000 });
}

function interactive(root, args, onPrompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], options(root));
    let stdout = '';
    let stderr = '';
    let count = 0;
    let pending = Promise.resolve();
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Timed out: ${stdout}\n${stderr}`)); }, 10000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const total = stdout.split(prompt).length - 1;
      while (count < total) {
        const index = count++;
        pending = pending.then(async () => {
          const answer = await onPrompt({ child, index, stdout });
          if (answer === null) child.stdin.end();
          else if (answer !== undefined) child.stdin.write(`${answer}\n`);
        }).catch((error) => { child.kill('SIGKILL'); reject(error); });
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status, signal) => { clearTimeout(timeout); resolve({ status, signal, stdout, stderr }); });
  });
}

test('directory rank overrides names, retains the preferred name within the winning directory, and counts moves', async (t) => {
  const { root, source, priority } = await fixture(t);
  const high = path.join(source, 'high');
  const low = path.join(source, 'low');
  const target = path.join(source, 'removed');
  const keep = path.join(high, 'a.mp3');
  const moved = [`a [${hash}].mp3`, 'original recording.mp3', 'other.mp3'];
  await put(keep);
  await put(path.join(high, moved[0]));
  await put(path.join(low, moved[1]));
  await put(path.join(low, moved[2]));
  await put(path.join(source, 'unique.mp3'), 'unique');
  await put(path.join(target, 'ignored.mp3'));
  // Blank lines, CRLF, trailing separators, duplicate entries and nonexistent directories are supported.
  const config = `\r\n${high}/\r\n${low}\r\n${high}\r\n${path.join(root, 'future')}\r\n`;
  await put(priority, config);
  const result = run(root, ['hash-repeat', source, '--dir-priority', priority, '--target', target]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes(prompt), result.stdout);
  assert.match(result.stdout, /读取检测了 5 个文件，移动 3 个文件/);
  assert.deepEqual(await fs.readdir(high), ['a.mp3']);
  assert.deepEqual(await fs.readdir(low), []);
  for (const name of moved) assert.equal(await fs.readFile(path.join(target, name), 'utf8'), 'same');
  assert.equal(await fs.readFile(priority, 'utf8'), config);
});

test('same-directory duplicates need no directory selection, and configuration is excluded from scanning', async (t) => {
  const { root, source } = await fixture(t);
  const priority = path.join(source, 'config', 'priority.txt');
  await put(path.join(source, 'song.mp3'));
  await put(path.join(source, 'song (1).mp3'));
  await put(path.join(source, 'empty.mp3'), '');
  const result = run(root, ['hash-repeat', source, '--dir-priority', path.relative(root, priority)]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /读取检测了 3 个文件，删除 1 个文件/);
  assert.ok(!result.stdout.includes(prompt));
  assert.equal(await fs.readFile(priority, 'utf8'), '');
  assert.equal(await fs.readFile(path.join(source, 'empty.mp3'), 'utf8'), '');
  assert.equal(await fs.readFile(path.join(source, 'song.mp3'), 'utf8'), 'same');
});

test('directory choices list every filename in the compared directories belonging to the current group', async (t) => {
  const { root, source, priority } = await fixture(t);
  const [a, b] = ['A', 'B'].map((name) => path.join(source, name));
  const names = ['歌曲.mp3', '歌曲 (1).mp3'];
  for (const directory of [a, b]) {
    for (const name of names) await put(path.join(directory, name));
    await put(path.join(directory, 'unique.mp3'), directory);
  }
  const result = run(root, ['hash-repeat', source, '--dir-priority', priority], '2\n');
  assert.equal(result.status, 0, result.stderr);
  for (const [index, directory] of [a, b].entries()) {
    const start = result.stdout.indexOf(`${index + 1}. ${directory}\n`);
    assert.ok(start >= 0, result.stdout);
    const end = result.stdout.indexOf(index === 0 ? `2. ${b}\n` : 'R - 重新加载优先级文件', start);
    assert.ok(end > start, result.stdout);
    const choice = result.stdout.slice(start, end);
    for (const name of names) assert.ok(choice.includes(`   文件: ${name}\n`), choice);
    assert.ok(!choice.includes('unique.mp3'), choice);
  }
  assert.ok(result.stdout.includes('R - 重新加载优先级文件'), result.stdout);
  assert.deepEqual(await fs.readdir(a), ['unique.mp3']);
  assert.deepEqual(await fs.readdir(b), ['unique.mp3', '歌曲.mp3']);
});

test('r and R reload complete rankings without rewriting them and apply the order to subsequent groups', async (t) => {
  for (const { answer, move } of [{ answer: 'r', move: false }, { answer: 'R', move: true }]) {
    await t.test(answer, async (t) => {
      const { root, source, priority } = await fixture(t);
      const [a, b] = ['A', 'B'].map((name) => path.join(source, name));
      const target = path.join(root, 'removed');
      for (const directory of [a, b]) {
        await put(path.join(directory, 'first.mp3'), 'first');
        await put(path.join(directory, 'second.mp3'), 'second');
      }
      const config = `${b}\n\n${a}\n${b}\n`;
      const args = ['hash-repeat', source, '--dir-priority', priority];
      if (move) args.push('--target', target);
      const result = await interactive(root, args, async ({ index }) => {
        assert.equal(index, 0);
        for (const directory of [a, b])
          assert.deepEqual(await fs.readdir(directory), ['first.mp3', 'second.mp3']);
        await put(priority, config);
        return answer;
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.split(prompt).length - 1, 1);
      assert.equal(result.stderr, '');
      assert.equal(await fs.readFile(priority, 'utf8'), config);
      assert.deepEqual(await fs.readdir(a), []);
      assert.deepEqual(await fs.readdir(b), ['first.mp3', 'second.mp3']);
      assert.ok(result.stdout.includes(`读取检测了 4 个文件，${move ? '移动' : '删除'} 2 个文件`), result.stdout);
      if (move) {
        assert.equal(await fs.readFile(path.join(target, 'first.mp3'), 'utf8'), 'first');
        assert.equal(await fs.readFile(path.join(target, 'second.mp3'), 'utf8'), 'second');
      }
    });
  }
});

test('incomplete reloads repeat choices and re-evaluate the whole group before processing any files', async (t) => {
  const { root, source, priority } = await fixture(t);
  const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((name) => path.join(source, name));
  const files = [a, b, c, d].map((directory) => path.join(directory, 'song.mp3'));
  for (const file of files) await put(file);
  const edited = `${c}\n\n${b}\n${a}\n`;
  const result = await interactive(root, ['hash-repeat', source, '--dir-priority', priority], async ({ index, stdout }) => {
    assert.ok(index < 4, stdout);
    for (const file of files) await fs.access(file);
    const menu = stdout.slice(stdout.lastIndexOf('需要确定目录优先级:'));
    const pair = index < 2 ? [a, b] : [c, d];
    for (const [number, directory] of pair.entries())
      assert.ok(menu.includes(`${number + 1}. ${directory}\n   文件: song.mp3\n`), menu);
    assert.ok(menu.includes('R - 重新加载优先级文件'), menu);
    assert.equal(await fs.readFile(priority, 'utf8'), index < 2 ? '' : edited);
    if (index === 1) await put(priority, edited);
    return ['r', 'R', 'r', '2'][index];
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.split(prompt).length - 1, 4);
  assert.equal(await fs.readFile(priority, 'utf8'), `${d}\n${c}\n${b}\n${a}\n`);
  assert.equal(await fs.readFile(files[3], 'utf8'), 'same');
  for (const file of files.slice(0, 3)) await assert.rejects(fs.access(file));
  assert.match(result.stdout, /读取检测了 4 个文件，删除 3 个文件/);
});

test('reload errors preserve the pending group and report already completed operations', async (t) => {
  for (const failure of ['invalid', 'missing']) {
    await t.test(failure, async (t) => {
      const { root, source, priority } = await fixture(t);
      const done = path.join(source, '0-done');
      await put(path.join(done, 'song.mp3'), 'done');
      await put(path.join(done, 'song (1).mp3'), 'done');
      const files = ['A', 'B'].map((name) => path.join(source, name, 'song.mp3'));
      for (const file of files) await put(file);
      const result = await interactive(root, ['hash-repeat', source, '--dir-priority', priority], async ({ index }) => {
        assert.equal(index, 0);
        if (failure === 'invalid') await put(priority, '\nrelative/path\n');
        else await fs.rm(priority);
        return 'R';
      });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, failure === 'invalid' ? /第 2 行必须是绝对路径/ : /ENOENT/);
      for (const file of files) await fs.access(file);
      assert.deepEqual(await fs.readdir(done), ['song.mp3']);
      assert.match(result.stdout, /读取检测了 4 个文件，删除 1 个文件/);
    });
  }
});

test('a parent directory entry does not define its subdirectory', async (t) => {
  const { root, source, priority } = await fixture(t);
  const subdirectory = path.join(source, 'subfolder');
  await put(path.join(source, 'a.mp3'));
  await put(path.join(subdirectory, 'b.mp3'));
  await put(priority, `${source}\n`);
  const result = run(root, ['hash-repeat', source, '--dir-priority', priority], '2\n');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`1. ${source}\n   文件: a.mp3\n2. ${subdirectory}\n   文件: b.mp3`), result.stdout);
  assert.equal(await fs.readFile(priority, 'utf8'), `${subdirectory}\n${source}\n`);
  assert.equal(await fs.readFile(path.join(subdirectory, 'b.mp3'), 'utf8'), 'same');
  await assert.rejects(fs.access(path.join(source, 'a.mp3')));
});

test('new directory rankings preserve the relative order of existing entries', async (t) => {
  for (const scenario of ['new-wins', 'new-loses', 'both-new']) {
    await t.test(scenario, async (t) => {
      const { root, source, priority } = await fixture(t);
      const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((name) => path.join(source, name));
      const bothNew = scenario === 'both-new';
      const existing = bothNew ? [a, b] : [a, b, c];
      await put(priority, `${existing.join('\n')}\n`);
      await put(path.join(bothNew ? c : b, 'first.mp3'));
      await put(path.join(d, 'second.mp3'));
      const answer = scenario === 'new-loses' ? '1' : '2';
      const result = run(root, ['hash-repeat', source, '--dir-priority', priority], `${answer}\n`);
      assert.equal(result.status, 0, result.stderr);
      const expected = bothNew ? [a, b, d, c] : scenario === 'new-wins' ? [a, d, b, c] : [a, b, d, c];
      assert.equal(await fs.readFile(priority, 'utf8'), `${expected.join('\n')}\n`);
    });
  }
});

test('a three-directory group retries invalid answers and resolves all rankings before deleting', async (t) => {
  const { root, source, priority } = await fixture(t);
  const [a, b, c] = ['A', 'B', 'C'].map((name) => path.join(source, name));
  const files = [a, b, c].map((directory) => path.join(directory, 'song.mp3'));
  for (const file of files) await put(file);
  const answers = ['', 'invalid', '2', '2'];
  const result = await interactive(root, ['hash-repeat', source, '--dir-priority', priority], async ({ index }) => {
    for (const file of files) await fs.access(file);
    return answers[index];
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.split(prompt).length - 1, 4);
  assert.match(result.stderr, /输入无效/);
  assert.equal(await fs.readFile(priority, 'utf8'), `${c}\n${b}\n${a}\n`);
  assert.equal(await fs.readFile(files[2], 'utf8'), 'same');
  await assert.rejects(fs.access(files[0]));
  await assert.rejects(fs.access(files[1]));
  assert.match(result.stdout, /读取检测了 3 个文件，删除 2 个文件/);
});

test('piped answers remain available across multiple directory comparisons', async (t) => {
  const { root, source, priority } = await fixture(t);
  const directories = ['A', 'B', 'C'].map((name) => path.join(source, name));
  for (const directory of directories) await put(path.join(directory, 'song.mp3'));
  const result = run(root, ['hash-repeat', source, '--dir-priority', priority], 'bad\n2\n2\n');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await fs.readFile(priority, 'utf8'), `${directories.reverse().join('\n')}\n`);
});

test('manual edits while waiting override stale answers and apply to subsequent groups', async (t) => {
  const { root, source, priority } = await fixture(t);
  const [a, b] = ['A', 'B'].map((name) => path.join(source, name));
  for (const directory of [a, b]) {
    await put(path.join(directory, 'first.mp3'), 'first');
    await put(path.join(directory, 'second.mp3'), 'second');
  }
  const result = await interactive(root, ['hash-repeat', source, '--dir-priority', priority], async () => {
    await put(priority, `${b}\n${a}\n`);
    return '1';
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.split(prompt).length - 1, 1);
  assert.equal(await fs.readFile(priority, 'utf8'), `${b}\n${a}\n`);
  assert.deepEqual(await fs.readdir(a), []);
  assert.deepEqual(await fs.readdir(b), ['first.mp3', 'second.mp3']);
});

test('new preferences are merged into the latest manually edited order', async (t) => {
  const { root, source, priority } = await fixture(t);
  const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((name) => path.join(source, name));
  await put(priority, `${a}\n${b}\n${c}\n`);
  await put(path.join(b, 'song.mp3'));
  await put(path.join(d, 'song.mp3'));
  const result = await interactive(root, ['hash-repeat', source, '--dir-priority', priority], async () => {
    await put(priority, `${c}\n${b}\n${a}\n`);
    return '2';
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await fs.readFile(priority, 'utf8'), `${c}\n${d}\n${b}\n${a}\n`);
});

test('EOF and SIGINT preserve the pending group and report already completed operations', async (t) => {
  for (const interruption of ['EOF', 'SIGINT']) {
    await t.test(interruption, async (t) => {
      const { root, source, priority } = await fixture(t);
      await put(path.join(source, '0-done', 'song.mp3'), 'done');
      await put(path.join(source, '0-done', 'song (1).mp3'), 'done');
      const files = ['A', 'B', 'C'].map((name) => path.join(source, name, 'song.mp3'));
      for (const file of files) await put(file);
      const result = await interactive(root, ['hash-repeat', source, '--dir-priority', priority], ({ child, index }) => {
        if (index === 0) return '2';
        if (interruption === 'EOF') return null;
        child.kill('SIGINT');
      });
      assert.equal(result.status, interruption === 'EOF' ? 1 : 130, result.stderr);
      for (const file of files) await fs.access(file);
      await assert.rejects(fs.access(path.join(source, '0-done', 'song (1).mp3')));
      assert.match(result.stdout, /读取检测了 5 个文件，删除 1 个文件/);
      assert.ok(!result.stdout.includes('已删除: ' + files[0]));
    });
  }
});

test('invalid priority content is rejected before scanning and also after a live edit', async (t) => {
  const { root, source, priority } = await fixture(t);
  const files = ['A', 'B'].map((name) => path.join(source, name, 'song.mp3'));
  for (const file of files) await put(file);
  await put(priority, '\nrelative/path\n');
  const result = run(root, ['hash-repeat', source, '--dir-priority', priority]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /第 2 行必须是绝对路径/);
  assert.match(result.stdout, /读取检测了 0 个文件，删除 0 个文件/);
  await put(priority, '');
  const edited = await interactive(root, ['hash-repeat', source, '--dir-priority', priority], async () => {
    await put(priority, 'relative/path\n');
    return '1';
  });
  assert.equal(edited.status, 1);
  assert.match(edited.stderr, /第 1 行必须是绝对路径/);
  for (const file of files) await fs.access(file);
  assert.match(edited.stdout, /读取检测了 2 个文件，删除 0 个文件/);
});

test('invalid configuration destinations fail before file processing', async (t) => {
  const { root, source } = await fixture(t);
  await put(path.join(source, 'a.mp3'));
  await put(path.join(source, 'b.mp3'));
  const blocked = path.join(root, 'blocked');
  await put(blocked, 'not a directory');
  for (const priority of [source, path.join(blocked, 'priority.txt')]) {
    const result = run(root, ['hash-repeat', source, '--dir-priority', priority]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /读取检测了 0 个文件，删除 0 个文件/);
  }
  assert.deepEqual(await fs.readdir(source), ['a.mp3', 'b.mp3']);
});

test('empty scans and partial move failures report accurate totals without directory priorities', async (t) => {
  const { root, source } = await fixture(t);
  const empty = run(root, ['hash-repeat', source]);
  assert.equal(empty.status, 0, empty.stderr);
  assert.equal(empty.stdout.trim(), '读取检测了 0 个文件，删除 0 个文件');
  const target = path.join(source, 'removed');
  await put(path.join(source, 'a (1).mp3'));
  await put(path.join(source, 'a.mp3'));
  await put(path.join(source, 'b (1).mp3'), 'second');
  await put(path.join(source, 'b.mp3'), 'second');
  const secondHash = createHash('md5').update('second').digest('hex');
  await put(path.join(target, 'b (1).mp3'), 'collision');
  await put(path.join(target, `b (1) [${secondHash}].mp3`), 'different');
  const result = run(root, ['hash-repeat', source, '--target', target]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /目标文件内容不同/);
  assert.match(result.stdout, /读取检测了 4 个文件，移动 1 个文件/);
  assert.equal(await fs.readFile(path.join(target, 'a (1).mp3'), 'utf8'), 'same');
  assert.equal(await fs.readFile(path.join(source, 'b (1).mp3'), 'utf8'), 'second');
});
