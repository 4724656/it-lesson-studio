(() => {
  const $ = id => document.getElementById(id);
  const panels = [...document.querySelectorAll('section.panel')];
  const tasks = Object.fromEntries(lessonConfig.screens.map(s => [s.id, {
    basicEver: false, independentEver: false, assistedEver: false, starEver: false,
    transferEver: false, hints: 0, phase: '未开始', current: null, controller: null
  }]));
  let currentStep = 0;
  let formalScore = null;
  const picked = quiz.map(() => null);
  let reflectionEver = false;
  let needsHelp = false;
  let certReturnFocus = null;
  let receiptSnapshot = '';
  const errors = [];
  // Runtime diagnostics contain module IDs only, no identity or behavior trace.
  window.__itlsV2 = { ready: false, errors };
  const status = (id, text) => { $(id).textContent = text; };
  const fail = id => {
    if (!errors.includes(id)) errors.push(id);
    tasks[id].controller = null;
    status(`feedback-${id}`, '这个实验暂时遇到问题，可以求助或先到其他任务。');
  };

  function renderProgress() {
    const all = Object.values(tasks);
    status('progressCapsule', `第 ${currentStep + 1}/${panels.length} 屏 · 基础 ${all.filter(t => t.basicEver).length}/${all.length} · ⭐ ${all.filter(t => t.starEver).length}/${all.length}`);
    for (const [id, t] of Object.entries(tasks)) {
      const achieved = t.independentEver ? '曾独立通关' : t.assistedEver ? '曾带提示通关' : '';
      status(`task-state-${id}`, `${t.phase}${achieved ? ' · ' + achieved : ''}${t.starEver ? ' · ⭐ 已达成' : ''}`);
    }
    [...$('stepper').children].forEach((button, i) => {
      if (i === currentStep) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    const achieved = {
      basic: all.some(t => t.basicEver), star: all.some(t => t.starEver),
      transfer: all.some(t => t.transferEver), reflection: reflectionEver || needsHelp
    };
    $('medalArea').replaceChildren(...medalDefs.map(m => {
      const el = document.createElement('div');
      el.className = 'medal' + (achieved[m.event] ? ' got' : '');
      el.textContent = `${achieved[m.event] ? '★ 已获得' : '☆ 待探索'} ${m.label}`;
      return el;
    }));
  }

  function update(id) {
    const t = tasks[id];
    if (!t.controller) return;
    try {
      const result = t.controller.evaluate();
      if (!result || ['basic', 'star', 'transfer'].some(k => typeof result[k] !== 'boolean')) throw new Error('invalid predicate');
      if ((result.star || result.transfer) && !result.basic) throw new Error('missing basic');
      t.current = result;
      if (result.basic) {
        t.basicEver = true;
        if (t.hints >= 3) t.assistedEver = true;
        else t.independentEver = true;
        t.starEver ||= result.star;
        t.transferEver ||= result.transfer;
        t.phase = t.hints >= 3 ? '带提示通关' : '独立通关';
      } else t.phase = '探索中';
      renderProgress();
    } catch { fail(id); }
  }

  for (const screen of lessonConfig.screens) {
    const host = $(`sim-${screen.id}`);
    const root = host.attachShadow({ mode: 'open' });
    root.appendChild($(`template-${screen.id}`).content.cloneNode(true));
    const api = Object.freeze({
      changed: () => update(screen.id),
      feedback: text => status(`feedback-${screen.id}`, String(text))
    });
    try {
      const controller = simulationMounts[screen.id](root, api);
      if (!controller || typeof controller.evaluate !== 'function' || typeof controller.reset !== 'function') throw new Error('missing lifecycle');
      tasks[screen.id].controller = controller;
      // Initial state must not grant completion without student work.
      const initial = controller.evaluate();
      if (!initial || ['basic', 'star', 'transfer'].some(k => initial[k] !== false)) throw new Error('pre-awarded');
    } catch { fail(screen.id); }
  }

  function navigate(index, focus = true) {
    const previous = lessonConfig.screens[currentStep];
    if (previous) {
      const t = tasks[previous.id];
      if (!t.basicEver) t.phase = '暂时跳过';
      try { t.controller?.onLeave?.(); } catch { fail(previous.id); }
    }
    currentStep = Math.max(0, Math.min(index, panels.length - 1));
    panels.forEach((panel, i) => { panel.classList.toggle('active', i === currentStep); panel.hidden = i !== currentStep; });
    const screen = lessonConfig.screens[currentStep];
    if (screen) {
      const t = tasks[screen.id];
      if (t.phase === '未开始' || t.phase === '暂时跳过') t.phase = '探索中';
      try { t.controller?.onEnter?.(); } catch { fail(screen.id); }
    }
    $('prevStep').disabled = currentStep === 0;
    $('nextStep').disabled = currentStep === panels.length - 1;
    status('navMessage', previous && !tasks[previous.id].basicEver ? '基础任务尚未完成，你可以继续试试或稍后回来。' : '可以随时回看与继续探索。');
    renderProgress();
    if (focus) panels[currentStep].querySelector('h2').focus();
  }
  stepLabels.forEach((label, index) => {
    const button = document.createElement('button');
    button.textContent = `${index + 1}. ${label}`;
    button.addEventListener('click', () => navigate(index));
    $('stepper').appendChild(button);
  });
  $('prevStep').addEventListener('click', () => navigate(currentStep - 1));
  $('nextStep').addEventListener('click', () => navigate(currentStep + 1));
  document.querySelectorAll('[data-hint]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.hint;
    const t = tasks[id];
    t.hints = Math.min(3, t.hints + 1);
    const screen = lessonConfig.screens.find(s => s.id === id);
    const box = $(`hint-${id}`);
    box.hidden = false;
    box.textContent = `${['观察方向', '关键变量', '完整示范'][t.hints - 1]}：${screen.hints[t.hints - 1]}`;
    button.textContent = t.hints < 3 ? '再给我一点提示' : '回看完整示范';
    // Reading a hint never grants completion; only evaluate() after real changes does.
  }));
  document.querySelectorAll('[data-reset]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.reset;
    const t = tasks[id];
    try {
      t.controller?.reset();
      t.current = null;
      t.phase = '探索中';
      status(`feedback-${id}`, '实验已重置，曾取得的成就仍保留。');
      renderProgress();
    } catch { fail(id); }
  }));
  $('helpFlag').addEventListener('click', () => {
    needsHelp = !needsHelp;
    $('helpFlag').setAttribute('aria-pressed', String(needsHelp));
    $('helpBanner').hidden = !needsHelp;
    if (needsHelp) reflectionEver = true;
    renderProgress();
  });

  quiz.forEach((item, qi) => {
    const block = document.createElement('div');
    block.className = 'quiz-block';
    const question = document.createElement('h3');
    question.textContent = `${qi + 1}. ${item.q}`;
    block.appendChild(question);
    const options = document.createElement('div');
    options.setAttribute('role', 'group');
    options.setAttribute('aria-label', item.q);
    [...item.options, '我暂时不会'].forEach((text, oi) => {
      const value = oi < item.options.length ? oi : -1;
      const button = document.createElement('button');
      button.className = 'quiz-option';
      button.dataset.choice = String(value);
      button.setAttribute('aria-pressed', 'false');
      button.textContent = text;
      button.addEventListener('click', () => {
        if (formalScore !== null) return;
        picked[qi] = value;
        [...options.children].forEach(other => {
          const selected = other === button;
          other.classList.toggle('picked', selected);
          other.setAttribute('aria-pressed', String(selected));
        });
      });
      options.appendChild(button);
    });
    block.appendChild(options);
    const why = document.createElement('p');
    why.className = 'quiz-explanation';
    why.hidden = true;
    why.textContent = item.why;
    block.appendChild(why);
    $('quizArea').appendChild(block);
  });
  $('quizSubmit').addEventListener('click', () => {
    if (formalScore !== null) return;
    const missing = picked.filter(v => v === null).length;
    if (missing) { status('quizMessage', `还有 ${missing} 题未选择，也可以选择“我暂时不会”。`); return; }
    formalScore = Math.round(picked.filter((v, i) => v === quiz[i].correct).length / quiz.length * 100);
    [...$('quizArea').children].forEach((block, qi) => {
      block.querySelectorAll('button').forEach(button => {
        const value = Number(button.dataset.choice);
        button.classList.remove('picked');
        if (value === quiz[qi].correct) { button.classList.add('correct'); button.textContent += ' ✔ 正确答案'; }
        else if (value === picked[qi]) { button.classList.add('wrong'); button.textContent += value < 0 ? ' · 本题未答' : ' ✘ 可以再想一想'; }
        button.disabled = true;
      });
      block.querySelector('.quiz-explanation').hidden = false;
    });
    $('quizSubmit').disabled = true;
    $('scoreBox').hidden = false;
    status('scoreBox', `本轮首次正式得分：${formalScore} / 100。可以继续探索与回看。`);
    status('quizMessage', '已记录首次正式成绩，回看和重置实验不会改写它。');
    $('saveReceipt').disabled = false;
    $('viewReceipt').disabled = false;
  });
  const selfLabels = ['我能解释今天一个关键现象', '我尝试过调整方案或修复问题', '我完成了 ⭐ 挑战或愿意继续试试', '我还没完全懂，需要老师或同伴帮助'];
  selfLabels.forEach((text, i) => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) reflectionEver = true;
      status('selfMessage', i === 3 && checkbox.checked ? '谢谢你告诉我们。可以点击顶部求助旗，请老师或同伴一起看看。' : '每一次认真回顾都值得肯定。');
      renderProgress();
    });
    label.append(checkbox, document.createTextNode(' ' + text));
    $('selfList').appendChild(label);
  });

  const cleanField = (text, fallback) => String(text).normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 60) || fallback;
  const receiptFields = () => ({ cls: cleanField($('inputClass').value, '本班'), name: cleanField($('inputName').value, '小极客'), title: cleanField(lessonConfig.title, '本课') });
  function showReceipt() {
    if (formalScore === null) return null;
    const fields = receiptFields();
    const pad = n => String(n).padStart(2, '0');
    const now = new Date();
    const time = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    receiptSnapshot = `# 班级|姓名|课题|得分|时间\n${fields.cls}|${fields.name}|${fields.title}|${formalScore}|${time}\n`;
    $('receiptText').value = receiptSnapshot;
    $('receiptPanel').hidden = false;
    return fields;
  }
  $('viewReceipt').addEventListener('click', showReceipt);
  $('saveReceipt').addEventListener('click', () => {
    const fields = showReceipt();
    if (!fields) return;
    let url;
    try {
      const blob = new Blob([receiptSnapshot], { type: 'text/plain;charset=utf-8' });
      url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fields.cls}_${fields.name}_${fields.title}_${formalScore}.txt`;
      document.body.appendChild(link);
      try { link.click(); } finally { link.remove(); }
      status('receiptMessage', '已请求下载。若未收到文件，可复制下方同一份凭单；请按课堂安排自行提交。');
    } catch { status('receiptMessage', '这里暂时无法下载，请复制下方同一份凭单。'); }
    finally { if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); }
  });
  $('copyReceipt').addEventListener('click', async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText($('receiptText').value);
      status('receiptMessage', '已复制凭单，请按课堂安排提交。');
    } catch {
      $('receiptText').focus();
      $('receiptText').select();
      status('receiptMessage', '已选中文本，请按 Ctrl+C 或使用设备的复制操作。');
    }
  });

  $('openCert').addEventListener('click', () => {
    certReturnFocus = document.activeElement;
    const fields = receiptFields();
    const allBasic = Object.values(tasks).every(t => t.basicEver);
    const title = allBasic ? '持续成长者' : '勇敢探索者';
    status('certContent', `${fields.cls} · ${fields.name}\n${lessonConfig.title}\n${title}\n${new Date().toLocaleDateString('zh-CN')}`);
    status('certMedals', [...$('medalArea').children].filter(el => el.classList.contains('got')).map(el => el.textContent).join(' · ') || '感谢你参与今天的探索。');
    $('certModal').hidden = false;
    $('closeCert').focus();
  });
  function closeCertificate() {
    $('certModal').hidden = true;
    certReturnFocus?.focus();
  }
  $('closeCert').addEventListener('click', closeCertificate);
  $('certModal').addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeCertificate(); }
    if (event.key === 'Tab') { event.preventDefault(); $('closeCert').focus(); }
  });
  $('certModal').addEventListener('click', event => { if (event.target === $('certModal')) closeCertificate(); });
  $('restartLesson').addEventListener('click', () => { $('restartConfirm').hidden = false; $('restartYes').focus(); });
  $('restartNo').addEventListener('click', () => { $('restartConfirm').hidden = true; $('restartLesson').focus(); });
  $('restartYes').addEventListener('click', () => location.reload());
  // Memory-only progress: private browsing, denied storage and file:// all work.
  document.addEventListener('visibilitychange', () => {
    const screen = lessonConfig.screens[currentStep];
    if (!screen) return;
    try { tasks[screen.id].controller?.[document.hidden ? 'onLeave' : 'onEnter']?.(); } catch { fail(screen.id); }
  });
  navigate(0, false);
  window.__itlsV2.ready = true;
})();
