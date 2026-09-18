# LH Author Kit

**LH Author Kit** is a Manifest V3 Chrome extension designed for AEM authors, developers, and QA engineers working across Lufthansa Group digital touchpoints. It simplifies multi-market page authoring, environment switching, automated QA health checks, and DOM-level content inspection.

---

## Key Features

### 1. Preset-Based Multi-Tab Opener & Tab Grouping
- **Dynamic Placeholders**: Define base URLs containing configurable placeholders (e.g. `https://example.com/$lang/page`).
- **Preset Management**: Create custom presets with language/market lists (e.g. `en, de, fr, it`) and assigned color tags.
- **Chrome Tab Groups**: Launching a preset opens all localized URLs in background tabs automatically grouped and color-coded.

### 2. Smart Navigation Bar
- **Editor**: Smart environment detection. From live pages, it automatically resolves the underlying AEM authoring path (extracting `logoutResource` or parsing live URL structures) and opens the page directly in the AEM Editor (`author-airem-prod.lufthansa.com`). From preview/author tabs, it directly transforms the URL.
- **Live**: Converts authoring/preview URLs into live production URLs across supported Lufthansa Group brands (`LH`, `LX`, `OS`, `SN`, `ITA`, and onboard fly portals).
- **QA**: Injects automated health checks with a visual overlay reporting on page structure and component states.

### 3. Native Right-Click Context Menu QA & CMS Tools
Access a suite of DOM manipulation and inspection tools directly from the Chrome context menu under **"LH AuthorKit"**:

| Tool | Description |
|---|---|
| **Open Accordions** | Penetrates Shadow DOMs of `<maui-collapsible-item>` custom web components, removes `hidden` classes, and forces panes to expand (`display: block`). |
| **Highlight Missing Alt Text** | Identifies images without alt text (`img:not([alt])`, `img[alt=""]`) and highlights them with a prominent red outline. |
| **Reveal Headings** | Prepends red `[H1]`, `[H2]`, etc. hierarchy tags inside all heading elements to inspect document outline structure. |
| **Find Broken Links** | Flags placeholder and script links (`a[href="#"]`, `a[href^="javascript"]`) with a yellow background and dashed border. |
| **Scroll to Bottom** | Smoothly scrolls to `document.body.scrollHeight` to trigger lazy-loaded assets and scripts. |
| **Check All Checkboxes** | Programmatically checks all `input[type="checkbox"]` elements and dispatches `change` events. |
| **Reveal Hidden Fields** | Converts all `input[type="hidden"]` fields into visible text inputs styled with a blue border. |

### 4. Context Menu Tools Customizer (Settings)
- **Opt-In / Opt-Out**: Enable or disable any context menu tool using toggle switches.
- **Drag-and-Drop Reordering**: Rearrange tools to prioritize your most frequently used actions at the top of the right-click menu.
- **Reactive Sync**: Saving settings instantly rebuilds Chrome's context menu tree.

---

## Installation

1. Download or clone this repository.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the extension directory (`lh-author-kit`).
5. Pin **LH Author Kit** to your toolbar for quick access.

![Installation Guide](/guide/installation.png)

---

## Usage

### URL Batch Launching
1. Click the extension icon in your toolbar.
2. The current tab's URL is pre-filled in the **Base URL** field. Replace the locale segment with your placeholder (e.g. `$lang`).
3. Click any preset button to launch and group tabs for each configured market.

### Environment Switching & QA
- Click **Editor** at the bottom of the popup to switch from a live page to its AEM editor equivalent.
- Click **Live** to preview how an author page maps to production.
- Click **QA** to run on-page diagnostics with the overlay inspector.

### Customizing Context Menu Tools
1. Open the popup and click the **Settings (⚙️)** icon in the header.
2. Scroll to the **Context Menu Tools** section:
   - Use the **toggle switch** next to any tool to show or hide it from the right-click menu.
   - Click and drag the **handle (`⠿`)** to reorder the items according to your priority.
3. Click **Save Settings** to apply your changes immediately.
4. Right-click on any page to use your customized **LH AuthorKit** menu.

---

## Project Structure

```text
lh-author-kit/
├── manifest.json       # Manifest V3 extension configuration & permissions
├── background.js       # Background service worker (context menu registration & dynamic script injection)
├── popup.html          # Extension popup UI (Main view & Settings view)
├── popup.js            # Preset handling, URL transformation, and drag-and-drop tool manager
├── health-check.js     # Page extraction script for QA health checks
├── qa-overlay.js       # In-page UI overlay for displaying QA diagnostics
├── icons/              # Extension icons (16, 48, 128px)
└── guide/              # Documentation screenshots and assets
```

---

## Permissions

| Permission | Purpose |
|---|---|
| `contextMenus` | Creates and manages the right-click menu items. |
| `scripting` | Executes isolated modular DOM QA scripts on active tabs. |
| `activeTab` | Accesses the active page URL and executes scripts upon user request. |
| `storage` | Persists presets and context menu order/visibility preferences in `chrome.storage.local`. |
| `tabs` | Queries, opens, and manages browser tabs. |
| `tabGroups` | Creates and colors Chrome tab groups based on preset settings. |
| `host_permissions` | Allows automated fetching and script execution across Lufthansa Group domains and AEM authoring environments. |

---

## Development & Maintenance

- **Adding a New Context Menu Tool**:
  1. Add an entry to `DEFAULT_CTX_TOOLS` in both `background.js` and `popup.js`.
  2. Add a `case` in `background.js` under `chrome.contextMenus.onClicked`.
  3. Implement the corresponding `injected*` function in `background.js`.
- **Manifest V3 Standards**:
  - Context menu actions use non-persistent script injection (`chrome.scripting.executeScript`) without heavy, continuous content scripts.
  - Context menu rebuilds use concurrency mutex locks to prevent duplicate registration errors.
