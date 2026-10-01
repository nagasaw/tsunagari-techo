chrome.action.onClicked.addListener(async tab => {
 if (!tab.url?.startsWith('https://note.com/')) { await chrome.tabs.create({url:chrome.runtime.getURL('index.html')}); return; }
 await chrome.tabs.create({url:chrome.runtime.getURL('index.html')+'?source='+tab.id});
});
