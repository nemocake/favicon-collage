// Clicking the toolbar icon opens the full-page collage studio in a new tab.
// (No default_popup is set, so onClicked fires.)
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("studio.html") });
});
