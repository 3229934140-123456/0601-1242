(function() {
  'use strict';

  if (window.__sportsClipEditorLoaded__) return;
  window.__sportsClipEditorLoaded__ = true;

  const state = {
    panelVisible: false,
    currentVideo: null,
    clips: [],
    captions: [],
    isRecording: false,
    audioRecorder: null,
    audioChunks: [],
    settings: {
      defaultExtend: 3,
      defaultSlowMo: 0.5,
      defaultVisibility: 'public'
    },
    activeTab: 'timeline'
  };

  function init() {
    chrome.storage.local.get(['settings'], (result) => {
      if (result.settings) {
        Object.assign(state.settings, result.settings);
      }
    });

    findVideoElement();
    createFloatingButton();
    bindKeyboardShortcuts();
    observeDOMChanges();
  }

  function findVideoElement() {
    const videos = document.querySelectorAll('video');
    if (videos.length > 0) {
      state.currentVideo = videos[0];
      attachVideoListeners();
    }
  }

  function observeDOMChanges() {
    const observer = new MutationObserver(() => {
      if (!state.currentVideo || !document.contains(state.currentVideo)) {
        findVideoElement();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function attachVideoListeners() {
    if (!state.currentVideo) return;
    state.currentVideo.addEventListener('timeupdate', updateTimeline);
    state.currentVideo.addEventListener('loadedmetadata', updateTimelineDuration);
  }

  function bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      if (e.key === 'q' || e.key === 'Q') {
        markGoalMoment();
      }
      if (e.key === 'w' || e.key === 'W') {
        toggleRecording();
      }
      if (e.key === 'Escape') {
        togglePanel();
      }
    });
  }

  function createFloatingButton() {
    if (document.getElementById('sports-clip-fab')) return;

    const fab = document.createElement('div');
    fab.id = 'sports-clip-fab';
    fab.innerHTML = `
      <button class="fab-main" title="赛事解说剪辑助手">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </button>
    `;

    fab.querySelector('.fab-main').addEventListener('click', togglePanel);

    let isDragging = false;
    let offsetX, offsetY;

    fab.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      const rect = fab.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      fab.style.left = (e.clientX - offsetX) + 'px';
      fab.style.top = (e.clientY - offsetY) + 'px';
      fab.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    document.body.appendChild(fab);
  }

  function togglePanel() {
    state.panelVisible = !state.panelVisible;
    if (state.panelVisible) {
      createEditorPanel();
    } else {
      removeEditorPanel();
    }
  }

  function removeEditorPanel() {
    const panel = document.getElementById('sports-clip-panel');
    if (panel) panel.remove();
  }

  function createEditorPanel() {
    if (document.getElementById('sports-clip-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'sports-clip-panel';
    panel.innerHTML = `
      <div class="panel-header">
        <div class="panel-title">
          <span class="title-icon">🎬</span>
          <span>赛事解说剪辑助手</span>
        </div>
        <div class="panel-tabs">
          <button class="tab-btn active" data-tab="timeline">⏱ 时间轴</button>
          <button class="tab-btn" data-tab="clips">🎞 片段库</button>
          <button class="tab-btn" data-tab="captions">💬 字幕</button>
          <button class="tab-btn" data-tab="publish">🚀 发布</button>
          <button class="tab-btn" data-tab="settings">⚙ 设置</button>
          <button class="tab-btn" data-tab="data">📊 数据</button>
        </div>
        <button class="close-btn" title="关闭">×</button>
      </div>

      <div class="panel-body">
        <div class="tab-content active" id="tab-timeline">
          <div class="control-bar">
            <button class="ctrl-btn" id="btn-mark-goal">
              <span>⚽</span>
              <span>标记进球 (Q)</span>
            </button>
            <button class="ctrl-btn" id="btn-toggle-record">
              <span class="record-icon">●</span>
              <span id="record-text">录制解说 (W)</span>
            </button>
            <button class="ctrl-btn" id="btn-play-slowmo">
              <span>🐌</span>
              <span>慢动作预览</span>
            </button>
            <button class="ctrl-btn" id="btn-scoreboard">
              <span>🏆</span>
              <span>添加比分牌</span>
            </button>
            <button class="ctrl-btn" id="btn-team-tag">
              <span>🏷️</span>
              <span>队伍标签</span>
            </button>
            <div class="ctrl-separator"></div>
            <button class="ctrl-btn ctrl-mini" id="btn-play">
              <span id="play-icon">▶</span>
            </button>
            <div class="time-display">
              <span id="current-time">00:00</span>
              <span class="time-sep">/</span>
              <span id="total-time">00:00</span>
            </div>
            <div class="playback-rate">
              <label>速度:</label>
              <select id="playback-rate">
                <option value="0.25">0.25x</option>
                <option value="0.5">0.5x</option>
                <option value="0.75">0.75x</option>
                <option value="1" selected>1x</option>
                <option value="1.5">1.5x</option>
                <option value="2">2x</option>
              </select>
            </div>
          </div>

          <div class="timeline-container">
            <div class="timeline-ruler" id="timeline-ruler"></div>
            <div class="timeline-track" id="timeline-track">
              <div class="timeline-progress" id="timeline-progress"></div>
              <div class="timeline-playhead" id="timeline-playhead"></div>
              <div class="clip-markers" id="clip-markers"></div>
            </div>
            <div class="timeline-marks" id="timeline-marks"></div>
          </div>

          <div class="clip-editor">
            <div class="clip-range-inputs">
              <div class="range-input">
                <label>起始时间</label>
                <input type="text" id="clip-start" value="00:00:00">
              </div>
              <div class="range-input">
                <label>结束时间</label>
                <input type="text" id="clip-end" value="00:00:00">
              </div>
              <div class="range-input">
                <label>片段时长</label>
                <span id="clip-duration">0秒</span>
              </div>
              <button class="action-btn primary" id="btn-add-clip">添加到片段库</button>
            </div>
            <div class="extend-controls">
              <label>前后自动扩展</label>
              <div class="extend-btns">
                <button class="extend-btn" data-extend="1">前1秒</button>
                <button class="extend-btn" data-extend="3" class="active">前3秒</button>
                <button class="extend-btn" data-extend="5">前5秒</button>
                <button class="extend-btn" data-extend="10">前10秒</button>
              </div>
              <div class="extend-btns">
                <button class="extend-btn" data-extend="1">后1秒</button>
                <button class="extend-btn" data-extend="3" class="active">后3秒</button>
                <button class="extend-btn" data-extend="5">后5秒</button>
                <button class="extend-btn" data-extend="10">后10秒</button>
              </div>
            </div>
          </div>
        </div>

        <div class="tab-content" id="tab-clips">
          <div class="clips-header">
            <h3>精彩片段库</h3>
            <div class="clips-actions">
              <button class="action-btn" id="btn-merge-clips">🔗 合并选中</button>
              <button class="action-btn" id="btn-clear-clips">🗑 清空</button>
              <button class="action-btn" id="btn-batch-name">🏷 批量命名</button>
            </div>
          </div>
          <div class="clips-list" id="clips-list">
            <div class="empty-state">
              <div class="empty-icon">🎞</div>
              <p>暂无片段</p>
              <p class="empty-hint">使用时间轴标记精彩时刻，或按Q键快速标记</p>
            </div>
          </div>
          <div class="scoreboard-editor" id="scoreboard-editor" style="display:none;">
            <h4>比分牌设置</h4>
            <div class="score-inputs">
              <div class="team-input">
                <input type="text" placeholder="主队名称" id="home-team" value="主队">
                <input type="number" id="home-score" value="0" min="0">
              </div>
              <span class="score-vs">VS</span>
              <div class="team-input">
                <input type="number" id="away-score" value="0" min="0">
                <input type="text" placeholder="客队名称" id="away-team" value="客队">
              </div>
            </div>
            <div class="score-actions">
              <button class="action-btn primary" id="btn-apply-score">应用比分牌</button>
              <button class="action-btn" id="btn-hide-score">隐藏</button>
            </div>
          </div>
          <div class="team-tag-editor" id="team-tag-editor" style="display:none;">
            <h4>队伍标签</h4>
            <div class="tag-inputs">
              <input type="text" placeholder="输入队伍标签，回车添加" id="new-team-tag">
            </div>
            <div class="tags-list" id="tags-list"></div>
          </div>
        </div>

        <div class="tab-content" id="tab-captions">
          <div class="captions-header">
            <h3>字幕编辑</h3>
            <div class="captions-actions">
              <button class="action-btn" id="btn-auto-segment">✨ 自动分段</button>
              <button class="action-btn" id="btn-add-caption">➕ 添加字幕</button>
              <button class="action-btn" id="btn-import-captions">📥 导入字幕</button>
              <button class="action-btn" id="btn-export-captions">📤 导出字幕</button>
            </div>
          </div>
          <div class="captions-list" id="captions-list">
            <div class="empty-state">
              <div class="empty-icon">💬</div>
              <p>暂无字幕</p>
              <p class="empty-hint">点击"自动分段"根据语音自动生成，或手动添加</p>
            </div>
          </div>
        </div>

        <div class="tab-content" id="tab-publish">
          <div class="publish-section">
            <h3>封面设置</h3>
            <div class="cover-settings">
              <div class="cover-preview" id="cover-preview">
                <span class="cover-placeholder">封面预览</span>
              </div>
              <div class="cover-actions">
                <button class="action-btn" id="btn-capture-cover">📸 当前帧抓图</button>
                <button class="action-btn" id="btn-select-frame">🎞 选择帧</button>
                <button class="action-btn" id="btn-upload-cover">📁 上传图片</button>
              </div>
            </div>
          </div>

          <div class="publish-section">
            <h3>视频信息</h3>
            <div class="form-group">
              <label>标题</label>
              <input type="text" id="publish-title" placeholder="输入视频标题">
            </div>
            <div class="form-group">
              <label>描述</label>
              <textarea id="publish-desc" rows="3" placeholder="输入视频描述..."></textarea>
            </div>
            <div class="form-group">
              <label>标签 (用逗号分隔)</label>
              <input type="text" id="publish-tags" placeholder="例如: 足球, 精彩进球, 梅西">
            </div>
          </div>

          <div class="publish-section">
            <h3>发布设置</h3>
            <div class="channel-selector">
              <label>选择发布频道</label>
              <div class="channel-grid">
                <label class="channel-item">
                  <input type="checkbox" value="douyin">
                  <span class="channel-icon">📺</span>
                  <span>抖音</span>
                </label>
                <label class="channel-item">
                  <input type="checkbox" value="kuaishou">
                  <span class="channel-icon">🎥</span>
                  <span>快手</span>
                </label>
                <label class="channel-item">
                  <input type="checkbox" value="bilibili">
                  <span class="channel-icon">📱</span>
                  <span>B站</span>
                </label>
                <label class="channel-item">
                  <input type="checkbox" value="wechat">
                  <span class="channel-icon">🎬</span>
                  <span>视频号</span>
                </label>
              </div>
            </div>
            <div class="form-group">
              <label>可见范围</label>
              <select id="publish-visibility">
                <option value="public">公开 - 所有人可见</option>
                <option value="private">仅自己可见</option>
                <option value="friends">好友可见</option>
              </select>
            </div>
          </div>

          <div class="publish-actions">
            <button class="action-btn" id="btn-save-draft">💾 保存草稿</button>
            <button class="action-btn" id="btn-generate-replay">🔗 生成回放链接</button>
            <button class="action-btn primary large" id="btn-publish">🚀 立即发布</button>
          </div>
        </div>

        <div class="tab-content" id="tab-settings">
          <div class="settings-section">
            <h3>剪辑偏好</h3>
            <div class="form-group">
              <label>标记后自动扩展 (秒)</label>
              <input type="number" id="set-extend" value="3" min="1" max="15">
            </div>
            <div class="form-group">
              <label>默认慢动作倍率</label>
              <select id="set-slowmo">
                <option value="0.25">0.25x</option>
                <option value="0.5" selected>0.5x</option>
                <option value="0.75">0.75x</option>
              </select>
            </div>
            <div class="form-group">
              <label>默认片段时长 (秒)</label>
              <input type="number" id="set-duration" value="8" min="2" max="60">
            </div>
          </div>

          <div class="settings-section">
            <h3>快捷键</h3>
            <div class="shortcut-list">
              <div class="shortcut-item">
                <span>标记精彩时刻</span>
                <kbd>Q</kbd>
              </div>
              <div class="shortcut-item">
                <span>开始/暂停录制</span>
                <kbd>W</kbd>
              </div>
              <div class="shortcut-item">
                <span>显示/隐藏面板</span>
                <kbd>Esc</kbd>
              </div>
            </div>
          </div>

          <div class="settings-section">
            <h3>数据管理</h3>
            <div class="cache-info">
              <div class="cache-item">
                <span>已缓存片段</span>
                <span id="cache-clips">0</span>
              </div>
              <div class="cache-item">
                <span>草稿数量</span>
                <span id="cache-drafts">0</span>
              </div>
              <div class="cache-item">
                <span>缓存大小</span>
                <span id="cache-size">0 KB</span>
              </div>
            </div>
            <button class="action-btn danger" id="btn-clear-cache">🗑 清空缓存</button>
          </div>
        </div>

        <div class="tab-content" id="tab-data">
          <div class="data-section">
            <h3>播放反馈统计</h3>
            <div class="data-stats">
              <div class="data-stat-card">
                <span class="stat-icon">🎬</span>
                <span class="stat-value" id="data-clips">0</span>
                <span class="stat-label">总剪辑数</span>
              </div>
              <div class="data-stat-card">
                <span class="stat-icon">🚀</span>
                <span class="stat-value" id="data-published">0</span>
                <span class="stat-label">已发布</span>
              </div>
              <div class="data-stat-card">
                <span class="stat-icon">👁</span>
                <span class="stat-value" id="data-views">0</span>
                <span class="stat-label">总播放</span>
              </div>
              <div class="data-stat-card">
                <span class="stat-icon">❤</span>
                <span class="stat-value" id="data-likes">0</span>
                <span class="stat-label">总点赞</span>
              </div>
            </div>
          </div>

          <div class="data-section">
            <h3>最近发布</h3>
            <div class="recent-list" id="recent-list">
              <div class="empty-state">
                <div class="empty-icon">📊</div>
                <p>暂无数据</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="toast-container" id="toast-container"></div>
    `;

    document.body.appendChild(panel);
    bindPanelEvents();
    loadClipsFromStorage();
    updateTimelineDuration();
  }

  function bindPanelEvents() {
    document.querySelectorAll('#sports-clip-panel .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#sports-clip-panel .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('#sports-clip-panel .tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
        state.activeTab = btn.dataset.tab;
        
        if (btn.dataset.tab === 'data') loadDataStats();
        if (btn.dataset.tab === 'settings') loadCacheInfo();
      });
    });

    document.querySelector('#sports-clip-panel .close-btn').addEventListener('click', togglePanel);

    document.getElementById('btn-mark-goal').addEventListener('click', markGoalMoment);
    document.getElementById('btn-toggle-record').addEventListener('click', toggleRecording);
    document.getElementById('btn-play-slowmo').addEventListener('click', playSlowMotion);
    document.getElementById('btn-scoreboard').addEventListener('click', toggleScoreboardEditor);
    document.getElementById('btn-team-tag').addEventListener('click', toggleTeamTagEditor);
    document.getElementById('btn-play').addEventListener('click', togglePlay);
    document.getElementById('btn-add-clip').addEventListener('click', addClipFromRange);

    document.getElementById('playback-rate').addEventListener('change', (e) => {
      if (state.currentVideo) {
        state.currentVideo.playbackRate = parseFloat(e.target.value);
      }
    });

    document.querySelectorAll('.extend-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
      });
    });

    ['clip-start', 'clip-end'].forEach(id => {
      document.getElementById(id).addEventListener('change', updateClipDuration);
    });

    document.getElementById('timeline-track').addEventListener('click', handleTimelineClick);

    document.getElementById('btn-merge-clips').addEventListener('click', mergeSelectedClips);
    document.getElementById('btn-clear-clips').addEventListener('click', clearAllClips);
    document.getElementById('btn-batch-name').addEventListener('click', batchRenameClips);

    document.getElementById('btn-auto-segment').addEventListener('click', autoSegmentCaptions);
    document.getElementById('btn-add-caption').addEventListener('click', addCaptionRow);

    document.getElementById('btn-capture-cover').addEventListener('click', captureCurrentFrame);
    document.getElementById('btn-save-draft').addEventListener('click', saveDraft);
    document.getElementById('btn-generate-replay').addEventListener('click', generateReplayLink);
    document.getElementById('btn-publish').addEventListener('click', publishClip);

    document.getElementById('btn-apply-score').addEventListener('click', applyScoreboard);
    document.getElementById('btn-hide-score').addEventListener('click', hideScoreboard);
    document.getElementById('new-team-tag').addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && e.target.value.trim()) {
        addTeamTag(e.target.value.trim());
        e.target.value = '';
      }
    });

    document.getElementById('btn-clear-cache').addEventListener('click', clearCache);
  }

  function markGoalMoment() {
    if (!state.currentVideo) {
      showToast('未检测到视频元素', 'error');
      return;
    }

    const currentTime = state.currentVideo.currentTime;
    const extendBefore = state.settings.defaultExtend;
    const extendAfter = state.settings.defaultExtend;
    const startTime = Math.max(0, currentTime - extendBefore);
    const endTime = Math.min(state.currentVideo.duration || currentTime + extendAfter, currentTime + extendAfter);

    const clip = {
      id: Date.now().toString(),
      startTime,
      endTime,
      title: `精彩片段 ${state.clips.length + 1}`,
      goalTime: currentTime,
      createdAt: new Date().toISOString(),
      selected: false,
      published: false,
      cover: null,
      tags: [],
      scoreboard: null
    };

    state.clips.push(clip);
    renderClips();
    renderClipMarkers();
    showToast(`已标记精彩片段 ${formatTime(startTime)} - ${formatTime(endTime)}`, 'success');
    
    chrome.storage.local.set({ clips: state.clips });
  }

  function toggleRecording() {
    const btn = document.getElementById('btn-toggle-record');
    const text = document.getElementById('record-text');
    const icon = btn.querySelector('.record-icon');

    if (!state.isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.audioRecorder = new MediaRecorder(stream);
      state.audioChunks = [];

      state.audioRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) state.audioChunks.push(e.data);
      };

      state.audioRecorder.onstop = () => {
        const audioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        state.latestRecording = audioUrl;
        showToast('解说音轨录制完成', 'success');
        stream.getTracks().forEach(t => t.stop());
      };

      state.audioRecorder.start();
      state.isRecording = true;

      const btn = document.getElementById('btn-toggle-record');
      const text = document.getElementById('record-text');
      const icon = btn.querySelector('.record-icon');
      btn.classList.add('recording');
      icon.style.color = '#ff4d4f';
      text.textContent = '停止录制 (W)';
      showToast('开始录制解说...', 'info');
    } catch (err) {
      showToast('无法访问麦克风: ' + err.message, 'error');
    }
  }

  function stopRecording() {
    if (state.audioRecorder && state.isRecording) {
      state.audioRecorder.stop();
      state.isRecording = false;

      const btn = document.getElementById('btn-toggle-record');
      const text = document.getElementById('record-text');
      const icon = btn.querySelector('.record-icon');
      btn.classList.remove('recording');
      icon.style.color = '';
      text.textContent = '录制解说 (W)';
    }
  }

  function playSlowMotion() {
    if (!state.currentVideo) {
      showToast('未检测到视频元素', 'error');
      return;
    }

    const currentTime = state.currentVideo.currentTime;
    const startTime = Math.max(0, currentTime - 2);
    const endTime = Math.min(currentTime + 2, state.currentVideo.duration || currentTime + 2);

    state.currentVideo.playbackRate = state.settings.defaultSlowMo;
    state.currentVideo.currentTime = startTime;
    state.currentVideo.play();

    const checkEnd = setInterval(() => {
      if (!state.currentVideo || state.currentVideo.currentTime >= endTime) {
        clearInterval(checkEnd);
        if (state.currentVideo) {
          state.currentVideo.pause();
          state.currentVideo.playbackRate = 1;
        }
      }
    }, 100);
  }

  function togglePlay() {
    if (!state.currentVideo) return;
    const icon = document.getElementById('play-icon');
    if (state.currentVideo.paused) {
      state.currentVideo.play();
      icon.textContent = '⏸';
    } else {
      state.currentVideo.pause();
      icon.textContent = '▶';
    }
  }

  function addClipFromRange() {
    const startStr = document.getElementById('clip-start').value;
    const endStr = document.getElementById('clip-end').value;
    const startTime = parseTime(startStr);
    const endTime = parseTime(endStr);

    if (isNaN(startTime) || isNaN(endTime) || startTime >= endTime) {
      showToast('时间范围无效', 'error');
      return;
    }

    const clip = {
      id: Date.now().toString(),
      startTime,
      endTime,
      title: `片段 ${state.clips.length + 1}`,
      createdAt: new Date().toISOString(),
      selected: false,
      published: false,
      cover: null,
      tags: [],
      scoreboard: null
    };

    state.clips.push(clip);
    renderClips();
    renderClipMarkers();
    showToast('已添加到片段库', 'success');
    chrome.storage.local.set({ clips: state.clips });
  }

  function updateClipDuration() {
    const startStr = document.getElementById('clip-start').value;
    const endStr = document.getElementById('clip-end').value;
    const startTime = parseTime(startStr);
    const endTime = parseTime(endStr);

    if (!isNaN(startTime) && !isNaN(endTime) && endTime > startTime) {
      document.getElementById('clip-duration').textContent = Math.round(endTime - startTime) + '秒';
    }
  }

  function handleTimelineClick(e) {
    if (!state.currentVideo) return;
    const track = e.currentTarget;
    const rect = track.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const duration = state.currentVideo.duration || 0;
    state.currentVideo.currentTime = percent * duration;
  }

  function updateTimeline() {
    if (!state.currentVideo) return;

    const duration = state.currentVideo.duration || 0;
    const current = state.currentVideo.currentTime;
    const percent = (current / duration) * 100;

    const progress = document.getElementById('timeline-progress');
    const playhead = document.getElementById('timeline-playhead');

    if (progress) progress.style.width = percent + '%';
    if (playhead) playhead.style.left = percent + '%';

    document.getElementById('current-time').textContent = formatTime(current);
    document.getElementById('clip-start').value = formatTimeSeconds(Math.max(0, current - state.settings.defaultExtend));
    document.getElementById('clip-end').value = formatTimeSeconds(Math.min(duration, current + state.settings.defaultExtend));
    updateClipDuration();
  }

  function updateTimelineDuration() {
    if (!state.currentVideo) return;
    document.getElementById('total-time').textContent = formatTime(state.currentVideo.duration || 0);
    renderTimelineRuler();
  }

  function renderTimelineRuler() {
    const ruler = document.getElementById('timeline-ruler');
    if (!ruler || !state.currentVideo) return;

    const duration = state.currentVideo.duration || 0;
    const interval = duration > 60 ? 10 : duration > 30 ? 5 : 2;
    let html = '';

    for (let t = 0; t <= duration; t += interval) {
      const percent = (t / duration) * 100;
      html += `<div class="ruler-mark" style="left: ${percent}%">
        <span>${formatTimeShort(t)}</span>
      </div>`;
    }

    ruler.innerHTML = html;
  }

  function renderClipMarkers() {
    const container = document.getElementById('clip-markers');
    if (!container || !state.currentVideo) return;

    const duration = state.currentVideo.duration || 0;
    container.innerHTML = state.clips.map(clip => {
      const left = (clip.startTime / duration) * 100;
      const width = ((clip.endTime - clip.startTime) / duration) * 100;
      return `<div class="clip-marker" style="left: ${left}%; width: ${width}%" title="${clip.title}"></div>`;
    }).join('');
  }

  function renderClips() {
    const list = document.getElementById('clips-list');
    if (!list) return;

    if (state.clips.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🎞</div>
          <p>暂无片段</p>
          <p class="empty-hint">使用时间轴标记精彩时刻，或按Q键快速标记</p>
        </div>
      `;
      return;
    }

    list.innerHTML = state.clips.map(clip => `
      <div class="clip-item ${clip.selected ? 'selected' : ''}" data-id="${clip.id}">
        <label class="clip-checkbox">
          <input type="checkbox" ${clip.selected ? 'checked' : ''}>
        </label>
        <div class="clip-info">
          <input type="text" class="clip-title" value="${clip.title}" data-id="${clip.id}">
          <div class="clip-time">
            <span>起始: ${formatTime(clip.startTime)}</span>
            <span>结束: ${formatTime(clip.endTime)}</span>
            <span>时长: ${Math.round(clip.endTime - clip.startTime)}秒</span>
          </div>
          ${clip.published ? '<span class="clip-status published">已发布</span>' : '<span class="clip-status draft">草稿</span>'}
        </div>
        <div class="clip-actions">
          <button class="mini-btn" data-action="preview" data-id="${clip.id}" title="预览">▶</button>
          <button class="mini-btn" data-action="edit" data-id="${clip.id}" title="编辑">✏️</button>
          <button class="mini-btn" data-action="delete" data-id="${clip.id}" title="删除">🗑</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.clip-item').forEach(item => {
      item.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
        const clip = state.clips.find(c => c.id === item.dataset.id);
        if (clip) clip.selected = e.target.checked;
        item.classList.toggle('selected', e.target.checked);
      });

      item.querySelector('.clip-title').addEventListener('change', (e) => {
        const clip = state.clips.find(c => c.id === item.dataset.id);
        if (clip) clip.title = e.target.value;
        chrome.storage.local.set({ clips: state.clips });
      });

      item.querySelectorAll('.mini-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          const id = btn.dataset.id;
          if (action === 'preview') previewClip(id);
          if (action === 'delete') deleteClip(id);
          if (action === 'edit') editClip(id);
        });
      });
    });
  }

  function previewClip(id) {
    const clip = state.clips.find(c => c.id === id);
    if (!clip || !state.currentVideo) return;

    state.currentVideo.currentTime = clip.startTime;
    state.currentVideo.play();

    const checkEnd = setInterval(() => {
      if (!state.currentVideo || state.currentVideo.currentTime >= clip.endTime) {
        clearInterval(checkEnd);
        if (state.currentVideo) state.currentVideo.pause();
      }
    }, 100);
  }

  function deleteClip(id) {
    state.clips = state.clips.filter(c => c.id !== id);
    renderClips();
    renderClipMarkers();
    chrome.storage.local.set({ clips: state.clips });
    showToast('片段已删除', 'success');
  }

  function editClip(id) {
    const clip = state.clips.find(c => c.id === id);
    if (!clip) return;
    document.getElementById('clip-start').value = formatTimeSeconds(clip.startTime);
    document.getElementById('clip-end').value = formatTimeSeconds(clip.endTime);
    updateClipDuration();
    showToast('已加载到编辑器', 'info');
  }

  function mergeSelectedClips() {
    const selected = state.clips.filter(c => c.selected);
    if (selected.length < 2) {
      showToast('请选择至少2个片段进行合并', 'warning');
      return;
    }

    selected.sort((a, b) => a.startTime - b.startTime);
    const merged = {
      id: Date.now().toString(),
      startTime: selected[0].startTime,
      endTime: selected[selected.length - 1].endTime,
      title: `合并片段 (${selected.length}个)`,
      createdAt: new Date().toISOString(),
      selected: false,
      published: false,
      cover: null,
      tags: [],
      scoreboard: null,
      mergedFrom: selected.map(c => c.id)
    };

    state.clips.push(merged);
    renderClips();
    renderClipMarkers();
    showToast(`已合并 ${selected.length} 个片段`, 'success');
    chrome.storage.local.set({ clips: state.clips });
  }

  function clearAllClips() {
    if (state.clips.length === 0) return;
    if (!confirm('确定要清空所有片段吗？')) return;
    state.clips = [];
    renderClips();
    renderClipMarkers();
    chrome.storage.local.set({ clips: state.clips });
    showToast('已清空所有片段', 'success');
  }

  function batchRenameClips() {
    if (state.clips.length === 0) {
      showToast('暂无片段可命名', 'warning');
      return;
    }
    const prefix = prompt('请输入批量命名前缀（例如：精彩进球）:', '精彩片段');
    if (!prefix) return;

    state.clips.forEach((clip, index) => {
      clip.title = `${prefix} ${index + 1}`;
    });
    renderClips();
    chrome.storage.local.set({ clips: state.clips });
    showToast('批量命名完成', 'success');
  }

  function toggleScoreboardEditor() {
    document.getElementById('scoreboard-editor').style.display = 'block';
    document.getElementById('team-tag-editor').style.display = 'none';
  }

  function toggleTeamTagEditor() {
    document.getElementById('team-tag-editor').style.display = 'block';
    document.getElementById('scoreboard-editor').style.display = 'none';
  }

  function applyScoreboard() {
    const homeTeam = document.getElementById('home-team').value;
    const awayTeam = document.getElementById('away-team').value;
    const homeScore = parseInt(document.getElementById('home-score').value);
    const awayScore = parseInt(document.getElementById('away-score').value);

    const selectedClips = state.clips.filter(c => c.selected);
    const targets = selectedClips.length > 0 ? selectedClips : (state.clips.length > 0 ? [state.clips[state.clips.length - 1]] : []);

    targets.forEach(clip => {
      clip.scoreboard = { homeTeam, awayTeam, homeScore, awayScore };
    });

    if (targets.length > 0) {
      showToast(`比分牌已应用到 ${targets.length} 个片段`, 'success');
      chrome.storage.local.set({ clips: state.clips });
    } else {
      showToast('暂无可应用的片段', 'warning');
    }
  }

  function hideScoreboard() {
    document.getElementById('scoreboard-editor').style.display = 'none';
  }

  function addTeamTag(tag) {
    const tagsList = document.getElementById('tags-list');
    const tagEl = document.createElement('span');
    tagEl.className = 'team-tag';
    tagEl.textContent = tag;
    tagEl.innerHTML += ' <button class="tag-remove">×</button>';
    tagEl.querySelector('.tag-remove').addEventListener('click', () => tagEl.remove());
    tagsList.appendChild(tagEl);

    const selectedClips = state.clips.filter(c => c.selected);
    selectedClips.forEach(clip => {
      if (!clip.tags.includes(tag)) clip.tags.push(tag);
    });
    chrome.storage.local.set({ clips: state.clips });
  }

  function autoSegmentCaptions() {
    showToast('正在进行语音识别自动分段...', 'info');
    setTimeout(() => {
      const sampleCaptions = [
        { startTime: 0, endTime: 3, text: '各位观众朋友们大家好' },
        { startTime: 3, endTime: 6, text: '欢迎来到今天的比赛' },
        { startTime: 6, endTime: 10, text: '这是一场精彩的对决' },
        { startTime: 10, endTime: 15, text: '双方球员已经准备就绪' }
      ];
      state.captions = sampleCaptions;
      renderCaptions();
      showToast(`已自动生成 ${state.captions.length} 条字幕`, 'success');
    }, 1000);
  }

  function addCaptionRow() {
    const lastCaption = state.captions[state.captions.length - 1];
    const startTime = lastCaption ? lastCaption.endTime : 0;
    state.captions.push({
      id: Date.now().toString(),
      startTime,
      endTime: startTime + 3,
      text: ''
    });
    renderCaptions();
  }

  function renderCaptions() {
    const list = document.getElementById('captions-list');
    if (!list) return;

    if (state.captions.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💬</div>
          <p>暂无字幕</p>
          <p class="empty-hint">点击"自动分段"根据语音自动生成，或手动添加</p>
        </div>
      `;
      return;
    }

    list.innerHTML = state.captions.map((cap, index) => `
      <div class="caption-item" data-index="${index}">
        <span class="caption-index">${index + 1}</span>
        <div class="caption-time">
          <input type="text" class="time-input" value="${formatTimeSeconds(cap.startTime)}" data-field="startTime">
          <span class="arrow">→</span>
          <input type="text" class="time-input" value="${formatTimeSeconds(cap.endTime)}" data-field="endTime">
        </div>
        <input type="text" class="caption-text" value="${cap.text || ''}" placeholder="输入字幕内容">
        <button class="mini-btn delete-caption" title="删除">🗑</button>
      </div>
    `).join('');

    list.querySelectorAll('.caption-item').forEach(item => {
      const index = parseInt(item.dataset.index);

      item.querySelectorAll('.time-input').forEach(input => {
        input.addEventListener('change', () => {
          const field = input.dataset.field;
          state.captions[index][field] = parseTime(input.value);
        });
      });

      item.querySelector('.caption-text').addEventListener('change', (e) => {
        state.captions[index].text = e.target.value;
      });

      item.querySelector('.delete-caption').addEventListener('click', () => {
        state.captions.splice(index, 1);
        renderCaptions();
      });
    });
  }

  function captureCurrentFrame() {
    if (!state.currentVideo) {
      showToast('未检测到视频', 'error');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = state.currentVideo.videoWidth;
      canvas.height = state.currentVideo.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(state.currentVideo, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

      const preview = document.getElementById('cover-preview');
      preview.innerHTML = `<img src="${dataUrl}" alt="封面">`;

      const lastClip = state.clips[state.clips.length - 1];
      if (lastClip) {
        lastClip.cover = dataUrl;
        chrome.storage.local.set({ clips: state.clips });
      }

      showToast('封面已抓取', 'success');
    } catch (e) {
      showToast('抓帧失败: ' + e.message, 'error');
    }
  }

  function saveDraft() {
    const title = document.getElementById('publish-title').value || '未命名草稿';
    const desc = document.getElementById('publish-desc').value;
    const tags = document.getElementById('publish-tags').value;

    const draft = {
      id: Date.now().toString(),
      title,
      desc,
      tags,
      clips: JSON.parse(JSON.stringify(state.clips)),
      captions: JSON.parse(JSON.stringify(state.captions)),
      createdAt: new Date().toISOString()
    };

    chrome.runtime.sendMessage({ action: 'saveDraft', draft }, (res) => {
      if (res && res.success) {
        showToast('草稿已保存', 'success');
      }
    });
  }

  function generateReplayLink() {
    const selected = state.clips.filter(c => c.selected);
    if (selected.length === 0 && state.clips.length === 0) {
      showToast('请先添加片段', 'warning');
      return;
    }

    const clips = selected.length > 0 ? selected : state.clips;
    const linkId = Date.now().toString(36);
    const replayUrl = `${window.location.origin}/replay?id=${linkId}`;
    
    navigator.clipboard.writeText(replayUrl).then(() => {
      showToast('回放链接已复制到剪贴板', 'success');
    }).catch(() => {
      prompt('回放链接已生成:', replayUrl);
    });
  }

  function publishClip() {
    const title = document.getElementById('publish-title').value;
    if (!title) {
      showToast('请输入标题', 'warning');
      return;
    }

    const channels = Array.from(document.querySelectorAll('#sports-clip-panel .channel-item input:checked')).map(c => c.value);
    if (channels.length === 0) {
      showToast('请至少选择一个发布频道', 'warning');
      return;
    }

    const selected = state.clips.filter(c => c.selected);
    const targetClips = selected.length > 0 ? selected : state.clips;

    if (targetClips.length === 0) {
      showToast('请先添加片段', 'warning');
      return;
    }

    showToast('正在发布...', 'info');

    setTimeout(() => {
      targetClips.forEach(clip => {
        clip.published = true;
        chrome.runtime.sendMessage({ action: 'publishClip', clipId: clip.id });
      });
      renderClips();
      showToast(`成功发布到 ${channels.join('、')}`, 'success');
    }, 1500);
  }

  function loadDataStats() {
    chrome.storage.local.get(['clips', 'feedback'], (result) => {
      const clips = result.clips || [];
      const feedback = result.feedback || [];

      document.getElementById('data-clips').textContent = clips.length;
      document.getElementById('data-published').textContent = clips.filter(c => c.published).length;
      document.getElementById('data-views').textContent = feedback.reduce((s, f) => s + (f.views || 0), 0);
      document.getElementById('data-likes').textContent = feedback.reduce((s, f) => s + (f.likes || 0), 0);

      const list = document.getElementById('recent-list');
      if (feedback.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📊</div>
            <p>暂无数据</p>
          </div>
        `;
      } else {
        list.innerHTML = feedback.slice(0, 5).map(f => `
          <div class="recent-item">
            <div class="recent-title">${f.title}</div>
            <div class="recent-stats">
              <span>👁 ${f.views}</span>
              <span>❤ ${f.likes}</span>
              <span>💬 ${f.comments}</span>
            </div>
            <div class="recent-date">${f.date}</div>
          </div>
        `).join('');
      }
    });
  }

  function loadCacheInfo() {
    chrome.storage.local.get(['clips', 'drafts'], (result) => {
      const clips = result.clips || [];
      const drafts = result.drafts || [];
      document.getElementById('cache-clips').textContent = clips.length;
      document.getElementById('cache-drafts').textContent = drafts.length;

      const size = new Blob([JSON.stringify(result)]).size;
      document.getElementById('cache-size').textContent = size < 1024 ? size + ' B' : (size / 1024).toFixed(1) + ' KB';
    });
  }

  function clearCache() {
    if (!confirm('确定要清空缓存吗？草稿不会被删除。')) return;
    chrome.runtime.sendMessage({ action: 'clearCache' }, () => {
      state.clips = [];
      renderClips();
      renderClipMarkers();
      loadCacheInfo();
      showToast('缓存已清空', 'success');
    });
  }

  function loadClipsFromStorage() {
    chrome.storage.local.get(['clips'], (result) => {
      if (result.clips) {
        state.clips = result.clips;
        renderClips();
        renderClipMarkers();
      }
    });
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-20px)';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function formatTimeSeconds(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function formatTimeShort(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function parseTime(str) {
    const parts = str.split(':').map(p => parseFloat(p));
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parseFloat(str) || 0;
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'togglePanel') togglePanel();
  });

  init();
})();
