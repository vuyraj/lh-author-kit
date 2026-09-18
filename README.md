# LH Author Kit ✈️

**LH Author Kit** is a handy browser assistant built for content authors, marketing editors, translators, and QA testers working across Lufthansa Group websites (Lufthansa, SWISS, Austrian Airlines, Brussels Airlines, ITA Airways, and more).

It eliminates everyday repetitive tasks:
- 🚀 **Open multiple language pages at once** (e.g. German, French, Italian, English) neatly grouped into colored tabs.
- ⚡ **Switch between live websites and the AEM editor** in one click no more searching for URLs.
- 🛠️ **Right-click QA tools** to inspect images, headlines, accordions, and links right on the page.

---

## 📸 Overview & Quick Tour

| Feature | What it looks like |
|---|---|
| **Batch URL Opener** | ![Workflow Guide](/guide/workflow.png) |
| **One-Click Editor & Live** | ![Editor Guide](/guide/editor.png) |

---

## ✨ What Can It Do For You?

### 1. 📂 Open Multiple Country & Language Pages in One Click
Instead of manually opening 10 browser tabs and typing in different country or language codes:
- Put `$lang` in your web address (e.g., `https://example.com/$lang/flights`).
- Click a button like **"European Markets"**.
- The extension automatically opens all your language versions in separate tabs and groups them into a tidy, colored **Chrome Tab Group**.

---

### 2. 🧭 One-Click Navigation Buttons (Bottom of Popup)

At the bottom of the extension window, you have three quick-action buttons:

- **✏️ Editor**: Jump straight from any live website page into its exact **AEM editing screen** without copying, pasting, or guessing the authoring link.
- **🌐 Live**: Working in AEM preview? Click **Live** to instantly see how that exact page looks on the public website.
- **🔍 QA**: Runs an automated health check on the page and shows an easy-to-read diagnostic overlay on top of your page.

---

### 3. 🖱️ Right-Click QA Tools (Available on Any Webpage!)

Right-click anywhere on any page, hover over **"LH AuthorKit"**, and choose a tool:

| Tool Name | What it does for you (Plain English) |
|---|---|
| 📂 **Open Accordions** | Opens every collapsed FAQ or expandable section on the page at once. You don't have to click each one individually to review the content! |
| 🖼️ **Highlight Missing Alt Text** | Puts a thick **red border** around any image missing an image description. Super helpful for checking accessibility and SEO requirements before publishing. |
| 🏷️ **Reveal Headings** | Puts small red tags like **`[H1]`**, **`[H2]`**, **`[H3]`** right next to titles on the page so you can easily verify that headline levels are in the right order. |
| 🔗 **Find Broken Links** | Highlights placeholder links (like links pointing to `#` or unfinished buttons) in **bright yellow** so you can catch missing links before going live. |
| ⬇️ **Scroll to Bottom** | Smoothly scrolls down to the very bottom of the page, triggering any lazy-loading content or footers. |
| ☑️ **Check All Checkboxes** | Checks every checkbox on the page at once. Saves lots of clicking when testing complex forms! |
| 👁️ **Reveal Hidden Fields** | Makes hidden form fields visible on the page with a **blue outline** so you can inspect tracking and form values. |

---

### 4. ⚙️ Customize Your Right-Click Menu

You can easily customize which tools appear when you right-click:

1. Click the **LH Author Kit** icon in your browser toolbar.
2. Click the **Gear icon (⚙️ Settings)** in the top-left corner.
3. Scroll down to **"Context Menu Tools"**:
   - **Turn tools On or Off**: Click the toggle switch next to any tool you don't use often.
   - **Reorder by priority**: Click and drag the **`⠿`** handle up or down to place your favorite tools at the top.
4. Click **"Save Settings"**. Your right-click menu updates immediately!

---

## 📥 How to Install (Takes 1 Minute)

1. Download or unzip this project folder onto your computer.
2. In Google Chrome, go to `chrome://extensions/`.
3. In the top-right corner, turn on **"Developer mode"**.
4. Click the **"Load unpacked"** button in the top-left.
5. Select the **`lh-author-kit`** folder.
6. Click the **Puzzle piece icon** in Chrome's toolbar and **Pin 📌** LH Author Kit so it's always one click away!

![Installation Guide](/guide/installation.png)

---

## ❓ Frequently Asked Questions (FAQ)

<details>
<summary><b>Why did my tabs not group into a colored tab group?</b></summary>
Make sure Tab Groups are enabled in your Chrome browser. When launching a preset, the extension creates a colored group named after your preset (e.g., "DACH", "Europe").
</details>

<details>
<summary><b>Does the right-click menu change anything permanently on the website?</b></summary>
No! All right-click tools only make visual changes on your screen for inspection. Simply refresh the webpage (`F5` or `Ctrl+R`) and the page returns to normal.
</details>

<details>
<summary><b>How do I add or change language presets?</b></summary>
Open the extension popup, click the <b>Settings (⚙️)</b> icon, and under <b>"Manage Presets"</b> you can click <b>"Add Preset"</b> or use the pencil icon (✏️) to edit existing ones.
</details>

---

## 🧑‍💻 Technical Reference (For Developers & IT)

<details>
<summary><b>Click to expand architecture, permissions, and file structure</b></summary>

### Architecture
- **Platform**: Chrome Extension Manifest V3.
- **Execution Model**: Script injection via `chrome.scripting.executeScript` (no continuous background content script overhead).
- **Concurrency**: `background.js` uses a mutex lock to serialize context menu rebuilds triggered by `chrome.storage.onChanged` to prevent duplicate ID warnings.

### Project Files
```text
lh-author-kit/
├── manifest.json       # Manifest V3 configuration & permission declarations
├── background.js       # Service worker handling context menus & script injections
├── popup.html          # Extension popup UI (Main view & Settings view)
├── popup.js            # UI logic, presets, drag-and-drop tool reordering
├── health-check.js     # Health check diagnostic script
├── qa-overlay.js       # Interactive QA findings overlay
├── icons/              # Extension icons (16, 48, 128px)
└── guide/              # Screenshot walkthroughs
```

### Permissions Used
- `contextMenus`: Native right-click menu actions.
- `scripting` & `activeTab`: Injecting DOM tools on demand into the active tab.
- `storage`: Saving user presets and menu preferences locally in Chrome.
- `tabs` & `tabGroups`: Creating, navigating, and grouping browser tabs.
- `host_permissions`: Access to Lufthansa Group and AEM authoring domains.

</details>
