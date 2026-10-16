// health-check.js
// Runs inside the active page to detect structural health issues and SEO metadata

function runHealthCheck(doc) {
    const issues = {
        seo: {},
        whitespaces: [],
        links: [],
        images: [],
        headlines: []
    };

    // Counter for stamping elements with unique IDs. Clear stamps from a previous run
    // first, or a stale "qa-5" on another element would shadow the new one.
    let qaIdCounter = 0;
    doc.querySelectorAll('[data-qa-id]').forEach(el => el.removeAttribute('data-qa-id'));

    // Stamp an element with a data-qa-id and return the id. An element flagged by two
    // checks (e.g. a heading with &nbsp; runs) keeps one id so both results can find it.
    function stampElement(el) {
        const existing = el.getAttribute('data-qa-id');
        if (existing) return existing;
        const id = 'qa-' + (qaIdCounter++);
        el.setAttribute('data-qa-id', id);
        return id;
    }

    function isVisible(el) {
        if (!el || el.nodeType !== 1) return false;
        try {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        } catch(e) {}
        return true;
    }

    // Check if element is inside header, footer, or nav
    function isInsideIgnoredTag(el) {
        if (!el) return false;
        let current = el;
        while (current && current.nodeType === 1) {
            const tag = current.tagName.toLowerCase();
            if (tag === 'header' || tag === 'footer' || tag === 'nav') return true;
            
            if (current.parentNode && current.parentNode.nodeType === 11 && current.parentNode.host) {
                current = current.parentNode.host;
            } else {
                current = current.parentElement;
            }
        }
        return false;
    }

    // 1. Extract SEO Data
    // Missing values are null; the overlay shows them as "Missing".
    issues.seo.title = doc.title || null;

    const descMeta = doc.querySelector('meta[name="description"]');
    issues.seo.description = (descMeta && descMeta.getAttribute('content')) || null;

    const ogImage = doc.querySelector('meta[property="og:image"]');
    issues.seo.thumbnail = (ogImage && ogImage.getAttribute('content')) || null;

    // 2. Check for Whitespaces
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while (node = walker.nextNode()) {
        const parent = node.parentElement;
        if (!parent || !isVisible(parent) || isInsideIgnoredTag(parent)) continue;
        if (['script', 'style', 'noscript', 'code', 'pre'].includes(parent.tagName.toLowerCase())) continue;

        const text = node.nodeValue;
        if (text && text.trim().length > 0) {
            const hasConsecutiveNbsp = /\u00A0{2,}/.test(text) || /\u00A0 \u00A0/.test(text);
            
            if (hasConsecutiveNbsp) {
                issues.whitespaces.push({
                    text: text.trim().substring(0, 60) + (text.trim().length > 60 ? '...' : ''),
                    reason: 'Multiple non-breaking spaces (&nbsp;)',
                    qaId: stampElement(parent)
                });
            }
        }
    }

    // 3. Check Links (Missing href, empty href, #)
    const links = doc.querySelectorAll('a');
    links.forEach(a => {
        if (!isVisible(a) || isInsideIgnoredTag(a)) return;

        const href = a.getAttribute('href');
        if (!href || href.trim() === '' || href.trim() === '#') {
            issues.links.push({
                text: a.textContent.trim().substring(0, 50) || 'Empty Link',
                reason: 'Missing or empty href attribute',
                qaId: stampElement(a)
            });
        }
    });

    // 4. Check Images — alt text, and the file's aspect ratio against the LHG editorial
    // guidelines (Frontify › Editorial Guidelines › Images › Image Ratios). "all" rows apply
    // to every airline; a brand's own rows are added on top.
    const GUIDELINE_RATIOS = {
        all: [['1:2', 'Navigation/Menu, Flightmanager mobile'], ['3:1', 'Homepage Main Stage Teaser'],
              ['16:9', 'Homepage Teaser Wide'], ['1:1', 'Teaser Compact, Offers square'],
              ['11:4', 'Flightmanager desktop'], ['21:9', 'Offers cinescope'], ['32:9', 'Offers panorama']],
        lh:  [['25:8', 'Header Visual'], ['21:9', 'Images, Context/Stage Teaser']],
        aua: [['11:4', 'Header Visual'], ['16:9', 'Images'], ['2:1', 'Context Teaser'],
              ['12:5', 'Hero/Stage Teaser'], ['4:3', 'Hero Teaser mobile']],
        bel: [['3:1', 'Header Visual'], ['2:1', 'Images, Context/Stage Teaser']],
        lx:  [['3:1', 'Header Visual'], ['2:1', 'Images, Context/Stage Teaser']],
        ita: [['3:1', 'Header Visual'], ['16:9', 'Images'], ['2:1', 'Context/Stage Teaser']]
    };
    const BRAND_BY_HOST = {
        'www.lufthansa.com': 'lh', 'www.austrian.com': 'aua', 'www.brusselsairlines.com': 'bel',
        'www.swiss.com': 'lx', 'www.ita-airways.com': 'ita'
    };
    // Live domain, or /content/{brand}/… on author/preview hosts. Unknown → every brand's ratios.
    const pathBrand = (location.pathname.match(/\/content\/([^/]+)\//) || [])[1];
    const brand = BRAND_BY_HOST[location.hostname] || (pathBrand && GUIDELINE_RATIOS[pathBrand.toLowerCase()] ? pathBrand.toLowerCase() : null);
    const allowed = new Map();
    const rows = brand ? [...GUIDELINE_RATIOS.all, ...GUIDELINE_RATIOS[brand]] : Object.values(GUIDELINE_RATIOS).flat();
    rows.forEach(([name, use]) => allowed.set(name, allowed.has(name) ? `${allowed.get(name)}; ${use}` : use));
    const ratioValue = (name) => { const [w, h] = name.split(':').map(Number); return w / h; };
    const ratioText = (r) => (r >= 1 ? `${Math.round(r * 100) / 100}:1` : `1:${Math.round(100 / r) / 100}`);
    issues.ratioBrand = brand;

    const images = doc.querySelectorAll('img');
    images.forEach(img => {
        if (!isVisible(img) || isInsideIgnoredTag(img)) return;
        const src = img.currentSrc || img.src || '';
        // The file's own size, not the box it is cropped into. Unloaded (lazy) images and
        // vectors have no meaningful ratio, so they get none.
        const isVector = /^data:image\/svg|\.svg(\?|#|$)/i.test(src);
        let ratio = '';
        let ratioOk = null;
        let ratioNearest = '';
        let ratioUse = '';
        if (!isVector && img.naturalWidth && img.naturalHeight) {
            const r = img.naturalWidth / img.naturalHeight;
            let best = null;
            for (const [name, use] of allowed) {
                const diff = Math.abs(r / ratioValue(name) - 1);
                if (!best || diff < best.diff) best = { name, use, diff };
            }
            ratioOk = !!best && best.diff <= 0.02;
            ratio = ratioOk ? best.name : ratioText(r);
            ratioNearest = best ? best.name : '';
            ratioUse = best ? best.use : '';
        }

        const alt = img.getAttribute('alt');
        const hasAlt = alt !== null && alt.trim() !== '';
        issues.images.push({
            src,
            alt: hasAlt ? alt.trim() : '',
            hasAlt,
            qaId: stampElement(img),
            ratio,
            ratioOk,
            ratioNearest,
            ratioUse,
            // Only content imagery is held to the guideline; logos and icons are not.
            ratioFlag: ratioOk === false && img.getBoundingClientRect().width >= 300,
            size: img.naturalWidth ? `${img.naturalWidth}×${img.naturalHeight}` : ''
        });
    });

    // 5. Check Headlines (H1, H2, H3)
    const headlines = doc.querySelectorAll('h1, h2, h3');
    headlines.forEach(h => {
        if (!isVisible(h) || isInsideIgnoredTag(h)) return;
        
        issues.headlines.push({
            tag: h.tagName.toUpperCase(),
            text: h.textContent.replace(/\s+/g, ' ').trim().substring(0, 120),
            qaId: stampElement(h)
        });
    });

    return issues;
}
