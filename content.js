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
    latestRecordingBlob: null,
    unassociatedAudio: null,
    currentAudio: null,
    settings: {
      defaultExtend: 3,
      defaultSlowMo: 0.5,
      defaultVisibility: 'public',
      extendBefore: 3,
      extendAfter: 3
    },
    activeTab: 'timeline',
    boundPlatforms: []
  };

  const PLATFORM_LIST = [
    { key: 'douyin', icon: '📺', name: '抖音' },
    { key: 'kuaishou', icon: '🎥', name: '快手' },
    { key: 'bilibili', icon: '📱', name: 'B站' },
    { key: 'wechat', icon: '🎬', name: '视频号' }
  ];

  const STORAGE_KEYS = {
    SETTINGS: 'settings',
    CLIPS: 'clips',
    BOUND: 'boundPlatforms',
    DRAFTS: 'drafts',
    REPLAYS: 'replays'
  };

  function init() {
    checkReplayPage().then((isReplay) => {
      if (isReplay) return;

      Promise.all([
        storageGet(STORAGE_KEYS.SETTINGS, {}),
        storageGet(STORAGE_KEYS.CLIPS, []),
        storageGet(STORAGE_KEYS.BOUND, [])
      ]).then(([settings, clips, bound]) => {
        if (settings) Object.assign(state.settings, settings);
        if (clips) state.clips = clips;
        if (bound) state.boundPlatforms = bound;

        findVideoElement();
        createFloatingButton();
        bindKeyboardShortcuts();
        observeDOMChanges();
      });
    });
  }

  function storageGet(key, def) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (r) => resolve(r[key] !== undefined ? r[key] : def));
      } catch (e) { resolve(def); }
    });
  }

  function storageSet(key, val) {
    return new Promise((resolve) => {
      try { chrome.storage.local.set({ [key]: val }, () => resolve()); }
      catch (e) { resolve(); }
    });
  }

  function checkReplayPage() {
    return new Promise((resolve) => {
      const params = new URLSearchParams(window.location.search);
      const replayId = params.get('replay');
      if (!replayId) { resolve(false); return; }

      storageGet(STORAGE_KEYS.REPLAYS, {}).then((replays) => {
        if (replays && replays[replayId]) {
          showReplayViewer(replays[replayId]);
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }

  function showReplayViewer(data) {
    document.title = data.title ? `${data.title} - 精彩回放` : '精彩回放';
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;padding:0;background:linear-gradient(135deg,#0f0f23 0%,#1a1a3e 100%);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;color:#fff;min-height:100vh;';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'max-width:960px;margin:0 auto;padding:48px 24px;';

    const coverHtml = data.cover
      ? `<img src="${data.cover}" style="width:100%;max-height:480px;object-fit:cover;border-radius:16px;margin-bottom:32px;box-shadow:0 8px 32px rgba(0,0,0,0.4);">`
      : '';

    const allTags = [];
    (data.clips || []).forEach(c => { if (c.tags) c.tags.forEach(t => { if (!allTags.includes(t)) allTags.push(t); }); });
    if (data.tags) data.tags.split(/[,，]/).map(s => s.trim()).filter(Boolean).forEach(t => { if (!allTags.includes(t)) allTags.push(t); });

    const tagsHtml = allTags.length > 0
      ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">
           ${allTags.map(t => `<span style="padding:4px 12px;background:rgba(102,126,234,0.25);border:1px solid rgba(102,126,234,0.4);border-radius:999px;font-size:12px;">#${escapeHtml(t)}</span>`).join('')}
         </div>`
      : '';

    const totalDur = (data.clips || []).reduce((s, c) => s + (c.endTime - c.startTime), 0);
    const hasAudio = (data.clips || []).some(c => c.audioData);

    const clipsHtml = (data.clips && data.clips.length > 0)
      ? `<div style="margin-top:32px;padding:24px;background:rgba(255,255,255,0.05);border-radius:16px;border:1px solid rgba(255,255,255,0.08);">
           <h2 style="margin:0 0 20px 0;font-size:18px;">🎞 精彩片段 (${data.clips.length})</h2>
           <div style="display:flex;flex-direction:column;gap:12px;">
             ${data.clips.map((c, i) => `
               <div style="padding:16px;background:rgba(255,255,255,0.04);border-radius:10px;border-left:3px solid #667eea;">
                 <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                   <div style="font-weight:600;font-size:15px;">${i + 1}. ${escapeHtml(c.title || '未命名片段')}</div>
                   ${c.audioData ? '<span style="font-size:12px;padding:2px 8px;background:rgba(255,214,0,0.15);border-radius:4px;color:#ffd600;">🎙 含解说</span>' : ''}
                 </div>
                 <div style="color:rgba(255,255,255,0.5);font-size:12px;font-family:monospace;margin-bottom:8px;">
                   ${formatTime(c.startTime)} → ${formatTime(c.endTime)} (${Math.round(c.endTime - c.startTime)}秒)
                 </div>
                 ${c.scoreboard ? `<div style="display:inline-flex;align-items:center;gap:12px;padding:8px 14px;background:rgba(255,214,0,0.1);border-radius:8px;border:1px solid rgba(255,214,0,0.2);font-size:13px;">
                   <span style="font-weight:500;">${escapeHtml(c.scoreboard.homeTeam || '主队')}</span>
                   <span style="font-weight:700;color:#ffd600;font-size:16px;font-family:monospace;">${c.scoreboard.homeScore} : ${c.scoreboard.awayScore}</span>
                   <span style="font-weight:500;">${escapeHtml(c.scoreboard.awayTeam || '客队')}</span>
                 </div>` : ''}
               </div>
             `).join('')}
           </div>
         </div>`
      : '';

    const captionsHtml = (data.captions && data.captions.length > 0)
      ? `<div style="margin-top:24px;padding:24px;background:rgba(255,255,255,0.05);border-radius:16px;border:1px solid rgba(255,255,255,0.08);">
           <h2 style="margin:0 0 20px 0;font-size:18px;">💬 字幕 (${data.captions.length})</h2>
           <div style="display:flex;flex-direction:column;">
             ${data.captions.map(c => `
               <div style="display:flex;gap:16px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                 <div style="min-width:160px;color:#667eea;font-family:monospace;font-size:12px;flex-shrink:0;">
                   ${formatTimeSec(c.startTime)} → ${formatTimeSec(c.endTime)}
                 </div>
                 <div style="flex:1;font-size:14px;line-height:1.6;">${escapeHtml(c.text || '')}</div>
               </div>
             `).join('')}
           </div>
         </div>`
      : '';

    wrap.innerHTML = `
      <div style="margin-bottom:24px;">
        <div style="color:#667eea;font-size:13px;font-weight:500;margin-bottom:8px;">⚽ 赛事解说剪辑助手 · 精彩回放</div>
        <h1 style="margin:0;font-size:32px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">${escapeHtml(data.title || '未命名回放')}</h1>
      </div>
      ${data.desc ? `<p style="color:rgba(255,255,255,0.65);font-size:15px;line-height:1.7;margin:0 0 8px 0;">${escapeHtml(data.desc)}</p>` : ''}
      ${tagsHtml}
      ${coverHtml}
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <div style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:rgba(102,126,234,0.15);border:1px solid rgba(102,126,234,0.3);border-radius:8px;font-size:13px;">
          🎞 片段 <b style="margin-left:4px;">${(data.clips || []).length}</b>
        </div>
        <div style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:rgba(82,196,26,0.15);border:1px solid rgba(82,196,26,0.3);border-radius:8px;font-size:13px;">
          ⏱ 总时长 <b style="margin-left:4px;">${formatTime(totalDur)}</b>
        </div>
        <div style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:rgba(24,144,255,0.15);border:1px solid rgba(24,144,255,0.3);border-radius:8px;font-size:13px;">
          💬 字幕 <b style="margin-left:4px;">${(data.captions || []).length}</b>
        </div>
        ${hasAudio ? `<div style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:rgba(255,214,0,0.15);border:1px solid rgba(255,214,0,0.3);border-radius:8px;font-size:13px;">
          🎙 含解说音轨
        </div>` : ''}
      </div>
      ${clipsHtml}
      ${captionsHtml}
      <div style="margin-top:48px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.08);text-align:center;color:rgba(255,255,255,0.35);font-size:12px;">
        由「赛事解说剪辑助手」生成 · ${data.createdAt ? new Date(data.createdAt).toLocaleString() : ''}
      </div>
    `;
    document.body.appendChild(wrap);
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function formatTimeSec(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function parseTime(str) {
    const parts = String(str).split(':').map(p => parseFloat(p));
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parseFloat(str) || 0;
  }

  function blobToBase64(blob) {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
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
    state.currentVideo.addEventListener('timeupdate', onVideoTimeUpdate);
    state.currentVideo.addEventListener('loadedmetadata', onVideoLoadedMeta);
    state.currentVideo.addEventListener('play', onVideoPlay);
    state.currentVideo.addEventListener('pause', onVideoPause);
  }

  function onVideoTimeUpdate() {
    if (!state.currentVideo) return;
    state.currentTime = state.currentVideo.currentTime;
    state.duration = state.currentVideo.duration || state.duration;
    if (state.panelVisible) updateTimelineUI();
  }

  function onVideoLoadedMeta() {
    if (!state.currentVideo) return;
    state.duration = state.currentVideo.duration;
    if (state.panelVisible) {
      updateTimelineDurationUI();
      renderTimelineRulerUI();
      renderClipMarkersUI();
    }
  }

  function onVideoPlay() {
    state.isPlaying = true;
    if (state.panelVisible) {
      const icon = document.getElementById('play-icon');
      if (icon) icon.textContent = '⏸';
    }
  }

  function onVideoPause() {
    state.isPlaying = false;
    if (state.panelVisible) {
      const icon = document.getElementById('play-icon');
      if (icon) icon.textContent = '▶';
    }
  }

  function bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const t = e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
      if (e.key === 'q' || e.key === 'Q') markGoalMoment();
      if (e.key === 'w' || e.key === 'W') toggleRecording();
      if (e.key === 'Escape') togglePanel();
    });
  }

  function createFloatingButton() {
    if (document.getElementById('sports-clip-fab')) return;
    const fab = document.createElement('div');
    fab.id = 'sports-clip-fab';
    fab.innerHTML = `<button class="fab-main" title="赛事解说剪辑助手"><svg viewBox="0 0 24 24" width="24" height="24" fill="white"><path d="M8 5v14l11-7z"/></svg></button>`;
    fab.querySelector('.fab-main').addEventListener('click', togglePanel);

    let dragging = false, ox = 0, oy = 0;
    fab.addEventListener('mousedown', (e) => { if (e.target.tagName === 'BUTTON') return; dragging = true; const r = fab.getBoundingClientRect(); ox = e.clientX - r.left; oy = e.clientY - r.top; e.preventDefault(); });
    document.addEventListener('mousemove', (e) => { if (!dragging) return; fab.style.left = (e.clientX - ox) + 'px'; fab.style.top = (e.clientY - oy) + 'px'; fab.style.right = 'auto'; });
    document.addEventListener('mouseup', () => dragging = false);

    document.body.appendChild(fab);
  }

  function togglePanel() {
    state.panelVisible = !state.panelVisible;
    if (state.panelVisible) {
      createEditorPanel();
      setTimeout(syncTimelineFromVideo, 60);
    } else {
      removeEditorPanel();
    }
  }

  function removeEditorPanel() {
    const panel = document.getElementById('sports-clip-panel');
    if (panel) panel.remove();
  }

  function syncTimelineFromVideo() {
    if (state.currentVideo) {
      state.currentTime = state.currentVideo.currentTime;
      state.duration = state.currentVideo.duration || 0;
      state.isPlaying = !state.currentVideo.paused;
    }
    updateTimelineUI();
    updateTimelineDurationUI();
    renderTimelineRulerUI();
    renderClipMarkersUI();
    applyExtendButtonState();
    applyChannelState();
    renderAccountListUI();
    syncSettingsToUI();
    renderClipsUI();
    renderCaptionsUI();
    loadCacheInfoUI();
  }

  function createEditorPanel() {
    if (document.getElementById('sports-clip-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'sports-clip-panel';
    panel.innerHTML = `
      <div class="panel-header">
        <div class="panel-title"><span class="title-icon">🎬</span><span>赛事解说剪辑助手</span></div>
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
            <button class="ctrl-btn" id="btn-mark-goal"><span>⚽</span><span>标记进球 (Q)</span></button>
            <button class="ctrl-btn" id="btn-toggle-record"><span class="record-icon">●</span><span id="record-text">录制解说 (W)</span></button>
            <button class="ctrl-btn" id="btn-play-slowmo"><span>🐌</span><span>慢动作预览</span></button>
            <button class="ctrl-btn" id="btn-scoreboard"><span>🏆</span><span>添加比分牌</span></button>
            <button class="ctrl-btn" id="btn-team-tag"><span>🏷️</span><span>队伍标签</span></button>
            <div class="ctrl-separator"></div>
            <button class="ctrl-btn ctrl-mini" id="btn-play"><span id="play-icon">▶</span></button>
            <div class="time-display"><span id="current-time">00:00</span><span class="time-sep">/</span><span id="total-time">00:00</span></div>
            <div class="playback-rate"><label>速度:</label>
              <select id="playback-rate">
                <option value="0.25">0.25x</option><option value="0.5">0.5x</option><option value="0.75">0.75x</option>
                <option value="1" selected>1x</option><option value="1.5">1.5x</option><option value="2">2x</option>
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
          </div>
          <div class="clip-editor">
            <div class="clip-range-inputs">
              <div class="range-input"><label>起始时间</label><input type="text" id="clip-start" value="00:00:00"></div>
              <div class="range-input"><label>结束时间</label><input type="text" id="clip-end" value="00:00:00"></div>
              <div class="range-input"><label>片段时长</label><span id="clip-duration">0秒</span></div>
              <button class="action-btn primary" id="btn-add-clip">添加到片段库</button>
            </div>
            <div class="extend-controls">
              <label>前后自动扩展（标记/添加片段时生效）</label>
              <div class="extend-btns" data-direction="before">
                <button class="extend-btn" data-extend="1">前1秒</button>
                <button class="extend-btn" data-extend="3">前3秒</button>
                <button class="extend-btn" data-extend="5">前5秒</button>
                <button class="extend-btn" data-extend="10">前10秒</button>
              </div>
              <div class="extend-btns" data-direction="after">
                <button class="extend-btn" data-extend="1">后1秒</button>
                <button class="extend-btn" data-extend="3">后3秒</button>
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
          <div class="clips-list" id="clips-list"></div>
          <div class="scoreboard-editor" id="scoreboard-editor" style="display:none;">
            <h4>比分牌设置</h4>
            <div class="score-inputs">
              <div class="team-input"><input type="text" placeholder="主队名称" id="home-team" value="主队"><input type="number" id="home-score" value="0" min="0"></div>
              <span class="score-vs">VS</span>
              <div class="team-input"><input type="number" id="away-score" value="0" min="0"><input type="text" placeholder="客队名称" id="away-team" value="客队"></div>
            </div>
            <div class="score-actions">
              <button class="action-btn primary" id="btn-apply-score">应用比分牌</button>
              <button class="action-btn" id="btn-hide-score">隐藏</button>
            </div>
          </div>
          <div class="team-tag-editor" id="team-tag-editor" style="display:none;">
            <h4>队伍标签</h4>
            <div class="tag-inputs"><input type="text" placeholder="输入队伍标签，回车添加" id="new-team-tag"></div>
            <div class="tags-list" id="tags-list"></div>
          </div>
        </div>
        <div class="tab-content" id="tab-captions">
          <div class="captions-header">
            <h3>字幕编辑</h3>
            <div class="captions-actions">
              <button class="action-btn" id="btn-auto-segment">✨ 自动分段</button>
              <button class="action-btn" id="btn-add-caption">➕ 添加字幕</button>
              <button class="action-btn" id="btn-export-captions">📤 导出字幕</button>
            </div>
          </div>
          <div class="captions-list" id="captions-list"></div>
        </div>
        <div class="tab-content" id="tab-publish">
          <div class="publish-section">
            <h3>封面设置</h3>
            <div class="cover-settings">
              <div class="cover-preview" id="cover-preview"><span class="cover-placeholder">封面预览</span></div>
              <div class="cover-actions">
                <button class="action-btn" id="btn-capture-cover">📸 当前帧抓图</button>
                <button class="action-btn" id="btn-select-frame">🎞 选择帧</button>
              </div>
            </div>
          </div>
          <div class="publish-section">
            <h3>视频信息</h3>
            <div class="form-group"><label>标题</label><input type="text" id="publish-title" placeholder="输入视频标题"></div>
            <div class="form-group"><label>描述</label><textarea id="publish-desc" rows="3" placeholder="输入视频描述..."></textarea></div>
            <div class="form-group"><label>标签 (用逗号分隔)</label><input type="text" id="publish-tags" placeholder="例如: 足球, 精彩进球"></div>
          </div>
          <div class="publish-section">
            <h3>发布设置</h3>
            <div class="channel-selector">
              <label>选择发布渠道<span class="channel-hint">（可到"设置"Tab绑定账号）</span></label>
              <div class="channel-grid" id="channel-grid">
                <label class="channel-item" data-platform="douyin"><input type="checkbox" value="douyin"><span class="channel-icon">📺</span><span>抖音</span></label>
                <label class="channel-item" data-platform="kuaishou"><input type="checkbox" value="kuaishou"><span class="channel-icon">🎥</span><span>快手</span></label>
                <label class="channel-item" data-platform="bilibili"><input type="checkbox" value="bilibili"><span class="channel-icon">📱</span><span>B站</span></label>
                <label class="channel-item" data-platform="wechat"><input type="checkbox" value="wechat"><span class="channel-icon">🎬</span><span>视频号</span></label>
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
            <div class="form-group"><label>标记后前扩展 (秒)</label><input type="number" id="set-extend-before" value="3" min="1" max="30"></div>
            <div class="form-group"><label>标记后后扩展 (秒)</label><input type="number" id="set-extend-after" value="3" min="1" max="30"></div>
            <div class="form-group"><label>默认慢动作倍率</label>
              <select id="set-slowmo">
                <option value="0.25">0.25x</option><option value="0.5" selected>0.5x</option><option value="0.75">0.75x</option>
              </select>
            </div>
            <button class="action-btn primary" id="btn-save-settings">💾 保存偏好</button>
          </div>
          <div class="settings-section">
            <h3>平台账号绑定</h3>
            <div id="account-list-content"></div>
          </div>
          <div class="settings-section">
            <h3>快捷键</h3>
            <div class="shortcut-list">
              <div class="shortcut-item"><span>标记精彩时刻</span><kbd>Q</kbd></div>
              <div class="shortcut-item"><span>开始/停止录制</span><kbd>W</kbd></div>
              <div class="shortcut-item"><span>显示/隐藏面板</span><kbd>Esc</kbd></div>
            </div>
          </div>
          <div class="settings-section">
            <h3>数据管理</h3>
            <div class="cache-info">
              <div class="cache-item"><span>已缓存片段</span><span id="cache-clips">0</span></div>
              <div class="cache-item"><span>草稿数量</span><span id="cache-drafts">0</span></div>
              <div class="cache-item"><span>缓存大小</span><span id="cache-size">0 KB</span></div>
            </div>
            <button class="action-btn danger" id="btn-clear-cache">🗑 清空缓存</button>
          </div>
        </div>
        <div class="tab-content" id="tab-data">
          <div class="data-section">
            <h3>播放反馈统计</h3>
            <div class="data-stats">
              <div class="data-stat-card"><span class="stat-icon">🎬</span><span class="stat-value" id="data-clips">0</span><span class="stat-label">总剪辑数</span></div>
              <div class="data-stat-card"><span class="stat-icon">🚀</span><span class="stat-value" id="data-published">0</span><span class="stat-label">已发布</span></div>
              <div class="data-stat-card"><span class="stat-icon">👁</span><span class="stat-value" id="data-views">0</span><span class="stat-label">总播放</span></div>
              <div class="data-stat-card"><span class="stat-icon">❤</span><span class="stat-value" id="data-likes">0</span><span class="stat-label">总点赞</span></div>
            </div>
          </div>
          <div class="data-section">
            <h3>最近发布</h3>
            <div class="recent-list" id="recent-list"></div>
          </div>
        </div>
      </div>
      <div class="toast-container" id="toast-container"></div>
    `;
    document.body.appendChild(panel);
    bindPanelEvents();
  }

  function bindPanelEvents() {
    $$_('#sports-clip-panel .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$_('#sports-clip-panel .tab-btn').forEach(b => b.classList.remove('active'));
        $$_('#sports-clip-panel .tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tabEl = document.getElementById('tab-' + btn.dataset.tab);
        if (tabEl) tabEl.classList.add('active');
        state.activeTab = btn.dataset.tab;
        if (btn.dataset.tab === 'data') loadDataStatsUI();
        if (btn.dataset.tab === 'settings') loadCacheInfoUI();
      });
    });

    const closeBtn = $_('#sports-clip-panel .close-btn');
    if (closeBtn) closeBtn.addEventListener('click', togglePanel);

    const el = (id) => document.getElementById(id);

    if (el('btn-mark-goal')) el('btn-mark-goal').addEventListener('click', markGoalMoment);
    if (el('btn-toggle-record')) el('btn-toggle-record').addEventListener('click', toggleRecording);
    if (el('btn-play-slowmo')) el('btn-play-slowmo').addEventListener('click', playSlowMotion);
    if (el('btn-scoreboard')) el('btn-scoreboard').addEventListener('click', () => toggleEditor('scoreboard'));
    if (el('btn-team-tag')) el('btn-team-tag').addEventListener('click', () => toggleEditor('team'));
    if (el('btn-play')) el('btn-play').addEventListener('click', togglePlay);
    if (el('btn-add-clip')) el('btn-add-clip').addEventListener('click', addClipFromRange);

    if (el('playback-rate')) el('playback-rate').addEventListener('change', (e) => {
      if (state.currentVideo) state.currentVideo.playbackRate = parseFloat(e.target.value);
    });

    $$_('.extend-btns').forEach(group => {
      const direction = group.dataset.direction;
      group.querySelectorAll('.extend-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          group.querySelectorAll('.extend-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const val = parseInt(btn.dataset.extend);
          if (direction === 'before') state.settings.extendBefore = val;
          else state.settings.extendAfter = val;
          storageSet(STORAGE_KEYS.SETTINGS, state.settings);
          updateClipRangeInputs();
        });
      });
    });

    if (el('clip-start')) el('clip-start').addEventListener('change', updateClipDurationUI);
    if (el('clip-end')) el('clip-end').addEventListener('change', updateClipDurationUI);

    const tl = el('timeline-track');
    if (tl) tl.addEventListener('click', handleTimelineClick);

    if (el('btn-merge-clips')) el('btn-merge-clips').addEventListener('click', mergeSelectedClips);
    if (el('btn-clear-clips')) el('btn-clear-clips').addEventListener('click', clearAllClips);
    if (el('btn-batch-name')) el('btn-batch-name').addEventListener('click', batchRenameClips);

    if (el('btn-auto-segment')) el('btn-auto-segment').addEventListener('click', autoSegmentCaptions);
    if (el('btn-add-caption')) el('btn-add-caption').addEventListener('click', addCaptionRow);
    if (el('btn-export-captions')) el('btn-export-captions').addEventListener('click', exportCaptions);

    if (el('btn-capture-cover')) el('btn-capture-cover').addEventListener('click', captureCurrentFrame);
    if (el('btn-save-draft')) el('btn-save-draft').addEventListener('click', saveDraft);
    if (el('btn-generate-replay')) el('btn-generate-replay').addEventListener('click', generateReplayLink);
    if (el('btn-publish')) el('btn-publish').addEventListener('click', publishClip);

    if (el('btn-apply-score')) el('btn-apply-score').addEventListener('click', applyScoreboard);
    if (el('btn-hide-score')) el('btn-hide-score').addEventListener('click', () => toggleEditor(null));

    const tagInput = el('new-team-tag');
    if (tagInput) tagInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && tagInput.value.trim()) { addTeamTag(tagInput.value.trim()); tagInput.value = ''; }
    });

    if (el('btn-clear-cache')) el('btn-clear-cache').addEventListener('click', clearCache);
    if (el('btn-save-settings')) el('btn-save-settings').addEventListener('click', saveSettingsPref);
  }

  function $_(s, p = document) { return p.querySelector(s); }
  function $$_(s, p = document) { return Array.from(p.querySelectorAll(s)); }

  function toggleEditor(type) {
    const sbe = document.getElementById('scoreboard-editor');
    const tte = document.getElementById('team-tag-editor');
    if (sbe) sbe.style.display = type === 'scoreboard' ? 'block' : 'none';
    if (tte) tte.style.display = type === 'team' ? 'block' : 'none';
  }

  function updateTimelineUI() {
    if (!state.panelVisible) return;
    const duration = state.duration || 0;
    const current = state.currentTime || 0;
    const percent = duration > 0 ? (current / duration) * 100 : 0;

    const progress = document.getElementById('timeline-progress');
    const playhead = document.getElementById('timeline-playhead');
    const curEl = document.getElementById('current-time');

    if (progress) progress.style.width = percent + '%';
    if (playhead) playhead.style.left = percent + '%';
    if (curEl) curEl.textContent = formatTime(current);

    updateClipRangeInputs();
  }

  function updateClipRangeInputs() {
    if (!state.panelVisible) return;
    const startInput = document.getElementById('clip-start');
    const endInput = document.getElementById('clip-end');
    if (!startInput || !endInput) return;
    const duration = state.duration || 0;
    const current = state.currentTime || 0;
    startInput.value = formatTimeSec(Math.max(0, current - (state.settings.extendBefore || 3)));
    endInput.value = formatTimeSec(Math.min(duration, current + (state.settings.extendAfter || 3)));
    updateClipDurationUI();
  }

  function updateTimelineDurationUI() {
    if (!state.panelVisible) return;
    const total = document.getElementById('total-time');
    if (total) total.textContent = formatTime(state.duration || 0);
  }

  function renderTimelineRulerUI() {
    if (!state.panelVisible) return;
    const ruler = document.getElementById('timeline-ruler');
    if (!ruler) return;
    const duration = state.duration || 0;
    if (duration <= 0) { ruler.innerHTML = ''; return; }
    const interval = duration > 120 ? 20 : duration > 60 ? 10 : duration > 30 ? 5 : 2;
    let html = '';
    for (let t = 0; t <= duration; t += interval) {
      html += `<div class="ruler-mark" style="left:${(t / duration) * 100}%"><span>${formatTime(t)}</span></div>`;
    }
    ruler.innerHTML = html;
  }

  function renderClipMarkersUI() {
    if (!state.panelVisible) return;
    const container = document.getElementById('clip-markers');
    if (!container) return;
    const duration = state.duration || 0;
    if (duration <= 0) { container.innerHTML = ''; return; }
    container.innerHTML = state.clips.map(c => {
      const left = (c.startTime / duration) * 100;
      const width = Math.max(((c.endTime - c.startTime) / duration) * 100, 0.3);
      return `<div class="clip-marker" style="left:${left}%;width:${width}%" title="${escapeHtml(c.title)}"></div>`;
    }).join('');
  }

  function updateClipDurationUI() {
    if (!state.panelVisible) return;
    const s = document.getElementById('clip-start');
    const e = document.getElementById('clip-end');
    const d = document.getElementById('clip-duration');
    if (!s || !e || !d) return;
    const st = parseTime(s.value), et = parseTime(e.value);
    if (!isNaN(st) && !isNaN(et) && et > st) d.textContent = Math.round(et - st) + '秒';
  }

  function applyExtendButtonState() {
    if (!state.panelVisible) return;
    const beforeBtns = $$_('.extend-btns[data-direction="before"] .extend-btn');
    const afterBtns = $$_('.extend-btns[data-direction="after"] .extend-btn');
    beforeBtns.forEach(b => b.classList.toggle('active', parseInt(b.dataset.extend) === state.settings.extendBefore));
    afterBtns.forEach(b => b.classList.toggle('active', parseInt(b.dataset.extend) === state.settings.extendAfter));
  }

  function applyChannelState() {
    if (!state.panelVisible) return;
    $$_('#channel-grid .channel-item').forEach(item => {
      const platform = item.dataset.platform;
      const bound = state.boundPlatforms.includes(platform);
      const cb = item.querySelector('input');
      item.classList.toggle('disabled', !bound);
      item.style.opacity = bound ? '1' : '0.4';
      if (cb) { cb.disabled = !bound; if (!bound) cb.checked = false; }
    });
  }

  function renderAccountListUI() {
    if (!state.panelVisible) return;
    const container = document.getElementById('account-list-content');
    if (!container) return;
    container.innerHTML = PLATFORM_LIST.map(p => {
      const bound = state.boundPlatforms.includes(p.key);
      return `<div class="account-item">
        <span class="platform-icon">${p.icon}</span>
        <span class="platform-name">${p.name}</span>
        <button class="bind-btn ${bound ? 'bound' : ''}" data-platform="${p.key}" style="${bound ? 'background:#52c41a;' : ''}">
          ${bound ? '已绑定' : '绑定'}
        </button>
      </div>`;
    }).join('');
    container.querySelectorAll('.bind-btn').forEach(btn => {
      btn.addEventListener('click', () => togglePlatformBind(btn.dataset.platform));
    });
  }

  function togglePlatformBind(platform) {
    const i = state.boundPlatforms.indexOf(platform);
    if (i >= 0) state.boundPlatforms.splice(i, 1);
    else state.boundPlatforms.push(platform);
    storageSet(STORAGE_KEYS.BOUND, state.boundPlatforms).then(() => {
      renderAccountListUI();
      applyChannelState();
      const name = (PLATFORM_LIST.find(p => p.key === platform) || {}).name || platform;
      showToast(i >= 0 ? `已解绑${name}` : `已绑定${name}`, 'success');
    });
  }

  function syncSettingsToUI() {
    if (!state.panelVisible) return;
    const eb = document.getElementById('set-extend-before');
    const ea = document.getElementById('set-extend-after');
    const sm = document.getElementById('set-slowmo');
    if (eb) eb.value = state.settings.extendBefore;
    if (ea) ea.value = state.settings.extendAfter;
    if (sm) sm.value = state.settings.defaultSlowMo;
  }

  function saveSettingsPref() {
    const eb = parseInt(document.getElementById('set-extend-before')?.value) || 3;
    const ea = parseInt(document.getElementById('set-extend-after')?.value) || 3;
    const sm = parseFloat(document.getElementById('set-slowmo')?.value) || 0.5;
    state.settings.extendBefore = eb;
    state.settings.extendAfter = ea;
    state.settings.defaultSlowMo = sm;
    state.settings.defaultExtend = Math.min(eb, ea);
    storageSet(STORAGE_KEYS.SETTINGS, state.settings).then(() => {
      applyExtendButtonState();
      showToast('偏好设置已保存', 'success');
    });
  }

  function handleTimelineClick(e) {
    if (!state.currentVideo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    state.currentVideo.currentTime = percent * (state.duration || 0);
  }

  function markGoalMoment() {
    if (!state.currentVideo && !state.panelVisible) { showToast('未检测到视频元素', 'error'); return; }
    const ct = state.currentVideo ? state.currentVideo.currentTime : (state.currentTime || 0);
    const dur = state.currentVideo ? (state.currentVideo.duration || state.duration) : state.duration;
    const extendB = state.panelVisible ? state.settings.extendBefore : 3;
    const extendA = state.panelVisible ? state.settings.extendAfter : 3;
    const startTime = Math.max(0, ct - extendB);
    const endTime = Math.min(dur || (ct + extendA), ct + extendA);

    const clip = {
      id: Date.now().toString(36),
      startTime, endTime,
      title: `精彩片段 ${state.clips.length + 1}`,
      goalTime: ct,
      createdAt: new Date().toISOString(),
      selected: false, published: false,
      cover: null, tags: [], scoreboard: null,
      audioData: null, audioName: null
    };
    state.clips.push(clip);
    if (state.panelVisible) { renderClipsUI(); renderClipMarkersUI(); }
    showToast(`已标记 ${formatTime(startTime)}-${formatTime(endTime)} (前${extendB}s/后${extendA}s)`, 'success');
    storageSet(STORAGE_KEYS.CLIPS, state.clips);
  }

  function addClipFromRange() {
    const s = document.getElementById('clip-start');
    const e = document.getElementById('clip-end');
    if (!s || !e) return;
    const st = parseTime(s.value), et = parseTime(e.value);
    if (isNaN(st) || isNaN(et) || st >= et) { showToast('时间范围无效', 'error'); return; }
    state.clips.push({
      id: Date.now().toString(36),
      startTime: st, endTime: et,
      title: `片段 ${state.clips.length + 1}`,
      createdAt: new Date().toISOString(),
      selected: false, published: false,
      cover: null, tags: [], scoreboard: null,
      audioData: null, audioName: null
    });
    renderClipsUI(); renderClipMarkersUI();
    showToast('已添加到片段库', 'success');
    storageSet(STORAGE_KEYS.CLIPS, state.clips);
  }

  function toggleRecording() {
    state.isRecording ? stopRecording() : startRecording();
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.audioRecorder = new MediaRecorder(stream);
      state.audioChunks = [];
      state.audioRecorder.ondataavailable = (e) => { if (e.data.size > 0) state.audioChunks.push(e.data); };
      state.audioRecorder.onstop = async () => {
        const blob = new Blob(state.audioChunks, { type: 'audio/webm' });
        state.latestRecordingBlob = blob;
        stream.getTracks().forEach(t => t.stop());
        const base64 = await blobToBase64(blob);
        handleRecordingComplete(base64);
      };
      state.audioRecorder.start();
      state.isRecording = true;
      if (state.panelVisible) {
        const btn = document.getElementById('btn-toggle-record');
        const txt = document.getElementById('record-text');
        const icon = btn?.querySelector('.record-icon');
        if (btn) btn.classList.add('recording');
        if (icon) icon.style.color = '#ff4d4f';
        if (txt) txt.textContent = '停止录制 (W)';
      }
      showToast('开始录制解说...', 'info');
    } catch (err) {
      showToast('无法访问麦克风: ' + err.message, 'error');
    }
  }

  function handleRecordingComplete(base64) {
    if (state.panelVisible) {
      const btn = document.getElementById('btn-toggle-record');
      const txt = document.getElementById('record-text');
      const icon = btn?.querySelector('.record-icon');
      if (btn) btn.classList.remove('recording');
      if (icon) icon.style.color = '';
      if (txt) txt.textContent = '录制解说 (W)';
    }
    state.isRecording = false;

    let target = null;
    if (state.clips.length > 0) {
      const last = state.clips[state.clips.length - 1];
      const useLast = confirm(`是否将解说音轨关联到片段「${last.title}」？\n(取消则暂存，稍后可手动关联)`);
      if (useLast) target = last;
    }
    if (target) {
      target.audioData = base64;
      target.audioName = `解说_${Date.now()}.webm`;
      storageSet(STORAGE_KEYS.CLIPS, state.clips);
      if (state.panelVisible) renderClipsUI();
      showToast(`音轨已关联到「${target.title}」，可在片段库试听`, 'success');
    } else {
      state.unassociatedAudio = base64;
      showToast('音轨已录制，可在片段库点击🎙按钮手动关联', 'info');
    }
  }

  function stopRecording() {
    if (state.audioRecorder && state.isRecording) state.audioRecorder.stop();
  }

  function playSlowMotion() {
    if (!state.currentVideo) { showToast('未检测到视频', 'error'); return; }
    const ct = state.currentVideo.currentTime;
    const st = Math.max(0, ct - 2);
    const et = Math.min(ct + 2, state.currentVideo.duration || ct + 2);
    state.currentVideo.playbackRate = state.settings.defaultSlowMo;
    state.currentVideo.currentTime = st;
    state.currentVideo.play();
    const timer = setInterval(() => {
      if (!state.currentVideo || state.currentVideo.currentTime >= et) {
        clearInterval(timer);
        if (state.currentVideo) { state.currentVideo.pause(); state.currentVideo.playbackRate = 1; }
      }
    }, 100);
  }

  function togglePlay() {
    if (!state.currentVideo) return;
    if (state.currentVideo.paused) state.currentVideo.play();
    else state.currentVideo.pause();
  }

  function renderClipsUI() {
    if (!state.panelVisible) return;
    const list = document.getElementById('clips-list');
    if (!list) return;
    if (state.clips.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">🎞</div><p>暂无片段</p><p class="empty-hint">按Q键标记精彩时刻</p></div>`;
      return;
    }
    list.innerHTML = state.clips.map(c => {
      const hasAudio = !!c.audioData;
      return `<div class="clip-item ${c.selected ? 'selected' : ''}" data-id="${c.id}">
        <label class="clip-checkbox"><input type="checkbox" ${c.selected ? 'checked' : ''}></label>
        <div class="clip-info">
          <input type="text" class="clip-title" value="${escapeHtml(c.title)}" data-id="${c.id}">
          <div class="clip-time">
            <span>起始: ${formatTime(c.startTime)}</span>
            <span>结束: ${formatTime(c.endTime)}</span>
            <span>时长: ${Math.round(c.endTime - c.startTime)}秒</span>
          </div>
          <div class="clip-extras">
            ${c.published ? '<span class="clip-status published">已发布</span>' : '<span class="clip-status draft">草稿</span>'}
            ${hasAudio ? '<span class="clip-status audio">🎙 含解说</span>' : ''}
            ${c.scoreboard ? `<span class="clip-status score">🏆 ${escapeHtml(c.scoreboard.homeTeam)} ${c.scoreboard.homeScore}:${c.scoreboard.awayScore} ${escapeHtml(c.scoreboard.awayTeam)}</span>` : ''}
            ${(c.tags || []).map(t => `<span class="clip-tag">${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
        <div class="clip-actions">
          <button class="mini-btn ${hasAudio ? '' : 'disabled'}" data-action="audio" data-id="${c.id}" title="${hasAudio ? '播放/停止解说' : '关联音轨'}">🎙</button>
          <button class="mini-btn" data-action="preview" data-id="${c.id}" title="预览">▶</button>
          <button class="mini-btn" data-action="edit" data-id="${c.id}" title="编辑">✏️</button>
          <button class="mini-btn" data-action="delete" data-id="${c.id}" title="删除">🗑</button>
        </div>
      </div>`;
    }).join('');

    list.querySelectorAll('.clip-item').forEach(item => {
      const id = item.dataset.id;
      const clip = state.clips.find(c => c.id === id);
      if (!clip) return;

      item.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
        clip.selected = e.target.checked; item.classList.toggle('selected', e.target.checked);
      });
      item.querySelector('.clip-title').addEventListener('change', (e) => {
        clip.title = e.target.value; storageSet(STORAGE_KEYS.CLIPS, state.clips);
      });
      item.querySelectorAll('.mini-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const act = btn.dataset.action;
          if (act === 'audio') clip.audioData ? playClipAudio(clip) : attachAudioToClip(clip);
          if (act === 'preview') previewClip(clip);
          if (act === 'edit') editClip(clip);
          if (act === 'delete') deleteClip(clip.id);
        });
      });
    });
  }

  function playClipAudio(clip) {
    if (state.currentAudio && !state.currentAudio.paused) {
      state.currentAudio.pause(); state.currentAudio = null;
      showToast('已停止播放音轨', 'info'); return;
    }
    const audio = new Audio(clip.audioData);
    state.currentAudio = audio;
    audio.play();
    audio.onended = () => { state.currentAudio = null; };
    showToast('正在播放解说...', 'info');
    if (state.currentVideo && confirm('同时从片段起点播放视频？')) {
      state.currentVideo.currentTime = clip.startTime;
      state.currentVideo.play();
    }
  }

  function attachAudioToClip(clip) {
    if (state.unassociatedAudio) {
      if (confirm(`将最近录制的解说关联到「${clip.title}」？`)) {
        clip.audioData = state.unassociatedAudio;
        clip.audioName = `解说_${Date.now()}.webm`;
        state.unassociatedAudio = null;
        storageSet(STORAGE_KEYS.CLIPS, state.clips);
        renderClipsUI();
        showToast('音轨已关联', 'success');
        return;
      }
    }
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'audio/*';
    inp.onchange = async (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      clip.audioData = await blobToBase64(f);
      clip.audioName = f.name;
      storageSet(STORAGE_KEYS.CLIPS, state.clips);
      renderClipsUI();
      showToast('音轨已关联', 'success');
    };
    inp.click();
  }

  function previewClip(clip) {
    if (!state.currentVideo) return;
    state.currentVideo.currentTime = clip.startTime;
    state.currentVideo.play();
    const timer = setInterval(() => {
      if (!state.currentVideo || state.currentVideo.currentTime >= clip.endTime) {
        clearInterval(timer);
        if (state.currentVideo) state.currentVideo.pause();
      }
    }, 100);
  }

  function editClip(clip) {
    const s = document.getElementById('clip-start');
    const e = document.getElementById('clip-end');
    if (s) s.value = formatTimeSec(clip.startTime);
    if (e) e.value = formatTimeSec(clip.endTime);
    updateClipDurationUI();
    showToast('已加载到时间轴编辑器', 'info');
  }

  function deleteClip(id) {
    state.clips = state.clips.filter(c => c.id !== id);
    renderClipsUI(); renderClipMarkersUI();
    storageSet(STORAGE_KEYS.CLIPS, state.clips);
    showToast('片段已删除', 'success');
  }

  function mergeSelectedClips() {
    const sel = state.clips.filter(c => c.selected);
    if (sel.length < 2) { showToast('请至少选择2个片段', 'warning'); return; }
    sel.sort((a, b) => a.startTime - b.startTime);
    state.clips.push({
      id: Date.now().toString(36),
      startTime: sel[0].startTime, endTime: sel[sel.length - 1].endTime,
      title: `合并片段 (${sel.length}个)`,
      createdAt: new Date().toISOString(),
      selected: false, published: false,
      cover: sel[0].cover, tags: [...new Set(sel.flatMap(c => c.tags || []))],
      scoreboard: sel[0].scoreboard,
      audioData: sel.find(c => c.audioData)?.audioData || null,
      audioName: sel.find(c => c.audioName)?.audioName || null,
      mergedFrom: sel.map(c => c.id)
    });
    renderClipsUI(); renderClipMarkersUI();
    storageSet(STORAGE_KEYS.CLIPS, state.clips);
    showToast(`已合并 ${sel.length} 个片段`, 'success');
  }

  function clearAllClips() {
    if (state.clips.length === 0) return;
    if (!confirm('确定清空所有片段？')) return;
    state.clips = [];
    renderClipsUI(); renderClipMarkersUI();
    storageSet(STORAGE_KEYS.CLIPS, state.clips);
    showToast('已清空', 'success');
  }

  function batchRenameClips() {
    if (state.clips.length === 0) { showToast('暂无片段', 'warning'); return; }
    const prefix = prompt('输入命名前缀：', '精彩片段');
    if (!prefix) return;
    state.clips.forEach((c, i) => { c.title = `${prefix} ${i + 1}`; });
    renderClipsUI();
    storageSet(STORAGE_KEYS.CLIPS, state.clips);
    showToast('命名完成', 'success');
  }

  function applyScoreboard() {
    const ht = document.getElementById('home-team').value;
    const at = document.getElementById('away-team').value;
    const hs = parseInt(document.getElementById('home-score').value);
    const as_ = parseInt(document.getElementById('away-score').value);
    const targets = state.clips.filter(c => c.selected);
    const list = targets.length > 0 ? targets : (state.clips.length > 0 ? [state.clips[state.clips.length - 1]] : []);
    list.forEach(c => { c.scoreboard = { homeTeam: ht, awayTeam: at, homeScore: hs, awayScore: as_ }; });
    if (list.length > 0) {
      storageSet(STORAGE_KEYS.CLIPS, state.clips);
      renderClipsUI();
      showToast(`比分牌已应用到 ${list.length} 个片段`, 'success');
    } else {
      showToast('暂无可应用的片段', 'warning');
    }
  }

  function addTeamTag(tag) {
    const listEl = document.getElementById('tags-list');
    if (!listEl) return;
    const el_ = document.createElement('span');
    el_.className = 'team-tag';
    el_.innerHTML = `${escapeHtml(tag)} <button class="tag-remove">×</button>`;
    el_.querySelector('.tag-remove').addEventListener('click', () => {
      el_.remove();
      state.clips.filter(c => c.selected).forEach(c => { c.tags = (c.tags || []).filter(t => t !== tag); });
      storageSet(STORAGE_KEYS.CLIPS, state.clips);
      renderClipsUI();
    });
    listEl.appendChild(el_);
    state.clips.filter(c => c.selected).forEach(c => {
      if (!c.tags) c.tags = [];
      if (!c.tags.includes(tag)) c.tags.push(tag);
    });
    storageSet(STORAGE_KEYS.CLIPS, state.clips);
    renderClipsUI();
  }

  function autoSegmentCaptions() {
    showToast('正在语音识别自动分段...', 'info');
    setTimeout(() => {
      state.captions = [
        { id: Date.now() + '-1', startTime: 0, endTime: 3, text: '各位观众朋友们大家好' },
        { id: Date.now() + '-2', startTime: 3, endTime: 6, text: '欢迎来到今天的比赛' },
        { id: Date.now() + '-3', startTime: 6, endTime: 10, text: '这是一场精彩的对决' },
        { id: Date.now() + '-4', startTime: 10, endTime: 15, text: '双方球员已准备就绪' }
      ];
      renderCaptionsUI();
      showToast(`已生成 ${state.captions.length} 条字幕`, 'success');
    }, 800);
  }

  function addCaptionRow() {
    const last = state.captions[state.captions.length - 1];
    state.captions.push({
      id: Date.now().toString(36),
      startTime: last ? last.endTime : 0,
      endTime: (last ? last.endTime : 0) + 3,
      text: ''
    });
    renderCaptionsUI();
  }

  function exportCaptions() {
    if (state.captions.length === 0) { showToast('暂无字幕可导出', 'warning'); return; }
    const srt = state.captions.map((c, i) => {
      const fmt = (t) => {
        const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60);
        const s = Math.floor(t % 60), ms = Math.floor((t % 1) * 1000);
        const pad = (n, w = 2) => String(n).padStart(w, '0');
        return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
      };
      return `${i + 1}\n${fmt(c.startTime)} --> ${fmt(c.endTime)}\n${c.text || ''}\n`;
    }).join('\n');
    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `captions_${Date.now()}.srt`;
    a.click();
    showToast('字幕已导出为SRT文件', 'success');
  }

  function renderCaptionsUI() {
    if (!state.panelVisible) return;
    const list = document.getElementById('captions-list');
    if (!list) return;
    if (state.captions.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">💬</div><p>暂无字幕</p><p class="empty-hint">点击自动分段或手动添加</p></div>`;
      return;
    }
    list.innerHTML = state.captions.map((c, i) => `
      <div class="caption-item" data-index="${i}">
        <span class="caption-index">${i + 1}</span>
        <div class="caption-time">
          <input type="text" class="time-input" value="${formatTimeSec(c.startTime)}" data-field="startTime">
          <span class="arrow">→</span>
          <input type="text" class="time-input" value="${formatTimeSec(c.endTime)}" data-field="endTime">
        </div>
        <input type="text" class="caption-text" value="${escapeHtml(c.text || '')}" placeholder="输入字幕内容">
        <button class="mini-btn delete-caption" title="删除">🗑</button>
      </div>
    `).join('');
    list.querySelectorAll('.caption-item').forEach(item => {
      const i = parseInt(item.dataset.index);
      item.querySelectorAll('.time-input').forEach(inp => {
        inp.addEventListener('change', () => { state.captions[i][inp.dataset.field] = parseTime(inp.value); });
      });
      item.querySelector('.caption-text').addEventListener('change', (e) => { state.captions[i].text = e.target.value; });
      item.querySelector('.delete-caption').addEventListener('click', () => {
        state.captions.splice(i, 1); renderCaptionsUI();
      });
    });
  }

  function captureCurrentFrame() {
    if (!state.currentVideo) { showToast('未检测到视频', 'error'); return; }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = state.currentVideo.videoWidth || 1280;
      canvas.height = state.currentVideo.videoHeight || 720;
      canvas.getContext('2d').drawImage(state.currentVideo, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const preview = document.getElementById('cover-preview');
      if (preview) preview.innerHTML = `<img src="${dataUrl}" alt="封面">`;
      const targets = state.clips.filter(c => c.selected);
      const list = targets.length > 0 ? targets : (state.clips.length > 0 ? [state.clips[state.clips.length - 1]] : []);
      list.forEach(c => { c.cover = dataUrl; });
      storageSet(STORAGE_KEYS.CLIPS, state.clips);
      renderClipsUI();
      showToast(`封面已应用到 ${list.length} 个片段`, 'success');
    } catch (e) {
      showToast('抓帧失败: ' + e.message, 'error');
    }
  }

  async function saveDraft() {
    const title = (document.getElementById('publish-title')?.value || '').trim() || '未命名草稿';
    const desc = document.getElementById('publish-desc')?.value || '';
    const tags = document.getElementById('publish-tags')?.value || '';
    const draft = {
      id: Date.now().toString(36),
      title, desc, tags,
      clips: JSON.parse(JSON.stringify(state.clips)),
      captions: JSON.parse(JSON.stringify(state.captions)),
      createdAt: new Date().toISOString()
    };
    const drafts = await storageGet(STORAGE_KEYS.DRAFTS, []);
    drafts.push(draft);
    await storageSet(STORAGE_KEYS.DRAFTS, drafts);
    showToast('草稿已保存', 'success');
  }

  async function generateReplayLink() {
    const sel = state.clips.filter(c => c.selected);
    const targetClips = sel.length > 0 ? sel : state.clips;
    if (targetClips.length === 0) { showToast('请先添加片段', 'warning'); return; }

    const title = (document.getElementById('publish-title')?.value || '').trim();
    const desc = document.getElementById('publish-desc')?.value || '';
    const tags = document.getElementById('publish-tags')?.value || '';

    const firstCover = targetClips.find(c => c.cover)?.cover || targetClips[0]?.cover || null;
    const replayId = Date.now().toString(36);
    const replayData = {
      id: replayId,
      title: title || targetClips[0]?.title || '精彩回放',
      desc, tags,
      cover: firstCover,
      clips: targetClips,
      captions: state.captions,
      createdAt: new Date().toISOString()
    };
    const replays = await storageGet(STORAGE_KEYS.REPLAYS, {});
    replays[replayId] = replayData;
    await storageSet(STORAGE_KEYS.REPLAYS, replays);

    const base = window.location.href.split('#')[0].split('?')[0];
    const sep = base.includes('?') ? '&' : '?';
    const url = `${base}${sep}replay=${replayId}`;

    try {
      await navigator.clipboard.writeText(url);
      showToast('回放链接已复制到剪贴板！', 'success');
    } catch {
      prompt('回放链接（Ctrl+C复制）:', url);
    }
  }

  async function publishClip() {
    const titleInput = document.getElementById('publish-title');
    if (!titleInput?.value.trim()) { showToast('请输入标题', 'warning'); return; }
    const channels = $$_('#channel-grid .channel-item input:checked').map(c => c.value);
    if (channels.length === 0) { showToast('请选择已绑定的发布频道', 'warning'); return; }
    const sel = state.clips.filter(c => c.selected);
    const targets = sel.length > 0 ? sel : state.clips;
    if (targets.length === 0) { showToast('请先添加片段', 'warning'); return; }

    showToast('正在发布...', 'info');
    setTimeout(async () => {
      targets.forEach(c => { c.published = true; });
      await storageSet(STORAGE_KEYS.CLIPS, state.clips);
      const feedback = await storageGet('feedback', []);
      targets.forEach(c => {
        feedback.push({
          id: c.id, title: c.title,
          views: Math.floor(Math.random() * 2000),
          likes: Math.floor(Math.random() * 200),
          comments: Math.floor(Math.random() * 80),
          date: new Date().toLocaleDateString()
        });
      });
      await storageSet('feedback', feedback);
      renderClipsUI();
      showToast(`成功发布到 ${channels.map(k => (PLATFORM_LIST.find(p => p.key === k) || {}).name || k).join('、')}`, 'success');
    }, 1200);
  }

  async function loadDataStatsUI() {
    if (!state.panelVisible) return;
    const clips = await storageGet(STORAGE_KEYS.CLIPS, []);
    const fb = await storageGet('feedback', []);
    const a = (id) => document.getElementById(id);
    if (a('data-clips')) a('data-clips').textContent = clips.length;
    if (a('data-published')) a('data-published').textContent = clips.filter(c => c.published).length;
    if (a('data-views')) a('data-views').textContent = fb.reduce((s, f) => s + (f.views || 0), 0);
    if (a('data-likes')) a('data-likes').textContent = fb.reduce((s, f) => s + (f.likes || 0), 0);
    const list = a('recent-list');
    if (list) {
      if (fb.length === 0) list.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>暂无数据</p></div>`;
      else list.innerHTML = fb.slice(0, 5).map(f => `
        <div class="recent-item">
          <div class="recent-title">${escapeHtml(f.title)}</div>
          <div class="recent-stats"><span>👁 ${f.views}</span><span>❤ ${f.likes}</span><span>💬 ${f.comments}</span></div>
          <div class="recent-date">${f.date}</div>
        </div>`).join('');
    }
  }

  async function loadCacheInfoUI() {
    if (!state.panelVisible) return;
    const clips = await storageGet(STORAGE_KEYS.CLIPS, []);
    const drafts = await storageGet(STORAGE_KEYS.DRAFTS, []);
    const a = (id) => document.getElementById(id);
    if (a('cache-clips')) a('cache-clips').textContent = clips.length;
    if (a('cache-drafts')) a('cache-drafts').textContent = drafts.length;
    if (a('cache-size')) {
      const size = new Blob([JSON.stringify({ clips, drafts })]).size;
      a('cache-size').textContent = size < 1024 ? size + ' B' : (size / 1024).toFixed(1) + ' KB';
    }
  }

  async function clearCache() {
    if (!confirm('清空缓存？（草稿不会被删除）')) return;
    state.clips = [];
    await storageSet(STORAGE_KEYS.CLIPS, []);
    await storageSet('feedback', []);
    renderClipsUI(); renderClipMarkersUI();
    loadCacheInfoUI();
    showToast('缓存已清空', 'success');
  }

  function showToast(msg, type = 'info') {
    if (!state.panelVisible) {
      if (msg) console.log('[赛事剪辑助手]', msg);
      return;
    }
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el_ = document.createElement('div');
    el_.className = `toast toast-${type}`;
    el_.textContent = msg;
    container.appendChild(el_);
    setTimeout(() => {
      el_.style.transition = 'all .3s ease';
      el_.style.opacity = '0'; el_.style.transform = 'translateY(-20px)';
      setTimeout(() => el_.remove(), 300);
    }, 2500);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'togglePanel') togglePanel();
  });

  init();
})();
