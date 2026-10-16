// Shared context-menu tool defaults (also used by popup.js)
importScripts('ctx-tools-defaults.js');

// ============================================================================
// CONTEXT MENU SYSTEM — LH AuthorKit QA & CMS Tools
// ============================================================================
//
// HOW TO ADD A NEW CONTEXT MENU ITEM:
// 1. Add a new entry to DEFAULT_CTX_TOOLS in ctx-tools-defaults.js.
// 2. Add a matching `case` in the onClicked switch statement further down.
// 3. Write the injected function and reference it in the case.

let isRebuildingMenus = false;
let pendingRebuild = false;

/**
 * Tear down and rebuild the entire context menu tree based on the user's
 * saved preferences (order + enabled state). Falls back to DEFAULT_CTX_TOOLS
 * on first run or if no preferences exist yet.
 * 
 * Uses a mutex flag (isRebuildingMenus) so rapid or concurrent calls
 * (e.g. storage change + message) serialize cleanly instead of racing.
 */
function rebuildContextMenus() {
    if (isRebuildingMenus) {
        pendingRebuild = true;
        return;
    }
    isRebuildingMenus = true;

    chrome.contextMenus.removeAll(() => {
        if (chrome.runtime.lastError) {
            // Handle/clear any error from removeAll
        }

        chrome.storage.local.get(["contextMenuTools"], (result) => {
            const savedTools = result.contextMenuTools || DEFAULT_CTX_TOOLS;
            // Sync titles with DEFAULT_CTX_TOOLS in case tool names changed
            const tools = savedTools.map(tool => {
                const defaultDef = DEFAULT_CTX_TOOLS.find(d => d.id === tool.id);
                return defaultDef ? { ...tool, title: defaultDef.title } : tool;
            });
            
            // Append any NEW tools that were added to DEFAULT_CTX_TOOLS but aren't in storage yet
            DEFAULT_CTX_TOOLS.forEach(defaultTool => {
                if (!tools.find(t => t.id === defaultTool.id)) {
                    tools.push(JSON.parse(JSON.stringify(defaultTool)));
                }
            });

            // Parent folder — all tools nest under this entry
            chrome.contextMenus.create({
                id: "lh-authorkit-parent",
                title: "LH AuthorKit",
                contexts: ["all"]
            }, () => {
                if (chrome.runtime.lastError) { /* ignore duplicate warnings */ }
            });

            // Create only enabled items, in the user's preferred order
            tools.forEach(tool => {
                if (!tool.enabled) return;
                chrome.contextMenus.create({
                    id: tool.id,
                    parentId: "lh-authorkit-parent",
                    title: tool.title,
                    contexts: ["all"]
                }, () => {
                    if (chrome.runtime.lastError) { /* ignore duplicate warnings */ }
                });
            });

            isRebuildingMenus = false;
            if (pendingRebuild) {
                pendingRebuild = false;
                rebuildContextMenus();
            }
        });
    });
}

// Build menus on install / update
chrome.runtime.onInstalled.addListener(() => {
    rebuildContextMenus();
});

// Rebuild when the popup sends a message after the user saves settings
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "rebuildContextMenus") {
        rebuildContextMenus();
        sendResponse({ success: true });
        return false;
    }
});

// Also rebuild if storage changes externally
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.contextMenuTools) {
        rebuildContextMenus();
    }
});

// ---------------------------------------------------------------------------
// Click handler — routes each menu item to its injected script
// ---------------------------------------------------------------------------
chrome.contextMenus.onClicked.addListener((info, tab) => {
    // Guard: only act on our own menu items and valid tabs
    if (!tab?.id) return;

    let func;

    switch (info.menuItemId) {
        case "lh-force-open-accordions":
            func = injectedForceOpenAccordions;
            break;
        case "lh-highlight-missing-alt":
            func = injectedHighlightMissingAlt;
            break;
        case "lh-reveal-headings":
            func = injectedRevealHeadings;
            break;
        case "lh-find-broken-links":
            func = injectedFindBrokenLinks;
            break;
        case "lh-scroll-to-bottom":
            func = injectedScrollToBottom;
            break;
        case "lh-check-all-checkboxes":
            func = injectedCheckAllCheckboxes;
            break;
        case "lh-reveal-hidden-fields":
            func = injectedRevealHiddenFields;
            break;
        case "lh-sync-scroll":
            handleSyncScroll(tab);
            return; // Exit early, handleSyncScroll manages its own async script injections
        // To add a new tool: add a new case here that maps to your function.
        default:
            return; // Unknown item — do nothing
    }

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: func
    });
});

// ============================================================================
// ASYNC WORKFLOWS
// ============================================================================

/**
 * Sync Scroll in Tab Group
 * 1. Grabs the current scroll percentage from the active tab.
 * 2. Queries all other tabs in the same Chrome Tab Group.
 * 3. Injects a script into each sibling tab to scroll them to the matching percentage.
 */
async function handleSyncScroll(activeTab) {
    if (activeTab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
        console.warn("[LH AuthorKit] Active tab is not in a tab group. Cannot sync scroll.");
        return;
    }

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: injectedScrollPosition
        });

        const scrollPercentage = results[0].result;

        const siblingTabs = await chrome.tabs.query({ groupId: activeTab.groupId });

        const outcomes = await Promise.allSettled(
            siblingTabs
                .filter(sibling => sibling.id !== activeTab.id)
                .map(sibling => chrome.scripting.executeScript({
                    target: { tabId: sibling.id },
                    func: injectedScrollPosition,
                    args: [scrollPercentage]
                }))
        );
        outcomes.forEach(o => {
            if (o.status === 'rejected') console.warn("[LH AuthorKit] Could not sync scroll on a tab:", o.reason);
        });
    } catch (error) {
        console.error("[LH AuthorKit] Error syncing scroll:", error);
    }
}

// ============================================================================
// INJECTED FUNCTIONS — each runs in the page's isolated world
// ============================================================================

/**
 * Scroll position as a 0–1 fraction. Called with no argument it reads the
 * position; called with a fraction it scrolls there.
 * The AEM editor stretches iframe#ContentFrame to full page height and scrolls
 * the #ContentScrollView panel instead of the window, so prefer that panel.
 * Instant, not smooth: sibling tabs are in the background, where Chrome may
 * never run a smooth-scroll animation.
 */
function injectedScrollPosition(percentage) {
    const aemView = document.getElementById("ContentScrollView");
    const el = aemView && aemView.scrollHeight > aemView.clientHeight
        ? aemView
        : (document.scrollingElement || document.documentElement);
    const maxScroll = el.scrollHeight - el.clientHeight;

    if (percentage === undefined) {
        return maxScroll > 0 ? el.scrollTop / maxScroll : 0;
    }
    if (maxScroll > 0) {
        el.scrollTo({ top: maxScroll * percentage, behavior: "instant" });
    }
}

/**
 * Force Open Custom Accordions
 * Penetrates Shadow DOMs of <maui-collapsible-item> web components,
 * removes the "hidden" class from .expandable-pane, and forces display.
 */
function injectedForceOpenAccordions() {
    const items = document.querySelectorAll("maui-collapsible-item");
    let count = 0;

    items.forEach(item => {
        const root = item.shadowRoot;
        if (!root) return;

        const pane = root.querySelector(".expandable-pane");
        if (pane) {
            pane.classList.remove("hidden");
            pane.style.display = "block";
            count++;
        }
    });

    console.log(`[LH AuthorKit] Forced open ${count} accordion(s).`);
}

/**
 * Highlight Missing Alt Text
 * Finds every <img> with no alt attribute or an empty alt attribute
 * and applies a prominent red border.
 */
function injectedHighlightMissingAlt() {
    const imgs = document.querySelectorAll('img:not([alt]), img[alt=""]');
    let count = 0;

    imgs.forEach(img => {
        img.style.outline = "4px solid red";
        img.style.outlineOffset = "2px";
        count++;
    });

    console.log(`[LH AuthorKit] Highlighted ${count} image(s) missing alt text.`);
}

/**
 * Reveal Headings
 * Prepends a small red badge (e.g. [H1]) inside every heading element
 * so the document's heading hierarchy is immediately visible.
 */
function injectedRevealHeadings() {
    const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
    let count = 0;

    headings.forEach(heading => {
        // Avoid duplicating badges on repeated runs
        if (heading.querySelector(".lh-heading-badge")) return;

        const level = heading.tagName; // "H1", "H2", etc.
        const badge = document.createElement("span");
        badge.className = "lh-heading-badge";
        badge.textContent = `[${level}] `;
        badge.style.cssText =
            "color: red; font-weight: bold; font-size: 12px; " +
            "font-family: monospace; margin-right: 4px;";

        heading.prepend(badge);
        count++;
    });

    console.log(`[LH AuthorKit] Revealed ${count} heading(s).`);
}

/**
 * Find Broken Links
 * Highlights anchors with href="#" or href starting with "javascript:"
 * using a yellow background and dashed border.
 */
function injectedFindBrokenLinks() {
    const selectors = 'a[href="#"], a[href^="javascript"]';
    const links = document.querySelectorAll(selectors);
    let count = 0;

    links.forEach(link => {
        link.style.backgroundColor = "yellow";
        link.style.outline = "2px dashed orange";
        link.style.outlineOffset = "1px";
        count++;
    });

    console.log(`[LH AuthorKit] Found ${count} broken/placeholder link(s).`);
}

/**
 * Scroll to Bottom
 * Smoothly scrolls to the very bottom of the page (or of the AEM editor's content panel).
 */
function injectedScrollToBottom() {
    // Same scroller lookup as injectedScrollPosition — injected functions are serialized, so they can't share helpers.
    const aemView = document.getElementById("ContentScrollView");
    const el = aemView && aemView.scrollHeight > aemView.clientHeight
        ? aemView
        : (document.scrollingElement || document.documentElement);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });

    console.log("[LH AuthorKit] Scrolling to bottom.");
}

/**
 * Check All Checkboxes
 * Programmatically checks every checkbox on the page and dispatches
 * a change event so frameworks pick up the state change.
 */
function injectedCheckAllCheckboxes() {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    let count = 0;

    checkboxes.forEach(cb => {
        if (!cb.checked) {
            cb.checked = true;
            cb.dispatchEvent(new Event("change", { bubbles: true }));
            count++;
        }
    });

    console.log(`[LH AuthorKit] Checked ${count} checkbox(es).`);
}

/**
 * Reveal Hidden Fields
 * Converts every hidden input to a visible text input and applies
 * a blue border so they stand out.
 */
function injectedRevealHiddenFields() {
    const fields = document.querySelectorAll('input[type="hidden"]');
    let count = 0;

    fields.forEach(field => {
        field.type = "text";
        field.style.outline = "3px solid dodgerblue";
        field.style.outlineOffset = "2px";
        field.style.padding = "4px";
        field.style.margin = "4px 0";
        field.style.display = "block";
        count++;
    });

    console.log(`[LH AuthorKit] Revealed ${count} hidden field(s).`);
}
