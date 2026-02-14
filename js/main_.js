// ============================================
// 音頻控制器（增強版 - 支持逐句高亮，無滾動，無脈衝）
// ============================================
const AudioController = {
  currentAudio: null,
  currentPlayingButton: null,
  currentParagraphSentences: [],
  currentSentenceIndex: -1,
  currentParaNum: null,
  currentUnitId: null,
  isPlayingParagraph: false,

  resetButton(btn) {
    if (!btn) return;
    btn.classList.remove('playing', 'loading');
    if (btn.id.includes('_para-audio-btn-')) {
      btn.innerHTML = '<i class="fas fa-volume-up"></i> 朗讀';
    } else if (btn.id.includes('_impl-audio-btn-')) {
      btn.innerHTML = '<i class="fas fa-play"></i>';
    } else if (btn.id.includes('_vocab-audio-btn-')) {
      btn.innerHTML = '<i class="fas fa-volume-up"></i>';
    } else {
      btn.innerHTML = btn.innerHTML.includes('朗讀') ? '<i class="fas fa-volume-up"></i> 朗讀' : '<i class="fas fa-play"></i>';
    }
  },

  preloadUnitAudio(unitId, audioPaths = null) {
    const base = audioPaths || {};
    const paraCount = UnitManager.getCurrentUnitData()?.article?.paragraphs?.length || 6;
    for (let i = 1; i <= paraCount; i++) {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.src = base.paragraphPattern ? base.paragraphPattern.replace('{id}', i.toString().padStart(2,'0')) : `/english-reading-multi/audio/${unitId}/paragraph_${i.toString().padStart(2,'0')}.mp3`;
      audio.load();
    }
  },

  stop() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (this.currentAudio instanceof HTMLAudioElement) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    if (this.currentPlayingButton) {
      this.resetButton(this.currentPlayingButton);
      this.currentPlayingButton = null;
    }
    this.clearAllSentenceHighlights();
    this.isPlayingParagraph = false;
    this.currentSentenceIndex = -1;
    this.currentParagraphSentences = [];
  },

  clearAllSentenceHighlights() {
    document.querySelectorAll('.sentence-highlightable').forEach(el => {
      el.classList.remove('sentence-playing', 'sentence-selected');
    });
    document.querySelectorAll('.translation-sentence').forEach(el => {
      el.classList.remove('translation-highlight');
    });
  },

  highlightSentence(paraNum, unitId, sentenceIndex) {
    this.clearAllSentenceHighlights();
    const selector = `#${unitId}_para${paraNum}-text .sentence-highlightable[data-sentence-index="${sentenceIndex}"]`;
    const sentenceEl = document.querySelector(selector);
    if (sentenceEl) sentenceEl.classList.add('sentence-selected');
    const transSelector = `#${unitId}_trans-${paraNum} .translation-sentence[data-sentence-index="${sentenceIndex}"]`;
    const transEl = document.querySelector(transSelector);
    if (transEl) transEl.classList.add('translation-highlight');
  },

  extractPlainText(htmlContent) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    return tempDiv.textContent || tempDiv.innerText || '';
  },

  preprocessForTTS(text) {
    // 可選：將縮寫展開以改善 TTS 發音
    return text
      .replace(/\bI'm\b/g, 'I am')
      .replace(/\byou're\b/g, 'you are')
      .replace(/\byou've\b/g, 'you have')
      .replace(/\bit's\b/g, 'it is')
      .replace(/\bdon't\b/g, 'do not')
      .replace(/\bdoesn't\b/g, 'does not')
      .replace(/\bdidn't\b/g, 'did not')
      .replace(/\bcan't\b/g, 'cannot');
  },

  async playSingleSentence(paraNum, unitId, sentenceIndex, sentenceHtml) {
    this.stop();
    const btn = document.getElementById(`${unitId}_para-audio-btn-${paraNum}`);
    const plainText = this.preprocessForTTS(this.extractPlainText(sentenceHtml));
    this.highlightSentence(paraNum, unitId, sentenceIndex);
    const utter = new SpeechSynthesisUtterance(plainText);
    utter.lang = 'en-GB'; utter.rate = 0.85;
    utter.onend = () => {
      this.clearAllSentenceHighlights();
      this.currentAudio = null;
      if (btn) { this.resetButton(btn); this.currentPlayingButton = null; }
    };
    utter.onerror = (e) => {
      console.error('TTS播放錯誤', e);
      this.clearAllSentenceHighlights();
      if (btn) { this.resetButton(btn); this.currentPlayingButton = null; }
    };
    window.speechSynthesis.speak(utter);
    this.currentAudio = utter;
    if (btn) {
      if (this.currentPlayingButton) this.resetButton(this.currentPlayingButton);
      btn.classList.add('playing');
      btn.innerHTML = '<i class="fas fa-stop"></i> 停止';
      this.currentPlayingButton = btn;
    }
  },

  async playParagraphBySentences(paraNum, unitId) {
    const btn = document.getElementById(`${unitId}_para-audio-btn-${paraNum}`);
    if (!btn) return;
    if (btn.classList.contains('playing')) { this.stop(); return; }
    const unitData = UnitManager.getCurrentUnitData();
    const paragraph = unitData?.article?.paragraphs[paraNum - 1];
    let sentences = paragraph?.sentences || [];
    if (!sentences.length) sentences = paragraph.english.split(/(?<=[.!?])\s+/);
    if (!sentences.length) { console.warn('無法獲取句子列表'); return; }
    this.stop();
    this.isPlayingParagraph = true;
    this.currentParagraphSentences = sentences;
    this.currentSentenceIndex = -1;
    this.currentParaNum = paraNum;
    this.currentUnitId = unitId;
    this.currentPlayingButton = btn;
    btn.classList.remove('loading');
    btn.classList.add('playing');
    btn.innerHTML = '<i class="fas fa-stop"></i> 停止';
    this.playNextSentence();
  },

  playNextSentence() {
    if (!this.isPlayingParagraph) return;
    this.currentSentenceIndex++;
    if (this.currentSentenceIndex >= this.currentParagraphSentences.length) {
      this.finishParagraphPlayback();
      return;
    }
    const sentence = this.currentParagraphSentences[this.currentSentenceIndex];
    this.highlightSentence(this.currentParaNum, this.currentUnitId, this.currentSentenceIndex);
    const plainText = this.preprocessForTTS(this.extractPlainText(sentence));
    const utter = new SpeechSynthesisUtterance(plainText);
    utter.lang = 'en-GB'; utter.rate = 0.85;
    utter.onend = () => { this.playNextSentence(); };
    utter.onerror = (e) => { console.error('TTS播放錯誤', e); this.playNextSentence(); };
    window.speechSynthesis.speak(utter);
    this.currentAudio = utter;
  },

  finishParagraphPlayback() {
    this.clearAllSentenceHighlights();
    if (this.currentPlayingButton) {
      this.resetButton(this.currentPlayingButton);
      this.currentPlayingButton = null;
    }
    this.currentAudio = null;
    this.isPlayingParagraph = false;
    this.currentParagraphSentences = [];
    this.currentSentenceIndex = -1;
  },

  async toggleParagraphAudio(paraNum, unitId) {
    const btn = document.getElementById(`${unitId}_para-audio-btn-${paraNum}`);
    if (!btn) return;
    if (btn.classList.contains('playing')) { this.stop(); return; }
    btn.classList.add('loading');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 載入中...';
    try {
      const audio = new Audio();
      const unitData = UnitManager.getCurrentUnitData();
      const pattern = unitData.audio?.paragraphPattern || `/english-reading-multi/audio/${unitId}/paragraph_{id}.mp3`;
      audio.src = pattern.replace('{id}', paraNum.toString().padStart(2, '0'));
      await audio.play();
      this.stop();
      this.currentAudio = audio;
      this.currentPlayingButton = btn;
      btn.classList.remove('loading');
      btn.classList.add('playing');
      btn.innerHTML = '<i class="fas fa-stop"></i> 停止';
      audio.onended = () => {
        this.resetButton(btn);
        if (this.currentAudio === audio) this.currentAudio = null;
        if (this.currentPlayingButton === btn) this.currentPlayingButton = null;
      };
    } catch (e) {
      console.warn('本地音頻失敗，使用逐句TTS', e);
      btn.classList.remove('loading');
      this.playParagraphBySentences(paraNum, unitId);
    }
  },

  async toggleImplicationAudio(paraNum, unitId) {
    const btn = document.getElementById(`${unitId}_impl-audio-btn-${paraNum}`);
    if (!btn) return;
    if (btn.classList.contains('playing')) { this.stop(); return; }
    btn.classList.add('loading');
    const unitData = UnitManager.getCurrentUnitData();
    const rawImpl = unitData?.article?.paragraphs[paraNum-1]?.implication?.english || '';
    const cleanImpl = rawImpl.replace(/^💡\s*/, '');
    try {
      const audio = new Audio();
      const pattern = unitData.audio?.implicationPattern || `/english-reading-multi/audio/${unitId}/impl_{id}.mp3`;
      audio.src = pattern.replace('{id}', paraNum.toString().padStart(2,'0'));
      await audio.play();
      this.stop();
      this.currentAudio = audio;
      this.currentPlayingButton = btn;
      btn.classList.remove('loading');
      btn.classList.add('playing');
      btn.innerHTML = '<i class="fas fa-stop"></i>';
      audio.onended = () => {
        this.resetButton(btn);
        if (this.currentAudio === audio) this.currentAudio = null;
        if (this.currentPlayingButton === btn) this.currentPlayingButton = null;
      };
    } catch (e) {
      console.warn('本地音頻失敗，使用TTS', e);
      this.playTTS(cleanImpl, btn, 'impl');
    }
  },

  async playVocabularyWord(vocabId, unitId) {
    const btn = document.getElementById(`${unitId}_vocab-audio-btn-${vocabId}`);
    if (!btn) return;
    if (btn.classList.contains('playing')) { this.stop(); return; }
    btn.classList.add('loading');
    const unitData = UnitManager.getCurrentUnitData();
    const word = unitData?.vocabulary?.find(v => v.id === vocabId)?.word || '';
    try {
      const audio = new Audio();
      const pattern = unitData.audio?.vocabularyPattern || `/english-reading-multi/audio/${unitId}/word_{id}.mp3`;
      audio.src = pattern.replace('{id}', vocabId.toString().padStart(2,'0'));
      await audio.play();
      this.stop();
      this.currentAudio = audio;
      this.currentPlayingButton = btn;
      btn.classList.remove('loading');
      btn.classList.add('playing');
      btn.innerHTML = '<i class="fas fa-stop"></i>';
      audio.onended = () => {
        this.resetButton(btn);
        if (this.currentAudio === audio) this.currentAudio = null;
        if (this.currentPlayingButton === btn) this.currentPlayingButton = null;
      };
    } catch (e) {
      console.warn('本地音頻失敗，使用TTS', e);
      this.playTTS(word, btn, 'vocab');
    }
  },

  playTTS(text, btn = null, type = '') {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-GB'; utter.rate = 0.85;
    if (btn) {
      this.stop();
      btn.classList.remove('loading');
      btn.classList.add('playing');
      if (type === 'para') btn.innerHTML = '<i class="fas fa-stop"></i> 停止(TTS)';
      else btn.innerHTML = '<i class="fas fa-stop"></i>';
      this.currentPlayingButton = btn;
    }
    utter.onend = () => {
      if (btn) {
        this.resetButton(btn);
        if (this.currentPlayingButton === btn) this.currentPlayingButton = null;
      }
      this.currentAudio = null;
      this.clearAllSentenceHighlights();
    };
    window.speechSynthesis.speak(utter);
    this.currentAudio = utter;
  }
};

// ============================================
// 句子懸停管理器
// ============================================
const SentenceHover = {
  setupHoverListeners(unitId) {
    document.querySelectorAll(`[data-unit-id="${unitId}"] .sentence-highlightable`).forEach(sentence => {
      if (sentence.hasAttribute('data-hover-initialized')) return;
      const paraNum = sentence.closest('[id*="para"]')?.id.match(/para(\d+)/)?.[1];
      const sentenceIdx = sentence.dataset.sentenceIndex;
      if (paraNum && sentenceIdx !== undefined) {
        sentence.setAttribute('data-hover-initialized', 'true');
        sentence.addEventListener('mouseenter', () => {
          this.highlightTranslation(unitId, paraNum, sentenceIdx);
        });
        sentence.addEventListener('mouseleave', () => {
          this.clearTranslationHighlight();
        });
      }
    });
  },
  highlightTranslation(unitId, paraNum, sentenceIdx) {
    const targetTrans = document.querySelector(
      `#${unitId}_trans-${paraNum} .translation-sentence[data-sentence-index="${sentenceIdx}"]`
    );
    if (targetTrans) targetTrans.classList.add('translation-highlight');
  },
  clearTranslationHighlight() {
    document.querySelectorAll('.translation-sentence.translation-highlight').forEach(el => {
      el.classList.remove('translation-highlight');
    });
  }
};

// ============================================
// 渲染器（修正英文容器 lang 屬性）
// ============================================
const Renderer = {
  showLoading() {
    const containers = [
      'article-vocab-wrapper', 'vocab-usage-section', 'reading-section',
      'cloze-section', 'seven-five-section', 'grammar-section'
    ];
    containers.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<div class="loading-indicator"><i class="fas fa-spinner fa-spin"></i> 載入單元中...</div>';
    });
  },

  renderAll(unitData, unitId) {
    this.renderArticleVocabulary(unitData, unitId);
    this.renderVocabUsage(unitData, unitId);
    this.renderReading(unitData, unitId);
    this.renderCloze(unitData, unitId);
    this.renderSevenFive(unitData, unitId);
    this.renderGrammar(unitData, unitId);
    setTimeout(() => {
      this.attachInputListeners(unitId);
      SentenceHover.setupHoverListeners(unitId);
    }, 50);
  },

  // 新增：用於安全地將文本放入 HTML 屬性
  encodeForHtmlAttribute(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  stripHtml(html) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    return tempDiv.textContent || tempDiv.innerText || '';
  },

  renderArticleVocabulary(unitData, unitId) {
    const wrapper = document.getElementById('article-vocab-wrapper');
    const article = unitData.article;
    const vocab = unitData.vocabulary || [];
    
    // 拆分標題
    const titleParts = article.title.split('\n');
    const englishTitle = titleParts[0] || '';
    const chineseTitle = titleParts[1] || '';

    let html = `
      <div class="article-section">
        <div class="article-header">
          <h3 class="article-title">
            <span lang="en">${englishTitle}</span><br>
            <span lang="zh">${chineseTitle}</span>
          </h3>
          <img src="${article.illustration || './images/placeholder.png'}" alt="illustration" class="article-illustration"
               onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="image-fallback" style="display:none; width:100%; height:180px; align-items:center; justify-content:center; color:#64748b;" lang="zh">
            <i class="fas fa-image" style="font-size:48px;"></i>
            <div style="margin-left:12px;">圖片載入失敗</div>
          </div>
        </div>
        <div class="article-paragraph-wrapper" id="article-content-${unitId}">
    `;

    article.paragraphs.forEach((para, idx) => {
      const paraNum = idx + 1;
      let paragraphHtml = '';
      if (para.sentences && para.sentences.length) {
        para.sentences.forEach((sentence, sIdx) => {
          const plainText = this.stripHtml(sentence);
          const encodedPlainText = this.encodeForHtmlAttribute(plainText);
          paragraphHtml += `<span class="sentence-highlightable" lang="en" data-sentence-index="${sIdx}" 
                            data-plain-text="${encodedPlainText}"
                            onclick="AudioController.playSingleSentence(${paraNum}, '${unitId}', ${sIdx}, this.dataset.plainText)">
                            ${sentence}</span> `;
        });
      } else {
        const sentences = para.english.split(/(?<=[.!?])\s+/);
        sentences.forEach((sentence, sIdx) => {
          const encodedSentence = this.encodeForHtmlAttribute(sentence);
          paragraphHtml += `<span class="sentence-highlightable sentence-fallback" lang="en" data-sentence-index="${sIdx}"
                            data-plain-text="${encodedSentence}"
                            onclick="AudioController.playSingleSentence(${paraNum}, '${unitId}', ${sIdx}, '${encodedSentence}')">
                            ${sentence}</span> `;
        });
      }

      html += `
        <div class="single-paragraph" id="${unitId}_para${paraNum}-text">
          ${paragraphHtml}
        </div>
        <div class="paragraph-controls">
          <button class="btn btn-outline paragraph-audio-btn" onclick="AudioController.toggleParagraphAudio(${paraNum}, '${unitId}')" id="${unitId}_para-audio-btn-${paraNum}">
            <i class="fas fa-volume-up"></i> 朗讀
          </button>
          <div class="toggle-button-group" id="${unitId}_toggle-group-${paraNum}">
            <button class="btn btn-outline toggle-btn" onclick="Renderer.showTranslation(${paraNum}, '${unitId}')" id="${unitId}_trans-btn-${paraNum}">
              <i class="fas fa-exchange-alt"></i> 翻譯
            </button>
            <button class="btn btn-outline toggle-btn" onclick="Renderer.showImplication(${paraNum}, '${unitId}')" id="${unitId}_impl-btn-${paraNum}">
              <i class="fas fa-lightbulb"></i> 解讀
            </button>
          </div>
        </div>
      `;

      // 統一的內容容器（預設全部隱藏）
      html += `
        <div class="unified-content" id="${unitId}_content-${paraNum}">
          <!-- 翻譯內容（預設隱藏） -->
          <div class="translation-content" id="${unitId}_trans-${paraNum}" data-content-type="translation" style="display: none;">
      `;

      if (para.translation_sentences && para.translation_sentences.length) {
        para.translation_sentences.forEach((sentence, sIdx) => {
          html += `<span class="translation-sentence" lang="zh" 
                        data-para="${paraNum}" 
                        data-sentence-index="${sIdx}">
                        ${sentence}</span> `;
        });
      } else {
        html += para.translation;
      }

      html += `
          </div>
          <!-- 解讀內容（預設隱藏） -->
          <div class="implication-content" id="${unitId}_impl-${paraNum}" data-content-type="implication" style="display: none;">
            <div class="implication-text-wrapper">
              <div class="implication-english" lang="en">${para.implication.english}</div>
              <div class="implication-chinese" lang="zh">${para.implication.chinese}</div>
            </div>
            <div class="implication-buttons">
              <button class="implication-audio-btn" onclick="AudioController.toggleImplicationAudio(${paraNum}, '${unitId}')" id="${unitId}_impl-audio-btn-${paraNum}">
                <i class="fas fa-play"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    });

    html += `</div></div>`;

    html += `<div class="vocab-section"><h4 class="vocab-title" lang="zh"><i class="fas fa-bookmark"></i> 核心詞彙</h4><div class="vocab-list" id="${unitId}_vocab-list">`;
    vocab.forEach((v, i) => {
      html += `
        <div class="vocab-item ${v.highlightClass || ''}">
          <button class="vocab-audio-btn" onclick="AudioController.playVocabularyWord(${v.id}, '${unitId}')" id="${unitId}_vocab-audio-btn-${v.id}">
            <i class="fas fa-volume-up"></i>
          </button>
          <div class="vocab-text">
            <div class="vocab-word-line">
              <span class="vocab-number">${i+1}.</span>
              <span class="vocab-word" lang="en">${v.word}</span>
            </div>
            <div class="vocab-meaning" lang="zh">${v.meaning}</div>
          </div>
        </div>
      `;
    });
    html += `</div></div>`;
    wrapper.innerHTML = html;
  },

  showTranslation(paraNum, unitId) {
    const transBtn = document.getElementById(`${unitId}_trans-btn-${paraNum}`);
    const implBtn = document.getElementById(`${unitId}_impl-btn-${paraNum}`);
    if (transBtn) transBtn.classList.add('active');
    if (implBtn) implBtn.classList.remove('active');
    const transContent = document.getElementById(`${unitId}_trans-${paraNum}`);
    const implContent = document.getElementById(`${unitId}_impl-${paraNum}`);
    if (transContent) transContent.style.display = 'block';
    if (implContent) implContent.style.display = 'none';
  },

  showImplication(paraNum, unitId) {
    const transBtn = document.getElementById(`${unitId}_trans-btn-${paraNum}`);
    const implBtn = document.getElementById(`${unitId}_impl-btn-${paraNum}`);
    if (transBtn) transBtn.classList.remove('active');
    if (implBtn) implBtn.classList.add('active');
    const transContent = document.getElementById(`${unitId}_trans-${paraNum}`);
    const implContent = document.getElementById(`${unitId}_impl-${paraNum}`);
    if (transContent) transContent.style.display = 'none';
    if (implContent) implContent.style.display = 'flex';
  },

  renderVocabUsage(unitData, unitId) {
    const container = document.getElementById('vocab-usage-section');
    const vu = unitData.vocabUsage;
    if (!vu) { container.innerHTML = ''; return; }

    let html = `
      <div class="vocab-drag-container">
        <div style="font-weight:600; color:#4b5563; width:100%;" lang="zh"><i class="fas fa-hand-pointer"></i> 拖拽詞彙到正確位置：</div>
        <div class="vocab-drag-source" id="${unitId}_vocab-drag-source">
    `;
    vu.options.forEach(opt => {
      html += `<div class="vocab-drag-item" draggable="true" id="${unitId}_vocab-option-${opt}" lang="en">
                  <i class="fas fa-grip-vertical" style="margin-right:8px; color:#9ca3af;"></i>${opt}
                </div>`;
    });
    html += `<button class="drag-undo-btn" onclick="DragDrop.undoVocabDrag('${unitId}')" lang="zh"><i class="fas fa-undo"></i> 返回上一步</button></div></div>`;

    // 問題文本容器添加 lang="en"
    html += `<div lang="en" style="font-size:12px; line-height:1.6; padding:12px; background:#fafafa; border-radius:6px;" id="${unitId}_vocab-usage-text">`;
    vu.questions.forEach((q, idx) => {
      const qWithId = q.replace(/id='vocab-drop-(\d+)'/, `id='${unitId}_vocab-drop-$1'`);
      html += `<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <span style="min-width:20px; font-weight:bold;">${idx+1}.</span>
                <span>${qWithId}</span>
              </div>`;
    });
    html += `</div>
      <div class="action-buttons">
        <button class="btn btn-success check-btn" onclick="ExerciseChecker.checkVocabUsage('${unitId}')" lang="zh"><i class="fas fa-check-circle"></i> 檢查答案</button>
        <button class="btn btn-danger reset-btn" onclick="ExerciseChecker.resetVocabUsage('${unitId}')" lang="zh"><i class="fas fa-redo"></i> 重新開始</button>
      </div>
      <div class="result-feedback" id="${unitId}_vocab-result"></div>`;
    container.innerHTML = html;
  },

  renderReading(unitData, unitId) {
    const container = document.getElementById('reading-section');
    const rc = unitData.readingComprehension;
    if (!rc || !rc.length) { 
      container.innerHTML = '<div style="padding:20px; text-align:center; color:#666;" lang="zh">暫無閱讀理解題目</div>'; 
      return; 
    }
    let html = `<div lang="en" style="display:flex; flex-direction:column; gap:12px;">`; // 添加 lang="en"
    rc.forEach((item, idx) => {
      const qNum = idx + 1;
      html += `<div><div style="font-weight:600;" lang="en">${item.question}</div><div style="margin-left:20px;">`;
      item.options.forEach(opt => {
        const radioId = `${unitId}_reading-${qNum}-${opt.id}`;
        html += `<div style="display:flex; align-items:center; gap:8px;">
                    <input type="radio" name="${unitId}_reading-${qNum}" id="${radioId}" value="${opt.id}">
                    <label for="${radioId}" class="option-label" lang="en">${opt.text}</label>
                  </div>`;
      });
      html += `</div></div>`;
    });
    html += `</div>
      <div class="action-buttons">
        <button class="btn btn-success check-btn" onclick="ExerciseChecker.checkReading('${unitId}')" lang="zh"><i class="fas fa-check-circle"></i> 檢查答案</button>
        <button class="btn btn-danger reset-btn" onclick="ExerciseChecker.resetReading('${unitId}')" lang="zh"><i class="fas fa-redo"></i> 重新開始</button>
      </div>
      <div class="result-feedback" id="${unitId}_reading-result"></div>`;
    container.innerHTML = html;
  },

  renderCloze(unitData, unitId) {
    const container = document.getElementById('cloze-section');
    let text = unitData.clozeText || '';
    text = text.replace(/id='cloze-(\d+)'/g, `id='${unitId}_cloze-$1'`);
    // 添加 lang="en" 到容器
    container.innerHTML = `
      <div lang="en" style="font-size:12px; line-height:1.6; padding:12px; border:1px solid #eee; border-radius:6px;">${text}</div>
      <div class="action-buttons">
        <button class="btn btn-success check-btn" onclick="ExerciseChecker.checkCloze('${unitId}')" lang="zh"><i class="fas fa-check-circle"></i> 檢查答案</button>
        <button class="btn btn-danger reset-btn" onclick="ExerciseChecker.resetCloze('${unitId}')" lang="zh"><i class="fas fa-redo"></i> 重新開始</button>
      </div>
      <div class="result-feedback" id="${unitId}_cloze-result"></div>
    `;
  },

  renderSevenFive(unitData, unitId) {
    const container = document.getElementById('seven-five-section');
    const sf = unitData.sevenFive;
    if (!sf) { container.innerHTML = ''; return; }
    let optionsHtml = '';
    sf.options.forEach(opt => {
      optionsHtml += `<div class="drag-item" draggable="true" id="${unitId}_option-${opt.id}" lang="en">
                        <i class="fas fa-grip-vertical" style="margin-right:8px;"></i>${opt.text}
                      </div>`;
    });
    let text = sf.text.replace(/id='drop-(\d+)'/g, `id='${unitId}_drop-$1'`);
    // 添加 lang="en" 到文本容器
    container.innerHTML = `
      <div class="drag-drop-container">
        <div style="font-weight:600; color:#4b5563; width:100%;" lang="zh"><i class="fas fa-hand-pointer"></i> 拖拽短語到正確位置：</div>
        <div class="drag-source" id="${unitId}_drag-source">${optionsHtml}
          <button class="drag-undo-btn" onclick="DragDrop.undoDrag('${unitId}')" lang="zh"><i class="fas fa-undo"></i> 返回上一步</button>
        </div>
      </div>
      <div lang="en" style="font-size:12px; line-height:1.6; padding:12px; border:1px solid #eee; border-radius:6px;">${text}</div>
      <div class="action-buttons">
        <button class="btn btn-success check-btn" onclick="ExerciseChecker.checkSevenFive('${unitId}')" lang="zh"><i class="fas fa-check-circle"></i> 檢查答案</button>
        <button class="btn btn-danger reset-btn" onclick="ExerciseChecker.resetSevenFive('${unitId}')" lang="zh"><i class="fas fa-redo"></i> 重新開始</button>
      </div>
      <div class="result-feedback" id="${unitId}_sevenfive-result"></div>
    `;
  },

  renderGrammar(unitData, unitId) {
    const container = document.getElementById('grammar-section');
    let text = unitData.grammarText || '';
    text = text.replace(/id='grammar-(\d+)'/g, `id='${unitId}_grammar-$1'`);
    // 添加 lang="en" 到容器
    container.innerHTML = `
      <div lang="en" style="font-size:12px; line-height:1.6; padding:12px; border:1px solid #eee; border-radius:6px;">${text}</div>
      <div class="action-buttons">
        <button class="btn btn-success check-btn" onclick="ExerciseChecker.checkGrammar('${unitId}')" lang="zh"><i class="fas fa-check-circle"></i> 檢查答案</button>
        <button class="btn btn-danger reset-btn" onclick="ExerciseChecker.resetGrammar('${unitId}')" lang="zh"><i class="fas fa-redo"></i> 重新開始</button>
      </div>
      <div class="result-feedback" id="${unitId}_grammar-result"></div>
    `;
  },

  attachInputListeners(unitId) {
    document.querySelectorAll(`.cloze-input[id^="${unitId}_"], .grammar-input[id^="${unitId}_"]`).forEach(input => {
      input.removeEventListener('input', this.adjustWidth);
      input.addEventListener('input', this.adjustWidth);
      input.removeEventListener('focus', this.focusWidth);
      input.addEventListener('focus', this.focusWidth);
      input.removeEventListener('blur', this.blurWidth);
      input.addEventListener('blur', this.blurWidth);
    });
  },
  
  adjustWidth(e) {
    const el = e.target;
    let min = el.classList.contains('cloze-input') ? 1.8 : 1.5;
    const len = el.value.length;
    el.style.width = `${Math.max(min, len * 0.8 + 0.5)}em`;
  },
  
  focusWidth(e) {
    const el = e.target;
    const cur = parseFloat(el.style.width) || 1.8;
    el.style.width = `${cur + 0.5}em`;
  },
  
  blurWidth(e) { Renderer.adjustWidth(e); }
};

// ============================================
// 拖拽管理器
// ============================================
const DragDrop = {
  dragHistory: new Map(),
  vocabDragHistory: new Map(),

  allowDrop(ev) { ev.preventDefault(); },

  handleDragStart(ev) {
    const el = ev.target.closest('.drag-item, .vocab-drag-item');
    if (el && el.draggable) ev.dataTransfer.setData('text/plain', el.id);
  },

  handleDrop(ev) {
    const vocabDropzone = ev.target.closest('.vocab-dropzone');
    if (vocabDropzone) {
      ev.preventDefault();
      const unitId = UnitManager.getCurrentUnitId();
      if (unitId) this.dropVocab(ev, unitId, vocabDropzone);
      return;
    }
    const sevenFiveDropzone = ev.target.closest('.seven-five-dropzone');
    if (sevenFiveDropzone) {
      ev.preventDefault();
      const unitId = UnitManager.getCurrentUnitId();
      if (unitId) this.drop(ev, unitId, sevenFiveDropzone);
    }
  },

  drop(ev, unitId, dropzone) {
    const data = ev.dataTransfer.getData('text/plain');
    const dragged = document.getElementById(data);
    if (!dragged || dragged.classList.contains('used') || !dropzone) return;
    if (!this.dragHistory.has(unitId)) this.dragHistory.set(unitId, []);
    this.dragHistory.get(unitId).push({
      dropzone, optionId: data, draggedElement: dragged
    });
    dropzone.innerHTML = dragged.textContent.replace(/^.*?>\s*/, '');
    dropzone.classList.add('filled');
    dropzone.setAttribute('data-answer', data.split('-').pop());
    this.adjustDropzoneWidth(dropzone);
    dragged.classList.add('used');
    dragged.draggable = false;
  },

  undoDrag(unitId) {
    const hist = this.dragHistory.get(unitId);
    if (hist && hist.length) {
      const last = hist.pop();
      if (last.draggedElement) {
        last.draggedElement.classList.remove('used');
        last.draggedElement.draggable = true;
      }
      last.dropzone.innerHTML = '';
      last.dropzone.classList.remove('filled');
      last.dropzone.removeAttribute('data-answer');
      last.dropzone.style.minWidth = '80px';
      last.dropzone.style.width = '80px';
    }
  },

  dropVocab(ev, unitId, dropzone) {
    const data = ev.dataTransfer.getData('text/plain');
    const dragged = document.getElementById(data);
    if (!dragged || dragged.classList.contains('used') || !dropzone) return;
    if (!this.vocabDragHistory.has(unitId)) this.vocabDragHistory.set(unitId, []);
    this.vocabDragHistory.get(unitId).push({
      dropzone, optionId: data, draggedElement: dragged
    });
    const word = data.replace(`${unitId}_vocab-option-`, '');
    dropzone.innerHTML = word;
    dropzone.classList.add('filled');
    dropzone.setAttribute('data-answer', word);
    dragged.classList.add('used');
    dragged.draggable = false;
  },

  undoVocabDrag(unitId) {
    const hist = this.vocabDragHistory.get(unitId);
    if (hist && hist.length) {
      const last = hist.pop();
      if (last.draggedElement) {
        last.draggedElement.classList.remove('used');
        last.draggedElement.draggable = true;
      }
      last.dropzone.innerHTML = '';
      last.dropzone.classList.remove('filled');
      last.dropzone.removeAttribute('data-answer');
      last.dropzone.style.color = '';
    }
  },

  adjustDropzoneWidth(dz) {
    const len = dz.textContent.trim().length;
    dz.style.minWidth = Math.max(80, len * 10) + 'px';
    dz.style.width = 'auto';
  }
};

// ============================================
// 習題檢查器
// ============================================
const ExerciseChecker = {
  checkVocabUsage(unitId) {
    const data = UnitManager.getCurrentUnitData();
    const answers = data.answers.vocab;
    let correct = 0;
    for (let i = 1; i <= answers.length; i++) {
      const dz = document.getElementById(`${unitId}_vocab-drop-${i}`);
      if (!dz) continue;
      const user = dz.getAttribute('data-answer') || '';
      dz.classList.remove('correct','incorrect');
      dz.style.color = '';
      if (!user) {
        dz.innerHTML = answers[i-1];
        dz.style.color = '#7c3aed';
      } else if (user.trim().toLowerCase() === answers[i-1].trim().toLowerCase()) {
        dz.classList.add('correct'); correct++;
      } else {
        dz.classList.add('incorrect');
        dz.innerHTML = `${user} <span style="color:#b91c1c; font-size:10px;">(正確: ${answers[i-1]})</span>`;
      }
    }
    this.showResult(unitId, 'vocab', correct, answers.length);
  },

  resetVocabUsage(unitId) {
    const data = UnitManager.getCurrentUnitData();
    if (!data) return;
    const count = data.answers.vocab.length;
    for (let i = 1; i <= count; i++) {
      const dz = document.getElementById(`${unitId}_vocab-drop-${i}`);
      if (dz) {
        dz.innerHTML = ''; 
        dz.classList.remove('filled','correct','incorrect'); 
        dz.removeAttribute('data-answer');
        dz.style.color = '';
      }
    }
    document.querySelectorAll(`#${unitId}_vocab-drag-source .vocab-drag-item`).forEach(el => {
      el.classList.remove('used'); 
      el.draggable = true;
    });
    DragDrop.vocabDragHistory.delete(unitId);
    const result = document.getElementById(`${unitId}_vocab-result`);
    if (result) result.style.display = 'none';
  },

  checkReading(unitId) {
    const data = UnitManager.getCurrentUnitData();
    const answers = data.answers.reading;
    let correct = 0;
    for (let i = 1; i <= answers.length; i++) {
      const radios = document.getElementsByName(`${unitId}_reading-${i}`);
      let selected = null;
      radios.forEach(r => { if (r.checked) selected = r.value; });
      const correctAns = answers[i-1];
      radios.forEach(r => {
        const label = document.querySelector(`label[for="${r.id}"]`);
        if (label) {
          label.classList.remove('correct','incorrect','selected-correct','selected-incorrect');
          if (r.value === correctAns) label.classList.add('correct');
          if (r.checked) {
            if (r.value === correctAns) { label.classList.add('selected-correct'); correct++; }
            else label.classList.add('selected-incorrect');
          }
        }
      });
    }
    this.showResult(unitId, 'reading', correct, answers.length);
  },

  resetReading(unitId) {
    document.querySelectorAll(`input[type="radio"][name^="${unitId}_reading-"]`).forEach(r => {
      r.checked = false;
      const label = document.querySelector(`label[for="${r.id}"]`);
      if (label) label.classList.remove('correct','incorrect','selected-correct','selected-incorrect');
    });
    const res = document.getElementById(`${unitId}_reading-result`);
    if (res) res.style.display = 'none';
  },

  checkCloze(unitId) { this.genericCheckFill(unitId, 'cloze', unitData => unitData.answers.cloze); },
  resetCloze(unitId) {
    const data = UnitManager.getCurrentUnitData();
    if (!data) return;
    this.genericResetFill(unitId, 'cloze', data.answers.cloze.length, 1.8);
  },
  checkGrammar(unitId) { this.genericCheckFill(unitId, 'grammar', unitData => unitData.answers.grammar); },
  resetGrammar(unitId) {
    const data = UnitManager.getCurrentUnitData();
    if (!data) return;
    this.genericResetFill(unitId, 'grammar', data.answers.grammar.length, 1.5);
  },

  checkSevenFive(unitId) {
    const data = UnitManager.getCurrentUnitData();
    const answers = data.answers.sevenFive;
    let correct = 0;
    for (let i = 1; i <= answers.length; i++) {
      const dz = document.getElementById(`${unitId}_drop-${i}`);
      if (!dz) continue;
      const user = dz.getAttribute('data-answer');
      dz.classList.remove('correct','incorrect','empty');
      dz.style.color = '';
      if (!user) {
        dz.classList.add('empty');
        const opt = data.sevenFive.options.find(o => o.id === answers[i-1]);
        dz.innerHTML = opt ? opt.text : answers[i-1];
        dz.style.color = '#7c3aed';
        DragDrop.adjustDropzoneWidth(dz);
      } else if (user === answers[i-1]) {
        dz.classList.add('correct'); 
        dz.classList.add('filled');
        correct++;
        DragDrop.adjustDropzoneWidth(dz);
      } else {
        dz.classList.add('incorrect');
        dz.classList.add('filled');
        const userOpt = data.sevenFive.options.find(o => o.id === user);
        const corrOpt = data.sevenFive.options.find(o => o.id === answers[i-1]);
        dz.innerHTML = `${userOpt?.text || user} <br><small style="color:#b91c1c;">正確: ${corrOpt?.text || answers[i-1]}</small>`;
        DragDrop.adjustDropzoneWidth(dz);
      }
    }
    this.showResult(unitId, 'sevenfive', correct, answers.length);
  },

  resetSevenFive(unitId) {
    const data = UnitManager.getCurrentUnitData();
    if (!data) return;
    const count = data.answers.sevenFive.length;
    for (let i = 1; i <= count; i++) {
      const dz = document.getElementById(`${unitId}_drop-${i}`);
      if (dz) {
        dz.innerHTML = ''; 
        dz.classList.remove('filled','correct','incorrect','empty'); 
        dz.removeAttribute('data-answer');
        dz.style.color = '';
        dz.style.minWidth = '80px'; 
        dz.style.width = '80px';
      }
    }
    document.querySelectorAll(`#${unitId}_drag-source .drag-item`).forEach(el => {
      el.classList.remove('used'); 
      el.draggable = true;
    });
    DragDrop.dragHistory.delete(unitId);
    const res = document.getElementById(`${unitId}_sevenfive-result`);
    if (res) res.style.display = 'none';
  },

  genericCheckFill(unitId, prefix, answerGetter) {
    const data = UnitManager.getCurrentUnitData();
    const answers = answerGetter(data);
    let correct = 0;
    for (let i = 1; i <= answers.length; i++) {
      const input = document.getElementById(`${unitId}_${prefix}-${i}`);
      if (!input) continue;
      const user = input.value.trim().toLowerCase();
      const ans = answers[i-1].toLowerCase();
      input.classList.remove('correct','incorrect','missing');
      if (user === '') {
        input.classList.add('missing');
        input.value = answers[i-1];
        Renderer.adjustWidth({target: input});
      } else if (user === ans) {
        input.classList.add('correct'); correct++;
        Renderer.adjustWidth({target: input});
      } else {
        input.classList.add('incorrect');
        Renderer.adjustWidth({target: input});
      }
    }
    this.showResult(unitId, prefix, correct, answers.length);
  },

  genericResetFill(unitId, prefix, count, minWidthEm) {
    for (let i = 1; i <= count; i++) {
      const input = document.getElementById(`${unitId}_${prefix}-${i}`);
      if (input) {
        input.value = '';
        input.classList.remove('correct','incorrect','missing');
        input.style.width = `${minWidthEm}em`;
      }
    }
    const res = document.getElementById(`${unitId}_${prefix}-result`);
    if (res) res.style.display = 'none';
  },

  showResult(unitId, section, correct, total) {
    const resId = `${unitId}_${section}-result`;
    const res = document.getElementById(resId);
    if (!res) return;
    const percent = Math.round((correct/total)*100);
    if (correct === total) {
      res.innerHTML = `<strong><i class="fas fa-trophy"></i> 全部正確！ (${correct}/${total})</strong>`;
      res.className = 'result-feedback result-correct';
    } else {
      res.innerHTML = `<strong><i class="fas fa-chart-line"></i> 答對 ${correct}/${total} (${percent}%)</strong>`;
      res.className = 'result-feedback result-incorrect';
    }
    res.style.display = 'block';
  }
};

// ============================================
// 單元管理器
// ============================================
const UnitManager = (function() {
  let unitsIndex = [];
  let currentUnitData = null;
  let currentUnitId = '';
  const app = document.getElementById('app');

  async function init() {
    await loadUnitsIndex();
    populateUnitSelect();
    const urlUnit = getUnitFromURL();
    if (urlUnit) {
      const found = unitsIndex.find(u => u.unitId === urlUnit);
      if (found) { await loadAndRenderUnit(found); return; }
    }
    if (unitsIndex.length > 0) await loadAndRenderUnit(unitsIndex[0]);
  }

  async function loadUnitsIndex() {
    try {
      const res = await fetch('./data/units-index.json');
      if (!res.ok) throw new Error('網路錯誤');
      unitsIndex = await res.json();
    } catch (e) {
      console.warn('載入單元索引失敗，使用內置測試數據', e);
      unitsIndex = [
        { unitId: 'unit1', unitName: 'Unit 1 – A Severe Fire in Hong Kong', dataUrl: './data/unit1.json' },
        { unitId: 'unit2', unitName: 'Unit 2 – The Rise of Blindbox', dataUrl: './data/unit2.json' }
      ];
    }
  }

  function populateUnitSelect() {
    const select = document.getElementById('unit-select');
    select.innerHTML = '';
    unitsIndex.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.unitId;
      opt.textContent = u.unitName;
      select.appendChild(opt);
    });
  }

  function getUnitFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('unit');
  }

  async function loadAndRenderUnit(unitInfo) {
    try {
      if (currentUnitId && currentUnitId.startsWith('upload_')) {
        const prevEntry = unitsIndex.find(u => u.unitId === currentUnitId);
        if (prevEntry?.dataUrl?.startsWith('blob:')) URL.revokeObjectURL(prevEntry.dataUrl);
      }
      AudioController.stop();
      if (currentUnitId) {
        DragDrop.dragHistory.delete(currentUnitId);
        DragDrop.vocabDragHistory.delete(currentUnitId);
      }
      Renderer.showLoading();
      const res = await fetch(unitInfo.dataUrl);
      if (!res.ok) throw new Error('載入單元數據失敗');
      const unitData = await res.json();
      currentUnitData = unitData;
      currentUnitId = unitData.unitId || unitInfo.unitId;
      app.dataset.unitId = currentUnitId;
      const select = document.getElementById('unit-select');
      select.value = currentUnitId;
      const url = new URL(window.location);
      url.searchParams.set('unit', currentUnitId);
      window.history.pushState({}, '', url);
      Renderer.renderAll(unitData, currentUnitId);
      AudioController.preloadUnitAudio(currentUnitId, unitData.audio);
    } catch (e) {
      console.error(e);
      alert('載入單元失敗：' + e.message);
    }
  }

  async function handleUnitSelect(unitId) {
    const unitInfo = unitsIndex.find(u => u.unitId === unitId);
    if (unitInfo) await loadAndRenderUnit(unitInfo);
  }

  async function handleFileUpload(input) {
    const file = input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const unitData = JSON.parse(text);
      if (!unitData.unitId || !unitData.unitName || !unitData.article) {
        throw new Error('無效的單元JSON格式：缺少 unitId/unitName/article');
      }
      const tempId = 'upload_' + Date.now();
      const tempEntry = {
        unitId: tempId,
        unitName: unitData.unitName,
        dataUrl: URL.createObjectURL(file)
      };
      unitsIndex.push(tempEntry);
      populateUnitSelect();
      await loadAndRenderUnit(tempEntry);
    } catch (e) {
      alert('解析JSON失敗：' + e.message);
    } finally {
      input.value = '';
    }
  }

  return {
    init,
    handleUnitSelect,
    handleFileUpload,
    getCurrentUnitId: () => currentUnitId,
    getCurrentUnitData: () => currentUnitData
  };
})();

// ============================================
// 全局拖拽監聽器
// ============================================
document.addEventListener('dragstart', (e) => { DragDrop.handleDragStart(e); });
document.addEventListener('dragover', (e) => { e.preventDefault(); });
document.addEventListener('drop', (e) => { DragDrop.handleDrop(e); });

// ============================================
// 頁面啟動
// ============================================
window.onload = () => { UnitManager.init(); };