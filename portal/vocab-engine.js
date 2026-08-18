/*
  共用單字練習引擎
  使用方式：在單元頁面中，先定義 window.UNIT = {...}，再引入這支檔案。
  UNIT 格式範例見 /data/*.js
*/
(function () {
  const UNIT = window.UNIT;
  if (!UNIT) { console.error('找不到 window.UNIT，請確認資料檔已正確載入'); return; }

  // ---- 套用主題色（CSS variables）----
  const root = document.documentElement.style;
  const theme = UNIT.theme || {};
  const themeMap = {
    bg: '--bg', card: '--card', primary: '--primary', primaryDark: '--primary-dark',
    accent: '--accent', success: '--success', danger: '--danger', border: '--border'
  };
  Object.keys(themeMap).forEach(k => { if (theme[k]) root.setProperty(themeMap[k], theme[k]); });

  // ---- 套用文字內容 ----
  document.title = UNIT.title + (UNIT.subtitle ? ' ' + UNIT.subtitle : '');
  document.getElementById('home-logo').textContent = UNIT.icon || '📖';
  document.getElementById('home-title').textContent = UNIT.title;
  document.getElementById('home-sub').textContent = UNIT.subtitle || '';
  document.getElementById('home-tip').textContent = UNIT.tip || '📖 每次練習幾個單字，慢慢來！';

  // ---- 組成 SETS（依 groupSize 分組）----
  const GROUP_SIZE = UNIT.groupSize || 3;
  const VOCAB = UNIT.vocab;
  const SETS = [];
  for (let i = 0; i < VOCAB.length; i += GROUP_SIZE) {
    SETS.push({ name: `第${SETS.length + 1}組`, words: VOCAB.slice(i, i + GROUP_SIZE) });
  }

  // ---- localStorage 持久化（記錄完成狀態與錯題本）----
  const STORAGE_KEY = 'vocab_progress_' + (UNIT.id || UNIT.title);
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { setDone: {}, globalWrong: {} }; }
    catch { return { setDone: {}, globalWrong: {} }; }
  }
  function saveProgress() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ setDone, globalWrong })); } catch {}
  }
  let { setDone, globalWrong } = loadProgress();

  // ---- DOM refs ----
  const $ = id => document.getElementById(id);
  const previewWordList = $('setsGrid');
  const wrongBtn = $('wrongBtn');
  const wrongCount = $('wrongCount');

  let curSetIdx = -1, curVocab = [], isWrong = false;
  let questions = [], qIdx = 0, score = 0;
  let wrongThisRound = [];
  let synth = window.speechSynthesis;

  function speak(text, lang) {
    if (!synth) return;
    if (synth.speaking) synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; u.rate = 0.88;
    synth.speak(u);
  }
  window.speak = speak; // 供 study 卡片按鈕使用

  function shuffle(a) { return [...a].sort(() => Math.random() - 0.5); }

  function buildHome() {
    previewWordList.innerHTML = '';
    SETS.forEach((s, i) => {
      const done = setDone[i];
      const c = document.createElement('div');
      c.className = 'set-card';
      c.onclick = () => startSet(i);
      c.innerHTML = `
        <div class="set-tag">${s.name}</div>
        <div class="set-words">${s.words.map(v => v.word).join(' · ')}</div>
        <div class="set-status ${done ? 'done' : ''}">${done ? '✅ 完成' : '▶ 開始練習'}</div>`;
      previewWordList.appendChild(c);
    });
    const wc = Object.keys(globalWrong).length;
    wrongCount.textContent = `（${wc} 個）`;
    wrongBtn.disabled = wc === 0;
  }

  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(id).classList.add('active');
    window.scrollTo(0, 0);
  }

  function goHome() { show('home'); buildHome(); }
  window.goHome = goHome;

  function startSet(idx) {
    curSetIdx = idx; isWrong = false;
    curVocab = SETS[idx].words;
    showStudy(SETS[idx].name, curVocab.length + ' 個單字');
  }

  function startWrong() {
    isWrong = true; curSetIdx = -1;
    curVocab = Object.values(globalWrong);
    if (!curVocab.length) return;
    showStudy('錯題複習', curVocab.length + ' 個單字');
  }
  window.startWrong = startWrong;

  function showStudy(title, sub) {
    $('studyTitle').textContent = title;
    $('studySub').textContent = sub;
    const scroll = $('cardsScroll');
    scroll.innerHTML = '';
    curVocab.forEach(v => {
      const card = document.createElement('div');
      card.className = 'vocab-card';
      card.innerHTML = `
        <div class="vc-row1">
          <div class="vc-word">${v.word}</div>
          <div class="vc-pos">${v.pos || ''}</div>
        </div>
        <div class="vc-phone-row">
          <span class="vc-phonetic">${v.phonetic || ''}</span>
          <button class="speak-btn" onclick="speak('${v.word.replace(/'/g, "\\'")}','en-US')" title="聽發音">🔊</button>
        </div>
        <div class="vc-meaning">${v.meaning}</div>
        ${v.colloc ? `<div class="vc-colloc">🔗 ${v.colloc}</div>` : ''}
        <div class="vc-ex">📌 ${v.example}<div class="vc-ex-tr">${v.exTr}</div></div>`;
      scroll.appendChild(card);
    });
    const btn = document.createElement('button');
    btn.className = 'start-quiz-btn';
    btn.textContent = '我記住了，開始測驗 →';
    btn.onclick = startQuiz;
    scroll.appendChild(btn);
    show('study');
  }

  function startQuiz() {
    const base = [...curVocab, ...curVocab];
    questions = shuffle(base);
    qIdx = 0; score = 0; wrongThisRound = [];
    $('quizName').textContent = isWrong ? '錯題練習' : (SETS[curSetIdx]?.name || '');
    show('quiz');
    renderQ();
  }
  window.startQuiz = startQuiz;

  function renderQ() {
    const total = questions.length;
    const q = questions[qIdx];
    $('pbarFill').style.width = (qIdx / total * 100) + '%';
    $('quizCounter').textContent = `${qIdx + 1} / ${total}`;
    $('qNum').textContent = `第 ${qIdx + 1} 題`;
    $('qWord').textContent = q.word;
    $('qPhone').textContent = q.phonetic || '';
    $('fbRow').textContent = '';
    $('fbRow').className = 'fb-row';
    $('nextBtn').style.display = 'none';

    const others = shuffle(VOCAB.filter(v => v.word !== q.word)).slice(0, 3);
    const opts = shuffle([q, ...others]);
    const grid = $('opts');
    grid.innerHTML = '';
    opts.forEach(o => {
      const button = document.createElement('button');
      button.className = 'opt';
      button.textContent = o.meaning;
      button.onclick = () => handleAns(o.meaning, q.meaning, q);
      grid.appendChild(button);
    });
  }

  function handleAns(chosen, correct, vo) {
    document.querySelectorAll('.opt').forEach(b => {
      b.disabled = true;
      if (b.textContent === correct) b.classList.add('correct');
      else if (b.textContent === chosen && chosen !== correct) b.classList.add('wrong');
    });
    const fb = $('fbRow');
    const nb = $('nextBtn');
    if (chosen === correct) {
      score++;
      fb.textContent = '✅ 答對了！';
      fb.className = 'fb-row good';
      delete globalWrong[vo.word];
    } else {
      fb.textContent = `❌ 正確答案是「${correct}」`;
      fb.className = 'fb-row bad';
      globalWrong[vo.word] = vo;
      if (!wrongThisRound.find(w => w.word === vo.word)) wrongThisRound.push({ word: vo.word, correct });
    }
    saveProgress();
    nb.style.display = 'block';
    nb.textContent = qIdx + 1 >= questions.length ? '查看結果 →' : '下一題 →';
  }

  function nextQ() {
    qIdx++;
    if (qIdx >= questions.length) showResult();
    else renderQ();
  }
  window.nextQ = nextQ;

  function showResult() {
    const total = questions.length;
    $('scoreRing').style.setProperty('--pct', Math.round(score / total * 100));
    $('scoreBig').textContent = score;
    $('scoreOf').textContent = `/ ${total}`;
    const pct = Math.round(score / total * 100);

    const [emoji, msg, sub] =
      pct >= 90 ? ['🏆', '太棒了！', '幾乎全對，繼續保持！'] :
      pct >= 70 ? ['👍', '做得很好！', '再複習一下錯的單字就更好了！'] :
      pct >= 50 ? ['💪', '加油！', '多練幾次，你一定可以的！'] :
                 ['📖', '再複習一次吧！', '先回去看單字表，再試一次看看。'];

    $('resEmoji').textContent = emoji;
    $('resMsg').textContent = msg;
    $('resSub').textContent = sub;

    const rv = $('review');
    rv.innerHTML = '';
    if (wrongThisRound.length) {
      rv.innerHTML = `<div class="review-ttl">❌ 這次答錯的單字，多看幾次：</div>`;
      wrongThisRound.forEach(w => {
        const d = document.createElement('div');
        d.className = 'review-item';
        d.innerHTML = `<span class="rw">${w.word}</span> → 正確意思：<span class="rright">${w.correct}</span>`;
        rv.appendChild(d);
      });
    } else {
      rv.innerHTML = `<div style="color:var(--success);font-weight:800;text-align:center;padding:10px 0;">🎉 全部答對！完美！</div>`;
    }

    const wc = Object.keys(globalWrong).length;
    $('practiceWrongBtn').disabled = wc === 0;
    $('practiceWrongBtn').textContent = `❌ 練習錯題（${wc} 個）`;
    if (!isWrong && curSetIdx >= 0) { setDone[curSetIdx] = true; saveProgress(); }
    show('result');
  }

  function retrySet() { startQuiz(); }
  window.retrySet = retrySet;

  $('speakQuestionBtn')?.addEventListener('click', () => {
    if (qIdx < questions.length) speak(questions[qIdx].word, 'en-US');
  });

  buildHome();
})();
