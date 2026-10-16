// Global storage object for settings
let storage = { settings: { presets: {} } };

// DEFAULT_CTX_TOOLS comes from ctx-tools-defaults.js (loaded before this file in popup.html)

// In-memory copy of context menu tools (order + enabled state)
let ctxTools = [];

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
        let pageUrl;
        try {
            pageUrl = new URL(tab.url);
        } catch (e) {
            alert('Invalid URL.');
            return;
        }

        // If the current page is on a supported live domain, use Live→Editor logic
        const brand = liveBrandFor(pageUrl);
        if (brand) {
            // --- Live → Editor path ---
            if (URL_PARSEABLE_BRANDS.has(brand)) {
                // Brand doesn't expose logoutResource; parse AEM path directly from the live URL
                const editorPath = buildEditorPathFromLiveUrl(tab.url, brand);
                if (!editorPath) {
                    alert('Could not parse AEM path from URL.');
                    return;
                }
                chrome.tabs.create({ url: `https://${AUTHOR_HOSTNAME}/editor.html${editorPath}` });
            } else {
                // Standard path: inject script to scrape logoutResource from page HTML
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
            }
        } else {
            // --- Preview / Author → Editor path ---
            openEditorFromPreview();
        }
    });
}

const BRAND_DOMAIN_MAP = {
    ita:     'https://www.ita-airways.com',
    lh:      'https://www.lufthansa.com',
    lx:      'https://www.swiss.com',
    lxc:     'https://www.swiss.com/corporate',
    bel:     'https://www.brusselsairlines.com',
    aua:     'https://www.austrian.com',
    fly_lh:  'https://wifi.lufthansa.com',
    fly_aua: 'https://wifi.austrian.com',
    fly_lx:  'https://wifi.swiss.com',
    b2bneo:  'https://business.lufthansagroup.com',
};

// Single shared AEM author hostname for all brands
const AUTHOR_HOSTNAME = 'author-airem-prod.lufthansa.com';

// Map live domain → brand code (used to build /content/{brand}/gc/... path)
const LIVE_DOMAIN_TO_BRAND = {
    'www.lufthansa.com':           'lh',
    'www.swiss.com':               'lx',
    'www.brusselsairlines.com':    'bel',
    'www.austrian.com':            'aua',
    'www.ita-airways.com':         'ita',
    'wifi.lufthansa.com':          'fly_lh',
    'wifi.austrian.com':           'fly_aua',
    'wifi.swiss.com':              'fly_lx',
    'business.lufthansagroup.com': 'B2Bneo',
};

// Brands whose AEM path is /content/{brand}/{lang}/{path} — no 'gc' or 'markets' segment.
const DIRECT_LANG_BRANDS = new Set(['lxc']);

// Brands whose live URL uses /{lang}/{path} only — no country segment before the language.
const NO_COUNTRY_BRANDS = new Set(['lxc']);

// Path-prefix overrides for brands that share a live domain with another brand.
// Key = hostname; value = ordered list of { pathPrefix, brand } checked top to bottom.
const LIVE_PATH_BRAND_OVERRIDES = {
    'www.swiss.com': [{ pathPrefix: '/corporate/', brand: 'lxc' }],
};

function liveBrandFor(url) {
    const override = (LIVE_PATH_BRAND_OVERRIDES[url.hostname] || []).find(o => url.pathname.startsWith(o.pathPrefix));
    return override ? override.brand : LIVE_DOMAIN_TO_BRAND[url.hostname];
}

// Brands whose live URLs expose the full AEM path directly (no logoutResource in HTML).
// For these, the Editor button parses the URL instead of injecting a page script.
const URL_PARSEABLE_BRANDS = new Set(['B2Bneo', 'lxc']);

// Derives the AEM content path from a live URL for URL_PARSEABLE_BRANDS.
// Live URL structure: {brand domain}/{country}/{lang}/{page…}, without the country for
// NO_COUNTRY_BRANDS; the brand domain may carry a path of its own (/corporate).
function buildEditorPathFromLiveUrl(liveUrl, brand) {
    const parsed = new URL(liveUrl);
    const base = new URL(BRAND_DOMAIN_MAP[brand.toLowerCase()]).pathname.replace(/\/+$/, '');
    const path = parsed.pathname.startsWith(base + '/') ? parsed.pathname.slice(base.length) : parsed.pathname;
    const segments = path.split('/').filter(Boolean);
    const langIndex = NO_COUNTRY_BRANDS.has(brand) ? 0 : 1;
    const lang = segments[langIndex];
    const pagePath = segments.slice(langIndex + 1).join('/');
    if (!lang || !pagePath) return null;
    const langFolder = DIRECT_LANG_BRANDS.has(brand) ? lang : `gc/${lang}`;
    return `/content/${brand}/${langFolder}/${pagePath}.html`;
}

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
    if (DIRECT_LANG_BRANDS.has(getBrand(segments))) {
        return segments[contentIndex + 2]?.replace(/\.html$/i, '').toLowerCase() || null;
    }
    return null;
}

function extractCountry(segments) {
    const contentIndex = segments.indexOf('content');
    // All fly_* brands use 'xs' as the market segment — no 'xx' country in their live URLs
    if (getBrand(segments)?.startsWith('fly_')) return 'xs';
    if (isMarketsFormat(segments)) {
        return segments[contentIndex + 3]?.toLowerCase() || null;
    }
    // gc pages: the market the airline uses for this language (LOCALES), else the 'xx' default
    const brand = getBrand(segments);
    const language = extractLanguage(segments);
    const locale = (LOCALES[brand] || []).find(l => l.includes('/') && localeLang(l) === language);
    return locale ? locale.split('/')[0] : 'xx';
}

function extractPagePath(segments) {
    const contentIndex = segments.indexOf('content');
    let startIndex = null;
    if (isGcFormat(segments)) {
        startIndex = contentIndex + 4;
    } else if (isMarketsFormat(segments)) {
        startIndex = contentIndex + 5;
    } else if (DIRECT_LANG_BRANDS.has(getBrand(segments))) {
        startIndex = contentIndex + 3;
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

// country === null leaves the country segment out (NO_COUNTRY_BRANDS).
function buildLiveUrl(domain, country, language, pagePath) {
    const normalizedLanguage = language || '';
    const trimmedPath = pagePath.replace(/\/+$|^\/+/, '');
    if (country === null) return `${domain}/${normalizedLanguage}/${trimmedPath}`;
    return `${domain}/${country || 'xx'}/${normalizedLanguage}/${trimmedPath}`;
}

function transformLiveUrl(url) {
    try {
        const parsed = new URL(url);
        const segments = parsed.pathname.replace(/\/+$|^\/+/, '').split('/').filter(Boolean);

        const brand = getBrand(segments);
        const mappedDomain = getMappedDomain(brand);
        const language = extractLanguage(segments);
        const country = NO_COUNTRY_BRANDS.has(brand) ? null : (extractCountry(segments) || 'xx');
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

// ── Locales ────────────────────────────────────────────────────────────────

// Market/language pairs per airline, as used on the live sites — just the language for
// NO_COUNTRY_BRANDS. The language part doubles as the AEM language folder
// (/content/{brand}/gc/{lang}/…, or /content/{brand}/{lang}/… for DIRECT_LANG_BRANDS).
const LOCALES = {
    lh:  ['de/de', 'de/en', 'gr/el', 'es/es', 'fr/fr', 'cn/hk', 'it/it', 'jp/ja', 'kr/ko', 'pl/pl', 'br/pt', 'ru/ru', 'cn/zh'],
    aua: ['at/de', 'at/en', 'fr/fr', 'gr/el', 'it/it', 'jp/ja', 'pl/pl', 'es/es', 'ru/ru', 'cn/zh'],
    lx:  ['ch/de', 'ch/en', 'gr/el', 'es/es', 'ch/fr', 'ch/it', 'jp/ja', 'kr/ko', 'br/pt', 'ru/ru', 'cn/zh'],
    lxc: ['de', 'en', 'fr'],
    ita: ['it/en', 'it/it', 'fr/fr', 'br/pt', 'nl/nl', 'es/es', 'gr/el', 'jp/ja', 'de/de'],
    bel: ['de/de', 'be/en', 'es/es', 'be/fr', 'it/it', 'be/nl']
};
const localeLang = (locale) => locale.split('/').pop();
// Tab group label (airline code) and colour per airline.
const LOCALE_GROUPS = { lh: ['LH', 'yellow'], aua: ['OS', 'red'], lx: ['LX', 'red'], lxc: ['LXC', 'grey'], ita: ['ITA', 'green'], bel: ['SN', 'blue'] };

// Live page → the same page on every live market/language (path from logoutResource, or from
// the URL for URL_PARSEABLE_BRANDS). Preview/author/editor page → the editor page for every
// language (path from the URL).
function openLocales() {
    const btn = document.querySelector('#localesBtn');

    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (!tabs || !tabs[0] || !tabs[0].url) {
            alert('Unable to detect the current page URL.');
            return;
        }
        const tab = tabs[0];
        let url;
        try {
            url = new URL(tab.url);
        } catch (e) {
            alert('Invalid URL.');
            return;
        }

        const liveBrand = liveBrandFor(url);
        if (liveBrand) {
            if (!LOCALES[liveBrand]) {
                alert('Locales is not set up for this site.');
                return;
            }
            const domain = BRAND_DOMAIN_MAP[liveBrand];
            if (URL_PARSEABLE_BRANDS.has(liveBrand)) {
                const contentPath = buildEditorPathFromLiveUrl(tab.url, liveBrand);
                const pagePath = contentPath && extractPagePath(contentPath.split('/').filter(Boolean));
                if (!pagePath) {
                    alert('Could not parse the page path from this URL.');
                    return;
                }
                openLocaleTabs(LOCALES[liveBrand].map(locale => `${domain}/${locale}/${pagePath}`), liveBrand, pagePath);
                return;
            }
            const originalText = btn.textContent;
            btn.textContent = 'Loading...';
            btn.classList.add('loading');

            chrome.scripting.executeScript(
                { target: { tabId: tab.id }, func: extractLogoutResource, world: 'MAIN' },
                (results) => {
                    btn.textContent = originalText;
                    btn.classList.remove('loading');

                    if (chrome.runtime.lastError) {
                        alert('Error reading page: ' + chrome.runtime.lastError.message);
                        return;
                    }
                    const contentPath = results && results[0] && results[0].result;
                    const pagePath = contentPath && extractPagePath(contentPath.split('/').filter(Boolean));
                    if (!pagePath) {
                        alert('Could not find logoutResource on this page.\nMake sure you are on a supported live page.');
                        return;
                    }
                    openLocaleTabs(LOCALES[liveBrand].map(locale => `${domain}/${locale}/${pagePath}`), liveBrand, pagePath);
                }
            );
            return;
        }

        const segments = url.pathname.split('/').filter(Boolean);
        const brand = getBrand(segments);
        const pagePath = extractPagePath(segments);
        if (!brand || !pagePath) {
            alert('Open a live, preview or editor page of an airline first.');
            return;
        }
        if (!LOCALES[brand]) {
            alert(`Locales is not set up for "${brand}".`);
            return;
        }
        const contentBrand = segments[segments.indexOf('content') + 1];
        const langFolder = (locale) => (DIRECT_LANG_BRANDS.has(brand) ? localeLang(locale) : `gc/${localeLang(locale)}`);
        openLocaleTabs(
            LOCALES[brand].map(locale => `https://${AUTHOR_HOSTNAME}/editor.html/content/${contentBrand}/${langFolder(locale)}/${pagePath}.html`),
            brand,
            pagePath
        );
    });
}

async function openLocaleTabs(urls, brand, pagePath) {
    const created = await Promise.allSettled(urls.map(u => chrome.tabs.create({ url: u, active: false })));
    const tabIds = [];
    created.forEach(r => {
        if (r.status === 'fulfilled') tabIds.push(r.value.id);
        else console.error('Error creating tab:', r.reason);
    });
    if (!tabIds.length) return;
    try {
        const [code, color] = LOCALE_GROUPS[brand];
        const group = await chrome.tabs.group({ tabIds });
        await chrome.tabGroups.update(group, { title: `${code} · ${pagePath.split('/').pop()}`, color });
    } catch (e) {
        console.error('Error grouping tabs:', e);
    }
}

// Load settings from Chrome storage
function loadData() {
    chrome.storage.local.get(['settings', 'contextMenuTools'], (result) => {
        storage.settings = result.settings || { presets: {} };
        if (!storage.settings.presets) storage.settings.presets = {};

        // Load context menu tools (sync titles with DEFAULT_CTX_TOOLS to pick up name changes)
        if (result.contextMenuTools) {
            ctxTools = result.contextMenuTools.map(tool => {
                const defaultDef = DEFAULT_CTX_TOOLS.find(d => d.id === tool.id);
                return defaultDef ? { ...tool, title: defaultDef.title } : tool;
            });
            
            // Append any NEW tools that were added to DEFAULT_CTX_TOOLS but aren't in storage yet
            DEFAULT_CTX_TOOLS.forEach(defaultTool => {
                if (!ctxTools.find(t => t.id === defaultTool.id)) {
                    ctxTools.push(JSON.parse(JSON.stringify(defaultTool)));
                }
            });
        } else {
            ctxTools = JSON.parse(JSON.stringify(DEFAULT_CTX_TOOLS));
        }

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
    document.querySelector('#localesBtn').addEventListener('click', openLocales);
    document.querySelector('.add-preset-btn').addEventListener('click', () => openModal());
    document.querySelector('.save-settings-btn').addEventListener('click', () => {
        // Persist both presets and context menu tools in one write
        chrome.storage.local.set({
            settings: storage.settings,
            contextMenuTools: ctxTools
        }, () => {
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
    // Hide bottom actions
    document.querySelector('#bottomActions').style.display = 'none';
    renderSettingsPresets();
    renderCtxTools();
}

// Switch back to main view
function switchToMain() {
    document.querySelector('.settings-view').classList.remove('active');
    document.querySelector('.main-view').classList.add('active');
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
    const placeholder = preset.placeholder || '$lang';
    if (!url || !url.includes(placeholder)) {
        alert(`Please enter a valid URL containing the placeholder "${placeholder}".`);
        return;
    }
    const results = await Promise.allSettled(
        preset.langs.map(lang => chrome.tabs.create({ url: url.replaceAll(placeholder, lang), active: false }))
    );
    const tabs = [];
    results.forEach(r => {
        if (r.status === 'fulfilled') {
            tabs.push(r.value.id);
        } else {
            console.error('Error creating tab:', r.reason);
        }
    });
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
    const placeholderInput = modal.querySelector('.placeholder-input');
    const colorSelect = modal.querySelector('.color-select');
    const error = modal.querySelector('.error');

    h3.textContent = isEdit ? 'Edit Preset' : 'Create Preset';
    nameInput.value = '';
    langsInput.value = '';
    placeholderInput.value = '';
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
        placeholderInput.value = preset.placeholder || '$lang';
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
        const placeholder = placeholderInput.value.trim() || '$lang';
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
        storage.settings.presets[name] = { name, langs, placeholder, color };
        chrome.storage.local.set({ settings: storage.settings });
        renderPresets();
        renderSettingsPresets();
        modal.classList.remove('show');
    };

    modal.querySelector('.cancel-btn').onclick = () => {
        modal.classList.remove('show');
    };
}

// ── Context Menu Tools – render, drag-to-reorder, toggle ───────────────────

/**
 * Renders the context menu tools list in the settings view.
 * Each item is draggable for reorder and has a toggle switch.
 */
function renderCtxTools() {
    const list = document.getElementById('ctxToolsList');
    list.innerHTML = '';

    let dragSrcIndex = null;

    ctxTools.forEach((tool, index) => {
        const li = document.createElement('li');
        li.draggable = true;
        li.dataset.index = index;

        // ── Drag handle ──
        const handle = document.createElement('span');
        handle.className = 'drag-handle';
        handle.textContent = '⠿';
        handle.title = 'Drag to reorder';

        // ── Title ──
        const title = document.createElement('span');
        title.className = 'ctx-tool-title';
        title.textContent = tool.title;

        // ── Toggle switch ──
        const toggle = document.createElement('label');
        toggle.className = 'toggle-switch';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = tool.enabled;
        checkbox.addEventListener('change', () => {
            ctxTools[index].enabled = checkbox.checked;
        });

        const slider = document.createElement('span');
        slider.className = 'toggle-slider';

        toggle.appendChild(checkbox);
        toggle.appendChild(slider);

        li.appendChild(handle);
        li.appendChild(title);
        li.appendChild(toggle);

        // ── Drag events ──
        li.addEventListener('dragstart', (e) => {
            dragSrcIndex = index;
            li.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', index);
        });

        li.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            // Clear previous drag-over indicators
            list.querySelectorAll('li').forEach(el => el.classList.remove('drag-over'));
            li.classList.add('drag-over');
        });

        li.addEventListener('dragleave', () => {
            li.classList.remove('drag-over');
        });

        li.addEventListener('drop', (e) => {
            e.preventDefault();
            li.classList.remove('drag-over');
            const targetIndex = parseInt(li.dataset.index, 10);
            if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;

            // Reorder the in-memory array
            const [moved] = ctxTools.splice(dragSrcIndex, 1);
            ctxTools.splice(targetIndex, 0, moved);

            // Re-render to reflect the new order
            renderCtxTools();
        });

        li.addEventListener('dragend', () => {
            list.querySelectorAll('li').forEach(el => {
                el.classList.remove('dragging', 'drag-over');
            });
            dragSrcIndex = null;
        });

        list.appendChild(li);
    });
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
