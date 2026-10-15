// 腾讯会议回放页字幕采集器 —— 整段作为 javascript_tool 的代码注入 meeting.tencent.com/cw/* 页面。
// 思路来自 mengchunm/TencentMeeting-subtitle-exporter：字幕列表是虚拟滚动的，只渲染可视区附近的句子，
// 所以要逐屏下滚、边滚边按 data-pid/data-sid 去重收集，每句的 data-time-offset 形如 "开始ms-结束ms"。
// 采集在后台异步进行，状态和导出方法挂在 window.__TMSRT__ 上，供后续调用轮询 / 导出。
(() => {
  const prev = window.__TMSRT__;
  if (prev && prev.status === 'running') return { alreadyRunning: true, ...prev.summary() };

  const CONTAINER_SELECTORS = ['.minutes-module-list', '[class*="minutes-module-list"]', '[class*="minutes-module_list"]'];
  const WORD_SELECTOR = '[class*="word-module_word"]';
  // 按优先级尝试：外层 [class*=speaker] 里还混着头像和段落开始时间（如 "H07:50"），所以 speaker-name 必须排前面
  const SPEAKER_SELECTORS = ['[class*="speaker-name"]', '[class*="speakerName"]', '[class*="speaker"]'];
  // 文件名用：AI 纪要主题 > 会议室名 > document.title（回放页 title 只是"录制文件"）
  const TITLE_SELECTORS = ['[class*="summary-header_title"]', '[class*="title-with-edit"]'];
  const opts = Object.assign({ delay: 800, overlap: 0.8, maxMinutes: 30 }, window.__TMSRT_OPTS__ || {});

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const fmt = (ms, sep = ',') => {
    ms = Math.max(0, Math.round(ms));
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
  };
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  // 逐词拼接：中文直接相连；两个英文/数字词之间若都没带空格，补一个空格（原脚本 trim 后直接 join 会把英文粘成一串）
  const joinWords = words => words.reduce((acc, w) => {
    const t = w.textContent || '';
    return acc + (/[A-Za-z0-9]$/.test(acc) && /^[A-Za-z0-9]/.test(t) ? ' ' : '') + t;
  }, '');

  function locate() {
    const docs = [document];
    for (const f of document.querySelectorAll('iframe')) {
      try { if (f.contentDocument) docs.push(f.contentDocument); } catch (e) { /* 跨域 iframe 忽略 */ }
    }
    for (const doc of docs) {
      for (const sel of CONTAINER_SELECTORS) {
        const c = doc.querySelector(sel);
        if (c) return { doc, container: c };
      }
    }
    // 兜底：从任意一句字幕往上找第一个可滚动的祖先
    for (const doc of docs) {
      let el = doc.querySelector('[data-sid][data-time-offset]');
      while (el && el !== doc.body) {
        el = el.parentElement;
        const oy = el && doc.defaultView.getComputedStyle(el).overflowY;
        if (el && /(auto|scroll)/.test(oy) && el.scrollHeight > el.clientHeight + 10) return { doc, container: el };
      }
    }
    return null;
  }

  // 同一页面上再次注入 = 再扫一轮并合并（用于补采缺口）；__TMSRT_OPTS__.fresh 为 true 时清空重来
  const subs = prev && prev._subs && !opts.fresh ? prev._subs : new Map();
  const S = window.__TMSRT__ = {
    _subs: subs, status: 'running', progress: 0, reachedBottom: false, unstableSteps: 0,
    error: null, title: '', date: '', startedAt: Date.now(),
    items() {
      return [...subs.values()].sort((a, b) => a.start - b.start || a.pid - b.pid || a.sid - b.sid);
    },
    summary() {
      const it = this.items();
      // 段号 pid 若是连续整数，中间缺号基本意味着漏采了某一屏
      const pids = [...new Set(it.map(s => s.pid))].sort((a, b) => a - b);
      const pidGaps = pids.length ? pids[pids.length - 1] - pids[0] + 1 - pids.length : 0;
      return {
        status: this.status, progress: +this.progress.toFixed(1), reachedBottom: this.reachedBottom,
        pidGaps, unstableSteps: this.unstableSteps,
        count: it.length, first: it.length ? fmt(it[0].start) : null, last: it.length ? fmt(it[it.length - 1].end) : null,
        speakers: [...new Set(it.map(s => s.speaker).filter(Boolean))].slice(0, 10),
        title: this.title, error: this.error, elapsedSec: Math.round((Date.now() - this.startedAt) / 1000),
      };
    },
    srt({ speaker = false } = {}) {
      return this.items().map((s, i) =>
        `${i + 1}\n${fmt(s.start)} --> ${fmt(s.end)}\n${speaker && s.speaker ? s.speaker + '：' : ''}${s.text}\n`).join('\n');
    },
    txt({ speaker = false, timestamps = false } = {}) {
      return this.items().map(s =>
        `${timestamps ? '[' + fmt(s.start).slice(0, 8) + '] ' : ''}${speaker && s.speaker ? s.speaker + '：' : ''}${s.text}`).join('\n') + '\n';
    },
    // 兜底通道：分块取回原始数据（start_ms \t end_ms \t speaker \t text），交给 to_srt.py 生成文件
    chunk(offset = 0, size = 150) {
      return this.items().slice(offset, offset + size).map(s => `${s.start}\t${s.end}\t${s.speaker}\t${s.text}`).join('\n');
    },
    filename(format = 'srt') {
      const base = clean(this.title.replace(/\s*[-|_]\s*腾讯会议.*$/, '')).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80);
      return `${base || '腾讯会议字幕'}${this.date ? '_' + this.date : ''}.${format}`;
    },
    // Claude in Chrome 用：直接下载到用户 Chrome 的下载目录
    download(format = 'srt', o = {}) {
      const content = format === 'txt' ? this.txt(o) : this.srt(o);
      const filename = o.filename || this.filename(format);
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      return { filename, bytes: blob.size, count: subs.size };
    },
    // 内置浏览器用：它的下载不落盘、clipboard API 也被拒，只能放一个按钮，
    // 由真实点击触发 execCommand('copy')，再在本机 `LANG=en_US.UTF-8 pbpaste > 文件`
    copyButton(format = 'srt', o = {}) {
      const content = format === 'txt' ? this.txt(o) : this.srt(o);
      document.getElementById('__tmsrt_copy')?.remove();
      const b = document.createElement('button');
      b.id = '__tmsrt_copy';
      b.textContent = `复制 ${format.toUpperCase()} 到剪贴板`;
      Object.assign(b.style, { position: 'fixed', top: '10px', left: '50%', zIndex: 2147483647, padding: '12px 20px',
        fontSize: '16px', background: '#1677ff', color: '#fff', border: '0', borderRadius: '6px', cursor: 'pointer' });
      b.onclick = () => {
        const ta = document.createElement('textarea');
        ta.value = content;
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        b.dataset.ok = ok ? '1' : '0';
        b.textContent = ok ? '已复制 ✓' : '复制失败';
        if (ok) setTimeout(() => b.remove(), 1500);
      };
      document.body.appendChild(b);
      return { button: b.textContent, filename: this.filename(format), bytes: new Blob([content]).size };
    },
  };

  function harvest(doc) {
    doc.querySelectorAll('[data-sid][data-time-offset]').forEach(el => {
      const m = /^(\d+)-(\d+)$/.exec(el.getAttribute('data-time-offset') || '');
      if (!m) return;
      const words = [...el.querySelectorAll(WORD_SELECTOR)];
      const text = clean(words.length ? joinWords(words) : el.textContent);
      if (!text) return;
      const p = el.closest('[data-pid]');
      const pid = p ? +p.getAttribute('data-pid') : 0;
      const sid = +el.getAttribute('data-sid');
      let speaker = '';
      for (const sel of p ? SPEAKER_SELECTORS : []) {
        const sp = p.querySelector(sel);
        if (sp && !sp.querySelector('[data-sid]')) { speaker = clean(sp.textContent); break; }
      }
      const key = `${pid}-${sid}`;
      const old = subs.get(key);
      // 同一句可能先渲染出一半，保留更完整的版本
      if (!old || text.length > old.text.length) subs.set(key, { pid, sid, start: +m[1], end: +m[2], speaker, text });
    });
  }

  const found = locate();
  if (!found) {
    S.status = 'error';
    S.error = '未找到字幕列表：确认已打开「转写/字幕」面板，且列表中能看到带时间的文字';
    return S.summary();
  }
  const { doc, container: c } = found;
  S.title = TITLE_SELECTORS.map(sel => clean((doc.querySelector(sel) || {}).textContent)).find(Boolean)
    || clean(doc.title || document.title);
  // 会议日期（页头形如 "2026/10/01 20:23"）用于文件名
  const dm = /(\d{4})\/(\d{1,2})\/(\d{1,2})\s+\d{1,2}:\d{2}/.exec(doc.body.innerText.slice(0, 3000));
  if (dm) S.date = `${dm[1]}${pad(dm[2])}${pad(dm[3])}`;

  (async () => {
    // 页面会把列表自动滚回当前播放位置：guard 拦住"往回滚"，settle 再确认位置稳定后才采集，
    // 否则可能在"被拽回去、还没拽回来"的瞬间采到别处的内容，漏掉当前这一屏
    let target = 0;
    const guard = () => { if (Math.abs(c.scrollTop - target) > 2) c.scrollTop = target; };
    const settle = async pos => {
      for (let i = 0; i < 6; i++) {
        target = pos;
        c.scrollTop = pos;
        await sleep(opts.delay);
        if (Math.abs(c.scrollTop - pos) > 2) continue;
        await sleep(80); // 让挂起的 scroll 事件 / 重渲染跑完
        if (Math.abs(c.scrollTop - pos) <= 2) return true;
      }
      return false;
    };
    try {
      c.addEventListener('scroll', guard);
      const deadline = Date.now() + opts.maxMinutes * 60000;
      let pos = 0, stalls = 0;
      while (true) {
        if (Date.now() > deadline) throw new Error(`超过 ${opts.maxMinutes} 分钟仍未滚到底`);
        if (await settle(pos)) harvest(doc);
        else S.unstableSteps++;
        const bottom = c.scrollHeight - c.clientHeight;
        S.progress = Math.min(100, ((pos + c.clientHeight) / c.scrollHeight) * 100);
        if (pos >= bottom - 2) {
          // 到底后多等几轮：懒加载可能还会把 scrollHeight 撑大
          if (++stalls >= 3) break;
          continue;
        }
        stalls = 0;
        pos = Math.min(bottom, pos + Math.max(50, c.clientHeight * opts.overlap));
      }
      S.reachedBottom = true;
      S.progress = 100;
      if (subs.size) S.status = 'done';
      else { S.status = 'error'; S.error = '滚动完成但没有采到字幕（页面 DOM 结构可能已变化）'; }
    } catch (e) {
      S.status = 'error';
      S.error = String((e && e.message) || e);
    } finally {
      c.removeEventListener('scroll', guard);
    }
  })();

  return { started: true, ...S.summary() };
})()
