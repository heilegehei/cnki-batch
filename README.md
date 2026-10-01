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

## 与既有文献流水线对接

`cnki_<时间>.json` 的 `records[]` 可与 PubMed 等模块的原始记录合并后统一去重：

- 去重建议：**DOI 优先**，其次 `题名 + 年`
- 注意：CNKI 题名可能含 `<sup>` 等 HTML 标记，比对前需规范化

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
  cdp.js            浏览器查找、启动、CDP 连接（跨平台）
  cnki-batch.js     批量检索主程序
  probe.js          环境与 DOM 选择器探测
  probe-export.js   导出接口验证
```

---

## 致谢

接口用法参考以下两个项目，均为独立实现：

- [SepineTam/cnki-mcp](https://github.com/SepineTam/cnki-mcp) — `GetExport` 导出接口与摘要解析
- [cookjohn/cnki-skills](https://github.com/cookjohn/cnki-skills) — 结果页复选框即导出 ID 的发现、验证码判定

## 许可

MIT
