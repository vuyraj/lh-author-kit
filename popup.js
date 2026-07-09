// Global storage object for settings
let storage = { settings: { placeholder: '$lang', presets: {} } };

// Transform URL to editor format
function transformUrl(url) {
    try {
        const urlObj = new URL(url);
        urlObj.pathname = '/editor.html' + urlObj.pathname;
        urlObj.search = ''; // remove query parameters
        return urlObj.toString();
    } catch (e) {
        console.error('Error transforming URL:', e);
        return url;
    }
}

// Load current active tab's URL into the input field
function loadCurrentUrl() {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].url) {
            document.querySelector('.url-input').value = tabs[0].url;
        }
    });
}

// Open editor URL in new tab (preview/author pages)
function openEditorFromPreview() {
    // Read from the input field, allowing users to modify the URL before clicking Editor
    const url = document.querySelector('.url-input').value.trim();
    if (!url) {
        alert('Please enter a URL first.');
        return;
    }
    const transformedUrl = transformUrl(url);
    chrome.tabs.create({ url: transformedUrl });
}

// Unified Editor button – auto-detects live vs preview and uses the right logic
function openSmartEditor() {
    const btn = document.querySelector('#editorBtn');

    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (!tabs || !tabs[0] || !tabs[0].url) {
            alert('Unable to detect the current page URL.');
            return;
        }
        const tab = tabs[0];
        let hostname;
        try {
            hostname = new URL(tab.url).hostname;
        } catch (e) {
            alert('Invalid URL.');
            return;
        }

        // If the current page is on a supported live domain, use Live→Editor logic
        const brand = LIVE_DOMAIN_TO_BRAND[hostname];
        if (brand) {
            // --- Live → Editor path ---
            const originalText = btn.textContent;
            btn.textContent = 'Loading...';
            btn.classList.add('loading');

            chrome.scripting.executeScript(
                {
                    target: { tabId: tab.id },
                    func: extractLogoutResource,
                    world: 'MAIN'
                },
                (results) => {
                    btn.textContent = originalText;
                    btn.classList.remove('loading');

                    if (chrome.runtime.lastError) {
                        alert('Error reading page: ' + chrome.runtime.lastError.message);
                        return;
                    }
                    const contentPath = results && results[0] && results[0].result;
                    if (!contentPath) {
                        alert('Could not find logoutResource on this page.\nMake sure you are on a supported live page.');
                        return;
                    }
                    const editorPath = transformContentPath(contentPath);
                    const editorUrl = `https://${AUTHOR_HOSTNAME}/editor.html${editorPath}`;
                    chrome.tabs.create({ url: editorUrl });
                }
            );
        } else {
            // --- Preview / Author → Editor path ---
            openEditorFromPreview();
        }
    });
}

const BRAND_DOMAIN_MAP = {
    ita: 'https://www.ita-airways.com',
    lh: 'https://www.lufthansa.com',
    lx: 'https://www.swiss.com',
    bel: 'https://www.brusselsairlines.com',
    aua: 'https://www.austrian.com'
};

// Single shared AEM author hostname for all brands
const AUTHOR_HOSTNAME = 'author-airem-prod.lufthansa.com';

// Map live domain → brand code (used to build /content/{brand}/gc/... path)
const LIVE_DOMAIN_TO_BRAND = {
    'www.lufthansa.com':        'lh',
    'www.swiss.com':            'lx',
    'www.brusselsairlines.com': 'bel',
    'www.austrian.com':         'aua',
    'www.ita-airways.com':      'ita',
};

function getBrand(segments) {
    const contentIndex = segments.indexOf('content');
    return contentIndex >= 0 && segments[contentIndex + 1]
        ? segments[contentIndex + 1].toLowerCase()
        : null;
}

function isGcFormat(segments) {
    const contentIndex = segments.indexOf('content');
    return contentIndex >= 0 && segments[contentIndex + 2]?.toLowerCase() === 'gc';
}

function isMarketsFormat(segments) {
    const contentIndex = segments.indexOf('content');
    return contentIndex >= 0 && segments[contentIndex + 2]?.toLowerCase() === 'markets';
}

function extractLanguage(segments) {
    const contentIndex = segments.indexOf('content');
    if (isGcFormat(segments)) {
        return segments[contentIndex + 3]?.toLowerCase() || null;
    }
    if (isMarketsFormat(segments)) {
        return segments[contentIndex + 4]?.toLowerCase() || null;
    }
    return null;
}

function extractCountry(segments) {
    const contentIndex = segments.indexOf('content');
    if (isMarketsFormat(segments)) {
        return segments[contentIndex + 3]?.toLowerCase() || null;
    }
    return 'xx';
}

function extractPagePath(segments) {
    const contentIndex = segments.indexOf('content');
    let startIndex = null;
    if (isGcFormat(segments)) {
        startIndex = contentIndex + 4;
    } else if (isMarketsFormat(segments)) {
        startIndex = contentIndex + 5;
    }
    if (startIndex === null || startIndex >= segments.length) {
        return null;
    }
    const cleanedSegments = segments.slice(startIndex).map((segment) => segment.replace(/\.html$/i, ''));
    return cleanedSegments.filter(Boolean).join('/');
}

function getMappedDomain(brand) {
    return BRAND_DOMAIN_MAP[brand] || null;
}

function buildLiveUrl(domain, country, language, pagePath) {
    const normalizedCountry = country || 'xx';
    const normalizedLanguage = language || '';
    const trimmedPath = pagePath.replace(/\/+$|^\/+/, '');
    return `${domain}/${normalizedCountry}/${normalizedLanguage}/${trimmedPath}`;
}

function transformLiveUrl(url) {
    try {
        const parsed = new URL(url);
        const segments = parsed.pathname.replace(/\/+$|^\/+/, '').split('/').filter(Boolean);

        const brand = getBrand(segments);
        const mappedDomain = getMappedDomain(brand);
        const language = extractLanguage(segments);
        const country = extractCountry(segments);
        const pagePath = extractPagePath(segments);

        if (!mappedDomain || !language || !pagePath) {
            alert('Unsupported or invalid URL format');
            return null;
        }

        return buildLiveUrl(mappedDomain, country, language, pagePath);
    } catch (error) {
        console.error('Error transforming live URL:', error);
        alert('Unsupported or invalid URL format');
        return null;
    }
}

function openLiveUrl() {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (!tabs || !tabs[0] || !tabs[0].url) {
            alert('Unable to detect the current page URL.');
            return;
        }
        const transformedUrl = transformLiveUrl(tabs[0].url);
        if (transformedUrl) {
            // Replaced window.open with chrome.tabs.create to avoid popup blocker issues
            chrome.tabs.create({ url: transformedUrl });
        }
    });
}

// ── Live → Editor ──────────────────────────────────────────────────────────

// Injected into the live tab — reads logoutResource from the
// .dcep-login-portlet div where AEM stores it.
function extractLogoutResource() {
    const patterns = [
        /"logoutResource"\s*:\s*"(\/content\/[^"]+)"/,
        /logoutResource\s*[=:]\s*['"](\/content\/[^'"]+)['"]/,
        /data-logout-resource=["'](\/content\/[^"']+)["']/,
    ];

    function tryMatch(text) {
        if (!text) return null;
        for (const pat of patterns) {
            const m = text.match(pat);
            if (m) return m[1];
        }
        return null;
    }

    // 1. Target .dcep-login-portlet directly
    const portlet = document.querySelector('.dcep-login-portlet');
    if (portlet) {
        // Check every attribute on the element
        for (const attr of portlet.attributes) {
            if (attr.value.includes('/content/')) {
                const found = tryMatch(attr.name + '="' + attr.value + '"');
                if (found) return found;
                if (attr.value.startsWith('/content/')) return attr.value;
            }
        }
        // Search the portlet's full outer HTML (catches JSON inside the div)
        const found = tryMatch(portlet.outerHTML);
        if (found) return found;
    }

    // 2. Full outerHTML fallback
    return tryMatch(document.documentElement.outerHTML);
}

// Converts an AEM content path from markets format to gc format and appends .html
function transformContentPath(contentPath) {
    const transformed = contentPath.replace(/\/markets\/[^/]+\//, '/gc/');
    return transformed.endsWith('.html') ? transformed : transformed + '.html';
}


// ── QA Health Check ─────────────────────────────────────────────────────

function runQA() {
    const btn = document.querySelector('#qaBtn');
    
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (!tabs || !tabs[0] || !tabs[0].url) {
            alert('Unable to detect the current page URL.');
            return;
        }
        const tab = tabs[0];
        let hostname;
        try {
            hostname = new URL(tab.url).hostname;
        } catch (e) {
            alert('Invalid URL.');
            return;
        }

        const originalText = btn.textContent;
        btn.textContent = 'Checking Health...';
        btn.classList.add('loading');

        // 1. Inject extract script and run on preview
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['health-check.js']
        }, () => {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => runHealthCheck(document)
            }, (res) => {
                const results = res && res[0] && res[0].result ? res[0].result : null;
                if (!results) {
                    alert('Health check extraction failed.');
                    btn.textContent = originalText;
                    btn.classList.remove('loading');
                    return;
                }

                // 2. Inject overlay
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['qa-overlay.js']
                }, () => {
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: (results) => renderQAOverlay(results),
                        args: [results]
                    }, () => {
                        btn.textContent = originalText;
                        btn.classList.remove('loading');
                    });
                });
            });
        });
    });
}

// Load settings from Chrome storage
function loadData() {
    chrome.storage.local.get(['settings'], (result) => {
        storage.settings = result.settings || { placeholder: '$lang', presets: {} };
        if (!storage.settings.presets) storage.settings.presets = {};
        renderPresets();
        loadCurrentUrl();
    });
}

function updateColorPreview(select) {
    const preview = document.querySelector('.color-preview');
    if (!preview) return;
    const color = select.value;
    preview.style.backgroundColor = color;
}

// Set up event listeners for buttons
function setupEventListeners() {
    document.querySelector('.settings-btn').addEventListener('click', switchToSettings);
    document.querySelector('.back-btn').addEventListener('click', switchToMain);
    document.querySelector('.add-btn').addEventListener('click', () => openModal());
    document.querySelector('#editorBtn').addEventListener('click', openSmartEditor);
    document.querySelector('#liveBtn').addEventListener('click', openLiveUrl);
    document.querySelector('#qaBtn').addEventListener('click', runQA);
    document.querySelector('.add-preset-btn').addEventListener('click', () => openModal());
    document.querySelector('.save-settings-btn').addEventListener('click', () => {
        // Always sync placeholder value before saving
        const placeholder = document.querySelector('.placeholder-input').value.trim();
        storage.settings.placeholder = placeholder || '$lang';
        chrome.storage.local.set({ settings: storage.settings }, () => {
            const notif = document.querySelector('#notification');
            if (chrome.runtime.lastError) {
                console.error('Error saving settings:', chrome.runtime.lastError);
                notif.textContent = 'Error saving settings.';
                notif.style.color = 'var(--danger-color)';
            } else {
                notif.textContent = 'Settings saved!';
                notif.style.color = 'var(--success-color)';
            }
            notif.classList.add('show');
            setTimeout(() => {
                notif.classList.remove('show');
            }, 3000);
        });
    });
}

// Switch to settings view
function switchToSettings() {
    document.querySelector('.main-view').classList.remove('active');
    document.querySelector('.settings-view').classList.add('active');
    document.querySelector('.placeholder-input').value = storage.settings.placeholder;
    // Hide bottom actions
    document.querySelector('#bottomActions').style.display = 'none';
    renderSettingsPresets();
}

// Switch back to main view and save placeholder
function switchToMain() {
    document.querySelector('.settings-view').classList.remove('active');
    document.querySelector('.main-view').classList.add('active');
    const placeholder = document.querySelector('.placeholder-input').value.trim();
    storage.settings.placeholder = placeholder || '$lang';
    chrome.storage.local.set({ settings: storage.settings });
    // Show bottom actions
    document.querySelector('#bottomActions').style.display = 'flex';
}

// Render presets in main view
function renderPresets() {
    const container = document.querySelector('.presets');
    container.innerHTML = '';
    for (const [key, preset] of Object.entries(storage.settings.presets)) {
        const div = document.createElement('div');
        div.className = 'preset';
        div.style.borderTopColor = preset.color; // Used border-top instead of border-color for a modern look
        
        // Prevent XSS by using textContent for preset name
        const textDiv = document.createElement('div');
        textDiv.textContent = preset.name;
        div.appendChild(textDiv);
        
        div.addEventListener('click', () => openPreset(preset));
        container.appendChild(div);
    }
}

// Open tabs for a preset and group them
async function openPreset(preset) {
    const url = document.querySelector('.url-input').value.trim();
    const placeholder = storage.settings.placeholder;
    if (!url || !url.includes(placeholder)) {
        alert('Please enter a valid URL containing the placeholder.');
        return;
    }
    const tabs = [];
    for (const lang of preset.langs) {
        const newUrl = url.replaceAll(placeholder, lang);
        try {
            const tab = await chrome.tabs.create({ url: newUrl, active: false });
            tabs.push(tab.id);
        } catch (e) {
            console.error('Error creating tab:', e);
        }
    }
    if (tabs.length > 0) {
        try {
            const group = await chrome.tabs.group({ tabIds: tabs });
            await chrome.tabGroups.update(group, { title: preset.name, color: preset.color });
        } catch (e) {
            console.error('Error grouping tabs:', e);
        }
    }
}

// Open modal for creating/editing presets
function openModal(isEdit = false, key = null) {
    const modal = document.querySelector('.modal');
    const h3 = modal.querySelector('h3');
    const nameInput = modal.querySelector('.preset-name');
    const langsInput = modal.querySelector('.langs-input');
    const colorSelect = modal.querySelector('.color-select');
    const error = modal.querySelector('.error');

    h3.textContent = isEdit ? 'Edit Preset' : 'Create Preset';
    nameInput.value = '';
    langsInput.value = '';
    colorSelect.value = 'blue';
    error.textContent = '';

    // Pre-fill for edit
    if (isEdit) {
        const preset = storage.settings.presets[key];
        if (!preset) {
            // Guard against stale reference
            alert('Preset not found.');
            return;
        }
        nameInput.value = preset.name;
        langsInput.value = preset.langs.join(', ');
        colorSelect.value = preset.color;
    }

    modal.classList.add('show');
    updateColorPreview(colorSelect);

    // Replace the element to remove all previously stacked change listeners
    const newColorSelect = colorSelect.cloneNode(true);
    colorSelect.parentNode.replaceChild(newColorSelect, colorSelect);
    newColorSelect.value = isEdit ? storage.settings.presets[key].color : 'blue';
    updateColorPreview(newColorSelect);
    newColorSelect.addEventListener('change', () => {
        updateColorPreview(newColorSelect);
    });
    const freshColorSelect = newColorSelect;

    modal.querySelector('.save-btn').onclick = () => {
        const name = nameInput.value.trim();
        const langs = langsInput.value.split(',').map(l => l.trim()).filter(l => l);
        const color = freshColorSelect.value;

        if (!name) {
            error.textContent = 'Preset name is required.';
            return;
        }
        if (langs.length === 0) {
            error.textContent = 'At least one language is required.';
            return;
        }
        if (!isEdit && storage.settings.presets[name]) {
            error.textContent = 'Preset name already exists.';
            return;
        }
        if (isEdit && key !== name && storage.settings.presets[name]) {
            error.textContent = 'Preset name already exists.';
            return;
        }

        if (isEdit) {
            delete storage.settings.presets[key];
        }
        storage.settings.presets[name] = { name, langs, color };
        chrome.storage.local.set({ settings: storage.settings });
        renderPresets();
        renderSettingsPresets();
        modal.classList.remove('show');
    };

    modal.querySelector('.cancel-btn').onclick = () => {
        modal.classList.remove('show');
    };
}

// Render presets in settings view
function renderSettingsPresets() {
    const container = document.querySelector('.settings-presets');
    container.innerHTML = '';
    for (const [key, preset] of Object.entries(storage.settings.presets)) {
        const div = document.createElement('div');
        div.className = 'settings-preset';
        div.style.borderTopColor = preset.color; // Using top border for modern look
        
        // Prevent XSS by using textContent
        const textDiv = document.createElement('div');
        textDiv.textContent = preset.name;
        div.appendChild(textDiv);
        
        // Add buttons
        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn';
        editBtn.textContent = '✏️';
        editBtn.title = 'Edit';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '✕';
        deleteBtn.title = 'Delete';
        
        div.appendChild(editBtn);
        div.appendChild(deleteBtn);
        
        div.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-btn')) {
                // Add native confirm before deletion
                if (confirm(`Are you sure you want to delete the preset "${preset.name}"?`)) {
                    delete storage.settings.presets[key];
                    chrome.storage.local.set({ settings: storage.settings });
                    renderSettingsPresets();
                    renderPresets();
                }
            } else if (e.target.classList.contains('edit-btn')) {
                openModal(true, key);
            }
        });
        container.appendChild(div);
    }
}

// Initialize on load
loadData();
setupEventListeners();
