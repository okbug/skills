#!/usr/bin/env python3
"""腾讯会议字幕：把 collect.js 分块取回的原始数据生成 SRT/TXT，或校验一个 SRT 文件。

用法：
  python3 to_srt.py build raw.tsv -o out.srt [--format srt|txt] [--speaker] [--timestamps]
  python3 to_srt.py check out.srt

raw.tsv 每行：start_ms \t end_ms \t speaker \t text（即 window.__TMSRT__.chunk() 的输出拼接）
"""
import argparse
import re
import sys

TIME_RE = re.compile(r"^(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})$")


def fmt(ms):
    ms = max(0, int(round(ms)))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def load_raw(path):
    items, seen = [], set()
    with open(path, encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            line = line.rstrip("\n")
            if not line.strip():
                continue
            parts = line.split("\t", 3)
            if len(parts) != 4 or not parts[0].isdigit() or not parts[1].isdigit():
                sys.exit(f"第 {n} 行格式不对（应为 start_ms\\tend_ms\\tspeaker\\ttext）：{line[:80]}")
            start, end, speaker, text = int(parts[0]), int(parts[1]), parts[2].strip(), parts[3].strip()
            key = (start, end, text)
            if text and key not in seen:  # 分块重叠时去重
                seen.add(key)
                items.append((start, end, speaker, text))
    items.sort(key=lambda x: (x[0], x[1]))
    return items


def build(args):
    items = load_raw(args.raw)
    if not items:
        sys.exit("没有可用的字幕行")
    prefix = lambda sp: f"{sp}：" if args.speaker and sp else ""
    if args.format == "srt":
        out = "\n".join(f"{i}\n{fmt(s)} --> {fmt(e)}\n{prefix(sp)}{t}\n" for i, (s, e, sp, t) in enumerate(items, 1))
    else:
        out = "".join(f"{'[' + fmt(s)[:8] + '] ' if args.timestamps else ''}{prefix(sp)}{t}\n" for s, _, sp, t in items)
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"已写入 {args.output}：{len(items)} 条，{fmt(items[0][0])} → {fmt(items[-1][1])}")


def to_ms(g):
    h, m, s, ms = map(int, g)
    return ((h * 60 + m) * 60 + s) * 1000 + ms


def check(args):
    text = open(args.srt, encoding="utf-8-sig").read().replace("\r\n", "\n")
    blocks = [b for b in re.split(r"\n\s*\n", text.strip()) if b.strip()]
    errors, backwards, empty = [], 0, 0
    prev_start, first, last = -1, None, None
    for i, b in enumerate(blocks, 1):
        lines = b.split("\n")
        if len(lines) < 2 or lines[0].strip() != str(i):
            errors.append(f"第 {i} 块序号不对：{lines[0][:40]!r}")
            continue
        m = TIME_RE.match(lines[1].strip())
        if not m:
            errors.append(f"第 {i} 块时间轴格式不对：{lines[1][:60]!r}")
            continue
        start, end = to_ms(m.groups()[:4]), to_ms(m.groups()[4:])
        if end < start:
            errors.append(f"第 {i} 块结束早于开始：{lines[1]}")
        if start < prev_start:
            backwards += 1
        if not "".join(lines[2:]).strip():
            empty += 1
        prev_start = start
        first = start if first is None else first
        last = max(last or 0, end)
    print(f"条数：{len(blocks)}")
    if first is not None:
        print(f"时间范围：{fmt(first)} → {fmt(last)}")
    print(f"时间倒退：{backwards} 处；空字幕：{empty} 条")
    for e in errors[:20]:
        print("错误：" + e)
    sys.exit(1 if errors else 0)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("raw")
    b.add_argument("-o", "--output", required=True)
    b.add_argument("--format", choices=["srt", "txt"], default="srt")
    b.add_argument("--speaker", action="store_true", help="在每句前加「说话人：」")
    b.add_argument("--timestamps", action="store_true", help="TXT 每行前加 [hh:mm:ss]")
    c = sub.add_parser("check")
    c.add_argument("srt")
    args = p.parse_args()
    build(args) if args.cmd == "build" else check(args)


if __name__ == "__main__":
    main()
