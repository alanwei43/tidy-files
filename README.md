# tidy-files

递归清理音乐（及其他）文件的 Node.js 命令行工具。npm 包名为 `@js-core/tidy-files`，命令名为 `tidy-files`。需要 Node.js 22 或更新版本。

## 安装

```bash
npm install -g @js-core/tidy-files
tidy-files --help
```

## 通用约定

- 所有命令的 `[folder]` 都可省略，默认使用当前工作目录（`.`）。
- 扫描会**递归**进入普通子目录，跳过符号链接。
- 支持 `--target <目录>` 的命令会把文件**移动**到目标目录而不是删除；目标目录不存在时会自动创建，但不能与源目录相同。
- `--target` 可以位于源目录内部，此时扫描会自动排除该目标目录，避免重复处理。
- 全局选项：`--help` 显示帮助，`--version` 显示版本号。

## 命令一览

| 命令 | 用途 |
| --- | --- |
| `tidy-files ls-ext [folder]` | 列出小写扩展名及对应文件数，包括"无扩展名" |
| `tidy-files rm-ext [folder] [--ext mp3,.flac] [--no-ext] [--target <dir>]` | 删除或移动指��扩展名或无扩展名的文件；匹配不区分大小写 |
| `tidy-files h2e [folder]` | 把文件名开头的 32 位 hash 移到扩展名前 |
| `tidy-files hash-repeat [folder] [--target <dir>]` | 按内容 MD5 和文件大小查重，删除或移动重复文件 |
| `tidy-files flat-files [folder]` | 将子目录文件移到根目录，并删除空目录 |
| `tidy-files trim-name [folder]` | 去掉文件名（扩展名前）两端的空白 |
| `tidy-files organize-name [folder] [--target <dir>]` | 交互选择保留文件，并清理 hash 与末尾重复编号 |
| `tidy-files keep-repeat [folder] [--target <dir>]` | 逐文件交互选择保留项，删除或移动其余候选文件 |

---

## ls-ext — 列出扩展名统计

递归扫描目录，按小写扩展名分组统计文件数量；没有扩展名的文件归入"无扩展名"。

```bash
tidy-files ls-ext [folder]
```

**参数**

- `folder`：源目录，默认为当前目录。

**示例**

```bash
$ tidy-files ls-ext ~/Music
.flac: 120
.mp3: 356
无扩展名: 3
```

---

## rm-ext — 按扩展名删除或移动文件

按扩展名匹配文件，并将其删除（默认）或移动到目标目录（使用 `--target`）。匹配不区分大小写。

```bash
tidy-files rm-ext [folder] [--ext <列表>] [--no-ext] [--target <dir>]
```

**参数与选项**

- `folder`：源目录，默认为当前目录。
- `--ext <列表>`：逗号分隔的扩展名，可带点也可不带点，例如 `mp3,.flac`。
- `--no-ext`：匹配没有扩展名的文件。
- `--target <dir>`：传入后将匹配的文件移动到该目录根层，而不是删除。

**注意**：必须提供 `--ext` 或 `--no-ext`，两者可以同时使用。

**示例**

```bash
# 删除所有 .tmp 和 .bak 文件
tidy-files rm-ext ~/Music --ext tmp,bak

# 删除无扩展名的文件
tidy-files rm-ext ~/Music --no-ext

# 把 .txt 歌词文件移动到 backups 目录而不是删除
tidy-files rm-ext ~/Music --ext .txt --target ~/backups

# 同时匹配 .log 文件和无扩展名文件
tidy-files rm-ext ~/Music --ext log --no-ext
```

**输出示例**

```text
已删除: /home/user/Music/demo.tmp
已移动: /home/user/Music/lyrics.txt -> /home/user/backups/lyrics.txt
```

---

## h2e — 把文件名开头的 hash 移到末尾

识别文件名开头独立的 32 位十六进制 hash（形如 `[hash] name.ext` 或 `hash name.ext`），将其移到扩展名之前，统一为 `name [hash].ext` 的格式。

```bash
tidy-files h2e [folder]
```

**参数**

- `folder`：源目录，默认为当前目录。

**示例**

```bash
$ tidy-files h2e ~/Music
/home/user/Music/0a1b2c… 歌曲名.mp3 -> /home/user/Music/歌曲名 [0a1b2c…].mp3
/home/user/Music/[0a1b2c…] 另一首.flac -> /home/user/Music/另一首 [0a1b2c…].flac
```

如果重命名后目标文件名已存在（冲突），会输出 `重命名冲突，已跳过` 并跳过该文件。

---

## hash-repeat — 按内容查重

按"文件大小 + 内容 MD5"分组查重：同一组中只保留一个文件，其余删除（默认）或移动到 `--target` 目录。

```bash
tidy-files hash-repeat [folder] [--target <dir>]
```

**参数与选项**

- `folder`：源目录，默认为当前目录。
- `--target <dir>`：将重复文件移动到该目录而不是删除。

**保留优先级**（决定同组中哪个文件被留下）：

1. 文件名带 hash 的优先被处理（即优先保留不带 hash 的）；
2. 文件名带 `(1)`、`（1）` 等重复编号的优先被处理；
3. 文件名较短的优先被处理；
4. 仍然打平时，保留完整路径字典序较小的文件。

**示例**

```bash
# 直接删除重复文件
tidy-files hash-repeat ~/Music

# 把重复文件移入隔离目录，稍后再人工确认
tidy-files hash-repeat ~/Music --target ~/Music/_duplicates
```

**输出示例**

```text
已删除: /home/user/Music/歌曲 (1).mp3
已移动: /home/user/Music/0a1b2c… 歌曲.mp3 -> /home/user/Music/_duplicates/0a1b2c… 歌曲.mp3
```

---

## flat-files — 扁平化目录

把所有子目录中的文件移动到源目录根层，然后删除空的子目录。目标位置出现同名文件时按"移动冲突处理"规则改名（见下文）。

```bash
tidy-files flat-files [folder]
```

**参数**

- `folder`：源目录，默认为当前目录。

**示例**

```bash
$ tree ~/Music
~/Music
├── 专辑A
│   └── song1.mp3
└── 专辑B
    └── song2.mp3

$ tidy-files flat-files ~/Music
已移动: /home/user/Music/专辑A/song1.mp3 -> /home/user/Music/song1.mp3
已移动: /home/user/Music/专辑B/song2.mp3 -> /home/user/Music/song2.mp3
# 之后 专辑A、专辑B 两个空目录被自动删除
```

---

## trim-name — 去掉文件名首尾空白

去掉文件名主名（扩展名之前的部分）两端的空白字符，只输出实际发生重命名的文件。去空白后名称为空的文件会被跳过并提示。

```bash
tidy-files trim-name [folder]
```

**参数**

- `folder`：源目录，默认为当前目录。

**示例**

```bash
$ tidy-files trim-name ~/Music
/home/user/Music/ 歌曲名 .mp3 -> /home/user/Music/歌曲名.mp3
重命名冲突，已跳过: /home/user/Music/ 已存在 .flac
```

---

## organize-name — 交互式整理重复文件名

针对文件名中带 hash 或末尾重复编号（如 `(1)`、`（2）`）的文件，按组列出候选文件（包括内容相同的文件和规范化名称相同的文件），由你输入要保留的序号，其余文件删除或移动，最后把保留的文件重命名为去掉 hash 和重复编号的"干净"名称。

```bash
tidy-files organize-name [folder] [--target <dir>]
```

**参数与选项**

- `folder`：源目录，默认为当前目录。
- `--target <dir>`：未选中的文件移动到该目录而不是删除。

**交互流程**

1. 先扫描文件并计算内容 MD5；
2. 逐组列出候选文件，按文件大小从大到小排序，大小相同时按完整路径排序；
3. 候选列表格式为 `序号 | hash | 文件大小 | 文件名 | 文件路径`；
4. 输入要保留的**一个**序号并回车；直接回车表示跳过该组；
5. 未选中的文件被删除或移动，保留的文件被重命名为干净名称；
6. 结束��组后输出 `保留N个文件，删除/移动M个文件`。

**示例**

```bash
$ tidy-files organize-name ~/Music --target ~/trash
序号 | hash | 文件大小 | 文件名 | 文件路径
1 | 9e107d9d372bb6826bd81d3542a419d6 | 4.00MB(4194304B) | 歌曲 [9e107d9d…].mp3 | /home/user/Music/歌曲 [9e107d9d…].mp3
2 | 9e107d9d372bb6826bd81d3542a419d6 | 4.00MB(4194304B) | 歌曲 (1).mp3 | /home/user/Music/歌曲 (1).mp3
输入要保留的文件序号（回车跳过）: 1
已移动: /home/user/Music/歌曲 (1).mp3 -> /home/user/trash/歌曲 (1).mp3
/home/user/Music/歌曲 [9e107d9d…].mp3 -> /home/user/Music/歌曲.mp3
保留1个文件，移动1个文件
```

---

## keep-repeat — 交互选择要保留的重复文件

逐个文件处理：从当前文件名去掉 hash、末尾重复编号和扩展名得到基础名，找出内容 MD5 相同或文件名包含该基础名的所有候选文件，由你输入要保留的**一个或多个**序号，其余候选删除或移动。保留下来的文件如果带 hash 或重复编号，会被重命名为干净名称。

```bash
tidy-files keep-repeat [folder] [--target <dir>]
```

**参数与选项**

- `folder`：源目录，默认为当前目录。
- `--target <dir>`：未选中的文件移动到该目录而不是删除。

**交互流程**

1. 启动时扫描一次源目录并计算内容 MD5；
2. 每轮打印候选列表（格式同 `organize-name`）；
3. 输入要保留的序号，**多个序号用空格或英文逗号分隔**；直接回车跳过该轮；
4. 输入无效（非数字、序号越界等）时提示 `输入无效，已跳过该轮`；
5. 结束每轮后输出 `保留N个文件，删除/移动M个文件`。

**示例**

```bash
$ tidy-files keep-repeat ~/Music
序号 | hash | 文件大小 | 文件名 | 文件路径
1 | 9e107d9d… | 4.00MB(4194304B) | 歌曲.mp3 | /home/user/Music/歌曲.mp3
2 | 9e107d9d… | 4.00MB(4194304B) | 歌曲 (1).mp3 | /home/user/Music/歌曲 (1).mp3
3 | 9e107d9d… | 4.00MB(4194304B) | 歌曲 [9e107d9d…].mp3 | /home/user/Music/歌曲 [9e107d9d…].mp3
输入要保留的文件序号（空格或英文逗号分隔，回车跳过）: 1, 3
已删除: /home/user/Music/歌曲 (1).mp3
/home/user/Music/歌曲 [9e107d9d…].mp3 -> /home/user/Music/歌曲.mp3
保留2个文件，删除1个文件
```

与 `organize-name` 的区别：`keep-repeat` 可以一次保留多个文件，并且候选匹配更宽松（包含基础名即算候选）；`organize-name` 只处理带 hash/重复编号的文件，每组只能保留一个。

---

## 移动冲突处理

移动文件时，如果目标目录已有同名文件，则改用 `<原文件名> [内容 MD5].<扩展名>` 作为目标名。如果这个名称也已存在，只有两者的 MD5 和大小都相同时才覆盖，否则报错中止。

## MD5 缓存

计算内容 MD5 时，工具会在 `~/.tidy-files-caches` 中缓存结果。缓存文件名是文件绝对路径的 MD5；记录文件路径、大小、`mtime`（修改时间）、`ctime`（状态变更时间）和创建时间，任一变化都会重新计算。扫描时会自动跳过缓存目录本身。

## API

包也导出 `resolveHashFileName(fileName)`，可以用它解析文件名中独立的 32 位十六进制 hash（位于开头或扩展名前末尾）。未找到时返回 `false`。

```js
import { resolveHashFileName } from '@js-core/tidy-files';

resolveHashFileName('歌曲 [9e107d9d372bb6826bd81d3542a419d6].mp3');
// { hashValue: '9e107d9d…', fileNameWithoutHash: '歌曲.mp3', hashInEnd: '歌曲 [9e107d9d…].mp3' }
```

## 开发和发布

```bash
npm ci
npm test
npm pack --dry-run
```

推送到 `master` 会运行 GitHub Actions 测试，测试通过后通过 npm Trusted Publishing 发布到 npm。首次使用前，在 npmjs.com 的 `@js-core/tidy-files` 包设置中添加 GitHub Actions 为可信发布方。
