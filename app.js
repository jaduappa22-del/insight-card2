/**
 * Insight Card Viewer - Core Application Logic
 * Optimized for GitHub Pages & Cross-Platform Stability
 */

(function () {
  'use strict';

  // --- SAFE GLOBAL DATA ACCESS ---
  const INSIGHTS = window.INSIGHTS_DATA || [];
  const META = window.CATEGORY_META || {
    philosophy: { name: "철학", color: "#6366f1", badgeBg: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30", glowColor: "rgba(99, 102, 241, 0.25)" },
    psychology: { name: "심리학", color: "#10b981", badgeBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", glowColor: "rgba(16, 185, 129, 0.25)" },
    economics: { name: "경제학", color: "#f59e0b", badgeBg: "bg-amber-500/10 text-amber-400 border-amber-500/30", glowColor: "rgba(245, 158, 11, 0.25)" }
  };

  // --- STATE ---
  const state = {
    category: 'all',          // 'all' | 'philosophy' | 'psychology' | 'economics'
    currentCard: null,
    history: [],              // Array of card IDs
    historyIndex: -1,
    recentIds: [],            // Recently shown IDs to avoid immediate repeats
    bookmarks: [],            // Array of saved card IDs
    soundEnabled: true,
    animMode: 'deck',         // 'deck' | 'flip'
    isTransitioning: false
  };

  // --- SAFE AUDIO SYNTHESIZER (Lazy Loaded on User Gesture) ---
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn('AudioContext creation failed', e);
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playShuffleSound() {
    if (!state.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.14);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, now);
      filter.frequency.exponentialRampToValueAtTime(250, now + 0.14);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.15);
    } catch (e) {
      // Audio errors must never block UI
    }
  }

  function playBookmarkSound(isAdded) {
    if (!state.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      if (isAdded) {
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.15);
      } else {
        osc.frequency.setValueAtTime(659.25, now);
        osc.frequency.exponentialRampToValueAtTime(440.00, now + 0.15);
      }

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch (e) {
      // Ignore audio error
    }
  }

  // --- LOCAL STORAGE HELPERS ---
  const STORAGE_KEY = 'insight_card_viewer_bookmarks_v1';
  const SOUND_KEY = 'insight_card_viewer_sound_v1';

  function loadBookmarks() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      state.bookmarks = saved ? JSON.parse(saved) : [];
    } catch (e) {
      state.bookmarks = [];
    }
  }

  function saveBookmarks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.bookmarks));
    } catch (e) {
      console.error('Failed to save bookmarks', e);
    }
    updateBookmarkBadge();
  }

  function loadSoundSetting() {
    const saved = localStorage.getItem(SOUND_KEY);
    if (saved !== null) {
      state.soundEnabled = saved === 'true';
    }
    updateSoundUI();
  }

  function saveSoundSetting() {
    localStorage.setItem(SOUND_KEY, state.soundEnabled ? 'true' : 'false');
    updateSoundUI();
  }

  // --- DOM ELEMENTS ---
  const elements = {
    cardContainer: document.getElementById('card-container'),
    card: document.getElementById('insight-card'),
    ambientGlow: document.getElementById('ambient-glow'),
    categoryBadge: document.getElementById('card-category-badge'),
    quoteKo: document.getElementById('card-quote-ko'),
    quoteOriginal: document.getElementById('card-quote-original'),
    author: document.getElementById('card-author'),
    authorMeta: document.getElementById('card-author-meta'),
    insightText: document.getElementById('card-insight-text'),
    tagsContainer: document.getElementById('card-tags'),
    btnNext: document.getElementById('btn-next'),
    btnPrev: document.getElementById('btn-prev'),
    btnBookmark: document.getElementById('btn-bookmark'),
    btnBookmarkIcon: document.getElementById('btn-bookmark-icon'),
    btnCopy: document.getElementById('btn-copy'),
    btnSaveImage: document.getElementById('btn-save-image'),
    categoryTabs: document.querySelectorAll('.category-tab'),
    // Drawer
    btnOpenDrawer: document.getElementById('btn-open-drawer'),
    btnCloseDrawer: document.getElementById('btn-close-drawer'),
    drawerBackdrop: document.getElementById('drawer-backdrop'),
    drawerPanel: document.getElementById('drawer-panel'),
    drawerList: document.getElementById('drawer-bookmark-list'),
    drawerEmpty: document.getElementById('drawer-empty'),
    drawerBadge: document.getElementById('header-bookmark-badge'),
    btnClearAllBookmarks: document.getElementById('btn-clear-all-bookmarks'),
    // Sound & Mode
    btnToggleSound: document.getElementById('btn-toggle-sound'),
    soundIcon: document.getElementById('sound-icon'),
    animModeSelect: document.getElementById('select-anim-mode'),
    // Toast
    toast: document.getElementById('toast-notification'),
    toastText: document.getElementById('toast-text')
  };

  // --- UTILS ---
  function showToast(message) {
    if (!elements.toast || !elements.toastText) return;
    elements.toastText.textContent = message;
    elements.toast.classList.remove('hidden');
    elements.toast.classList.add('toast-enter');

    clearTimeout(elements.toast._timer);
    elements.toast._timer = setTimeout(() => {
      elements.toast.classList.add('hidden');
      elements.toast.classList.remove('toast-enter');
    }, 2400);
  }

  function getAvailableCards() {
    const list = window.INSIGHTS_DATA || INSIGHTS;
    if (state.category === 'all') {
      return list;
    }
    return list.filter(item => item.category === state.category);
  }

  function getRandomCard() {
    const list = getAvailableCards();
    if (!list || list.length === 0) return null;
    if (list.length === 1) return list[0];

    const pool = list.filter(card => !state.recentIds.includes(card.id));
    const effectivePool = pool.length > 0 ? pool : list.filter(c => !state.currentCard || c.id !== state.currentCard.id);

    const randomIndex = Math.floor(Math.random() * effectivePool.length);
    const chosen = effectivePool[randomIndex];

    state.recentIds.push(chosen.id);
    if (state.recentIds.length > Math.min(8, Math.floor(list.length / 2))) {
      state.recentIds.shift();
    }

    return chosen;
  }

  // --- CARD RENDERING ---
  function renderCardContent(card) {
    if (!card) return;
    const metaList = window.CATEGORY_META || META;
    const meta = metaList[card.category] || metaList.philosophy;

    // 1. Category Badge
    if (elements.categoryBadge) {
      elements.categoryBadge.className = `inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase border ${meta.badgeBg}`;
      elements.categoryBadge.innerHTML = `${meta.icon || '✨'} <span>${card.categoryName}</span>`;
    }

    // 2. Quotes
    if (elements.quoteKo) elements.quoteKo.textContent = `"${card.quoteKo}"`;
    if (elements.quoteOriginal) elements.quoteOriginal.textContent = card.quoteOriginal ? `— "${card.quoteOriginal}"` : '';

    // 3. Author & Source
    if (elements.author) elements.author.textContent = card.author;
    const metaParts = [];
    if (card.authorEn) metaParts.push(card.authorEn);
    if (card.source) metaParts.push(card.source);
    if (card.year) metaParts.push(`(${card.year})`);
    if (elements.authorMeta) elements.authorMeta.textContent = metaParts.join(' · ');

    // 4. Insight Text
    if (elements.insightText) elements.insightText.textContent = card.insight;

    // 5. Tags
    if (elements.tagsContainer) {
      elements.tagsContainer.innerHTML = '';
      if (card.tags && card.tags.length > 0) {
        card.tags.forEach(tag => {
          const tagEl = document.createElement('span');
          tagEl.className = 'px-2.5 py-1 text-xs rounded-lg glass-pill text-slate-300 font-medium hover:text-white transition-colors';
          tagEl.textContent = `#${tag}`;
          elements.tagsContainer.appendChild(tagEl);
        });
      }
    }

    // 6. Ambient Glow & Card Glow
    if (elements.ambientGlow) {
      elements.ambientGlow.style.backgroundColor = meta.color;
    }
    if (elements.card) {
      elements.card.style.setProperty('--card-glow', meta.glowColor);
    }

    // 7. Update Bookmark Button State
    updateBookmarkButtonState();

    // 8. Update Prev Button State
    if (elements.btnPrev) {
      elements.btnPrev.disabled = state.historyIndex <= 0;
      elements.btnPrev.style.opacity = state.historyIndex <= 0 ? '0.35' : '1';
    }
  }

  // --- TRANSITION ANIMATION WITH SAFETY WATCHDOG ---
  let safetyTimer = null;

  function transitionToCard(newCard, direction = 'next') {
    if (!newCard || state.isTransitioning) return;
    state.isTransitioning = true;

    // Safety Watchdog: Guarantee release of transition lock within 700ms
    clearTimeout(safetyTimer);
    safetyTimer = setTimeout(() => {
      state.isTransitioning = false;
      if (elements.card) {
        elements.card.classList.remove('card-anim-exit-next', 'card-anim-enter-next', 'card-anim-exit-prev', 'card-anim-enter-prev', 'card-anim-flip-exit', 'card-anim-flip-enter');
        elements.card.style.transform = '';
      }
    }, 700);

    // Audio Play
    playShuffleSound();

    const card = elements.card;
    if (!card) {
      state.currentCard = newCard;
      renderCardContent(newCard);
      state.isTransitioning = false;
      return;
    }

    // Reset inline 3D transform so CSS keyframes execute freely
    card.style.transform = '';

    const isFlip = state.animMode === 'flip';
    let exitClass = isFlip ? 'card-anim-flip-exit' : (direction === 'next' ? 'card-anim-exit-next' : 'card-anim-exit-prev');
    let enterClass = isFlip ? 'card-anim-flip-enter' : (direction === 'next' ? 'card-anim-enter-next' : 'card-anim-enter-prev');

    // Remove any lingering animation classes
    card.classList.remove('card-anim-exit-next', 'card-anim-enter-next', 'card-anim-exit-prev', 'card-anim-enter-prev', 'card-anim-flip-exit', 'card-anim-flip-enter');
    card.classList.add(exitClass);

    setTimeout(() => {
      // Swap data mid-animation
      state.currentCard = newCard;
      renderCardContent(newCard);

      card.classList.remove(exitClass);
      card.classList.add(enterClass);

      setTimeout(() => {
        card.classList.remove(enterClass);
        card.style.transform = '';
        state.isTransitioning = false;
        clearTimeout(safetyTimer);
      }, isFlip ? 420 : 460);
    }, isFlip ? 320 : 380);
  }

  function showNextCard() {
    if (state.isTransitioning) return;

    // Check if moving forward in already visited history
    if (state.historyIndex < state.history.length - 1) {
      state.historyIndex++;
      const nextCardId = state.history[state.historyIndex];
      const list = window.INSIGHTS_DATA || INSIGHTS;
      const card = list.find(c => c.id === nextCardId);
      if (card) {
        transitionToCard(card, 'next');
        return;
      }
    }

    // Pick new random card
    const nextCard = getRandomCard();
    if (!nextCard) return;

    state.history.push(nextCard.id);
    state.historyIndex = state.history.length - 1;
    transitionToCard(nextCard, 'next');
  }

  function showPrevCard() {
    if (state.isTransitioning || state.historyIndex <= 0) return;
    state.historyIndex--;
    const prevCardId = state.history[state.historyIndex];
    const list = window.INSIGHTS_DATA || INSIGHTS;
    const prevCard = list.find(c => c.id === prevCardId);
    if (prevCard) {
      transitionToCard(prevCard, 'prev');
    }
  }

  function jumpToCard(cardId) {
    if (state.isTransitioning) return;
    const list = window.INSIGHTS_DATA || INSIGHTS;
    const card = list.find(c => c.id === cardId);
    if (!card) return;

    if (state.currentCard && state.currentCard.id === cardId) {
      closeDrawer();
      return;
    }

    state.history.push(card.id);
    state.historyIndex = state.history.length - 1;
    closeDrawer();
    transitionToCard(card, 'next');
  }

  // --- BOOKMARKS ---
  function isCurrentCardBookmarked() {
    return state.currentCard && state.bookmarks.includes(state.currentCard.id);
  }

  function updateBookmarkButtonState() {
    if (!elements.btnBookmark || !elements.btnBookmarkIcon) return;
    const bookmarked = isCurrentCardBookmarked();

    if (bookmarked) {
      elements.btnBookmarkIcon.setAttribute('fill', '#f43f5e');
      elements.btnBookmarkIcon.setAttribute('stroke', '#f43f5e');
      elements.btnBookmark.classList.add('text-rose-500', 'border-rose-500/40', 'bg-rose-500/10');
      elements.btnBookmark.classList.remove('text-slate-300', 'border-slate-700/60');
    } else {
      elements.btnBookmarkIcon.setAttribute('fill', 'none');
      elements.btnBookmarkIcon.setAttribute('stroke', 'currentColor');
      elements.btnBookmark.classList.remove('text-rose-500', 'border-rose-500/40', 'bg-rose-500/10');
      elements.btnBookmark.classList.add('text-slate-300', 'border-slate-700/60');
    }
  }

  function toggleCurrentBookmark() {
    if (!state.currentCard) return;
    const cardId = state.currentCard.id;
    const index = state.bookmarks.indexOf(cardId);
    let added = false;

    if (index >= 0) {
      state.bookmarks.splice(index, 1);
      added = false;
      showToast('북마크에서 제거되었습니다.');
    } else {
      state.bookmarks.unshift(cardId);
      added = true;
      showToast('북마크에 저장되었습니다.');
      if (elements.btnBookmark) {
        elements.btnBookmark.classList.remove('anim-heart-pop');
        void elements.btnBookmark.offsetWidth;
        elements.btnBookmark.classList.add('anim-heart-pop');
      }
    }

    playBookmarkSound(added);
    saveBookmarks();
    updateBookmarkButtonState();
    renderBookmarkDrawerList();
  }

  function removeBookmark(cardId, e) {
    if (e) e.stopPropagation();
    const index = state.bookmarks.indexOf(cardId);
    if (index >= 0) {
      state.bookmarks.splice(index, 1);
      saveBookmarks();
      updateBookmarkButtonState();
      renderBookmarkDrawerList();
      showToast('북마크가 삭제되었습니다.');
    }
  }

  function updateBookmarkBadge() {
    const count = state.bookmarks.length;
    if (elements.drawerBadge) {
      elements.drawerBadge.textContent = count;
      elements.drawerBadge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
  }

  function renderBookmarkDrawerList() {
    if (!elements.drawerList || !elements.drawerEmpty) return;

    if (state.bookmarks.length === 0) {
      elements.drawerList.innerHTML = '';
      elements.drawerEmpty.classList.remove('hidden');
      if (elements.btnClearAllBookmarks) elements.btnClearAllBookmarks.classList.add('hidden');
      return;
    }

    elements.drawerEmpty.classList.add('hidden');
    if (elements.btnClearAllBookmarks) elements.btnClearAllBookmarks.classList.remove('hidden');
    elements.drawerList.innerHTML = '';

    const list = window.INSIGHTS_DATA || INSIGHTS;
    const metaList = window.CATEGORY_META || META;

    state.bookmarks.forEach(id => {
      const card = list.find(c => c.id === id);
      if (!card) return;

      const meta = metaList[card.category] || metaList.philosophy;
      const itemEl = document.createElement('div');
      itemEl.className = 'group relative p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 hover:bg-slate-800/60 transition-all cursor-pointer flex flex-col gap-2.5';
      
      itemEl.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${meta.badgeBg}">
            ${card.categoryName}
          </span>
          <button class="btn-delete-item text-slate-500 hover:text-rose-400 p-1 rounded-md transition-colors" title="북마크 삭제">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
        <p class="text-sm font-medium text-slate-100 line-clamp-2 leading-relaxed">"${card.quoteKo}"</p>
        <div class="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/80">
          <span class="truncate font-medium text-slate-300">${card.author}</span>
          <span class="text-indigo-400/80 group-hover:text-indigo-300 flex items-center gap-1 text-[11px]">카드 보기 &rarr;</span>
        </div>
      `;

      itemEl.addEventListener('click', () => jumpToCard(card.id));
      const deleteBtn = itemEl.querySelector('.btn-delete-item');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => removeBookmark(card.id, e));
      }

      elements.drawerList.appendChild(itemEl);
    });
  }

  function openDrawer() {
    renderBookmarkDrawerList();
    if (elements.drawerBackdrop && elements.drawerPanel) {
      elements.drawerBackdrop.classList.remove('hidden', 'pointer-events-none');
      elements.drawerBackdrop.classList.remove('opacity-0');
      elements.drawerBackdrop.classList.add('opacity-100');

      elements.drawerPanel.classList.remove('translate-x-full');
      elements.drawerPanel.classList.add('translate-x-0');
    }
  }

  function closeDrawer() {
    if (elements.drawerBackdrop && elements.drawerPanel) {
      elements.drawerBackdrop.classList.remove('opacity-100');
      elements.drawerBackdrop.classList.add('opacity-0', 'pointer-events-none');

      elements.drawerPanel.classList.remove('translate-x-0');
      elements.drawerPanel.classList.add('translate-x-full');

      setTimeout(() => {
        elements.drawerBackdrop.classList.add('hidden');
      }, 300);
    }
  }

  function clearAllBookmarks() {
    if (state.bookmarks.length === 0) return;
    if (confirm('저장된 모든 북마크를 삭제하시겠습니까?')) {
      state.bookmarks = [];
      saveBookmarks();
      updateBookmarkButtonState();
      renderBookmarkDrawerList();
      showToast('모든 북마크가 삭제되었습니다.');
    }
  }

  // --- CLIPBOARD ---
  function copyQuoteToClipboard() {
    if (!state.currentCard) return;
    const card = state.currentCard;
    const textToCopy = `"${card.quoteKo}"\n\n— ${card.author} (${card.source || ''})\n\n[인사이트] ${card.insight}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        showToast('인사이트 문구가 클립보드에 복사되었습니다!');
      }).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }

    function fallbackCopy() {
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        showToast('인사이트 문구가 클립보드에 복사되었습니다!');
      } catch (err) {
        showToast('복사에 실패했습니다.');
      }
      document.body.removeChild(textarea);
    }
  }

  // --- CANVAS IMAGE EXPORT ---
  function saveCardAsImage() {
    if (!state.currentCard) return;
    const card = state.currentCard;
    const metaList = window.CATEGORY_META || META;
    const meta = metaList[card.category] || metaList.philosophy;

    const canvas = document.createElement('canvas');
    const w = 1200;
    const h = 1200;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // 1. Background
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, '#0a0d16');
    bgGrad.addColorStop(0.5, '#111827');
    bgGrad.addColorStop(1, '#090d16');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Ambient Color Orb
    const orbGrad = ctx.createRadialGradient(w / 2, 480, 50, w / 2, 480, 500);
    orbGrad.addColorStop(0, (meta.color || '#6366f1') + '44');
    orbGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = orbGrad;
    ctx.fillRect(0, 0, w, h);

    // 3. Card Panel
    const cardX = 100;
    const cardY = 120;
    const cardW = 1000;
    const cardH = 960;
    const radius = 40;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 30;

    ctx.beginPath();
    ctx.moveTo(cardX + radius, cardY);
    ctx.lineTo(cardX + cardW - radius, cardY);
    ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + radius);
    ctx.lineTo(cardX + cardW, cardY + cardH - radius);
    ctx.quadraticCurveTo(cardX + cardW, cardY + cardH, cardX + cardW - radius, cardY + cardH);
    ctx.lineTo(cardX + radius, cardY + cardH);
    ctx.quadraticCurveTo(cardX, cardY + cardH, cardX, cardY + cardH - radius);
    ctx.lineTo(cardX, cardY + radius);
    ctx.quadraticCurveTo(cardX, cardY, cardX + radius, cardY);
    ctx.closePath();

    ctx.fillStyle = 'rgba(20, 27, 45, 0.88)';
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 4. Quote Mark Watermark
    ctx.font = 'italic bold 220px Georgia, serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillText('“', cardX + 60, cardY + 220);

    // 5. Category Badge
    ctx.fillStyle = meta.color || '#6366f1';
    ctx.font = 'bold 24px -apple-system, sans-serif';
    ctx.fillText(`• ${card.categoryName.toUpperCase()} INSIGHT`, cardX + 80, cardY + 110);

    // 6. Korean Quote
    ctx.font = 'bold 44px "Pretendard", -apple-system, sans-serif';
    ctx.fillStyle = '#f8fafc';
    const maxTextWidth = 840;
    const lineHeight = 66;

    function wrapText(text, x, y, maxWidth, lHeight) {
      const words = text.split(' ');
      let line = '';
      let currentY = y;

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          ctx.fillText(line, x, currentY);
          line = words[n] + ' ';
          currentY += lHeight;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, x, currentY);
      return currentY + lHeight;
    }

    let nextY = wrapText(`"${card.quoteKo}"`, cardX + 80, cardY + 240, maxTextWidth, lineHeight);

    // 7. Original Quote
    if (card.quoteOriginal) {
      ctx.font = 'italic 26px Georgia, serif';
      ctx.fillStyle = '#94a3b8';
      nextY = wrapText(`— "${card.quoteOriginal}"`, cardX + 80, nextY + 10, maxTextWidth, 38);
    }

    // 8. Divider line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + 80, nextY + 30);
    ctx.lineTo(cardX + cardW - 80, nextY + 30);
    ctx.stroke();

    // 9. Author
    ctx.font = 'bold 32px "Pretendard", -apple-system, sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(card.author, cardX + 80, nextY + 90);

    ctx.font = '22px "Pretendard", -apple-system, sans-serif';
    ctx.fillStyle = '#94a3b8';
    const metaStr = `${card.authorEn || ''} ${card.source ? '· ' + card.source : ''} ${card.year ? '(' + card.year + ')' : ''}`;
    ctx.fillText(metaStr, cardX + 80, nextY + 130);

    // 10. Insight Box
    const boxY = cardY + cardH - 180;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(cardX + 80, boxY, cardW - 160, 110);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.strokeRect(cardX + 80, boxY, cardW - 160, 110);

    ctx.font = '22px "Pretendard", -apple-system, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    wrapText(card.insight, cardX + 110, boxY + 45, cardW - 220, 32);

    // 11. Watermark
    ctx.font = '20px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillText('Insight Card Viewer · 철학 · 심리학 · 경제학', cardX + 80, cardY + cardH + 50);

    try {
      const link = document.createElement('a');
      link.download = `Insight_${card.category}_${card.author.replace(/\s+/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('고화질 카드 이미지가 다운로드되었습니다!');
    } catch (e) {
      console.error(e);
      showToast('이미지 저장 중 오류가 발생했습니다.');
    }
  }

  // --- SOUND TOGGLE ---
  function updateSoundUI() {
    if (!elements.soundIcon || !elements.btnToggleSound) return;
    if (state.soundEnabled) {
      elements.soundIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>`;
      elements.btnToggleSound.classList.add('text-indigo-400');
      elements.btnToggleSound.classList.remove('text-slate-500');
    } else {
      elements.soundIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/>`;
      elements.btnToggleSound.classList.remove('text-indigo-400');
      elements.btnToggleSound.classList.add('text-slate-500');
    }
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    saveSoundSetting();
    showToast(state.soundEnabled ? '효과음이 켜졌습니다.' : '효과음이 꺼졌습니다.');
  }

  // --- CATEGORIES ---
  function setCategory(category) {
    if (state.category === category) return;
    state.category = category;

    elements.categoryTabs.forEach(tab => {
      const cat = tab.getAttribute('data-category');
      if (cat === category) {
        tab.classList.add('active', 'bg-indigo-600', 'text-white', 'shadow-lg', 'shadow-indigo-500/25');
        tab.classList.remove('text-slate-400', 'hover:text-slate-200', 'bg-transparent');
      } else {
        tab.classList.remove('active', 'bg-indigo-600', 'text-white', 'shadow-lg', 'shadow-indigo-500/25');
        tab.classList.add('text-slate-400', 'hover:text-slate-200', 'bg-transparent');
      }
    });

    state.recentIds = [];
    showNextCard();
  }

  // --- INTERACTIVE 3D TILT ---
  function setupCardTilt() {
    const card = elements.card;
    if (!card) return;

    card.addEventListener('mousemove', (e) => {
      if (state.isTransitioning) return;
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // Realistic 3D Tilt: Up to 12 degrees
      const rotateX = ((y - centerY) / centerY) * -12;
      const rotateY = ((x - centerX) / centerX) * 12;

      card.style.transform = `perspective(1200px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateZ(10px)`;
    });

    card.addEventListener('mouseleave', () => {
      if (state.isTransitioning) return;
      card.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
    });
  }

  // --- TOUCH SWIPE FOR MOBILE ---
  function setupTouchSwipe() {
    const card = elements.card;
    if (!card) return;
    let startX = 0;
    let startY = 0;

    card.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    card.addEventListener('touchend', (e) => {
      if (state.isTransitioning) return;
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = endX - startX;
      const diffY = endY - startY;

      if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
        if (diffX < 0) {
          showNextCard();
        } else {
          showPrevCard();
        }
      }
    }, { passive: true });
  }

  // --- KEYBOARD SHORTCUTS ---
  function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.code === 'Space' || e.key === 'Enter' || e.code === 'ArrowRight') {
        e.preventDefault();
        showNextCard();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        showPrevCard();
      } else if (e.key === 'b' || e.key === 'B' || e.key === 'ㅠ') {
        e.preventDefault();
        toggleCurrentBookmark();
      } else if (e.key === 'c' || e.key === 'C' || e.key === 'ㅊ') {
        e.preventDefault();
        copyQuoteToClipboard();
      } else if (e.key === 'm' || e.key === 'M' || e.key === 'ㅡ') {
        e.preventDefault();
        toggleSound();
      } else if (e.key === 'Escape') {
        closeDrawer();
      }
    });
  }

  // --- INITIALIZATION ---
  function init() {
    loadBookmarks();
    loadSoundSetting();
    updateBookmarkBadge();

    // Event Listeners with Safe Wrapping
    if (elements.btnNext) {
      elements.btnNext.addEventListener('click', (e) => {
        e.preventDefault();
        showNextCard();
      });
    }
    if (elements.btnPrev) {
      elements.btnPrev.addEventListener('click', (e) => {
        e.preventDefault();
        showPrevCard();
      });
    }
    if (elements.btnBookmark) {
      elements.btnBookmark.addEventListener('click', (e) => {
        e.preventDefault();
        toggleCurrentBookmark();
      });
    }
    if (elements.btnCopy) {
      elements.btnCopy.addEventListener('click', (e) => {
        e.preventDefault();
        copyQuoteToClipboard();
      });
    }
    if (elements.btnSaveImage) {
      elements.btnSaveImage.addEventListener('click', (e) => {
        e.preventDefault();
        saveCardAsImage();
      });
    }

    // Drawer Listeners
    if (elements.btnOpenDrawer) elements.btnOpenDrawer.addEventListener('click', openDrawer);
    if (elements.btnCloseDrawer) elements.btnCloseDrawer.addEventListener('click', closeDrawer);
    if (elements.drawerBackdrop) elements.drawerBackdrop.addEventListener('click', closeDrawer);
    if (elements.btnClearAllBookmarks) {
      elements.btnClearAllBookmarks.addEventListener('click', clearAllBookmarks);
    }

    // Sound & Mode
    if (elements.btnToggleSound) elements.btnToggleSound.addEventListener('click', toggleSound);
    if (elements.animModeSelect) {
      elements.animModeSelect.addEventListener('change', (e) => {
        state.animMode = e.target.value;
      });
    }

    // Category Tabs
    elements.categoryTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const cat = tab.getAttribute('data-category');
        setCategory(cat);
      });
    });

    setupCardTilt();
    setupTouchSwipe();
    setupKeyboardShortcuts();

    // Render Initial First Card Instantly (WITHOUT transition lock)
    const initialCard = getRandomCard();
    if (initialCard) {
      state.currentCard = initialCard;
      state.history.push(initialCard.id);
      state.historyIndex = 0;
      renderCardContent(initialCard);
    }
  }

  // Ensure DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
