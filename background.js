chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fetchPage") {
        fetch(request.url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.text();
            })
            .then(html => {
                sendResponse({ html: html });
            })
            .catch(error => {
                console.error("Fetch error:", error);
                sendResponse({ error: error.message });
            });
        return true; 
    } else if (request.action === "fetchRenderedPage") {
        chrome.tabs.create({ url: request.url, active: false }, (newTab) => {
            const tabId = newTab.id;
            
            // Wait for the tab to finish loading
            const listener = (updatedTabId, changeInfo) => {
                if (updatedTabId === tabId && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    
                    // Give the SPA 2.5 seconds to fully render its content
                    setTimeout(() => {
                        chrome.scripting.executeScript({
                            target: { tabId: tabId },
                            files: ['qa-extract.js']
                        }, () => {
                            chrome.scripting.executeScript({
                                target: { tabId: tabId },
                                func: () => extractQAContent(document)
                            }, (res) => {
                                chrome.tabs.remove(tabId); // Cleanup
                                if (res && res[0] && res[0].result) {
                                    sendResponse({ blocks: res[0].result });
                                } else {
                                    sendResponse({ error: "Extraction failed or returned empty" });
                                }
                            });
                        });
                    }, 2500); 
                }
            };
            chrome.tabs.onUpdated.addListener(listener);
        });
        return true; 
    }
});
