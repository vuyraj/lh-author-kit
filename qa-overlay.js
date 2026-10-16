// qa-overlay.js
// Renders health-check results as a panel plus on-page marks (outline + short tag per result,
// toggleable per layer). Runs in the extension's isolated world after health-check.js.
// Everything lives in a shadow root and is position:fixed, so the page's own DOM and styles
// are never touched (beyond the data-qa-id stamps health-check.js adds).

function renderQAOverlay(results) {
    if (window.__lhQaTeardown) window.__lhQaTeardown();

    const COLORS = { error: '#ef4444', warning: '#f59e0b', heading: '#8b5cf6', image: '#10b981' };
    const BRAND_NAMES = { lh: 'Lufthansa', aua: 'Austrian Airlines', bel: 'Brussels Airlines', lx: 'SWISS', ita: 'ITA Airways' };

    function h(tag, attrs, ...kids) {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) {
            if (v === null || v === undefined || v === false) continue;
            if (k === 'class') el.className = v;
            else if (k === 'style') el.style.cssText = v;
            else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
            else el.setAttribute(k, v === true ? '' : v);
        }
        for (const kid of kids.flat()) {
            if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
        }
        return el;
    }

    const byQaId = (id) => (id ? document.querySelector(`[data-qa-id="${id}"]`) : null);
    const fileName = (src) => {
        if (!src) return '(no src)';
        if (src.startsWith('data:')) return `inline image (${src.slice(5).split(/[;,]/)[0] || 'data'})`;
        try { return decodeURIComponent(new URL(src, location.href).pathname.split('/').pop()) || src; }
        catch (e) { return src; }
    };
    const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');

    // ── Data ────────────────────────────────────────────────────────────────
    const issues = [
        ...(results.links || []).map(i => ({
            color: COLORS.error, sev: 'error', title: 'Empty link', detail: i.text, el: byQaId(i.qaId)
        })),
        ...(results.images || []).filter(i => !i.hasAlt).map(i => ({
            color: COLORS.error, sev: 'error', title: 'Missing alt text', detail: fileName(i.src), el: byQaId(i.qaId)
        })),
        ...(results.whitespaces || []).map(i => ({
            color: COLORS.warning, sev: 'warning', title: 'Repeated non-breaking spaces', detail: i.text, el: byQaId(i.qaId)
        })),
        ...(results.images || []).filter(i => i.ratioFlag).map(i => ({
            color: COLORS.warning, sev: 'warning', title: `Image ratio ${i.ratio} not in guidelines`,
            detail: `${i.size} · nearest guideline ratio ${i.ratioNearest} (${i.ratioUse})`, el: byQaId(i.qaId)
        }))
    ];
    issues.forEach(i => { i.label = i.title; });

    const seo = results.seo || {};
    const errorCount = issues.filter(i => i.sev === 'error').length;
    const warningCount = issues.length - errorCount;

    // ── Shell ───────────────────────────────────────────────────────────────
    const host = h('div', { id: 'lh-qa-host' });
    host.style.setProperty('all', 'initial', 'important');
    const root = host.attachShadow({ mode: 'open' });
    root.append(h('style', {}, `
        :host { all: initial; }
        * { box-sizing: border-box; }
        .panel {
            position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
            width: 380px; max-height: min(560px, calc(100vh - 40px));
            display: flex; flex-direction: column; overflow: hidden;
            background: #15171c; color: #e8eaee;
            border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.45);
            font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        }
        .head {
            display: flex; align-items: center; gap: 4px; padding: 10px 10px 10px 14px;
            cursor: grab; user-select: none;
            background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .head.dragging { cursor: grabbing; }
        .title { flex: 1; font-weight: 600; font-size: 13px; letter-spacing: 0.01em; }
        .btn {
            width: 26px; height: 26px; border: 0; border-radius: 6px; background: transparent;
            color: #a0a5b1; cursor: pointer; font-family: inherit; font-size: 14px; line-height: 1;
            display: grid; place-items: center;
        }
        .btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
        .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .body { flex: 1; overflow-y: auto; padding: 6px; }
        .body::-webkit-scrollbar { width: 6px; }
        .body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
        .section + .section { margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.08); }
        .section-title {
            display: flex; align-items: center; gap: 8px; padding: 12px 8px 4px;
            color: #a0a5b1; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
        }
        .count { display: inline-flex; align-items: center; gap: 5px; text-transform: none; letter-spacing: 0; font-weight: 600; }
        .count.zero { opacity: 0.5; }
        .row { display: flex; align-items: flex-start; gap: 10px; padding: 8px; border-radius: 8px; cursor: pointer; }
        .row:hover { background: rgba(255,255,255,0.06); }
        .row.pinned { background: rgba(59,130,246,0.18); }
        .row.gone { opacity: 0.45; cursor: default; }
        .row .dot { margin-top: 5px; }
        .main { flex: 1; min-width: 0; }
        .row-title { font-weight: 600; }
        .detail { color: #a0a5b1; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .missing { color: #f87171; font-weight: 600; }
        .empty { padding: 14px 8px 16px; color: #6ee7b7; font-weight: 600; }
        .note { padding: 6px 8px 8px; color: #7d8390; font-size: 11px; }
        .field { padding: 8px 8px 10px; }
        .field-label { display: flex; justify-content: space-between; margin-bottom: 4px; color: #a0a5b1; font-size: 11px; }
        .field-value { font-size: 13px; word-break: break-word; }
        .og { display: block; width: 100%; max-height: 130px; object-fit: contain; border-radius: 6px; background: #0f1115; border: 1px solid rgba(255,255,255,0.08); }
        .layers {
            display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 9px 14px 11px;
            border-top: 1px solid rgba(255,255,255,0.08); color: #7d8390; font-size: 11px;
        }
        .toggle .n { font-weight: 500; opacity: 0.7; }
        .fab { display: none; }
        .panel.min {
            width: 48px; height: 48px; max-height: none; border-radius: 50%; overflow: visible;
            background: #15171c; cursor: grab;
        }
        .panel.min > :not(.fab) { display: none; }
        .panel.min .fab {
            display: grid; place-items: center; width: 100%; height: 100%; border-radius: 50%;
            color: #fff; font-size: 13px; font-weight: 800; letter-spacing: 0.02em; user-select: none;
        }
        .panel.min .fab:hover { background: rgba(255,255,255,0.08); }
        .badge {
            position: absolute; top: -5px; right: -5px; min-width: 20px; height: 20px; padding: 0 5px;
            display: grid; place-items: center; border-radius: 10px; border: 2px solid #15171c;
            color: #fff; font-size: 11px; font-weight: 700;
        }
        .toggle {
            display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 999px;
            border: 1px solid rgba(255,255,255,0.14); background: transparent; color: #7d8390;
            font-family: inherit; font-size: 11px; font-weight: 600; cursor: pointer;
        }
        .toggle.on { background: rgba(255,255,255,0.1); border-color: transparent; color: #fff; }
        .toggle:not(.on) .dot { opacity: 0.35; }
        .mark-box { position: fixed; z-index: 2147483645; pointer-events: none; border: 1.5px solid; border-radius: 3px; }
        .mark-box.dashed { border-style: dashed; }
        .mark-chip {
            position: fixed; z-index: 2147483645; pointer-events: none;
            padding: 2px 5px; border-radius: 3px; color: #fff; letter-spacing: 0.02em;
            font: 700 10px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 1px 3px rgba(0,0,0,0.35);
        }
        .hl { position: fixed; z-index: 2147483646; pointer-events: none; display: none; border: 2px solid; border-radius: 4px; }
        .hl.flash { animation: flash 0.7s ease-out 2; }
        @keyframes flash { 50% { box-shadow: 0 0 0 6px currentColor; } }
        .hl-label {
            position: fixed; z-index: 2147483646; pointer-events: none; display: none; white-space: nowrap;
            padding: 4px 7px; border-radius: 4px; color: #fff;
            font: 600 11px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        }
    `));

    // ── Highlight: one box + a label outside it, for the hovered/clicked row ──
    const box = h('div', { class: 'hl' });
    const label = h('div', { class: 'hl-label' });
    root.append(box, label);
    let shown = null;
    let pinned = null;
    let pinnedRow = null;
    let frame = 0;

    function place() {
        if (!shown || !shown.el || !shown.el.isConnected) {
            box.style.display = label.style.display = 'none';
            return;
        }
        const r = shown.el.getBoundingClientRect();
        const pad = 3;
        Object.assign(box.style, {
            display: 'block', color: shown.color, borderColor: shown.color, background: shown.color + '1a',
            left: (r.left - pad) + 'px', top: (r.top - pad) + 'px',
            width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px'
        });
        label.textContent = shown.label;
        Object.assign(label.style, { display: 'block', background: shown.color });
        const lw = label.offsetWidth;
        const lh = label.offsetHeight;
        let top = r.top - pad - lh - 4;
        if (top < 4) top = r.bottom + pad + 4;
        const left = Math.max(4, Math.min(r.left - pad, window.innerWidth - lw - 4));
        label.style.left = left + 'px';
        label.style.top = top + 'px';
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { layoutMarks(); place(); }); };
    const show = (item) => { shown = item; place(); };

    // ── On-page marks: an outline per result, and a short tag placed where it can't cover
    // text: headings in the left margin, images inside their own top-left corner, the rest
    // just above. A mark shows while any of its layers is switched on. ──────────────────
    const CHIP = { error: '#dc2626', warning: '#b45309', heading: '#7c3aed', image: '#047857' };
    const layersOn = window.__lhQaLayers = window.__lhQaLayers || { issues: true, headings: true, images: true };
    const markSpecs = [
        ...(results.links || []).map(i => ({
            qaId: i.qaId, color: COLORS.error, chipBg: CHIP.error, text: 'NO LINK', dashed: true, at: 'above', layers: ['issues']
        })),
        ...(results.whitespaces || []).map(i => ({
            qaId: i.qaId, color: COLORS.warning, chipBg: CHIP.warning, text: 'NBSP', dashed: true, at: 'above', layers: ['issues']
        })),
        ...(results.headlines || []).map(i => ({
            qaId: i.qaId, color: COLORS.heading, chipBg: CHIP.heading, text: i.tag, at: 'gutter', layers: ['headings']
        })),
        ...(results.images || []).map(i => {
            const sev = !i.hasAlt ? 'error' : i.ratioFlag ? 'warning' : 'image';
            return {
                qaId: i.qaId, color: COLORS[sev], chipBg: CHIP[sev],
                text: [i.ratio && (i.ratioFlag ? `${i.ratio} off-guide` : i.ratio), i.hasAlt ? clip(i.alt, 60) : 'NO ALT'].filter(Boolean).join(' · '),
                dashed: sev !== 'image', at: 'inside', layers: sev === 'image' ? ['images'] : ['images', 'issues']
            };
        })
    ];
    const marks = markSpecs.map(s => ({ ...s, el: byQaId(s.qaId) })).filter(m => m.el).map(m => {
        m.box = h('div', { class: 'mark-box' + (m.dashed ? ' dashed' : ''), style: `border-color:${m.color}` });
        m.chip = h('div', { class: 'mark-chip', style: `background:${m.chipBg}` }, m.text);
        const cs = getComputedStyle(m.el);
        m.line = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 16) * 1.2;
        root.append(m.box, m.chip);
        return m;
    });

    // Fixed/sticky bars along the top or bottom edge (site header, cookie banner) sit above the
    // content, so marks are clipped at their edge instead of being drawn over them.
    function barInsets(vw, vh) {
        let top = 0;
        let bottom = vh;
        for (const fx of [0.2, 0.5, 0.8]) {
            for (const atTop of [true, false]) {
                const hit = document.elementFromPoint(vw * fx, atTop ? 2 : vh - 3);
                if (!hit || hit === host) continue;
                for (let e = hit; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
                    const pos = getComputedStyle(e).position;
                    if (pos !== 'fixed' && pos !== 'sticky') continue;
                    const r = e.getBoundingClientRect();
                    if (atTop && r.top <= 2 && r.bottom < vh * 0.5) top = Math.max(top, r.bottom);
                    if (!atTop && r.bottom >= vh - 2 && r.top > vh * 0.5) bottom = Math.min(bottom, r.top);
                    break;
                }
            }
        }
        return { top, bottom };
    }

    // All reads first, then all writes, so a page with many marks doesn't thrash layout.
    // Hidden elements (closed accordions, screen-reader-only text) are 0–1px and get no mark.
    function layoutMarks() {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const anyOn = marks.some(m => m.layers.some(l => layersOn[l]));
        const bars = anyOn ? barInsets(vw, vh) : { top: 0, bottom: vh };
        const rects = marks.map(m => (m.layers.some(l => layersOn[l]) && m.el.isConnected ? m.el.getBoundingClientRect() : null));
        const fits = (top, height) => top >= bars.top + 2 && top + height <= bars.bottom - 2;
        marks.forEach((m, i) => {
            const r = rects[i];
            const boxTop = r ? Math.max(r.top - 2, bars.top) : 0;
            const boxBottom = r ? Math.min(r.bottom + 2, bars.bottom) : 0;
            const off = !r || r.width < 2 || r.height < 2 || boxBottom - boxTop < 4 || r.right < 0 || r.left > vw;
            m.box.style.display = m.chip.style.display = off ? 'none' : 'block';
            if (off) return;
            Object.assign(m.box.style, {
                left: (r.left - 2) + 'px', top: boxTop + 'px', width: (r.width + 4) + 'px', height: (boxBottom - boxTop) + 'px'
            });
            let left;
            let top;
            let maxWidth = '';
            if (m.at === 'inside' && r.width >= 60 && r.height >= 28) {
                left = r.left + 4;
                top = r.top + 4;
                // Image partly under a header: keep the chip on the part still in view.
                if (!fits(top, m.h) && r.bottom - bars.top >= 28) top = bars.top + 4;
                maxWidth = (r.width - 8) + 'px';
            } else if (m.at === 'gutter' && r.left - m.w - 8 >= 2) {
                left = r.left - m.w - 8;
                top = r.top + (Math.min(r.height, m.line) - m.h) / 2;
            } else {
                left = r.left;
                top = r.top - m.h - 4;
                if (!fits(top, m.h)) top = r.bottom + 4;
            }
            if (!fits(top, m.h)) {
                m.chip.style.display = 'none';
                return;
            }
            Object.assign(m.chip.style, { left: left + 'px', top: top + 'px', maxWidth });
        });
    }

    function pin(item, row) {
        if (!item.el || !item.el.isConnected) return;
        if (pinnedRow) pinnedRow.classList.remove('pinned');
        pinned = item;
        pinnedRow = row;
        row.classList.add('pinned');
        item.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        show(item);
        box.classList.remove('flash');
        void box.offsetWidth;
        box.classList.add('flash');
    }

    function rowFor(item, ...content) {
        const gone = !item.el;
        const row = h('div', { class: 'row' + (gone ? ' gone' : ''), title: gone ? 'Element is no longer on the page' : null }, ...content);
        if (!gone) {
            row.addEventListener('mouseenter', () => show(item));
            row.addEventListener('mouseleave', () => show(pinned));
            row.addEventListener('click', () => pin(item, row));
        }
        return row;
    }

    // ── Panel: SEO on top, issues below, on-page toggles in the footer ─────
    const field = (name, value) => h('div', { class: 'field' },
        h('div', { class: 'field-label' }, h('span', {}, name), value ? h('span', {}, `${value.length} characters`) : null),
        value ? h('div', { class: 'field-value' }, value) : h('div', { class: 'missing' }, 'Missing'));
    const count = (color, n, text) => h('span', { class: 'count' + (n ? '' : ' zero') },
        h('span', { class: 'dot', style: `background:${color}` }), `${n} ${text}`);

    const seoSection = h('div', { class: 'section' },
        h('div', { class: 'section-title' }, 'SEO'),
        field('Meta title', seo.title),
        field('Meta description', seo.description),
        h('div', { class: 'field' },
            h('div', { class: 'field-label' }, h('span', {}, 'Thumbnail (og:image)')),
            seo.thumbnail ? h('img', { class: 'og', src: seo.thumbnail, alt: '' }) : h('div', { class: 'missing' }, 'Missing')));

    const issuesSection = h('div', { class: 'section' },
        h('div', { class: 'section-title' }, 'Issues',
            count(COLORS.error, errorCount, errorCount === 1 ? 'error' : 'errors'),
            count(COLORS.warning, warningCount, warningCount === 1 ? 'warning' : 'warnings')),
        issues.length
            ? issues.map(i => rowFor(i,
                h('span', { class: 'dot', style: `background:${i.color}` }),
                h('div', { class: 'main' },
                    h('div', { class: 'row-title' }, i.title),
                    h('div', { class: 'detail' }, i.detail || '(no text)'))))
            : h('div', { class: 'empty' }, '✓ No issues found'),
        h('div', { class: 'note' }, `Image ratios checked against the ${BRAND_NAMES[results.ratioBrand] || 'all-airline'} guidelines.`));

    const body = h('div', { class: 'body' }, seoSection, issuesSection);

    const layerRow = h('div', { class: 'layers' }, h('span', {}, 'Show on page'),
        [
            ['issues', 'Issues', COLORS.error, issues.length],
            ['headings', 'Headings', COLORS.heading, (results.headlines || []).length],
            ['images', 'Images', COLORS.image, (results.images || []).length]
        ].map(([key, name, color, n]) => {
            const btn = h('button', { class: 'toggle' + (layersOn[key] ? ' on' : ''), title: `Show or hide ${name.toLowerCase()} on the page` },
                h('span', { class: 'dot', style: `background:${color}` }), name, h('span', { class: 'n' }, n));
            btn.addEventListener('click', () => {
                layersOn[key] = !layersOn[key];
                btn.classList.toggle('on', layersOn[key]);
                layoutMarks();
            });
            return btn;
        }));

    // Minimized state: a small round "QA" icon carrying the error (or warning) count.
    const badge = errorCount
        ? h('span', { class: 'badge', style: `background:${COLORS.error}` }, errorCount)
        : warningCount
            ? h('span', { class: 'badge', style: `background:${COLORS.warning}` }, warningCount)
            : h('span', { class: 'badge', style: 'background:#059669' }, '✓');
    const fab = h('div', { class: 'fab', title: 'Open QA Health Check' }, 'QA', badge);

    const panel = h('div', { class: 'panel' });
    const head = h('div', { class: 'head' },
        h('div', { class: 'title' }, 'QA Health Check'),
        h('button', { class: 'btn', title: 'Re-scan page', onclick: rescan }, '↻'),
        h('button', { class: 'btn', title: 'Minimize to icon', onclick: () => setMinimized(true) }, '–'),
        h('button', { class: 'btn', title: 'Close', onclick: () => teardown(true) }, '✕'));

    panel.append(fab, head, body, layerRow);
    root.append(panel);
    document.documentElement.append(host);
    marks.forEach(m => { m.w = m.chip.offsetWidth; m.h = m.chip.offsetHeight; });
    layoutMarks();

    // Shrinks in place; once dragged (left/top), re-clamp after expanding so the panel stays on screen.
    function setMinimized(min) {
        show(min ? null : pinned);
        panel.classList.toggle('min', min);
        if (!min && panel.style.left) {
            const r = panel.getBoundingClientRect();
            const view = document.documentElement;
            panel.style.left = Math.max(8, Math.min(r.left, view.clientWidth - r.width - 8)) + 'px';
            panel.style.top = Math.max(8, Math.min(r.top, view.clientHeight - r.height - 8)) + 'px';
        }
    }

    // Drag by the header, or by the icon when minimized. A press that doesn't move opens the icon.
    function startDrag(e) {
        if (e.button !== 0 || e.target.closest('.btn')) return;
        const rect = panel.getBoundingClientRect();
        const dx = e.clientX - rect.left;
        const dy = e.clientY - rect.top;
        let moved = false;
        head.classList.add('dragging');
        const move = (ev) => {
            if (!moved && Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) < 4) return;
            if (!moved) Object.assign(panel.style, { right: 'auto', bottom: 'auto', left: rect.left + 'px', top: rect.top + 'px' });
            moved = true;
            const view = document.documentElement;
            panel.style.left = Math.max(0, Math.min(ev.clientX - dx, view.clientWidth - rect.width)) + 'px';
            panel.style.top = Math.max(0, Math.min(ev.clientY - dy, view.clientHeight - Math.min(rect.height, 48))) + 'px';
        };
        const up = () => {
            head.classList.remove('dragging');
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            if (!moved && panel.classList.contains('min')) setMinimized(false);
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
        e.preventDefault();
    }
    head.addEventListener('mousedown', startDrag);
    fab.addEventListener('mousedown', startDrag);

    // Keep marks on their elements: scrolling (incl. inner scrollers), resizes, content
    // that grows (accordions), and a slow tick for things that move on their own (carousels).
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(document.documentElement);
    if (document.body) resizeObserver.observe(document.body);
    const tick = setInterval(schedule, 700);

    // Re-renders call this without clearing stamps: the new scan has already re-stamped the page.
    function teardown(clearStamps) {
        cancelAnimationFrame(frame);
        clearInterval(tick);
        resizeObserver.disconnect();
        window.removeEventListener('scroll', schedule, { capture: true });
        window.removeEventListener('resize', schedule);
        host.remove();
        if (clearStamps) document.querySelectorAll('[data-qa-id]').forEach(el => el.removeAttribute('data-qa-id'));
        window.__lhQaTeardown = null;
    }

    function rescan() {
        if (typeof runHealthCheck === 'function') renderQAOverlay(runHealthCheck(document));
    }

    window.__lhQaTeardown = teardown;
}
