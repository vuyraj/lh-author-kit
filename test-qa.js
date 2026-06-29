const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const previewHtml = fs.readFileSync('./qa-test/Animali in cabina _ ITA Airways_previewMode.html', 'utf8');
const liveHtml = fs.readFileSync('./qa-test/Trasporto animali in cabina _ ITA Airways_live_page.html', 'utf8');

function extractQAContent(doc) {
    const blocks = [];
    
    // Helper to generate a unique CSS selector for an element
    function getSelector(el) {
        if (!el || el.nodeType !== 1) return ''; // Node.ELEMENT_NODE
        if (el.id) {
            try { return `#${CSS.escape(el.id)}`; } catch (e) { return `[id="${el.id}"]`; }
        }
        
        let path = [];
        let current = el;
        while (current && current.nodeType === 1) { // Node.ELEMENT_NODE
            let selector = current.tagName.toLowerCase();
            if (current.id) {
                try {
                    selector += `#${CSS.escape(current.id)}`;
                } catch (e) {
                    selector += `[id="${current.id}"]`;
                }
                path.unshift(selector);
                break;
            } else {
                let sibling = current;
                let nth = 1;
                while (sibling = sibling.previousElementSibling) {
                    if (sibling.tagName.toLowerCase() === selector) nth++;
                }
                if (nth > 1 || (current.nextElementSibling && current.nextElementSibling.tagName.toLowerCase() === selector)) {
                    selector += `:nth-of-type(${nth})`;
                }
            }
            path.unshift(selector);
            
            // Handle shadow root boundary (mock for jsdom)
            if (current.parentNode && current.parentNode.nodeType === 11 && current.parentNode.host) { // Node.DOCUMENT_FRAGMENT_NODE
                current = current.parentNode.host;
            } else {
                current = current.parentElement;
            }
        }
        return path.join(' > ');
    }

    // Function to check if an element is visible
    function isVisible(el) {
        if (!el || el.nodeType !== 1) return false;
        
        const style = el.getAttribute('style');
        if (style && (style.includes('display: none') || style.includes('display:none') || style.includes('visibility: hidden'))) return false;
        const className = el.className || '';
        if (typeof className === 'string') {
            const hasHidden = /(^|\s)(hidden|d-none)(\s|$)/.test(className);
            if (hasHidden) return false;
        }
        return true;
    }

    function traverse(node) {
        if (!node) return;

        if (node.nodeType === 1) { // Node.ELEMENT_NODE
            const tag = node.tagName.toLowerCase();
            if (['script', 'style', 'noscript', 'nav', 'footer', 'header', 'svg', 'iframe', 'button', 'form'].includes(tag)) {
                return; // skip
            }
            if (!isVisible(node)) return;

            if (tag === 'img') {
                const src = node.getAttribute('src');
                if (src && !src.startsWith('data:')) {
                    blocks.push({
                        type: 'image',
                        src: src,
                        alt: node.getAttribute('alt') || '',
                        selector: getSelector(node)
                    });
                }
            }

            if (node.shadowRoot) traverse(node.shadowRoot);
            for (let child of node.childNodes) traverse(child);
            
        } else if (node.nodeType === 3) { // Node.TEXT_NODE
            const text = node.textContent.trim().replace(/\s+/g, ' ');
            if (text.length > 1) {
                const parent = node.parentElement;
                if (isVisible(parent)) {
                    blocks.push({
                        type: 'text',
                        tag: parent ? parent.tagName.toLowerCase() : 'text',
                        text: text,
                        selector: getSelector(parent)
                    });
                }
            }
        } else if (node.nodeType === 11) { // Node.DOCUMENT_FRAGMENT_NODE
            for (let child of node.childNodes) traverse(child);
        }
    }

    traverse(doc.body || doc);
    return blocks;
}

const domPreview = new JSDOM(previewHtml);
// add mock CSS.escape
domPreview.window.CSS = { escape: (id) => id };
const previewBlocks = extractQAContent(domPreview.window.document);

const domLive = new JSDOM(liveHtml);
domLive.window.CSS = { escape: (id) => id };
const liveBlocks = extractQAContent(domLive.window.document);

console.log(`Preview Blocks: ${previewBlocks.length}`);
console.log(`Live Blocks: ${liveBlocks.length}`);

// find the target text block in preview
const targetText = "Con ITA Airways il viaggio è ancora più speciale";
const targetPreview = previewBlocks.find(b => b.text && b.text.includes(targetText));
console.log("Target in Preview found:", !!targetPreview);

const targetLive = liveBlocks.find(b => b.text && b.text.includes(targetText));
console.log("Target in Live found:", !!targetLive);

if (targetPreview) {
    console.log("Target Preview Tag:", targetPreview.tag);
    console.log("Target Preview Text:", targetPreview.text);
    console.log("Target Preview Selector:", targetPreview.selector);
}

if (targetLive) {
    console.log("Target Live Tag:", targetLive.tag);
    console.log("Target Live Text:", targetLive.text);
    console.log("Target Live Selector:", targetLive.selector);
}

// Compare how much they overlap
let matchCount = 0;
for (let lb of liveBlocks) {
    if (previewBlocks.find(pb => pb.text === lb.text)) {
        matchCount++;
    }
}
console.log(`Live blocks that match Preview exactly: ${matchCount}/${liveBlocks.length} (${Math.round((matchCount/liveBlocks.length)*100)}%)`);
