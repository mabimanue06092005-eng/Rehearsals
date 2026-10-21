// Makes clicking the toolbar icon open the side panel instead of doing
// nothing — chrome.sidePanel requires this to be set explicitly, there's no
// declarative manifest equivalent for "open on action click" in MV3 yet.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Rehearsals live coach: failed to set side panel behavior', error));
