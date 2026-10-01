# CNKI 批量文献检索（指南／专家共识写作支撑）

对知网（CNKI）做**确定性批量检索**，输出题录 + 摘要，供指南／专家共识的文献筛选、去重与参考文献表使用。

设计原则：**不经过 LLM、记录逐字来自知网、完整留存检索出处**，便于在方法学部分复现检索过程。

支持 **Windows / macOS / Linux**。

---

## 为什么必须走浏览器

知网没有公开检索 API，且已对直连强制人机验证。实测结果：

| 请求 | 结果 |
|---|---|
| `GET /kns8s/search` | 302 → `/verify/home?captchaType=blockPuzzle`（腾讯滑块） |
| `GET /kns8s/AdvSearch` | 302 → 同上 |
| `POST /dm8/API/GetExport` | 403（无会话／无效 id） |

因此纯 HTTP 抓取不可行，必须在**机构 IP 的浏览器会话**内操作。

---

## 核心机制

三个关键点合起来才能跑通，缺一不可：

1. **结果页复选框即导出 ID**
   `input.cbItem` 的 `value` 就是详情页 `#export-id`（同一个加密串）。
   实测单页 20 条即得 20 个可用加密 ID。
   （发现出处：`cookjohn/cnki-skills` 的 `skills/cnki-export/SKILL.md`）

2. **摘要只能从导出接口取**
   结果页 HTML **不含**摘要（已实测确认）。必须对每个 ID 调
   `POST /dm8/API/GetExport`（`displaymode=GBTREFER,elearning,EndNote`），
   再从 `ELEARNING` 的 `Summary-摘要` 或 `ENDNOTE` 的 `%X` 取摘要。
   （出处：`SepineTam/cnki-mcp` 的 `core/tools/export.py`）

3. **验证码判定要排除预加载**
   `#tcaptcha_transform_dy` 需 `getBoundingClientRect().top >= 0` 才算真验证码；
   SDK 预加载时位于 `-1000000px`，只判存在会误报。

---

## 安装

要求 Node.js ≥ 18 与 Chrome（或任意 Chromium 内核浏览器：Edge、Brave、Chromium）。

```bash
git clone <your-repo-url> cnki-batch
cd cnki-batch
npm install
```

本项目用 `puppeteer-core`，**不会下载自带 Chromium**，直接驱动你已安装的浏览器。

### 浏览器路径

脚本按平台自动查找：

| 平台 | 典型路径 |
|---|---|
| macOS | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
| macOS (Homebrew) | `/opt/homebrew/bin/chromium`、`/usr/local/bin/chromium` |
| Windows | `%ProgramFiles%\Google\Chrome\Application\chrome.exe` 等 |
| Linux | `/usr/bin/google-chrome`、`/usr/bin/chromium` 等 |

macOS 上若 Chrome 不在 `/Applications`，或想用其他 Chromium 内核浏览器，显式指定即可：

```bash
export CHROME_PATH="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
```

若出现 `macOS` 首次拦截（"无法验证开发者"），在
**系统设置 → 隐私与安全性** 里允许一次即可。

---

## 用法

```bash
# 一框式检索，抓 3 页（每页 20 条）
node src/cnki-batch.js --query "中医药 肺癌 围手术期" --out out --maxPages 3

# 专业检索（布尔式，与 PubMed / Embase 检索式可对齐）
node src/cnki-batch.js --advanced --query "SU=('肺癌') AND KY=('围手术期')" --maxPages 3

# 复用已打开的 Chrome（同一个机构 IP 会话，验证码人工过一次后继续）
node src/cnki-batch.js --query "..." --reuse
```

### 参数

| 参数 | 说明 | 默认 |
|---|---|---|
| `--query` | 检索词或专业检索式 | 必填 |
| `--out` | 输出目录 | `out` |
| `--maxPages` | 最多抓几页（每页 20 条） | 1 |
| `--limit` | 最多几条记录 | 不限 |
| `--delayMs` | 每条导出间隔（礼貌抓取） | 1200 |
| `--advanced` | 走专业检索页 | 否 |
| `--reuse` | 连接已有 `:9222` Chrome | 否 |
| `--port` | CDP 端口 | 9222 |
| `--headless` | 无头模式（**不建议**，验证码无法人工处理） | 否 |

### 环境变量

| 变量 | 用途 |
|---|---|
| `CHROME_PATH` | 指定浏览器可执行文件 |
| `CDP_PORT` | 调试端口（等价于 `--port`） |

---

## 输出

每次检索生成一对文件（时间戳命名）：

- `cnki_<时间>.json` — 完整记录 + 检索出处（`query` / `searchUrl` / `totalHitsReported` / `retrievedAt`）
- `cnki_<时间>.csv` — **带 BOM 的 UTF-8**，Excel（含 macOS Excel / Numbers）直接打开不乱码

### 字段实测覆盖率（43 条真实检索）

| 字段 | 覆盖 | 字段 | 覆盖 |
|---|---|---|---|
| 题名 / 作者 / 来源 | 43/43 | 关键词 / **摘要** | 42–43/43 |
| 文献类型 / 年 / 发表日期 | 43/43 | 机构 / 期 / 页数 | 43/43 |
| 来源库 / 链接 / GB/T 7714 | 43/43 | DOI | 约 57% ※ |

※ 学位论文与早期文献通常无 DOI；`link` 字段可兜底定位。
早期文献可能无结构化摘要（数据本身缺口，非脚本问题）。

`GB/T 7714` 为整条引用串，可直接进参考文献表：

```
[1]黄宏,谢林峰,燕平杰,等.输注红细胞配合贞芪扶正颗粒口服…[J].中华中医药学刊,2023,41(6):242-246.DOI:10.13193/…
```

---

## 环境自检

不确定环境是否就绪（选择器是否仍有效、机构 IP 是否可访问、验证码是否触发）时，先跑探测：

```bash
npm run probe -- "中医药 肺癌"
npm run probe:export -- "中医药 肺癌"
```

`probe.js` 会输出结果页各选择器的命中数量、总命中数、验证码状态；
`probe-export.js` 会验证导出接口能否取到摘要。知网改版后以此定位失效点。

---

## 多库访问现状（实测）

不同数据库的可获取性差异极大，实测结论如下（`npm run probe:foreign` 可复现）：

| 数据库 | 状态 | 判读 |
|---|---|---|
| **PubMed** | 200 | 官方 E-utilities，免费开放 |
| **Europe PMC** | 200 | 免费 REST API，含全文与预印本 |
| **Crossref** | 200 | 免费，DOI 权威源 |
| **CNKI 知网** | 200（需机构会话） | 服务端渲染，本项目已支持批量 |
| **Cochrane Library** | **403 `Just a moment...`** | Cloudflare 反爬 |
| **Embase** | **403 `Just a moment...`** | Cloudflare 反爬 |
| **Web of Science** | 200 但仅空壳 SPA | 内容须机构会话；API 返回 401 需 key |

### 为什么不为这三个库写爬虫

不是技术上"做不到"，而是三条路同时封死：

1. **技术**：Cloudflare 挑战 + SPA 架构，直连拿不到内容。
2. **合规**：Clarivate / Elsevier 条款明确禁止未经许可的自动抓取；数据挖掘须走机构协议或官方 API。
3. **方法学**：指南与共识必须报告**可复现**的检索过程。爬虫结果不稳定、无法引用，审稿时无法交代检索日期与命中数。

**正解是官方 API**（需机构权限）：

- Web of Science：Starter / Expanded API（[申请凭据](https://clarivate.libguides.com/ld.php?content_id=77549221#1#1)）
- Embase：Elsevier Embase API（[使用资格](https://www.elsevier.support/dataasaservice/answer/who-can-use-the-elsevier-research-products-apis)）
- Cochrane：机构访问 + 平台导出 RIS

本项目提供的是它们的**理论覆盖替代与结果合并**：Europe PMC + Crossref 可覆盖相当部分 PubMed/Embase 重叠区，而**合并去重层对任何来源都适用**（包括你手动导出的 RIS）。

> 诚实说明：Embase 相对 PubMed 的独特价值（约 15–30% 会议摘要与欧洲期刊）**没有免费替代**。若指南要求必须检索 Embase，需要机构订阅。

---

## 跨库合并与去重

指南检索会横跨多个库，最终必须报成**一张去重后的表**和一个 PRISMA 流程图数字。这个模块负责把任意来源的导出合并去重。

支持四种格式（自动识别）：

| 格式 | 来源 |
|---|---|
| **RIS** | Web of Science、Cochrane、Embase、Scopus |
| **EndNote** | CNKI（本项目的 `--out` 产出）、Web of Science |
| **BibTeX** | Zotero、EndNote、Google Scholar |
| **JSON** | 本项目 CNKI 模块的输出 |

### 用法

```bash
node src/merge.js --in wos.ris cochrane.ris pubmed.txt cnki.json embase.ris --out merged

# 覆盖来源标签（文件名无法识别时）
node src/merge.js --in a.ris b.ris --source "Web of Science" --source Cochrane --out merged

# 调参
node src/merge.js --in a.ris b.ris --no-fuzzy            # 只做精确匹配
node src/merge.js --in a.ris b.ris --threshold 0.92      # 更严格的模糊阈值
node src/merge.js --in a.ris --dry                       # 只解析，不写文件
```

| 参数 | 说明 | 默认 |
|---|---|---|
| `--in` | 输入文件（可多个） | 必填 |
| `--source` | 覆盖来源标签，按位置对应 `--in` | 按文件名猜测 |
| `--out` | 输出目录 | `merged` |
| `--threshold` | 模糊匹配相似度阈值 | 0.9 |
| `--no-fuzzy` | 关闭模糊匹配 | 关闭前为开启 |
| `--no-year-check` | 题名相同但年份不同也合并 | 不合并 |

### 匹配级联

按顺序执行，任一级命中即合并（并记录原因，可审计）：

| 顺序 | 规则 | 说明 |
|---|---|---|
| 1 | **DOI** | 最强标识；大小写与 `doi:` 前缀自动归一 |
| 2 | **PMID** | PubMed / Europe PMC 重叠 |
| 3 | **题名 + 年** | 归一化后完全相等 |
| 4 | **题名模糊** | 同英文分词 / 中文二元组的 token-set Jaccard ≥ 阈值 |

合并用并查集**传递合并**：A~B 靠 DOI、B~C 靠题名，三者归为一条。年份参与约束，避免同名不同年误合并。

### 输出

- `merged_<时间>.json` — 合并后记录 + 报告 + 输入清单
- `merged_<时间>.csv` — 带 BOM，可直接用于 Excel / Rayyan / Covidence 筛选
- `dedup-report_<时间>.json` — 去重报告，含每次合并的**保留/丢弃题名与来源**

### 实测（`npm run fixtures` 生成合成数据后）

```
input records        : 21
unique records       : 10
duplicates removed   : 11
cross-database merges: 5
match reasons        : {"doi":7,"title+year":3,"title-fuzzy":1}
```

其中一条把 **PubMed + Embase + CNKI + Zotero 四源**正确合并为一条，作者与关键词求并集、摘要取最长变体。合成数据已覆盖真实差异：DOI 大小写、全角括号、破折号、`randomized`/`randomised`、方括号包裹的英译题名、以及**无 DOI**的仅题名重叠。

字段合并策略：文本取最长非空值（通常信息最全），作者/关键词求并集，标识符取任一来源有值者。

---

## 与既有文献流水线对接

CNKI 模块产出的 `cnki_<时间>.json` 直接喂给合并层即可：

```bash
node src/merge.js --in out/cnki_2026-10-01_11-56-22.json pubmed.txt cochrane.ris --out merged
```

- 去重由合并层统一处理（DOI → PMID → 题名+年 → 模糊）
- CNKI 题名可能含 `<sup>` 等 HTML 标记，解析时已自动剥离
- 需要人工核对时看 `dedup-report_*.json` 里每次合并的保留/丢弃题名

---

## 风险与合规

- **验证码**：触发时脚本报 `CAPTCHA_BLOCKED` 并停止，不会硬绕。请在 Chrome 窗口手动拖动滑块，再用 `--reuse` 继续。
- **403 / 429**：导出接口返回 403 时立即停止重试，避免升级为风控。
- **礼貌抓取**：默认每条约 1.2 秒，全程单浏览器会话。请勿把 `--delayMs` 调到很小。
- **版权**：本工具只取**题录与摘要**，不下载全文。
  `SepineTam/cnki-mcp` 的许可条款明确禁止批量检索，故本项目为独立实现，仅参考其接口用法；参考项目源码未随仓库分发。
- **机构权限**：能否取到摘要取决于机构 IP 订阅；无订阅时部分记录会缺摘要。

---

## 已知问题

**Windows 受限沙箱下 Chrome 可能启动失败**，报：

```
mojo platform_channel.cc Check failed: 拒绝访问 (0x5)
```

这是文件沙箱封了命名管道 IPC，**不是脚本或 Chrome 的问题**。解决办法：

1. 在普通终端手动启动 Chrome，然后脚本加 `--reuse`：

   ```powershell
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" `
     --remote-debugging-port=9222 `
     --user-data-dir="$PWD\.chrome-profile"
   ```

2. 或在放宽权限的模式下运行。

macOS / Linux 无此问题。

---

## 项目结构

```
src/
  cdp.js             浏览器查找、启动、CDP 连接（跨平台）
  cnki-batch.js      CNKI 批量检索主程序
  parse-formats.js   RIS / BibTeX / EndNote / JSON 解析
  normalize.js       规范化、匹配级联、去重、合并
  merge.js           跨库合并去重 CLI
  probe.js           环境与 DOM 选择器探测
  probe-export.js    CNKI 导出接口验证
  probe-foreign.js   WoS / Embase / Cochrane 可获取性探测
  probe-wos.js       Web of Science 访问与 API 需求核实
testdata/            合成的跨库测试数据（由 _tools/make-fixtures.mjs 生成）
_tools/              维护者脚本（推送、校验），不随仓库发布
```

生成测试数据并自检：

```bash
npm run fixtures
node src/merge.js --in testdata/webofscience.ris testdata/cochrane.ris testdata/pubmed.txt \
  testdata/embase.ris testdata/cnki.json testdata/nodoi_a.ris testdata/nodoi_b.ris --out out
```

预期结果：21 条输入 → 10 条唯一记录，`match reasons: {"doi":7,"title+year":3,"title-fuzzy":1}`。

---

## 致谢

接口用法参考以下两个项目，均为独立实现：

- [SepineTam/cnki-mcp](https://github.com/SepineTam/cnki-mcp) — `GetExport` 导出接口与摘要解析
- [cookjohn/cnki-skills](https://github.com/cookjohn/cnki-skills) — 结果页复选框即导出 ID 的发现、验证码判定

## 许可

MIT
