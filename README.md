# okbug/skills

Agent Skills 集合 / Agent Skills collection，供 Claude Code、Cursor 等支持 [Agent Skills](https://agentskills.io) 的客户端通过 [`npx skills add`](https://github.com/vercel-labs/skills) 安装。

## 中文

### 这是什么

Agent Skills 集合。每个技能放在 `skills/<name>/` 下，根目录有 `SKILL.md`，`npx skills` 会自动发现。

### 已收录技能

| 技能 | 说明 |
| --- | --- |
| `tencent-meeting-srt` | 导出腾讯会议云录制回放的字幕 / 转写为 SRT 或 TXT。打开 `meeting.tencent.com/cw/*` 回放页，滚动虚拟列表采集时间轴与文字（可选说话人），生成并校验标准字幕文件。 |

### 安装

在项目目录执行（安装到当前项目的 agent skills 目录）：

```bash
npx skills add okbug/skills
npx skills add okbug/skills --skill tencent-meeting-srt
npx skills add okbug/skills --list
```

全局安装到 Claude Code，并跳过确认：

```bash
npx skills add okbug/skills -g -a claude-code -y
```

也可以用完整仓库 URL：

```bash
npx skills add https://github.com/okbug/skills --skill tencent-meeting-srt
```

常用选项：

- `--skill <name>`：只安装指定技能；省略则安装仓库里发现的全部技能。
- `--list`：只列出可安装的技能，不写入本地。
- `--agent` / `-a`：指定目标客户端，例如 `claude-code`、`cursor`。可重复传入以同时装到多个 agent。
- `--global` / `-g`：装到用户级目录（如 `~/.claude/skills/`），而不是当前项目。
- `-y`：跳过交互确认。

### 用法

安装后，把腾讯会议回放链接交给 agent，或直接说「导出腾讯会议字幕」。具体步骤、参数（`--txt`、`--speaker`）和排错见技能自己的说明：

[`skills/tencent-meeting-srt/SKILL.md`](skills/tencent-meeting-srt/SKILL.md)

### 仓库结构

```
README.md
LICENSE
skills/tencent-meeting-srt/SKILL.md
skills/tencent-meeting-srt/scripts/collect.js
skills/tencent-meeting-srt/scripts/to_srt.py
```

### 继续添加技能

在 `skills/` 下新建一个文件夹，放入该技能的 `SKILL.md`（YAML frontmatter 里写 `name` 和 `description`），需要的脚本放在同级 `scripts/`。不必改安装命令：`npx skills add okbug/skills` 会发现新增技能，`--skill <name>` 可单独安装。

## English

### What this repo is

An Agent Skills collection for clients that support [Agent Skills](https://agentskills.io), such as Claude Code and Cursor. Install with [`npx skills add`](https://github.com/vercel-labs/skills).

Each skill lives in `skills/<name>/` with a `SKILL.md` at the root of that folder. `npx skills` discovers them automatically.

### Included skills

| Skill | Description |
| --- | --- |
| `tencent-meeting-srt` | Export a Tencent Meeting cloud-recording transcript to SRT or TXT. Open a `meeting.tencent.com/cw/*` playback page, scroll the virtual list to collect timestamps and text (optional speaker names), then write and validate a standard subtitle file. |

### Install

From a project directory (installs into that project's agent skills directory):

```bash
npx skills add okbug/skills
npx skills add okbug/skills --skill tencent-meeting-srt
npx skills add okbug/skills --list
```

Install globally for Claude Code and skip the confirmation prompt:

```bash
npx skills add okbug/skills -g -a claude-code -y
```

Full GitHub URL form:

```bash
npx skills add https://github.com/okbug/skills --skill tencent-meeting-srt
```

Options:

- `--skill <name>`: install one skill. Omit it to install every skill found in the repo.
- `--list`: list installable skills without writing anything locally.
- `--agent` / `-a`: target a client, for example `claude-code` or `cursor`. Pass it more than once to install for several agents.
- `--global` / `-g`: install into the user-level directory (such as `~/.claude/skills/`) instead of the current project.
- `-y`: skip interactive confirmation.

### Usage

After install, give the agent a Tencent Meeting playback link, or ask it to export the meeting subtitles. Steps, flags (`--txt`, `--speaker`), and troubleshooting are in the skill itself:

[`skills/tencent-meeting-srt/SKILL.md`](skills/tencent-meeting-srt/SKILL.md)

### Repository structure

```
README.md
LICENSE
skills/tencent-meeting-srt/SKILL.md
skills/tencent-meeting-srt/scripts/collect.js
skills/tencent-meeting-srt/scripts/to_srt.py
```

### Adding more skills

Add another folder under `skills/` with that skill's `SKILL.md` (`name` and `description` in the YAML frontmatter). Put helper scripts in a sibling `scripts/` directory. Install commands stay the same: `npx skills add okbug/skills` discovers the new skill, and `--skill <name>` installs just that one.

