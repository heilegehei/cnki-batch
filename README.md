# 澶氬簱鏂囩尞妫€绱笌鍚堝苟锛堟寚鍗楋紡涓撳鍏辫瘑鍐欎綔鏀拺锛?
璺ㄦ暟鎹簱鐨?*纭畾鎬ф枃鐚绱?+ 鍘婚噸鍚堝苟**锛岃緭鍑洪褰?+ 鎽樿锛屼緵鎸囧崡锛忎笓瀹跺叡璇嗙殑鏂囩尞绛涢€夈€?PRISMA 娴佺▼鍥句笌鍙傝€冩枃鐚〃浣跨敤銆?
璁捐鍘熷垯锛?*涓嶇粡杩?LLM銆佽褰曢€愬瓧鏉ヨ嚜婧愬簱銆佸畬鏁寸暀瀛樻绱㈠嚭澶?*锛屼究浜庡湪鏂规硶瀛﹂儴鍒嗗鐜版绱㈣繃绋嬨€?
鏀寔 **Windows / macOS / Linux**銆?
---

## 蹇€熷紑濮嬶紙鏂拌澶?/ 鏂?Agent 浠庤繖閲屽紑濮嬶級

```bash
git clone https://github.com/heilegehei/cnki-batch.git
cd cnki-batch
npm install
node src/retrieve.js --list          # 鐪嬫湁鍝簺婧愩€佸悇鑷姹?```

**闆堕厤缃紝绔嬪埢鍙窇**锛堝彧闇€ Node 鈮?18 鍜?Chrome锛夛細

```bash
node src/retrieve.js --query "acupuncture AND lung cancer" \
  --sources pubmed,europepmc,clinicaltrials --limit 25
```

杈撳嚭鍦?`results/`锛氬悎骞跺悗鐨?JSON + 鍙洿鎺ヨ繘 Excel/Rayyan 绛涢€夌殑 CSV + 鍘婚噸鎶ュ憡銆?
**鍙窇鐭ョ綉鎴栫淮鏅?*锛堥渶瑕佹祻瑙堝櫒锛涚煡缃戣繕闇€鏈烘瀯 IP锛夛細

```bash
node src/retrieve.js --query "鑲虹檶 涓尰鑽? --sources cnki --limit 40
node src/retrieve.js --query "鑲虹檶 涓尰鑽? --sources vip  --limit 20
```

**鍙湁鎵嬪姩瀵煎嚭鐨勬枃浠?*锛圧IS / BibTeX / EndNote / JSON锛夋椂锛岀洿鎺ョ敤鍚堝苟灞傦細

```bash
node src/merge.js --in wos.ris cochrane.ris pubmed.txt cnki.json --out merged
```

### 鍚勫簱褰撳墠鍙敤鎬э紙涓€鍙ヨ瘽鐗堬級

| 鐘舵€?| 鏁版嵁搴?|
|---|---|
| **闆堕厤缃彲鐢?* | PubMed銆丒urope PMC銆丆linicalTrials.gov |
| **鍙敤锛堥渶娴忚鍣級** | 缁存櫘 VIP |
| **鍙敤锛堥渶鏈烘瀯 IP锛?* | CNKI 鐭ョ綉 |
| **涓嶅彲鑷姩鍖?* | 涓囨柟锛堥樋閲屼簯鐩鹃獙璇佸锛夆啋 鎵嬪姩瀵煎嚭 RIS |
| **闇€璐﹀彿 / 璁㈤槄** | SinoMed锛堣处鍙凤級銆丆ochrane / Embase / Web of Science / Scopus / CINAHL锛堟満鏋勮闃呮垨瀹樻柟 API锛?|

缁嗚妭銆佸疄娴嬭瘉鎹笌鏇夸唬鏂规瑙佸悗鏂囥€?
---

## 鐩綍

- [蹇€熷紑濮媇(#蹇€熷紑濮嬫柊璁惧--鏂?agent-浠庤繖閲屽紑濮?
- [鏀寔鐨勬暟鎹簱](#鏀寔鐨勬暟鎹簱) 路 [妫€绱㈢敤娉昡(#妫€绱㈢敤娉? 路 [閰嶇疆鍑嵁](#閰嶇疆鍑嵁閲嶈)
- [璺ㄥ簱鍚堝苟涓庡幓閲峕(#璺ㄥ簱鍚堝苟涓庡幓閲? 路 [CNKI 涓撻棬璇存槑](#涓轰粈涔堝繀椤昏蛋娴忚鍣?
- [椋庨櫓涓庡悎瑙刔(#椋庨櫓涓庡悎瑙? 路 [宸茬煡闂](#宸茬煡闂) 路 [椤圭洰缁撴瀯](#椤圭洰缁撴瀯)

---

## 涓轰粈涔堝繀椤昏蛋娴忚鍣?
鐭ョ綉娌℃湁鍏紑妫€绱?API锛屼笖宸插鐩磋繛寮哄埗浜烘満楠岃瘉銆傚疄娴嬬粨鏋滐細

| 璇锋眰 | 缁撴灉 |
|---|---|
| `GET /kns8s/search` | 302 鈫?`/verify/home?captchaType=blockPuzzle`锛堣吘璁粦鍧楋級 |
| `GET /kns8s/AdvSearch` | 302 鈫?鍚屼笂 |
| `POST /dm8/API/GetExport` | 403锛堟棤浼氳瘽锛忔棤鏁?id锛?|

鍥犳绾?HTTP 鎶撳彇涓嶅彲琛岋紝蹇呴』鍦?*鏈烘瀯 IP 鐨勬祻瑙堝櫒浼氳瘽**鍐呮搷浣溿€?
---

## 鏍稿績鏈哄埗

涓変釜鍏抽敭鐐瑰悎璧锋潵鎵嶈兘璺戦€氾紝缂轰竴涓嶅彲锛?
1. **缁撴灉椤靛閫夋鍗冲鍑?ID**
   `input.cbItem` 鐨?`value` 灏辨槸璇︽儏椤?`#export-id`锛堝悓涓€涓姞瀵嗕覆锛夈€?   瀹炴祴鍗曢〉 20 鏉″嵆寰?20 涓彲鐢ㄥ姞瀵?ID銆?   锛堝彂鐜板嚭澶勶細`cookjohn/cnki-skills` 鐨?`skills/cnki-export/SKILL.md`锛?
2. **鎽樿鍙兘浠庡鍑烘帴鍙ｅ彇**
   缁撴灉椤?HTML **涓嶅惈**鎽樿锛堝凡瀹炴祴纭锛夈€傚繀椤诲姣忎釜 ID 璋?   `POST /dm8/API/GetExport`锛坄displaymode=GBTREFER,elearning,EndNote`锛夛紝
   鍐嶄粠 `ELEARNING` 鐨?`Summary-鎽樿` 鎴?`ENDNOTE` 鐨?`%X` 鍙栨憳瑕併€?   锛堝嚭澶勶細`SepineTam/cnki-mcp` 鐨?`core/tools/export.py`锛?
3. **楠岃瘉鐮佸垽瀹氳鎺掗櫎棰勫姞杞?*
   `#tcaptcha_transform_dy` 闇€ `getBoundingClientRect().top >= 0` 鎵嶇畻鐪熼獙璇佺爜锛?   SDK 棰勫姞杞芥椂浣嶄簬 `-1000000px`锛屽彧鍒ゅ瓨鍦ㄤ細璇姤銆?
---

## 瀹夎

瑕佹眰 Node.js 鈮?18 涓?Chrome锛堟垨浠绘剰 Chromium 鍐呮牳娴忚鍣細Edge銆丅rave銆丆hromium锛夈€?
```bash
git clone https://github.com/heilegehei/cnki-batch.git
cd cnki-batch
npm install
```

鏈」鐩敤 `puppeteer-core`锛?*涓嶄細涓嬭浇鑷甫 Chromium**锛岀洿鎺ラ┍鍔ㄤ綘宸插畨瑁呯殑娴忚鍣ㄣ€?
### 娴忚鍣ㄨ矾寰?
鑴氭湰鎸夊钩鍙拌嚜鍔ㄦ煡鎵撅細

| 骞冲彴 | 鍏稿瀷璺緞 |
|---|---|
| macOS | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
| macOS (Homebrew) | `/opt/homebrew/bin/chromium`銆乣/usr/local/bin/chromium` |
| Windows | `%ProgramFiles%\Google\Chrome\Application\chrome.exe` 绛?|
| Linux | `/usr/bin/google-chrome`銆乣/usr/bin/chromium` 绛?|

macOS 涓婅嫢 Chrome 涓嶅湪 `/Applications`锛屾垨鎯崇敤鍏朵粬 Chromium 鍐呮牳娴忚鍣紝鏄惧紡鎸囧畾鍗冲彲锛?
```bash
export CHROME_PATH="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
```

鑻ュ嚭鐜?`macOS` 棣栨鎷︽埅锛?鏃犳硶楠岃瘉寮€鍙戣€?锛夛紝鍦?**绯荤粺璁剧疆 鈫?闅愮涓庡畨鍏ㄦ€?* 閲屽厑璁镐竴娆″嵆鍙€?
---

## 鐢ㄦ硶

```bash
# 涓€妗嗗紡妫€绱紝鎶?3 椤碉紙姣忛〉 20 鏉★級
node src/cnki-batch.js --query "涓尰鑽?鑲虹檶 鍥存墜鏈湡" --out out --maxPages 3

# 涓撲笟妫€绱紙甯冨皵寮忥紝涓?PubMed / Embase 妫€绱㈠紡鍙榻愶級
node src/cnki-batch.js --advanced --query "SU=('鑲虹檶') AND KY=('鍥存墜鏈湡')" --maxPages 3

# 澶嶇敤宸叉墦寮€鐨?Chrome锛堝悓涓€涓満鏋?IP 浼氳瘽锛岄獙璇佺爜浜哄伐杩囦竴娆″悗缁х画锛?node src/cnki-batch.js --query "..." --reuse
```

### 鍙傛暟

| 鍙傛暟 | 璇存槑 | 榛樿 |
|---|---|---|
| `--query` | 妫€绱㈣瘝鎴栦笓涓氭绱㈠紡 | 蹇呭～ |
| `--out` | 杈撳嚭鐩綍 | `out` |
| `--maxPages` | 鏈€澶氭姄鍑犻〉锛堟瘡椤?20 鏉★級 | 1 |
| `--limit` | 鏈€澶氬嚑鏉¤褰?| 涓嶉檺 |
| `--delayMs` | 姣忔潯瀵煎嚭闂撮殧锛堢ぜ璨屾姄鍙栵級 | 1200 |
| `--advanced` | 璧颁笓涓氭绱㈤〉 | 鍚?|
| `--reuse` | 杩炴帴宸叉湁 `:9222` Chrome | 鍚?|
| `--port` | CDP 绔彛 | 9222 |
| `--headless` | 鏃犲ご妯″紡锛?*涓嶅缓璁?*锛岄獙璇佺爜鏃犳硶浜哄伐澶勭悊锛?| 鍚?|

### 鐜鍙橀噺

| 鍙橀噺 | 鐢ㄩ€?|
|---|---|
| `CHROME_PATH` | 鎸囧畾娴忚鍣ㄥ彲鎵ц鏂囦欢 |
| `CDP_PORT` | 璋冭瘯绔彛锛堢瓑浠蜂簬 `--port`锛?|

---

## 杈撳嚭

姣忔妫€绱㈢敓鎴愪竴瀵规枃浠讹紙鏃堕棿鎴冲懡鍚嶏級锛?
- `cnki_<鏃堕棿>.json` 鈥?瀹屾暣璁板綍 + 妫€绱㈠嚭澶勶紙`query` / `searchUrl` / `totalHitsReported` / `retrievedAt`锛?- `cnki_<鏃堕棿>.csv` 鈥?**甯?BOM 鐨?UTF-8**锛孍xcel锛堝惈 macOS Excel / Numbers锛夌洿鎺ユ墦寮€涓嶄贡鐮?
### 瀛楁瀹炴祴瑕嗙洊鐜囷紙43 鏉＄湡瀹炴绱級

| 瀛楁 | 瑕嗙洊 | 瀛楁 | 瑕嗙洊 |
|---|---|---|---|
| 棰樺悕 / 浣滆€?/ 鏉ユ簮 | 43/43 | 鍏抽敭璇?/ **鎽樿** | 42鈥?3/43 |
| 鏂囩尞绫诲瀷 / 骞?/ 鍙戣〃鏃ユ湡 | 43/43 | 鏈烘瀯 / 鏈?/ 椤垫暟 | 43/43 |
| 鏉ユ簮搴?/ 閾炬帴 / GB/T 7714 | 43/43 | DOI | 绾?57% 鈥?|

鈥?瀛︿綅璁烘枃涓庢棭鏈熸枃鐚€氬父鏃?DOI锛沗link` 瀛楁鍙厹搴曞畾浣嶃€?鏃╂湡鏂囩尞鍙兘鏃犵粨鏋勫寲鎽樿锛堟暟鎹湰韬己鍙ｏ紝闈炶剼鏈棶棰橈級銆?
`GB/T 7714` 涓烘暣鏉″紩鐢ㄤ覆锛屽彲鐩存帴杩涘弬鑰冩枃鐚〃锛?
```
[1]榛勫畯,璋㈡灄宄?鐕曞钩鏉?绛?杈撴敞绾㈢粏鑳為厤鍚堣礊鑺壎姝ｉ绮掑彛鏈嶁€J].涓崕涓尰鑽鍒?2023,41(6):242-246.DOI:10.13193/鈥?```

---

## 鐜鑷

涓嶇‘瀹氱幆澧冩槸鍚﹀氨缁紙閫夋嫨鍣ㄦ槸鍚︿粛鏈夋晥銆佹満鏋?IP 鏄惁鍙闂€侀獙璇佺爜鏄惁瑙﹀彂锛夋椂锛屽厛璺戞帰娴嬶細

```bash
npm run probe -- "涓尰鑽?鑲虹檶"
npm run probe:export -- "涓尰鑽?鑲虹檶"
```

`probe.js` 浼氳緭鍑虹粨鏋滈〉鍚勯€夋嫨鍣ㄧ殑鍛戒腑鏁伴噺銆佹€诲懡涓暟銆侀獙璇佺爜鐘舵€侊紱
`probe-export.js` 浼氶獙璇佸鍑烘帴鍙ｈ兘鍚﹀彇鍒版憳瑕併€傜煡缃戞敼鐗堝悗浠ユ瀹氫綅澶辨晥鐐广€?
---

## 鏀寔鐨勬暟鎹簱

缁熶竴鍏ュ彛 `src/retrieve.js`锛屼竴娆℃绱㈠彲璺ㄥ涓簱锛岃嚜鍔ㄥ幓閲嶅悎骞躲€?
| 婧?| 閿悕 | 鏂瑰紡 | 鎽樿 | 鏄惁闇€瑕佹敞鍐?|
|---|---|---|---|---|
| **PubMed** | `pubmed` | NCBI E-utilities锛堜袱姝ヨ皟鐢級 | 鉁?| 鍚︼紙鍙€?API key 鎻愰€燂級 |
| **Europe PMC** | `europepmc` | 鍏嶈垂 REST API锛屽瓧娈靛寲甯冨皵妫€绱?| 鉁?98% | 鍚?|
| **ClinicalTrials.gov** | `clinicaltrials` | 瀹樻柟 v2 API | 鉁?| 鍚?|
| **CNKI 鐭ョ綉** | `cnki` | 娴忚鍣紙CDP锛夛紝闇€鏈烘瀯 IP | 鉁?| 鏈烘瀯 IP |
| **缁存櫘 VIP** | `vip` | 娴忚鍣紙CDP锛?| 鉁?璇︽儏椤佃ˉ鍏?| 鍚?|

### 瀹炴祴缁撹锛坄npm run probe:foreign`銆乣npm run probe:cn` 鍙鐜帮級

| 鏁版嵁搴?| 鐘舵€?| 璇存槑 |
|---|---|---|
| PubMed / Europe PMC / ClinicalTrials.gov | **200 鍙敤** | 瀹樻柟 API锛岄浂閰嶇疆 |
| 缁存櫘 VIP | **鍙敤** | 妫€绱㈤〉 412 鍙嶇埇锛屼絾娴忚鍣ㄩ┍鍔ㄦ垚鍔?|
| CNKI 鐭ョ綉 | **鍙敤** | 闇€鏈烘瀯 IP锛屽惈楠岃瘉鐮佸鐞?|
| 涓囨柟 Wanfang | **403 楠岃瘉澧?* | 闃块噷浜戠浘锛?50 绉掑唴涓嶈嚜鏀捐锛?*鏃犳硶鏃犱汉鍊煎畧** |
| SinoMed | 302 璺崇櫥褰?| 闇€娉ㄥ唽璐﹀彿 |
| Cochrane / Embase / Web of Science / Scopus / CINAHL | **Cloudflare 403** | 闇€鏈烘瀯璁㈤槄鎴栧畼鏂?API |

**涓囨柟鐨勬浛浠ｅ仛娉?*锛氬湪娴忚鍣ㄩ噷鎵嬪姩妫€绱㈠苟瀵煎嚭 RIS锛屽啀浜ょ粰鍚堝苟灞傦細

```bash
node src/merge.js --in wanfang-export.ris --source 涓囨柟 --out merged
```

### 涓轰粈涔堜笉涓?Cochrane / Embase / WoS 鍐欑埇铏?
涓夋潯璺悓鏃跺皝姝伙細

1. **鎶€鏈?*锛欳loudflare 鎸戞垬 + SPA 鏋舵瀯锛岀洿杩炴嬁涓嶅埌鍐呭锛堝疄娴?`/verify/home?captchaType=blockPuzzle`锛夈€?2. **鍚堣**锛欳larivate / Elsevier 鏉℃绂佹鏈粡璁稿彲鐨勮嚜鍔ㄦ姄鍙栵紱鏁版嵁鎸栨帢椤昏蛋鏈烘瀯鍗忚鎴栧畼鏂?API銆?3. **鏂规硶瀛?*锛氭寚鍗楀繀椤绘姤鍛?*鍙鐜?*鐨勬绱㈣繃绋嬨€傜埇铏粨鏋滀笉绋冲畾銆佹棤娉曞紩鐢紝瀹＄鏃舵棤娉曚氦浠ｆ绱㈡棩鏈熶笌鍛戒腑鏁般€?
**姝ｈВ鏄畼鏂?API**锛堥渶鏈烘瀯鏉冮檺锛夛細

- Web of Science锛歋tarter / Expanded API锛圼鐢宠鍑嵁](https://clarivate.libguides.com/ld.php?content_id=77549221#1#1)锛?- Embase锛欵lsevier Embase API锛圼浣跨敤璧勬牸](https://www.elsevier.support/dataasaservice/answer/who-can-use-the-elsevier-research-products-apis)锛?- Cochrane锛氭満鏋勮闂?+ 骞冲彴瀵煎嚭 RIS

> 璇氬疄璇存槑锛欵mbase 鐩稿 PubMed 鐨勭嫭鐗逛环鍊硷紙浼氳鎽樿涓庢娲叉湡鍒婏級**娌℃湁鍏嶈垂鏇夸唬**銆?
---

## 妫€绱㈢敤娉?
```bash
# 闆堕厤缃笁婧愶紝鑷姩鍘婚噸
node src/retrieve.js --query "acupuncture AND lung cancer" --sources pubmed,europepmc,clinicaltrials

# 鍏ㄩ儴婧愶紙鍚祻瑙堝櫒椹卞姩鐨勭煡缃戜笌缁存櫘锛?node src/retrieve.js --query "鑲虹檶 涓尰鑽? --sources all --limit 50

# 鍙窇缁存櫘
node src/retrieve.js --query "鑲虹檶 涓尰鑽? --sources vip --limit 20

# 妫€绱㈢瓥鐣ユ枃浠讹紙姣忚涓€鏉★紝鎴?"鍚嶇О<TAB>妫€绱㈠紡"锛?node src/retrieve.js --query-file strategy.txt --sources pubmed,europepmc --out results

# 鍒楀嚭鎵€鏈夋簮鍙婂叾瑕佹眰
node src/retrieve.js --list
```

| 鍙傛暟 | 璇存槑 | 榛樿 |
|---|---|---|
| `--query` | 妫€绱㈣瘝鎴栨绱㈠紡 | 蹇呭～* |
| `--query-file` | 妫€绱㈢瓥鐣ユ枃浠讹紙澶氭绱㈠紡锛?| 鈥?|
| `--sources` | 閫楀彿鍒嗛殧锛屾垨 `all` | `pubmed,europepmc,clinicaltrials` |
| `--out` | 杈撳嚭鐩綍 | `results` |
| `--limit` | 姣忔簮涓婇檺 | 200 |
| `--max-pages` | 娴忚鍣ㄦ簮鐨勬渶澶х炕椤垫暟 | 鎸?limit 鎺ㄧ畻 |
| `--no-merge` | 璺宠繃鍘婚噸锛屽彧杈撳嚭鍘熷璁板綍 | 鍘婚噸寮€鍚?|
| `--no-enrich` | 缁存櫘璺宠繃璇︽儏椤佃ˉ鎽樿锛堝揩寰堝锛屼絾鏃犳憳瑕侊級 | 琛ュ叏寮€鍚?|
| `--reuse` | 澶嶇敤宸插紑鐨?Chrome | 鍚?|
| `--advanced` | 鐭ョ綉璧颁笓涓氭绱?| 鍚?|
| `--json` | JSON 杈撳嚭 | 鍚?|

\* `--query` 涓?`--query-file` 鑷冲皯缁欎竴涓€?
### 杈撳嚭

```
results/
  retrieved_<鏃堕棿>.json    鍚堝苟鍚庤褰?+ 姣忔簮鍛戒腑鏁?+ 鍘婚噸鎶ュ憡 + 閿欒
  retrieved_<鏃堕棿>.csv     甯?BOM锛屽彲鐩存帴鐢ㄤ簬 Excel / Rayyan / Covidence 绛涢€?  dedup-report_<鏃堕棿>.json 姣忔鍚堝苟鐨勪繚鐣?涓㈠純棰樺悕涓庢潵婧?```

### 鍚勬簮妫€绱㈣娉?
| 婧?| 璇硶绀轰緥 |
|---|---|
| PubMed | `(lung neoplasms[MeSH]) AND (acupuncture[tiab] OR moxibustion[tiab])` |
| Europe PMC | `(TITLE_ABS:"lung cancer") AND (TITLE_ABS:"acupuncture")` |
| ClinicalTrials.gov | 鑷敱璇嶏紝濡?`acupuncture AND lung cancer` |
| CNKI | `涓尰鑽?鑲虹檶 鍥存墜鏈湡`锛屾垨 `--advanced` 鐢ㄤ笓涓氭绱㈠紡 |
| 缁存櫘 | `鑲虹檶 涓尰鑽痐锛屾垨瀛楁寮?`K=鑲虹檶` |

---

## 閰嶇疆鍑嵁锛堥噸瑕侊級

**鎵€鏈?API key 閮戒粠鐜鍙橀噺璇诲彇锛屼唬鐮侀噷娌℃湁浠讳綍纭紪鐮佸瘑閽ワ紝涔熶笉闇€瑕佸啓鍏ユ枃浠躲€?*

```bash
cp .env.example .env      # 鐒跺悗缂栬緫 .env
set -a; source .env; set +a        # macOS / Linux
```

Windows PowerShell锛?
```powershell
$env:NCBI_API_KEY = "浣犵殑key"
# 鎴栦粠鏂囦欢鍔犺浇
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') { Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim() }
}
```

| 鍙橀噺 | 蹇呴渶 | 浣滅敤 |
|---|---|---|
| `NCBI_API_KEY` | 鍚?| PubMed 閫熺巼 3鈫?0 娆?绉掞紙[鍏嶈垂鐢宠](https://www.ncbi.nlm.nih.gov/account/)锛?|
| `CONTACT_EMAIL` | 寤鸿 | 璁?Crossref/OpenAlex/NCBI 鎶婁綘鏀捐繘蹇€熸睜锛岄伩鍏?429 |
| `CHROME_PATH` | 鍚?| 鎸囧畾娴忚鍣ㄥ彲鎵ц鏂囦欢 |
| `CDP_PORT` | 鍚?| 璋冭瘯绔彛锛岄粯璁?9222 |

`.env` 宸插湪 `.gitignore` 涓紝涓?*鎺ㄩ€佸墠鏈夊己鍒跺瘑閽ユ壂鎻?*锛堣涓嬶級銆?
---

## 璺ㄥ簱鍚堝苟涓庡幓閲?
鎸囧崡妫€绱細妯法澶氫釜搴擄紝鏈€缁堝繀椤绘姤鎴?*涓€寮犲幓閲嶅悗鐨勮〃**鍜屼竴涓?PRISMA 娴佺▼鍥炬暟瀛椼€傝繖涓ā鍧楄礋璐ｆ妸浠绘剰鏉ユ簮鐨勫鍑哄悎骞跺幓閲嶃€?
鏀寔鍥涚鏍煎紡锛堣嚜鍔ㄨ瘑鍒級锛?
| 鏍煎紡 | 鏉ユ簮 |
|---|---|
| **RIS** | Web of Science銆丆ochrane銆丒mbase銆丼copus |
| **EndNote** | CNKI锛堟湰椤圭洰鐨?`--out` 浜у嚭锛夈€乄eb of Science |
| **BibTeX** | Zotero銆丒ndNote銆丟oogle Scholar |
| **JSON** | 鏈」鐩?CNKI 妯″潡鐨勮緭鍑?|

### 鐢ㄦ硶

```bash
node src/merge.js --in wos.ris cochrane.ris pubmed.txt cnki.json embase.ris --out merged

# 瑕嗙洊鏉ユ簮鏍囩锛堟枃浠跺悕鏃犳硶璇嗗埆鏃讹級
node src/merge.js --in a.ris b.ris --source "Web of Science" --source Cochrane --out merged

# 璋冨弬
node src/merge.js --in a.ris b.ris --no-fuzzy            # 鍙仛绮剧‘鍖归厤
node src/merge.js --in a.ris b.ris --threshold 0.92      # 鏇翠弗鏍肩殑妯＄硦闃堝€?node src/merge.js --in a.ris --dry                       # 鍙В鏋愶紝涓嶅啓鏂囦欢
```

| 鍙傛暟 | 璇存槑 | 榛樿 |
|---|---|---|
| `--in` | 杈撳叆鏂囦欢锛堝彲澶氫釜锛?| 蹇呭～ |
| `--source` | 瑕嗙洊鏉ユ簮鏍囩锛屾寜浣嶇疆瀵瑰簲 `--in` | 鎸夋枃浠跺悕鐚滄祴 |
| `--out` | 杈撳嚭鐩綍 | `merged` |
| `--threshold` | 妯＄硦鍖归厤鐩镐技搴﹂槇鍊?| 0.9 |
| `--no-fuzzy` | 鍏抽棴妯＄硦鍖归厤 | 鍏抽棴鍓嶄负寮€鍚?|
| `--no-year-check` | 棰樺悕鐩稿悓浣嗗勾浠戒笉鍚屼篃鍚堝苟 | 涓嶅悎骞?|

### 鍖归厤绾ц仈

鎸夐『搴忔墽琛岋紝浠讳竴绾у懡涓嵆鍚堝苟锛堝苟璁板綍鍘熷洜锛屽彲瀹¤锛夛細

| 椤哄簭 | 瑙勫垯 | 璇存槑 |
|---|---|---|
| 1 | **DOI** | 鏈€寮烘爣璇嗭紱澶у皬鍐欎笌 `doi:` 鍓嶇紑鑷姩褰掍竴 |
| 2 | **PMID** | PubMed / Europe PMC 閲嶅彔 |
| 3 | **棰樺悕 + 骞?* | 褰掍竴鍖栧悗瀹屽叏鐩哥瓑 |
| 4 | **棰樺悕妯＄硦** | 鍚岃嫳鏂囧垎璇?/ 涓枃浜屽厓缁勭殑 token-set Jaccard 鈮?闃堝€?|

鍚堝苟鐢ㄥ苟鏌ラ泦**浼犻€掑悎骞?*锛欰~B 闈?DOI銆丅~C 闈犻鍚嶏紝涓夎€呭綊涓轰竴鏉°€傚勾浠藉弬涓庣害鏉燂紝閬垮厤鍚屽悕涓嶅悓骞磋鍚堝苟銆?
### 杈撳嚭

- `merged_<鏃堕棿>.json` 鈥?鍚堝苟鍚庤褰?+ 鎶ュ憡 + 杈撳叆娓呭崟
- `merged_<鏃堕棿>.csv` 鈥?甯?BOM锛屽彲鐩存帴鐢ㄤ簬 Excel / Rayyan / Covidence 绛涢€?- `dedup-report_<鏃堕棿>.json` 鈥?鍘婚噸鎶ュ憡锛屽惈姣忔鍚堝苟鐨?*淇濈暀/涓㈠純棰樺悕涓庢潵婧?*

### 瀹炴祴锛坄npm run fixtures` 鐢熸垚鍚堟垚鏁版嵁鍚庯級

```
input records        : 21
unique records       : 10
duplicates removed   : 11
cross-database merges: 5
match reasons        : {"doi":7,"title+year":3,"title-fuzzy":1}
```

鍏朵腑涓€鏉℃妸 **PubMed + Embase + CNKI + Zotero 鍥涙簮**姝ｇ‘鍚堝苟涓轰竴鏉★紝浣滆€呬笌鍏抽敭璇嶆眰骞堕泦銆佹憳瑕佸彇鏈€闀垮彉浣撱€傚悎鎴愭暟鎹凡瑕嗙洊鐪熷疄宸紓锛欴OI 澶у皬鍐欍€佸叏瑙掓嫭鍙枫€佺牬鎶樺彿銆乣randomized`/`randomised`銆佹柟鎷彿鍖呰９鐨勮嫳璇戦鍚嶃€佷互鍙?*鏃?DOI**鐨勪粎棰樺悕閲嶅彔銆?
瀛楁鍚堝苟绛栫暐锛氭枃鏈彇鏈€闀块潪绌哄€硷紙閫氬父淇℃伅鏈€鍏級锛屼綔鑰?鍏抽敭璇嶆眰骞堕泦锛屾爣璇嗙鍙栦换涓€鏉ユ簮鏈夊€艰€呫€?
---

## 涓庢棦鏈夋枃鐚祦姘寸嚎瀵规帴

CNKI 妯″潡浜у嚭鐨?`cnki_<鏃堕棿>.json` 鐩存帴鍠傜粰鍚堝苟灞傚嵆鍙細

```bash
node src/merge.js --in out/cnki_2026-10-01_11-56-22.json pubmed.txt cochrane.ris --out merged
```

- 鍘婚噸鐢卞悎骞跺眰缁熶竴澶勭悊锛圖OI 鈫?PMID 鈫?棰樺悕+骞?鈫?妯＄硦锛?- CNKI 棰樺悕鍙兘鍚?`<sup>` 绛?HTML 鏍囪锛岃В鏋愭椂宸茶嚜鍔ㄥ墺绂?- 闇€瑕佷汉宸ユ牳瀵规椂鐪?`dedup-report_*.json` 閲屾瘡娆″悎骞剁殑淇濈暀/涓㈠純棰樺悕

---

## 椋庨櫓涓庡悎瑙?
- **鍑嵁瀹夊叏**锛氭墍鏈夊瘑閽ヤ粠鐜鍙橀噺璇诲彇锛屼粨搴撳唴鏃犱换浣曠‖缂栫爜瀵嗛挜銆俙.env` 宸插拷鐣ワ紝涓?  `_tools/push-api.mjs` 鍦ㄦ帹閫佸墠寮哄埗鎵ц `_tools/scan-secrets.mjs`鈥斺€旀娴嬪埌浠讳綍
  鍑嵁鏍峰紡鍐呭浼?*鎷掔粷鎺ㄩ€佸苟閫€鍑?*锛堝彲鐢?`node _tools/scan-secrets.mjs` 鍗曠嫭杩愯鑷锛夈€?- **楠岃瘉鐮?*锛氱煡缃戣Е鍙戞椂鑴氭湰鎶?`CAPTCHA_BLOCKED` 骞跺仠姝紝涓嶄細纭粫銆傝鍦?Chrome 绐楀彛鎵嬪姩鎷栧姩婊戝潡锛屽啀鐢?`--reuse` 缁х画銆?- **403 / 429**锛氭帴鍙ｈ繑鍥?403 鏃剁珛鍗冲仠姝㈤噸璇曪紝閬垮厤鍗囩骇涓洪鎺с€?- **绀艰矊鎶撳彇**锛氱煡缃戞瘡鏉＄害 1.2 绉掞紝缁存櫘姣忔潯绾?1.5 绉掞紙鍚鎯呴〉锛夛紝鍏ㄧ▼鍗曟祻瑙堝櫒浼氳瘽銆傝鍕挎妸 `--delay-ms` 璋冨埌寰堝皬銆?- **鐗堟潈**锛氭湰宸ュ叿鍙彇**棰樺綍涓庢憳瑕?*锛屼笉涓嬭浇鍏ㄦ枃銆?  `SepineTam/cnki-mcp` 鐨勮鍙潯娆炬槑纭姝㈡壒閲忔绱紝鏁呮湰椤圭洰涓虹嫭绔嬪疄鐜帮紝浠呭弬鑰冨叾鎺ュ彛鐢ㄦ硶锛涘弬鑰冮」鐩簮鐮佹湭闅忎粨搴撳垎鍙戙€?- **鏈烘瀯鏉冮檺**锛氱煡缃戣兘鍚﹀彇鍒版憳瑕佸彇鍐充簬鏈烘瀯 IP 璁㈤槄銆?- **妫€绱㈠彲澶嶇幇**锛氭瘡娆¤緭鍑洪兘璁板綍妫€绱㈠紡銆佹绱㈡椂闂淬€佸懡涓暟涓庢潵婧愶紝渚涙柟娉曞绔犺妭寮曠敤銆?
---

## 宸茬煡闂

**Windows 鍙楅檺娌欑涓?Chrome 鍙兘鍚姩澶辫触**锛屾姤锛?
```
mojo platform_channel.cc Check failed: 鎷掔粷璁块棶 (0x5)
```

杩欐槸鏂囦欢娌欑灏佷簡鍛藉悕绠￠亾 IPC锛?*涓嶆槸鑴氭湰鎴?Chrome 鐨勯棶棰?*銆傝В鍐冲姙娉曪細

1. 鍦ㄦ櫘閫氱粓绔墜鍔ㄥ惎鍔?Chrome锛岀劧鍚庤剼鏈姞 `--reuse`锛?
   ```powershell
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" `
     --remote-debugging-port=9222 `
     --user-data-dir="$PWD\.chrome-profile"
   ```

2. 鎴栧湪鏀惧鏉冮檺鐨勬ā寮忎笅杩愯銆?
macOS / Linux 鏃犳闂銆?
---

## 椤圭洰缁撴瀯

```
src/
  retrieve.js          缁熶竴妫€绱?CLI锛堝婧?+ 鑷姩鍘婚噸锛?  retrieve/
    common.js          HTTP 宸ュ叿銆佺ぜ璨?UA銆侀€€閬块噸璇?    pubmed.js          PubMed锛圗-utilities 涓ゆ璋冪敤 + 鑷爺 XML 瑙ｆ瀽锛?    europepmc.js       Europe PMC REST API
    clinicaltrials.js  ClinicalTrials.gov v2 API
    cnki.js            鐭ョ綉锛堣皟鐢?cnki-batch.js 鐨勬祻瑙堝櫒娴佺▼锛?    vip.js             缁存櫘锛堟祻瑙堝櫒 + 璇︽儏椤佃ˉ鎽樿锛?    browser-utils.js   娴忚鍣ㄦ簮鍏变韩鐨?CDP 宸ュ叿
  cdp.js              娴忚鍣ㄦ煡鎵俱€佸惎鍔ㄣ€丆DP 杩炴帴锛堣法骞冲彴锛?  cnki-batch.js       CNKI 鎵归噺妫€绱富绋嬪簭
  xml.js              闆朵緷璧?XML 瑙ｆ瀽鍣紙PubMed 闇€瑕侊紝瑙佷笅锛?  parse-formats.js    RIS / BibTeX / EndNote / JSON 瑙ｆ瀽
  normalize.js        瑙勮寖鍖栥€佸尮閰嶇骇鑱斻€佸幓閲嶃€佸悎骞?  merge.js            璺ㄥ簱鍚堝苟鍘婚噸 CLI
  probe*.js           鍚勫簱鍙幏鍙栨€т笌 DOM 閫夋嫨鍣ㄦ帰娴?testdata/             鍚堟垚鐨勮法搴撴祴璇曟暟鎹紙鐢?_tools/make-fixtures.mjs 鐢熸垚锛?_tools/               缁存姢鑰呰剼鏈紙鎺ㄩ€併€佸瘑閽ユ壂鎻忋€佸悇搴撹皟璇曪級锛屼笉闅忎粨搴撳彂甯?```

> `xml.js` 瀛樺湪鐨勫師鍥狅細PubMed XML 閲?`<ArticleIdList>` 鏃㈠嚭鐜板湪鏂囩珷鑷韩锛屼篃鍑虹幇鍦?> `<ReferenceList>` 鐨勬瘡鏉″弬鑰冩枃鐚腑銆傜敤姝ｅ垯鎻愬彇浼氬尮閰嶅埌鍙傝€冩枃鐚殑 DOI
> 锛堝疄娴?3 绡囨枃绔犱笅鎶撳埌 98 涓?DOI锛夛紝鍥犳蹇呴』鎸夊眰绾цВ鏋愩€?
鐢熸垚娴嬭瘯鏁版嵁骞惰嚜妫€锛?
```bash
npm run fixtures
node src/merge.js --in testdata/webofscience.ris testdata/cochrane.ris testdata/pubmed.txt \
  testdata/embase.ris testdata/cnki.json testdata/nodoi_a.ris testdata/nodoi_b.ris --out out
```

棰勬湡缁撴灉锛?1 鏉¤緭鍏?鈫?10 鏉″敮涓€璁板綍锛宍match reasons: {"doi":7,"title+year":3,"title-fuzzy":1}`銆?
妫€绱㈣嚜妫€锛堥渶瑕佽仈缃戯級锛?
```bash
node src/retrieve.js --query "acupuncture AND lung cancer" --sources pubmed,europepmc,clinicaltrials --limit 25
```

---

## 鑷磋阿

鎺ュ彛鐢ㄦ硶鍙傝€冧互涓嬩袱涓」鐩紝鍧囦负鐙珛瀹炵幇锛?
- [SepineTam/cnki-mcp](https://github.com/SepineTam/cnki-mcp) 鈥?`GetExport` 瀵煎嚭鎺ュ彛涓庢憳瑕佽В鏋?- [cookjohn/cnki-skills](https://github.com/cookjohn/cnki-skills) 鈥?缁撴灉椤靛閫夋鍗冲鍑?ID 鐨勫彂鐜般€侀獙璇佺爜鍒ゅ畾

## 璁稿彲

MIT
