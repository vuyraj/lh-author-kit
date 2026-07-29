# LH Author Kit

A Chrome extension for developers and QA testers to quickly launch multiple localized or variant URLs in grouped tabs.

## Features

- **Dynamic Placeholder System**: Use a configurable placeholder (e.g., `$lang`) in base URLs to replace with preset values.
- **Preset Management**: Create, edit, and delete presets with names, language lists, and random colors.
- **Tab Launching**: Click a preset to open multiple tabs with replaced URLs, automatically grouped in Chrome Tab Groups.
- **Settings Panel**: Manage presets, edit the placeholder, and save configurations.
- **Modern UI**: Dark theme with smooth transitions and hover effects.

## Installation

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable "Developer mode" in the top right.
4. Click "Load unpacked" and select the project folder (`/path/to/url_opener`).
5. The extension icon should appear in the toolbar.

![Installation Guide](/guide/installation.png)

## Usage

![Installation Guide](/guide/editor.png)

### Basic Workflow

![Installation Guide](/guide/workflow.png)

1. Click the extension icon to open the popup.
2. The URL input is pre-filled with the current tab's URL (edit it to include the placeholder, e.g., `https://example.com/$lang/page`).
3. Go to Settings (⚙️ icon) to manage presets.
4. Create presets with a name and comma-separated languages (e.g., `en,fr,de`).
5. Back to main view, click a preset to launch tabs:
   - Each language replaces the placeholder.
   - Tabs open in the background and are grouped by preset name and color.

### Managing Presets
- In Settings, view existing presets.
- Click "Add Preset" to create new ones.
- Hover over presets to show edit (✏️) and delete (✕) buttons.
- Edit pre-fills the modal with existing data.
- Colors are assigned randomly for new presets; existing colors are retained.

### Settings
- Change the placeholder string (default: `$lang`).
- Manage all presets in one place.
- Click "Save Settings" to persist changes (auto-saved on edits).

## File Structure

- `manifest.json`: Extension metadata and permissions.
- `popup.html`: HTML structure with inline CSS.
- `popup.js`: JavaScript logic for UI, storage, and tab management.

## Permissions

- `storage`: Save presets and settings locally.
- `activeTab`: Access the current tab's URL.
- `tabs`: Query and create tabs.
- `tabGroups`: Group created tabs.

## Development

- Built for Manifest V3.
- No external dependencies.
- Uses Chrome APIs for storage, tabs, and tab groups.

## Troubleshooting

- If tabs don't group, ensure Chrome Tab Groups are enabled.
- Reload the extension after changes.
- Check console for errors (inspect popup via right-click > Inspect).
