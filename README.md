# tidy-files

递归清理音乐文件的 Node.js 命令行工具。npm 包名为 `@js-core/tidy-files`，命令名为 `tidy-files`。需要 Node.js 22 或更新版本。

```bash
npm install -g @js-core/tidy-files
tidy-files --help
```

所有命令的 `[folder]` 都可省略，默认使用当前工作目录。扫描会递归进入普通子目录，跳过符号链接。`--target` 可位于源目录内；此时扫描会排除该目录。目标目录不能与源目录相同。

| 命令 | 用途 |
| --- | --- |
| `tidy-files ls-ext [folder]` | 列出小写扩展名及对应文件数，包括“无扩展名” |
| `tidy-files rm-ext [folder] [--ext mp3,.flac] [--no-ext] [--target <target>]` | 删除或移动指定扩展名或无扩展名的文件；匹配不区分大小写 |
| `tidy-files h2e [folder]` | 把开头的 32 位文件名 hash 移到扩展名前 |
| `tidy-files hash-repeat [folder] [--target <target>]` | 按内容 MD5 和文件大小查重，删除或移动重复文件 |
| `tidy-files flat-files [folder]` | 将子目录文件移到根目录，并删除空目录 |
| `tidy-files trim-name [folder]` | 去掉扩展名前文件名两端的空白，只输出实际重命名的文件 |
| `tidy-files organize-name [folder] [--target <target>]` | 交互选择保留文件，并清理 hash 与末尾重复编号 |
| `tidy-files keep-repeat [folder] [--target <target>]` | 逐文件交互选择保留项，并删除或移动其余候选文件 |

`hash-repeat` 在同组文件中优先处理文件名带 hash 的文件，然后处理带 `(1)` 或 `（1）` 等编号的文件，再处理文件名较短的文件。仍然打平时，保留完整路径字典序最小的文件。

`rm-ext` 必须提供 `--ext` 或 `--no-ext`，两者可以同时使用。未传 `--target` 时删除匹配的文件；传入后将它们移动到目标目录根层。

移动文件时，目标目录已有同名文件，就使用 `<原文件名> [内容 MD5].<扩展名>`。如果这个名称也已存在，只有两者的 MD5 和大小都相同时才覆盖，否则报错。原地重命名遇到名称冲突时跳过并报告。

计算内容 MD5 时，工具会在 `~/.tidy-files-caches` 中缓存结果。缓存文件名是文件绝对路径的 MD5；记录文件路径、大小、`mtime`（修改时间）、`ctime`（状态变更时间）、`crtime`（创建时间）和内容 MD5。时间使用 ISO 8601 格式。再次计算时，路径、大小和三个时间都一致才复用缓存，否则重新读取文件并更新缓存。缓存损坏或无法读写时仍会直接计算文件 MD5。文件被删除、移动或重命名后，工具会清理旧路径的缓存；已有内容 MD5 时会更新新路径的缓存。请勿对同一目录同时运行多个 `tidy-files` 进程。

`organize-name` 会先扫描文件并计算 MD5，再逐组按文件大小从大到小列出候选文件；大小相同时按完整路径排序。候选项按“序号 | hash | 文件大小 | 文件名 | 文件路径”显示，文件路径为完整路径。大小按 1024 进位显示，并在括号中保留精确字节数，例如 `3.21MB(3365929B)`。输入序号选择保留的文件；直接回车或输入无效序号会跳过该组。未传 `--target` 时删除其余候选文件；传入后将它们移动到目标目录根层。被选中文件会去掉文件名 hash 和末尾重复编号。每组完成后输出保留及删除或移动的文件数，末尾有两个换行符。

`keep-repeat` 启动时扫描一次源目录并计算内容 MD5，然后逐个处理扫描到的文件。每轮先从当前文件名去掉 hash、末尾重复编号和扩展名，再找出内容 MD5 相同，或文件名（不含扩展名）包含该文字的文件；子串匹配区分大小写。候选项同样按“序号 | hash | 文件大小 | 文件名 | 文件路径”显示，大小按 1024 进位并在括号中保留精确字节数；按大小降序排列，大小相同时按完整路径排序。只有一个候选项且当前文件名没有 hash 或末尾重复编号时直接跳过。输入多个保留序号时用空格或英文逗号分隔；直接回车或输入无效序号会跳过该轮。未传 `--target` 时删除其余候选文件；传入后将它们移动到目标目录根层。随后按列表顺序尝试清理保留文件名中的 hash 和末尾重复编号；若目标名称已存在，则保留原名并继续处理。每轮完成后输出保留及删除或移动的文件数，末尾有两个换行符。每轮选择仅对该轮生效，后续轮次仍可能处理此前保留的文件。`--target` 位于源目录内时，该目录不参与扫描。

包也导出 `resolveHashFileName(fileName)`，可以用它解析文件名中独立的 32 位十六进制 hash（位于开头或扩展名前末尾）。未找到时返回 `false`。

## 开发和发布

```bash
npm ci
npm test
npm pack --dry-run
```

推送到 `master` 会运行 GitHub Actions 测试，测试通过后通过 npm Trusted Publishing 发布到 npm。首次使用前，在 npmjs.com 的 `@js-core/tidy-files` 包设置中添加 GitHub Actions Trusted Publisher：Organization or user 填 `alanwei43`，Repository 填 `tidy-files`，Workflow filename 填 `publish.yml`，并允许 `npm publish`。无需配置 `NPM_ACCESS_TOKEN`；首次通过 Trusted Publishing 发布成功后，可删除旧的 GitHub Repository secret，并在 npm 撤销旧 token。
