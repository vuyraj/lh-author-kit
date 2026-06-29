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

    function inlineDiff(oldStr, newStr) {
        if (!oldStr || !newStr) return escapeHTML(newStr || oldStr);
        const oldWords = oldStr.split(/(\s+)/);
        const newWords = newStr.split(/(\s+)/);
        
        const n = oldWords.length, m = newWords.length;
        const dp = Array(n + 1).fill(0).map(() => Array(m + 1).fill(0));
        
        for (let i = 1; i <= n; i++) {
            for (let j = 1; j <= m; j++) {
                if (oldWords[i-1] === newWords[j-1]) {
                    dp[i][j] = dp[i-1][j-1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
                }
            }
        }
        
        let i = n, j = m, path = [];
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && oldWords[i-1] === newWords[j-1]) {
                path.push({ type: 'keep', text: oldWords[i-1] });
                i--; j--;
            } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
                path.push({ type: 'add', text: newWords[j-1] });
                j--;
            } else if (i > 0 && (j === 0 || dp[i][j-1] < dp[i-1][j])) {
                path.push({ type: 'remove', text: oldWords[i-1] });
                i--;
            }
        }
        path.reverse();
        
        let html = '';
        for (const op of path) {
            if (op.type === 'keep') html += escapeHTML(op.text);
            else if (op.type === 'add') html += `<span style="background-color: #dcfce7; color: #166534; text-decoration: none;">${escapeHTML(op.text)}</span>`;
            else if (op.type === 'remove') html += `<span style="background-color: #fee2e2; color: #991b1b; text-decoration: line-through;">${escapeHTML(op.text)}</span>`;
        }
        return html;
    }

    function querySelectorShadow(selector) {
        if (!selector) return null;
        const parts = selector.split('::shadow::');
        let current = document;
        for (let i = 0; i < parts.length; i++) {
            if (!current) return null;
            if (i > 0 && current.shadowRoot) {
                current = current.shadowRoot;
            }
            if (parts[i].trim()) {
                current = current.querySelector(parts[i]);
            }
        }
        return current;
    }

    // 1. Remove any existing QA overlays and highlights
    const existing = document.getElementById('qa-overlay-root');
    if (existing) existing.remove();

    document.querySelectorAll('.qa-highlight-added, .qa-highlight-modified').forEach(el => {
        el.classList.remove('qa-highlight-added', 'qa-highlight-modified');
    });
    document.querySelectorAll('.qa-removed-marker').forEach(el => el.remove());

    // 2. Add highlight styles to document head
    let style = document.getElementById('qa-highlight-styles');
    if (!style) {
        style = document.createElement('style');
        style.id = 'qa-highlight-styles';
        style.textContent = `
            .qa-highlight-added {
                outline: 2px solid #10b981 !important;
                background-color: rgba(16, 185, 129, 0.1) !important;
            }
            .qa-highlight-modified {
                outline: 2px solid #f59e0b !important;
                background-color: rgba(245, 158, 11, 0.1) !important;
            }
            .qa-removed-marker {
                position: absolute;
                background: #ef4444;
                color: white;
                font-size: 11px;
                padding: 4px 8px;
                border-radius: 4px;
                font-family: sans-serif;
                z-index: 10000;
                pointer-events: none;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                white-space: nowrap;
                max-width: 300px;
                overflow: hidden;
                text-overflow: ellipsis;
            }
        `;
        document.head.appendChild(style);
    }

    // 3. Apply highlights to Added/Modified
    results.added.forEach(item => {
        try {
            const el = querySelectorShadow(item.selector);
            if (el) el.classList.add('qa-highlight-added');
        } catch(e) {}
    });

    results.modified.forEach(item => {
        try {
            const el = querySelectorShadow(item.selector);
            if (el) el.classList.add('qa-highlight-modified');
        } catch(e) {}
    });

    // 4. Add floating markers for Removed content
    results.removed.forEach(item => {
        if (item.previousSelector) {
            try {
                const prevEl = document.querySelector(item.previousSelector);
                if (prevEl) {
                    const marker = document.createElement('div');
                    marker.className = 'qa-removed-marker';
                    marker.textContent = '❌ Removed below: ' + (item.text || item.src || 'content');
                    
                    const rect = prevEl.getBoundingClientRect();
                    // Position just below the previous element
                    marker.style.top = (window.scrollY + rect.bottom + 5) + 'px';
                    marker.style.left = (window.scrollX + rect.left) + 'px';
                    document.body.appendChild(marker);
                }
            } catch(e) {}
        }
    });

    // 5. Render Shadow DOM Panel
    const root = document.createElement('div');
    root.id = 'qa-overlay-root';
    root.style.position = 'fixed';
    root.style.bottom = '20px';
    root.style.right = '20px';
    root.style.zIndex = '2147483647';

    const shadow = root.attachShadow({ mode: 'open' });
    
    shadow.innerHTML = `
        <style>
            :host {
                all: initial;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }
            .panel {
                width: 350px;
                background: #1e2128;
                color: #f0f2f5;
                border-radius: 12px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                display: flex;
                flex-direction: column;
                max-height: 500px;
                border: 1px solid rgba(255,255,255,0.1);
            }
            .header {
                padding: 16px;
                background: #15171c;
                border-top-left-radius: 12px;
                border-top-right-radius: 12px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: grab;
                border-bottom: 1px solid rgba(255,255,255,0.05);
            }
            .header:active { cursor: grabbing; }
            .title { font-weight: 600; font-size: 15px; margin: 0; }
            .controls button {
                background: transparent;
                border: none;
                color: #a0a5b1;
                cursor: pointer;
                padding: 4px;
                font-size: 16px;
                border-radius: 4px;
            }
            .controls button:hover { background: rgba(255,255,255,0.1); color: #fff; }
            .summary {
                display: flex;
                justify-content: space-around;
                padding: 12px;
                background: #1a1c23;
                border-bottom: 1px solid rgba(255,255,255,0.05);
                font-size: 13px;
            }
            .stat { display: flex; flex-direction: column; align-items: center; }
            .stat-val { font-size: 18px; font-weight: 600; margin-bottom: 2px; }
            .stat-add { color: #10b981; }
            .stat-mod { color: #f59e0b; }
            .stat-rem { color: #ef4444; }
            .content {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
            }
            .section-title {
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                color: #a0a5b1;
                margin-top: 0;
                margin-bottom: 12px;
            }
            .item {
                background: rgba(255,255,255,0.03);
                border-radius: 6px;
                padding: 10px;
                margin-bottom: 10px;
                font-size: 13px;
                line-height: 1.4;
            }
            .item-removed { border-left: 3px solid #ef4444; }
            .item-modified { border-left: 3px solid #f59e0b; }
            .item-added { border-left: 3px solid #10b981; }
            
            .text-snippet {
                color: #d1d5db;
                display: -webkit-box;
                -webkit-line-clamp: 3;
                -webkit-box-orient: vertical;
                overflow: hidden;
            }
            .text-old { text-decoration: line-through; color: #ef4444; margin-bottom: 4px; }
            .text-new { color: #10b981; }
            
            .empty-state {
                color: #a0a5b1;
                text-align: center;
                padding: 20px 0;
                font-style: italic;
            }
            
            ::-webkit-scrollbar { width: 6px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 3px; }
            ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.25); }
        </style>
        <div class="panel">
            <div class="header">
                <h3 class="title">QA Results</h3>
                <div class="controls">
                    <button id="closeBtn" title="Clear QA">✕</button>
                </div>
            </div>
            <div class="summary">
                <div class="stat"><span class="stat-val stat-add">${results.added.length}</span><span>Added</span></div>
                <div class="stat"><span class="stat-val stat-mod">${results.modified.length}</span><span>Modified</span></div>
                <div class="stat"><span class="stat-val stat-rem">${results.removed.length}</span><span>Removed</span></div>
            </div>
            <div class="content">
                <h4 class="section-title">Added Content</h4>
                <div id="addedList"></div>

                <h4 class="section-title" style="margin-top:20px;">Modified Content</h4>
                <div id="modifiedList"></div>
                
                <h4 class="section-title" style="margin-top:20px;">Removed Content</h4>
                <div id="removedList"></div>
            </div>
        </div>
    `;

    // Populate added
    const addedList = shadow.getElementById('addedList');
    if (results.added.length === 0) {
        addedList.innerHTML = '<div class="empty-state">No content added</div>';
    } else {
        results.added.forEach(item => {
            const div = document.createElement('div');
            div.className = 'item item-added';
            div.innerHTML = `<div class="text-snippet" style="color: #10b981;">${escapeHTML(item.text) || 'Image: ' + escapeHTML(item.src)}</div>`;
            addedList.appendChild(div);
        });
    }

    // Populate removed
    const removedList = shadow.getElementById('removedList');
    if (results.removed.length === 0) {
        removedList.innerHTML = '<div class="empty-state">No content removed</div>';
    } else {
        results.removed.forEach(item => {
            const div = document.createElement('div');
            div.className = 'item item-removed';
            div.innerHTML = `<div class="text-snippet">${escapeHTML(item.text) || 'Image: ' + escapeHTML(item.src)}</div>`;
            removedList.appendChild(div);
        });
    }

    // Populate modified
    const modifiedList = shadow.getElementById('modifiedList');
    if (results.modified.length === 0) {
        modifiedList.innerHTML = '<div class="empty-state">No content modified</div>';
    } else {
        results.modified.forEach(item => {
            const div = document.createElement('div');
            div.className = 'item item-modified';
            const diffHtml = item.type === 'text' 
                ? inlineDiff(item.oldText || '', item.text || '') 
                : `<div class="text-snippet text-old">${item.oldText || 'Old Image: ' + item.oldSrc}</div>
                   <div class="text-snippet text-new">${item.text || 'New Image: ' + item.src}</div>`;
            div.innerHTML = diffHtml;
            modifiedList.appendChild(div);
        });
    }

    // Dragging logic
    const header = shadow.querySelector('.header');
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    header.addEventListener('mousedown', dragStart);
    window.addEventListener('mouseup', dragEnd);
    window.addEventListener('mousemove', drag);

    function dragStart(e) {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
        if (e.target === header || e.target.classList.contains('title')) {
            isDragging = true;
        }
    }

    function dragEnd(e) {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            xOffset = currentX;
            yOffset = currentY;
            root.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
        }
    }

    // Close logic
    shadow.getElementById('closeBtn').addEventListener('click', () => {
        root.remove();
        document.querySelectorAll('.qa-highlight-added, .qa-highlight-modified').forEach(el => {
            el.classList.remove('qa-highlight-added', 'qa-highlight-modified');
        });
        document.querySelectorAll('.qa-removed-marker').forEach(el => el.remove());
    });

    document.body.appendChild(root);
}
