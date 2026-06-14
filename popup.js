document.addEventListener('DOMContentLoaded', () => {
  const navBtns = document.querySelectorAll('.nav-btn');
  const panels = document.querySelectorAll('.panel');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const panelId = btn.dataset.panel;
      navBtns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`panel-${panelId}`).classList.add('active');
    });
  });

  document.getElementById('btn-open-panel').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
    window.close();
  });

  document.getElementById('btn-clear-cache').addEventListener('click', async () => {
    if (confirm('确定要清空所有缓存吗？草稿不会被删除。')) {
      chrome.storage.local.set({
        clips: [],
        feedback: [],
        settings: {
          defaultExtend: 3,
          defaultSlowMo: 0.5,
          defaultVisibility: 'public'
        }
      }, () => {
        alert('缓存已清空');
        loadStats();
      });
    }
  });

  document.getElementById('btn-drafts').addEventListener('click', () => {
    chrome.storage.local.get(['drafts'], (result) => {
      const drafts = result.drafts || [];
      alert(`共有 ${drafts.length} 个草稿`);
    });
  });

  document.getElementById('btn-feedback').addEventListener('click', () => {
    const dataNavBtn = document.querySelector('.nav-btn[data-panel="data"]');
    dataNavBtn.click();
    loadStats();
  });

  function applyBindButtonState(platform, bound) {
    const btn = document.querySelector(`.bind-btn[data-platform="${platform}"]`);
    if (!btn) return;
    if (bound) {
      btn.textContent = '已绑定';
      btn.classList.add('bound');
      btn.style.backgroundColor = '#52c41a';
    } else {
      btn.textContent = '绑定';
      btn.classList.remove('bound');
      btn.style.backgroundColor = '';
    }
  }

  function loadBoundPlatforms() {
    chrome.storage.local.get(['boundPlatforms'], (result) => {
      const bound = result.boundPlatforms || [];
      document.querySelectorAll('.bind-btn').forEach(btn => {
        applyBindButtonState(btn.dataset.platform, bound.includes(btn.dataset.platform));
      });
    });
  }

  document.querySelectorAll('.bind-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const platform = btn.dataset.platform;
      chrome.storage.local.get(['boundPlatforms'], (result) => {
        let bound = result.boundPlatforms || [];
        const idx = bound.indexOf(platform);
        if (idx >= 0) {
          bound.splice(idx, 1);
          applyBindButtonState(platform, false);
        } else {
          bound.push(platform);
          applyBindButtonState(platform, true);
        }
        chrome.storage.local.set({ boundPlatforms: bound }, () => {
          chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
              try {
                chrome.tabs.sendMessage(tab.id, { action: 'syncBoundPlatforms' });
              } catch (e) {}
            });
          });
        });
      });
    });
  });

  loadBoundPlatforms();

  document.querySelector('.save-settings-btn').addEventListener('click', () => {
    const visibility = document.getElementById('default-visibility').value;
    const extend = parseInt(document.getElementById('default-extend').value);
    const slowmo = parseFloat(document.getElementById('default-slowmo').value);
    
    chrome.storage.local.get(['settings'], (result) => {
      const settings = result.settings || {};
      chrome.storage.local.set({
        settings: {
          ...settings,
          defaultExtend: extend,
          defaultSlowMo: slowmo,
          defaultVisibility: visibility
        }
      }, () => {
        alert('设置已保存');
      });
    });
  });

  function loadStats() {
    chrome.storage.local.get(['clips', 'drafts', 'feedback'], (result) => {
      const clips = result.clips || [];
      const drafts = result.drafts || [];
      const feedback = result.feedback || [];
      
      document.getElementById('stat-clips').textContent = clips.length;
      document.getElementById('stat-published').textContent = clips.filter(c => c.published).length;
      document.getElementById('stat-drafts').textContent = drafts.length;
      document.getElementById('stat-views').textContent = feedback.reduce((sum, f) => sum + (f.views || 0), 0);

      const feedbackList = document.getElementById('feedback-list');
      if (feedback.length === 0) {
        feedbackList.innerHTML = '<p class="empty-text">暂无播放数据</p>';
      } else {
        feedbackList.innerHTML = feedback.slice(0, 5).map(f => `
          <div class="feedback-item">
            <div class="feedback-title">${f.title || '未命名'}</div>
            <div class="feedback-stats">
              <span>👁 ${f.views || 0}</span>
              <span>❤ ${f.likes || 0}</span>
              <span>💬 ${f.comments || 0}</span>
            </div>
            <div class="feedback-date">${f.date || ''}</div>
          </div>
        `).join('');
      }
    });
  }

  chrome.storage.local.get(['settings'], (result) => {
    const settings = result.settings || {};
    if (settings.defaultVisibility) {
      document.getElementById('default-visibility').value = settings.defaultVisibility;
    }
    if (settings.defaultExtend) {
      document.getElementById('default-extend').value = settings.defaultExtend;
    }
    if (settings.defaultSlowMo) {
      document.getElementById('default-slowmo').value = settings.defaultSlowMo;
    }
  });

  loadStats();
});
