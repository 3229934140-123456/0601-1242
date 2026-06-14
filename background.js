chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    clips: [],
    drafts: [],
    feedback: [],
    settings: {
      defaultExtend: 3,
      defaultSlowMo: 0.5,
      defaultVisibility: 'public'
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'saveClip') {
    chrome.storage.local.get(['clips'], (result) => {
      const clips = result.clips || [];
      clips.push(message.clip);
      chrome.storage.local.set({ clips }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.action === 'saveDraft') {
    chrome.storage.local.get(['drafts'], (result) => {
      const drafts = result.drafts || [];
      drafts.push(message.draft);
      chrome.storage.local.set({ drafts }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.action === 'getClips') {
    chrome.storage.local.get(['clips'], (result) => {
      sendResponse({ clips: result.clips || [] });
    });
    return true;
  }

  if (message.action === 'getDrafts') {
    chrome.storage.local.get(['drafts'], (result) => {
      sendResponse({ drafts: result.drafts || [] });
    });
    return true;
  }

  if (message.action === 'publishClip') {
    chrome.storage.local.get(['clips', 'feedback'], (result) => {
      const clips = result.clips || [];
      const feedback = result.feedback || [];
      const clipIndex = clips.findIndex(c => c.id === message.clipId);
      if (clipIndex >= 0) {
        clips[clipIndex].published = true;
        clips[clipIndex].publishedDate = new Date().toISOString();
        feedback.push({
          id: message.clipId,
          title: clips[clipIndex].title,
          views: Math.floor(Math.random() * 1000),
          likes: Math.floor(Math.random() * 100),
          comments: Math.floor(Math.random() * 50),
          date: new Date().toLocaleDateString()
        });
        chrome.storage.local.set({ clips, feedback }, () => {
          sendResponse({ success: true });
        });
      }
    });
    return true;
  }

  if (message.action === 'clearCache') {
    chrome.storage.local.set({ clips: [], feedback: [] }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
