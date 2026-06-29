// Extracts structured text and image content from a given document for QA comparison.
function extractQAContent(doc) {
    const blocks = [];
    
    // Helper to generate a unique CSS selector for an element
    function getSelector(el) {
        if (!el || el.nodeType !== 1) return '';
        
        let path = [];
        let current = el;
        while (current && current.nodeType === 1) {
            let selector = current.tagName.toLowerCase();
            if (current.id) {
                try { selector += `#${CSS.escape(current.id)}`; } catch(e) { selector += `[id="${current.id}"]`; }
                path.unshift(selector);
            } else {
                let sibling = current;
                let nth = 1;
                while (sibling = sibling.previousElementSibling) {
                    if (sibling.tagName.toLowerCase() === selector) nth++;
                }
                if (nth > 1 || (current.nextElementSibling && current.nextElementSibling.tagName.toLowerCase() === selector)) {
                    selector += `:nth-of-type(${nth})`;
                }
                path.unshift(selector);
            }
            
            if (current.parentNode && current.parentNode.nodeType === 11 && current.parentNode.host) {
                path.unshift('::shadow::');
                current = current.parentNode.host;
            } else {
                current = current.parentElement;
            }
        }
        return path.join(' > ').replace(/ > ::shadow:: > /g, '::shadow::').replace(/::shadow:: > /g, '::shadow::');
    }

    // Function to check if an element is visible
    function isVisible(el) {
        if (!el || el.nodeType !== 1) return false;
        if (doc.defaultView) {
            // Live page (in browser)
            try {
                const style = doc.defaultView.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
            } catch(e) {}
        } else {
            // Extracted HTML (DOMParser)
            const style = el.getAttribute('style');
            if (style && (style.includes('display: none') || style.includes('display:none') || style.includes('visibility: hidden'))) return false;
            const className = el.className || '';
            if (typeof className === 'string') {
                const hasHidden = /(^|\s)(hidden|d-none)(\s|$)/.test(className);
                if (hasHidden) return false;
            }
        }
        return true;
    }

    function traverse(node, isInsideBlock = false) {
        if (!node) return;

        if (node.nodeType === 1) {
            const tag = node.tagName.toLowerCase();
            // Removed 'button' from skip list so accordion headlines are processed
            if (['script', 'style', 'noscript', 'nav', 'footer', 'header', 'svg', 'iframe', 'form'].includes(tag)) {
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

            // Define tags that represent a single block of text
            const isBlock = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'td', 'th', 'figcaption', 'button', 'label'].includes(tag);

            if (isBlock && !isInsideBlock) {
                const text = node.textContent.replace(/\u00A0/g, ' ').trim().replace(/\s+/g, ' ');
                if (text.length > 1) {
                    blocks.push({
                        type: 'text',
                        tag: tag,
                        text: text,
                        selector: getSelector(node)
                    });
                }
            }

            // Traverse shadow DOM if present
            if (node.shadowRoot) {
                traverse(node.shadowRoot, isInsideBlock || isBlock);
            }

            // Traverse children. Pass down whether we are already inside a block.
            for (let child of node.childNodes) {
                traverse(child, isInsideBlock || isBlock);
            }
            
        } else if (node.nodeType === 3 && !isInsideBlock) {
            // Text node that is directly inside a div or span (not wrapped in p, h1, etc)
            const text = node.textContent.replace(/\u00A0/g, ' ').trim().replace(/\s+/g, ' ');
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
        } else if (node.nodeType === 11) {
            // Traverse shadow root contents
            for (let child of node.childNodes) {
                traverse(child, isInsideBlock);
            }
        }
    }

    // Start traversal from body
    traverse(doc.body || doc, false);

    return blocks;
}
