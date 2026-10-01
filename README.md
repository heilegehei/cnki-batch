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

## 支持的数据库

统一入口 `src/retrieve.js`，一次检索可跨多个库，自动去重合并。

| 源 | 键名 | 方式 | 摘要 | 是否需要注册 |
|---|---|---|---|---|
| **PubMed** | `pubmed` | NCBI E-utilities（两步调用） | ✅ | 否（可选 API key 提速） |
| **Europe PMC** | `europepmc` | 免费 REST API，字段化布尔检索 | ✅ 98% | 否 |
| **ClinicalTrials.gov** | `clinicaltrials` | 官方 v2 API | ✅ | 否 |
| **CNKI 知网** | `cnki` | 浏览器（CDP），需机构 IP | ✅ | 机构 IP |
| **维普 VIP** | `vip` | 浏览器（CDP） | ✅ 详情页补全 | 否 |

### 实测结论（`npm run probe:foreign`、`npm run probe:cn` 可复现）

| 数据库 | 状态 | 说明 |
|---|---|---|
| PubMed / Europe PMC / ClinicalTrials.gov | **200 可用** | 官方 API，零配置 |
| 维普 VIP | **可用** | 检索页 412 反爬，但浏览器驱动成功 |
| CNKI 知网 | **可用** | 需机构 IP，含验证码处理 |
| 万方 Wanfang | **403 验证墙** | 阿里云盾，150 秒内不自放行，**无法无人值守** |
| SinoMed | 302 跳登录 | 需注册账号 |
| Cochrane / Embase / Web of Science / Scopus / CINAHL | **Cloudflare 403** | 需机构订阅或官方 API |

**万方的替代做法**：在浏览器里手动检索并导出 RIS，再交给合并层：

```bash
node src/merge.js --in wanfang-export.ris --source 万方 --out merged
```

### 为什么不为 Cochrane / Embase / WoS 写爬虫

三条路同时封死：

1. **技术**：Cloudflare 挑战 + SPA 架构，直连拿不到内容（实测 `/verify/home?captchaType=blockPuzzle`）。
2. **合规**：Clarivate / Elsevier 条款禁止未经许可的自动抓取；数据挖掘须走机构协议或官方 API。
3. **方法学**：指南必须报告**可复现**的检索过程。爬虫结果不稳定、无法引用，审稿时无法交代检索日期与命中数。

**正解是官方 API**（需机构权限）：

- Web of Science：Starter / Expanded API（[申请凭据](https://clarivate.libguides.com/ld.php?content_id=77549221#1#1)）
- Embase：Elsevier Embase API（[使用资格](https://www.elsevier.support/dataasaservice/answer/who-can-use-the-elsevier-research-products-apis)）
- Cochrane：机构访问 + 平台导出 RIS

> 诚实说明：Embase 相对 PubMed 的独特价值（会议摘要与欧洲期刊）**没有免费替代**。

---

## 检索用法

```bash
# 零配置三源，自动去重
node src/retrieve.js --query "acupuncture AND lung cancer" --sources pubmed,europepmc,clinicaltrials

# 全部源（含浏览器驱动的知网与维普）
node src/retrieve.js --query "肺癌 中医药" --sources all --limit 50

# 只跑维普
node src/retrieve.js --query "肺癌 中医药" --sources vip --limit 20

# 检索策略文件（每行一条，或 "名称<TAB>检索式"）
node src/retrieve.js --query-file strategy.txt --sources pubmed,europepmc --out results

# 列出所有源及其要求
node src/retrieve.js --list
```

| 参数 | 说明 | 默认 |
|---|---|---|
| `--query` | 检索词或检索式 | 必填* |
| `--query-file` | 检索策略文件（多检索式） | — |
| `--sources` | 逗号分隔，或 `all` | `pubmed,europepmc,clinicaltrials` |
| `--out` | 输出目录 | `results` |
| `--limit` | 每源上限 | 200 |
| `--max-pages` | 浏览器源的最大翻页数 | 按 limit 推算 |
| `--no-merge` | 跳过去重，只输出原始记录 | 去重开启 |
| `--no-enrich` | 维普跳过详情页补摘要（快很多，但无摘要） | 补全开启 |
| `--reuse` | 复用已开的 Chrome | 否 |
| `--advanced` | 知网走专业检索 | 否 |
| `--json` | JSON 输出 | 否 |

\* `--query` 与 `--query-file` 至少给一个。

### 输出

```
results/
  retrieved_<时间>.json    合并后记录 + 每源命中数 + 去重报告 + 错误
  retrieved_<时间>.csv     带 BOM，可直接用于 Excel / Rayyan / Covidence 筛选
  dedup-report_<时间>.json 每次合并的保留/丢弃题名与来源
```

### 各源检索语法

| 源 | 语法示例 |
|---|---|
| PubMed | `(lung neoplasms[MeSH]) AND (acupuncture[tiab] OR moxibustion[tiab])` |
| Europe PMC | `(TITLE_ABS:"lung cancer") AND (TITLE_ABS:"acupuncture")` |
| ClinicalTrials.gov | 自由词，如 `acupuncture AND lung cancer` |
| CNKI | `中医药 肺癌 围手术期`，或 `--advanced` 用专业检索式 |
| 维普 | `肺癌 中医药`，或字段式 `K=肺癌` |

---

## 配置凭据（重要）

**所有 API key 都从环境变量读取，代码里没有任何硬编码密钥，也不需要写入文件。**

```bash
cp .env.example .env      # 然后编辑 .env
set -a; source .env; set +a        # macOS / Linux
```

Windows PowerShell：

```powershell
$env:NCBI_API_KEY = "你的key"
# 或从文件加载
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') { Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim() }
}
```

| 变量 | 必需 | 作用 |
|---|---|---|
| `NCBI_API_KEY` | 否 | PubMed 速率 3→10 次/秒（[免费申请](https://www.ncbi.nlm.nih.gov/account/)） |
| `CONTACT_EMAIL` | 建议 | 让 Crossref/OpenAlex/NCBI 把你放进快速池，避免 429 |
| `CHROME_PATH` | 否 | 指定浏览器可执行文件 |
| `CDP_PORT` | 否 | 调试端口，默认 9222 |

`.env` 已在 `.gitignore` 中，且**推送前有强制密钥扫描**（见下）。

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

- **凭据安全**：所有密钥从环境变量读取，仓库内无任何硬编码密钥。`.env` 已忽略，且
  `_tools/push-api.mjs` 在推送前强制执行 `_tools/scan-secrets.mjs`——检测到任何
  凭据样式内容会**拒绝推送并退出**（可用 `node _tools/scan-secrets.mjs` 单独运行自检）。
- **验证码**：知网触发时脚本报 `CAPTCHA_BLOCKED` 并停止，不会硬绕。请在 Chrome 窗口手动拖动滑块，再用 `--reuse` 继续。
- **403 / 429**：接口返回 403 时立即停止重试，避免升级为风控。
- **礼貌抓取**：知网每条约 1.2 秒，维普每条约 1.5 秒（含详情页），全程单浏览器会话。请勿把 `--delay-ms` 调到很小。
- **版权**：本工具只取**题录与摘要**，不下载全文。
  `SepineTam/cnki-mcp` 的许可条款明确禁止批量检索，故本项目为独立实现，仅参考其接口用法；参考项目源码未随仓库分发。
- **机构权限**：知网能否取到摘要取决于机构 IP 订阅。
- **检索可复现**：每次输出都记录检索式、检索时间、命中数与来源，供方法学章节引用。

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
  retrieve.js          统一检索 CLI（多源 + 自动去重）
  retrieve/
    common.js          HTTP 工具、礼貌 UA、退避重试
    pubmed.js          PubMed（E-utilities 两步调用 + 自研 XML 解析）
    europepmc.js       Europe PMC REST API
    clinicaltrials.js  ClinicalTrials.gov v2 API
    cnki.js            知网（调用 cnki-batch.js 的浏览器流程）
    vip.js             维普（浏览器 + 详情页补摘要）
    browser-utils.js   浏览器源共享的 CDP 工具
  cdp.js              浏览器查找、启动、CDP 连接（跨平台）
  cnki-batch.js       CNKI 批量检索主程序
  xml.js              零依赖 XML 解析器（PubMed 需要，见下）
  parse-formats.js    RIS / BibTeX / EndNote / JSON 解析
  normalize.js        规范化、匹配级联、去重、合并
  merge.js            跨库合并去重 CLI
  probe*.js           各库可获取性与 DOM 选择器探测
testdata/             合成的跨库测试数据（由 _tools/make-fixtures.mjs 生成）
_tools/               维护者脚本（推送、密钥扫描、各库调试），不随仓库发布
```

> `xml.js` 存在的原因：PubMed XML 里 `<ArticleIdList>` 既出现在文章自身，也出现在
> `<ReferenceList>` 的每条参考文献中。用正则提取会匹配到参考文献的 DOI
> （实测 3 篇文章下抓到 98 个 DOI），因此必须按层级解析。

生成测试数据并自检：

```bash
npm run fixtures
node src/merge.js --in testdata/webofscience.ris testdata/cochrane.ris testdata/pubmed.txt \
  testdata/embase.ris testdata/cnki.json testdata/nodoi_a.ris testdata/nodoi_b.ris --out out
```

预期结果：21 条输入 → 10 条唯一记录，`match reasons: {"doi":7,"title+year":3,"title-fuzzy":1}`。

检索自检（需要联网）：

```bash
node src/retrieve.js --query "acupuncture AND lung cancer" --sources pubmed,europepmc,clinicaltrials --limit 25
```

---

## 致谢

接口用法参考以下两个项目，均为独立实现：

- [SepineTam/cnki-mcp](https://github.com/SepineTam/cnki-mcp) — `GetExport` 导出接口与摘要解析
- [cookjohn/cnki-skills](https://github.com/cookjohn/cnki-skills) — 结果页复选框即导出 ID 的发现、验证码判定

## 许可

MIT
