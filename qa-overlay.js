function renderQAOverlay(results) {
    function escapeHTML(str) {
        if (!str) return '';
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag])
        );
    }

    // Find element by data-qa-id attribute
    function findByQaId(qaId) {
        if (!qaId) return null;
        return document.querySelector(`[data-qa-id="${qaId}"]`);
    }

    // 1. Remove existing overlays, highlights, and tooltips
    const existingBanner = document.getElementById('qa-seo-banner');
    if (existingBanner) existingBanner.remove();

    const oldPanel = document.getElementById('qa-overlay-root');
    if (oldPanel) oldPanel.remove();

    document.querySelectorAll('.qa-hc-warning, .qa-hc-error, .qa-hc-info, .qa-hc-headline').forEach(el => {
        el.classList.remove('qa-hc-warning', 'qa-hc-error', 'qa-hc-info', 'qa-hc-headline');
    });
    document.querySelectorAll('.qa-inline-tooltip').forEach(el => el.remove());

    // 2. Add styles for highlights and tooltips
    let style = document.getElementById('qa-hc-styles');
    if (style) style.remove(); // Always refresh styles
    style = document.createElement('style');
    style.id = 'qa-hc-styles';
    style.textContent = `
        .qa-hc-warning {
            outline: 2px dashed #f59e0b !important;
            background-color: rgba(245, 158, 11, 0.1) !important;
        }
        .qa-hc-error {
            outline: 2px dashed #ef4444 !important;
            background-color: rgba(239, 68, 68, 0.1) !important;
        }
        .qa-hc-info {
            outline: 2px dashed #10b981 !important;
            background-color: rgba(16, 185, 129, 0.1) !important;
        }
        .qa-inline-tooltip {
            position: absolute;
            z-index: 2147483647;
            padding: 5px 10px;
            border-radius: 4px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            font-size: 11px;
            font-weight: 600;
            color: white;
            pointer-events: none;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            white-space: normal;
            word-wrap: break-word;
            max-width: 300px;
        }
        .qa-tooltip-error {
            background: #ef4444;
        }
        .qa-tooltip-warning {
            background: #f59e0b;
        }
        .qa-tooltip-info {
            background: #10b981;
        }
        .qa-tooltip-ratio {
            background: #3b82f6;
            transform: translate(-100%, -100%);
        }
        .qa-hc-headline {
            outline: 2px dashed #8b5cf6 !important;
            background-color: rgba(139, 92, 246, 0.1) !important;
        }
        .qa-tooltip-headline {
            background: #8b5cf6;
        }
    `;
    document.head.appendChild(style);

    // 3. Render SEO Box (Vertical & Movable)
    if (results.seo) {
        const banner = document.createElement('div');
        banner.id = 'qa-seo-banner';
        banner.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 320px;
            background: #1e2128;
            color: #f0f2f5;
            z-index: 2147483647;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            display: flex;
            flex-direction: column;
            border: 1px solid rgba(255,255,255,0.1);
            box-sizing: border-box;
            overflow: hidden;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 16px;
            background: rgba(255,255,255,0.05);
            border-bottom: 1px solid rgba(255,255,255,0.1);
            cursor: grab;
            user-select: none;
        `;
        header.innerHTML = `<div style="font-size: 13px; font-weight: 600; color: #fff; letter-spacing: 0.05em;">🛠️ SEO Info</div>`;
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.title = 'Close Health Check';
        closeBtn.style.cssText = `
            background: transparent;
            border: none;
            color: #a0a5b1;
            font-size: 14px;
            cursor: pointer;
            padding: 4px;
            transition: color 0.2s;
        `;
        closeBtn.onmouseover = () => closeBtn.style.color = '#fff';
        closeBtn.onmouseout = () => closeBtn.style.color = '#a0a5b1';
        closeBtn.onclick = () => {
            banner.remove();
            document.querySelectorAll('.qa-hc-warning, .qa-hc-error, .qa-hc-info, .qa-hc-headline').forEach(el => {
                el.classList.remove('qa-hc-warning', 'qa-hc-error', 'qa-hc-info', 'qa-hc-headline');
            });
            document.querySelectorAll('.qa-inline-tooltip').forEach(el => el.remove());
            document.querySelectorAll('[data-qa-id]').forEach(el => el.removeAttribute('data-qa-id'));
        };

        header.appendChild(closeBtn);

        const seoContent = document.createElement('div');
        seoContent.style.cssText = `
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        `;
        seoContent.innerHTML = `
            <div>
                <div style="font-size: 11px; color: #a0a5b1; margin-bottom: 4px;">Meta Title</div>
                <div style="font-size: 14px; font-weight: 500; color: #3b82f6;">${escapeHTML(results.seo.title)}</div>
            </div>
            <div>
                <div style="font-size: 11px; color: #a0a5b1; margin-bottom: 4px;">Meta Description</div>
                <div style="font-size: 13px; line-height: 1.4; color: #fff;">${escapeHTML(results.seo.description)}</div>
            </div>
            <div>
                <div style="font-size: 11px; color: #a0a5b1; margin-bottom: 8px;">Thumbnail (og:image)</div>
                ${results.seo.thumbnail && results.seo.thumbnail !== 'Missing og:image' 
                    ? `<img src="${escapeHTML(results.seo.thumbnail)}" style="width: 100%; max-height: 140px; object-fit: contain; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); background: #15171c;">` 
                    : `<div style="padding: 16px; background: rgba(239, 68, 68, 0.1); color: #ef4444; border-radius: 4px; font-size: 12px; text-align: center; border: 1px dashed #ef4444;">Missing Image</div>`
                }
            </div>
        `;

        banner.appendChild(header);
        banner.appendChild(seoContent);
        document.body.appendChild(banner);

        // Dragging Logic
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        header.addEventListener('mousedown', (e) => {
            if (e.target === closeBtn) return;
            isDragging = true;
            header.style.cursor = 'grabbing';
            const rect = banner.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            initialLeft = rect.left;
            initialTop = rect.top;
            
            // Lock dimensions and positions
            banner.style.right = 'auto';
            banner.style.bottom = 'auto';
            banner.style.left = initialLeft + 'px';
            banner.style.top = initialTop + 'px';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            banner.style.left = (initialLeft + dx) + 'px';
            banner.style.top = (initialTop + dy) + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                header.style.cursor = 'grab';
            }
        });
    }

    // 4. Highlight elements and add inline tooltips
    function addTooltip(item, type) {
        const el = findByQaId(item.qaId);
        if (!el) return;

        let outlineClass = 'qa-hc-warning';
        let tooltipClass = 'qa-tooltip-warning';
        let icon = '⚠️ ';

        if (type === 'error') {
            outlineClass = 'qa-hc-error';
            tooltipClass = 'qa-tooltip-error';
            icon = '❌ ';
        } else if (type === 'info') {
            outlineClass = 'qa-hc-info';
            tooltipClass = 'qa-tooltip-info';
            icon = '🖼️ ';
        } else if (type === 'headline') {
            outlineClass = 'qa-hc-headline';
            tooltipClass = 'qa-tooltip-headline';
            icon = '📝 ';
        }

        el.classList.add(outlineClass);

        const tooltip = document.createElement('div');
        tooltip.className = `qa-inline-tooltip ${tooltipClass}`;
        tooltip.textContent = icon + item.reason;

        // Position tooltip at the top-left corner of the element
        const rect = el.getBoundingClientRect();
        
        tooltip.style.left = (window.scrollX + rect.left) + 'px';
        tooltip.style.top = (window.scrollY + rect.top) + 'px';

        document.body.appendChild(tooltip);

        // Render aspect ratio badge if available
        if (item.ratio) {
            const ratioBadge = document.createElement('div');
            ratioBadge.className = 'qa-inline-tooltip qa-tooltip-ratio';
            ratioBadge.textContent = '📐 Ratio: ' + item.ratio;
            ratioBadge.style.left = (window.scrollX + rect.right) + 'px';
            ratioBadge.style.top = (window.scrollY + rect.bottom) + 'px';
            document.body.appendChild(ratioBadge);
        }
    }

    const errorLinks = results.links || [];
    const missingAltImages = (results.images || []).filter(img => !img.hasAlt);
    const validAltImages = (results.images || []).filter(img => img.hasAlt);
    const allWarnings = results.whitespaces || [];
    const allHeadlines = results.headlines || [];

    errorLinks.forEach(item => addTooltip(item, 'error'));
    missingAltImages.forEach(item => addTooltip(item, 'error'));
    allWarnings.forEach(item => addTooltip(item, 'warning'));
    validAltImages.forEach(item => addTooltip(item, 'info'));
    allHeadlines.forEach(item => addTooltip(item, 'headline'));
}
