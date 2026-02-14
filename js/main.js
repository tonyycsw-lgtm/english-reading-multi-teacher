// ============================================
// 音頻控制器（增強版 - 支援逐句高亮、解讀區獨立播放）
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
    this.clearImplicationHighlights(); // 新增：清除解讀區高亮
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

  // 新增：清除解讀區高亮
  clearImplicationHighlights() {
    document.querySelectorAll('.implication-english, .implication-chinese-part').forEach(el => {
      el.classList.remove('implication-playing');
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
    // ... 原有程式碼不變 ...
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
    // ... 原有程式碼不變 ...
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

  // 修改：播放解讀英文（嘗試本地音檔，失敗則用TTS）
  async playImplicationEnglish(paraNum, unitId) {
    this.stop(); // 停止任何正在播放的音頻
    const unitData = UnitManager.getCurrentUnitData();
    const implEnglish = unitData?.article?.paragraphs[paraNum-1]?.implication?.english || '';
    const cleanEnglish = implEnglish.replace(/^💡\s*/, '');
    
    // 高亮英文部分
    this.clearImplicationHighlights();
    const englishEl = document.getElementById(`${unitId}_impl-${paraNum}`)?.querySelector('.implication-english');
    if (englishEl) englishEl.classList.add('implication-playing');

    // 嘗試播放本地音檔
    const btn = document.getElementById(`${unitId}_impl-audio-btn-${paraNum}`); // 可選按鈕
    try {
      const audio = new Audio();
      const pattern = unitData.audio?.implicationPattern || `/english-reading-multi/audio/${unitId}/impl_{id}.mp3`;
      audio.src = pattern.replace('{id}', paraNum.toString().padStart(2,'0'));
      await audio.play();
      this.currentAudio = audio;
      audio.onended = () => {
        this.clearImplicationHighlights();
        this.currentAudio = null;
      };
    } catch (e) {
      console.warn('本地解讀音檔失敗，使用TTS', e);
      // TTS 播放
      const utter = new SpeechSynthesisUtterance(cleanEnglish);
      utter.lang = 'en-GB';
      utter.rate = 0.85;
      utter.onend = () => {
        this.clearImplicationHighlights();
        this.currentAudio = null;
      };
      utter.onerror = () => {
        this.clearImplicationHighlights();
        this.currentAudio = null;
      };
      window.speechSynthesis.speak(utter);
      this.currentAudio = utter;
    }
  },

  // 新增：點擊解讀中文時僅停止播放，不發聲
  stopImplicationChinese() {
    this.stop(); // 停止所有音頻並清除高亮
  },

  async toggleImplicationAudio(paraNum, unitId) {
    // 保留原有功能（按鈕控制整段解讀英文）
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
    // ... 原有程式碼不變 ...
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
      this.clearImplicationHighlights();
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
// 渲染器（修正英文容器 lang 屬性，加入解讀區分段）
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
      this.setupImplicationHover(unitId); // 新增
    }, 50);
  },

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

  // 新增：設定解讀區懸停（CSS 即可，此處僅為標記）
  setupImplicationHover(unitId) {
    // 所有效果由 CSS 處理，無需額外 JS
  },

  renderArticleVocabulary(unitData, unitId) {
    const wrapper = document.getElementById('article-vocab-wrapper');
    const article = unitData.article;
    const vocab = unitData.vocabulary || [];
    
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

      // 統一的內容容器
      html += `
        <div class="unified-content" id="${unitId}_content-${paraNum}">
          <!-- 翻譯內容 -->
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
          <!-- 解讀內容（分段） -->
          <div class="implication-content" id="${unitId}_impl-${paraNum}" data-content-type="implication" style="display: none;">
            <div class="implication-text-wrapper">
              <!-- 英文部分：點擊播放（優先本地音檔） -->
              <div class="implication-english" lang="en" 
                   onclick="AudioController.playImplicationEnglish(${paraNum}, '${unitId}')"
                   title="點擊播放英文">${para.implication.english}</div>
              <!-- 中文部分：分為兩段（「換句話說：」前後）點擊僅停止播放 -->
              <div class="implication-chinese" lang="zh">`;

      // 分割中文部分
      const chineseText = para.implication.chinese;
      const marker = '換句話說：';
      const markerIndex = chineseText.indexOf(marker);
      if (markerIndex !== -1) {
        const beforePart = chineseText.substring(0, markerIndex);
        const afterPart = chineseText.substring(markerIndex);
        html += `<span class="implication-chinese-part" 
                       onclick="AudioController.stopImplicationChinese()"
                       title="點擊停止播放">${beforePart}</span>`;
        html += `<span class="implication-chinese-part implication-saying" 
                       onclick="AudioController.stopImplicationChinese()"
                       title="點擊停止播放">${afterPart}</span>`;
      } else {
        // 若無標記，整段作為一個部分
        html += `<span class="implication-chinese-part" 
                       onclick="AudioController.stopImplicationChinese()"
                       title="點擊停止播放">${chineseText}</span>`;
      }

      html += `
              </div>
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
    // ... 保持原有程式碼 ...
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
    // ... 保持原有程式碼 ...
    const container = document.getElementById('reading-section');
    const rc = unitData.readingComprehension;
    if (!rc || !rc.length) { 
      container.innerHTML = '<div style="padding:20px; text-align:center; color:#666;" lang="zh">暫無閱讀理解題目</div>'; 
      return; 
    }
    let html = `<div lang="en" style="display:flex; flex-direction:column; gap:12px;">`;
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
    // ... 保持原有程式碼 ...
    const container = document.getElementById('cloze-section');
    let text = unitData.clozeText || '';
    text = text.replace(/id='cloze-(\d+)'/g, `id='${unitId}_cloze-$1'`);
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
    // ... 保持原有程式碼 ...
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
    // ... 保持原有程式碼 ...
    const container = document.getElementById('grammar-section');
    let text = unitData.grammarText || '';
    text = text.replace(/id='grammar-(\d+)'/g, `id='${unitId}_grammar-$1'`);
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
// 其餘物件（DragDrop, ExerciseChecker, UnitManager）保持不變，僅需確認所有UI文字為繁體
// ============================================
// 為節省篇幅，此處省略 DragDrop, ExerciseChecker, UnitManager 的完整程式碼，
// 但實際上它們與原檔案完全相同，僅需確認其中所有中文提示均為繁體（如「返回上一步」、「檢查答案」等已是繁體，無需修改）。
// 請在實際使用時將原檔案中對應的部分保留。
// ============================================

// 注意：因字數限制，此處省略 DragDrop, ExerciseChecker, UnitManager 的完整重複內容，
// 但它們應與原始 main.js 中對應部分完全相同，僅需確保所有使用者介面文字為繁體（原始已是）。
// 請在合併時保留這些物件的完整定義。

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