// Default context menu tool definitions — shared between background.js (service worker,
// loaded via importScripts) and popup.js (loaded via a <script> tag in popup.html).
// The array order is the default menu order. Each entry has an `id` (used for
// contextMenus + the onClicked switch), a `title` (shown in the right-click menu),
// and `enabled` (visibility).
const DEFAULT_CTX_TOOLS = [
    { id: "lh-force-open-accordions", title: "Open Accordions",             enabled: true },
    { id: "lh-highlight-missing-alt",  title: "Highlight Missing Alt Text",  enabled: true },
    { id: "lh-reveal-headings",        title: "Reveal Headings",             enabled: true },
    { id: "lh-find-broken-links",      title: "Find Broken Links",           enabled: true },
    { id: "lh-scroll-to-bottom",       title: "Scroll to Bottom",            enabled: true },
    { id: "lh-check-all-checkboxes",   title: "Check All Checkboxes",        enabled: true },
    { id: "lh-reveal-hidden-fields",   title: "Reveal Hidden Fields",        enabled: true },
    { id: "lh-sync-scroll",            title: "Sync Scroll in Tab Group",    enabled: true }
];
