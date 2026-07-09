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

    // Counter for stamping elements with unique IDs
    let qaIdCounter = 0;

    // Stamp an element with a data-qa-id and return the id
    function stampElement(el) {
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
    issues.seo.title = doc.title || (doc.querySelector('title') ? doc.querySelector('title').innerText : 'Missing Title');
    
    const descMeta = doc.querySelector('meta[name="description"]');
    issues.seo.description = descMeta ? descMeta.getAttribute('content') : 'Missing Description';
    
    const ogImage = doc.querySelector('meta[property="og:image"]');
    issues.seo.thumbnail = ogImage ? ogImage.getAttribute('content') : 'Missing og:image';

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

    // 4. Check Images (Extract all alt texts to show on page)
    const images = doc.querySelectorAll('img');
    images.forEach(img => {
        if (!isVisible(img) || isInsideIgnoredTag(img)) return;
        const width = img.naturalWidth || img.clientWidth;
        const height = img.naturalHeight || img.clientHeight;
        let ratioString = '';
        if (width && height) {
            const ratio = width / height;
            const commonRatios = [
                { str: '1:1', val: 1 },
                { str: '4:3', val: 1.333 },
                { str: '3:2', val: 1.5 },
                { str: '16:9', val: 1.777 },
                { str: '2:1', val: 2 },
                { str: '21:9', val: 2.333 },
                { str: '3:1', val: 3 },
                { str: '4:1', val: 4 },
                { str: '3:4', val: 0.75 },
                { str: '2:3', val: 0.666 },
                { str: '9:16', val: 0.562 }
            ];
            let closest = commonRatios[0];
            let minDiff = Math.abs(ratio - closest.val);
            for (let i = 1; i < commonRatios.length; i++) {
                let diff = Math.abs(ratio - commonRatios[i].val);
                if (diff < minDiff) {
                    minDiff = diff;
                    closest = commonRatios[i];
                }
            }
            if (minDiff < 0.1) {
                ratioString = closest.str;
            } else {
                ratioString = (Math.round(ratio * 100) / 100) + ':1';
            }
        }

        const alt = img.getAttribute('alt');
        if (alt === null || alt.trim() === '') {
            issues.images.push({
                src: img.getAttribute('src') || 'unknown src',
                reason: 'Missing Alt Text',
                hasAlt: false,
                qaId: stampElement(img),
                ratio: ratioString
            });
        } else {
            issues.images.push({
                src: img.getAttribute('src') || 'unknown src',
                reason: `Alt: "${alt}"`,
                hasAlt: true,
                qaId: stampElement(img),
                ratio: ratioString
            });
        }
    });

    // 5. Check Headlines (H1, H2, H3)
    const headlines = doc.querySelectorAll('h1, h2, h3');
    headlines.forEach(h => {
        if (!isVisible(h) || isInsideIgnoredTag(h)) return;
        
        issues.headlines.push({
            reason: `Tag: ${h.tagName.toUpperCase()}`,
            qaId: stampElement(h)
        });
    });

    return issues;
}
