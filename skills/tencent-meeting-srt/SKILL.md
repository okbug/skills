---
name: tencent-meeting-srt
description: 导出腾讯会议云录制回放的字幕/转写为 SRT（或 TXT）文件。用浏览器打开 meeting.tencent.com/cw/* 回放页，自动滚动虚拟列表采集每句的时间轴与文字（可带说话人），生成标准 .srt 并校验。当用户给出腾讯会议回放链接（meeting.tencent.com/cw/...、/crm/... 等），或说「导出腾讯会议字幕」「腾讯会议转写/逐字稿下载」「会议回放字幕 SRT」「把腾讯会议录制转成 srt/txt」时使用。
---

# 腾讯会议回放字幕 → SRT

思路来自 [mengchunm/TencentMeeting-subtitle-exporter](https://github.com/mengchunm/TencentMeeting-subtitle-exporter)（油猴脚本），这里改成由 Claude 驱动浏览器执行。

**原理一句话**：回放页右侧的转写列表是**虚拟滚动**的（只渲染可视区附近几句），所以必须逐屏往下滚、边滚边收集；每句 DOM 上带 `data-pid`（段）、`data-sid`（句）、`data-time-offset="开始ms-结束ms"`，拿到这些就能直接拼 SRT。

## 用法

```
/tencent-meeting-srt <回放链接> [目标目录] [--txt] [--speaker]
```

- `<回放链接>`：必填，`https://meeting.tencent.com/cw/xxxx`（分享短链会跳到 /cw/）
- `[目标目录]`：默认当前工作目录
- `--txt`：额外导出纯文本；`--speaker`：每句前加「说话人：」（能识别到才有）

## 文件

- `scripts/collect.js` —— 注入页面的采集器（异步跑，状态挂在 `window.__TMSRT__`）
- `scripts/to_srt.py` —— `check` 校验 SRT；`build` 供兜底通道 C 把原始数据生成 SRT/TXT

下文 `SKILL_DIR` 指安装后包含本 `SKILL.md` 与 `scripts/` 的技能目录（例如 Claude Code 全局安装：`~/.claude/skills/tencent-meeting-srt`），不是写死的单一路径。

## 执行步骤

### 1. 选浏览器

- **Claude in Chrome（`mcp__claude-in-chrome__*`）优先**：用的是用户自己的 Chrome，通常已登录腾讯会议，且 `download()` 能直接下载到用户的下载目录。
- 不可用时用**内置浏览器（`mcp__Claude_Browser__*`）**：需要用户在面板里自己扫码登录。实测它的下载不会落盘、`navigator.clipboard` 被拒、也访问不了 127.0.0.1，所以导出走第 5 步 B 的「点击复制 + pbpaste」。

两者的 `javascript_tool` 都返回最后一个表达式的值，下面的代码两边通用。

### 2. 打开回放页并确认已登录

导航到链接（内置浏览器的 `navigate` 偶尔会被拒，可改用 `javascript_tool` 执行 `location.href = '<链接>'`）。`/crm/` 短链要先停在 `readyState: loading` 十几秒再跳到 `/cw/`，属正常，多等几轮即可。等 3–5 秒后执行检查：

```js
await new Promise(r => setTimeout(r, 3000));
({ url: location.href, title: document.title,
   sentences: document.querySelectorAll('[data-sid][data-time-offset]').length
     + [...document.querySelectorAll('iframe')].reduce((n, f) => { try { return n + f.contentDocument.querySelectorAll('[data-sid][data-time-offset]').length } catch (e) { return n } }, 0) })
```

- URL 跳到 `login.html` → **停下来请用户自己登录**（扫码/手机号都由用户完成，绝不代填账号密码或验证码），用户说好了再继续。
- 要求输入访问密码 → 请用户自己输入。
- `sentences` 为 0 → 转写面板可能没打开：用 `find`/截图找「转写」「字幕」「文字记录」「纪要」之类的标签点开，再检查一次；仍为 0 说明该录制没有转写，告知用户。

### 3. 注入采集器

用 Read 读取 `SKILL_DIR/scripts/collect.js`，把**全文原样**作为 `javascript_tool` 的代码执行。返回 `{ started: true, ... }` 即开始；返回 `status: 'error'` 则按 `error` 文案处理（通常是没打开转写面板）。

可选参数（在注入前同一段代码里先设置）：`window.__TMSRT_OPTS__ = { delay: 800, overlap: 0.8, maxMinutes: 30, fresh: false }`
- `delay`：每滚一屏等待渲染的毫秒数；网络慢/漏句时调大到 1200–1500
- `overlap`：每次滚动的屏高比例，越小越稳但越慢

**采集期间不要点击/滚动页面、不要播放视频**（播放会让列表跟随进度自动滚回去；脚本虽有防回滚守卫，但干扰越少越稳）。

### 4. 轮询进度

每隔约 10 秒（用浏览器 `computer` 的 `wait`，可在 `browser_batch` 里连发几个 wait 再接一次查询）执行 `window.__TMSRT__.summary()`，直到 `status` 为 `done` 或 `error`。列表会边滚边懒加载变长，`progress` 中途回落属正常。实测：4 小时 49 分的会议（6207 句）约 3 分钟。

完成后检查 summary：
- `reachedBottom: true`、`pidGaps: 0` → 完整
- `pidGaps > 0` → 段号不连续，很可能漏了几屏：设 `window.__TMSRT_OPTS__ = { delay: 1500, overlap: 0.5 }` 后**再注入一次 collect.js**，新一轮会**合并**到已有结果里，直到缺口不再减少。（若某录制本身段号就不连续，多轮后缺口数不变，即可忽略）
- `unstableSteps > 0` → 有几屏位置一直被页面拽走没采成，同上处理
- 末尾完整性：`document.querySelector('video')?.duration`（秒）应与 `last` 接近（实测差 2–3 秒）

### 5. 导出文件

文件名用 `window.__TMSRT__.filename('srt')`（AI 纪要主题 + 会议日期，如 `订单流交易实战培训_20261001.srt`）。

**A. Claude in Chrome：直接下载**

```js
window.__TMSRT__.download('srt', { speaker: false })   // --speaker 时传 true；--txt 时再调一次 download('txt')
```

返回 `{ filename, bytes, count }`。然后在本地找到文件并移到目标目录：

```bash
ls -t ~/Downloads/*.srt | head -3
mv ~/Downloads/<filename> <目标目录>/
```

若几秒内 `~/Downloads` 没有出现（Chrome 设了「下载前询问保存位置」等），请用户确认保存位置，或改走 C。

**B. 内置浏览器：点击复制 + pbpaste（实测可用）**

1. `window.__TMSRT__.copyButton('srt', { speaker: false })` —— 页面顶部出现一个「复制 SRT 到剪贴板」按钮，返回 `{ filename, bytes }`
2. 用 `find` 找到该按钮的 ref，`computer` `left_click` 点它（必须是真实点击，`execCommand('copy')` 需要用户手势）
3. 本机落盘（**必须带 `LANG=en_US.UTF-8`**，否则 pbpaste 按非 UTF-8 输出，中文全成乱码）：

```bash
LANG=en_US.UTF-8 pbpaste > "<目标目录>/<filename>"
wc -c "<目标目录>/<filename>"    # 应与返回的 bytes 一致
```

这会覆盖用户的系统剪贴板，应用也会提示「页面写了剪贴板」，汇报时告诉用户一声。需要 TXT 时再调 `copyButton('txt', ...)` 重复一遍。

**C. 兜底：分块取回（很费 token，仅在 A/B 都不行时用）**

1. `window.__TMSRT__.items().length` 得到总条数 N
2. 循环 `window.__TMSRT__.chunk(offset, 150)`（offset = 0, 150, 300 … < N），每块是若干行 `start_ms\tend_ms\tspeaker\ttext`
3. 把每块**原样**追加写入草稿目录下的 `raw.tsv`（Bash heredoc `<<'EOF'` 追加）
4. 生成文件：

```bash
python3 SKILL_DIR/scripts/to_srt.py build raw.tsv -o "<目标目录>/<filename>" [--speaker]
python3 SKILL_DIR/scripts/to_srt.py build raw.tsv -o "<目标目录>/<名>.txt" --format txt [--speaker] [--timestamps]
```

全文会过两遍上下文（读一遍、写一遍）：5 小时的会议约 30 万字符，开始前先告知用户成本。

### 6. 校验并汇报

```bash
python3 SKILL_DIR/scripts/to_srt.py check "<目标目录>/<文件名>.srt"
head -20 "<目标目录>/<文件名>.srt"
```

汇报：文件路径、条数、时间范围、是否有缺口/告警；走了 B 的话提醒剪贴板已被覆盖。最后用 `document.getElementById('__tmsrt_copy')?.remove()` 清掉页面上的临时按钮（如还在）。

## 排错

- **DOM 结构变了**（采到 0 条但页面上明明有字）：在页面上执行
  `document.querySelector('[data-time-offset]')?.outerHTML.slice(0, 800)` 看实际结构，
  对照修改 `collect.js` 顶部的 `CONTAINER_SELECTORS` / `WORD_SELECTOR` / `SPEAKER_SELECTOR`。
  采集器在找不到列表容器时，会自动从任意一句往上找最近的可滚动祖先作为兜底。
- **转写在跨域 iframe 里**：`javascript_tool` 只能访问同源 iframe；此时让用户在新标签直接打开该 iframe 的 src 再采。
- **说话人为空**：说话人选择器是按类名含 `speaker` 猜的，未必命中；不影响 SRT 本体。

## 已知限制

- 依赖腾讯会议前端 DOM（类名、`data-*` 属性），页面改版可能失效，按「排错」更新选择器即可
- 时间轴是腾讯会议转写给的句级时间，SRT 质量取决于其转写质量
- 只能导出自己有权限查看的录制
