/**
 * AiSolutions — Side Panel Logic
 * OpenRouter API · Smart model routing · SSE Streaming · Exponential backoff
 */
(() => {
  'use strict';

  // Smart Model Router: text-only vs vision
  const MODEL_TEXT = 'google/gemma-4-26b-a4b-it:free';
  const MODEL_VISION = 'google/gemma-4-31b-it:free';
  const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
  const REFERER = 'https://github.com/ai-sidekick';
  const SK_KEY = 'aisolutions_api_key';
  const SK_HIST = 'aisolutions_chat_history';
  const MAX_HIST = 50;

  const $ = (id) => document.getElementById(id);
  const chatMessages = $('chat-messages');
  const chatContainer = $('chat-container');
  const userInput = $('user-input');
  const btnSend = $('btn-send');
  const btnClear = $('btn-clear');
  const btnSettings = $('btn-settings');
  const settingsModal = $('settings-modal');
  const modalClose = $('modal-close');
  const apiKeyInput = $('api-key-input');
  const btnToggleKey = $('btn-toggle-key');
  const btnSaveKey = $('btn-save-key');
  const keyStatus = $('key-status');

  let apiKey = '';
  let isProcessing = false;
  let convHistory = []; // OpenAI format: { role, content }

  const ICO = {
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
  };

  /* ── Exponential Backoff Fetch ─────────────────────────── */
  async function fetchWithRetry(url, options, maxRetries = 4) {
    for (let i = 0; i < maxRetries; i++) {
      const res = await fetch(url, options);

      // Handle rate limits (429) and server overload (503)
      if (res.status === 429 || res.status === 503) {
        if (i === maxRetries - 1) throw new Error('Server overloaded. Please try again in a minute.');
        const wait = Math.pow(2, i) * 1000 + Math.random() * 500;
        console.log(`[AiSolutions] Retry ${i + 1}/${maxRetries} in ${Math.round(wait)}ms...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      if (!res.ok) {
        let errStr = `API Error ${res.status}`;
        try {
          const data = await res.json();
          if (data?.error?.message) errStr = data.error.message;
        } catch (e) {}
        throw new Error(errStr);
      }
      return res; // Return the raw response object for streaming
    }
  }

  /* ── OpenRouter Headers Builder ────────────────────────── */
  function openRouterHeaders() {
    return {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      'HTTP-Referer': REFERER
    };
  }

  /* ── Init ──────────────────────────────────────────────── */
  async function init() {
    const stored = await chrome.storage.local.get(SK_KEY);
    apiKey = stored[SK_KEY] || '';
    const hist = await chrome.storage.local.get(SK_HIST);
    if (hist[SK_HIST]) restoreHistory(hist[SK_HIST]);
    setupListeners();
    chrome.runtime.onMessage.addListener(onMessage);
    if (!apiKey) setTimeout(showSettings, 600);
  }

  function setupListeners() {
    btnSend.addEventListener('click', handleSend);
    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
    userInput.addEventListener('input', () => {
      userInput.style.height = 'auto';
      userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
    });
    btnClear.addEventListener('click', clearChat);
    btnSettings.addEventListener('click', showSettings);
    modalClose.addEventListener('click', hideSettings);
    settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) hideSettings(); });
    btnToggleKey.addEventListener('click', () => {
      const show = apiKeyInput.type === 'password';
      apiKeyInput.type = show ? 'text' : 'password';
      btnToggleKey.innerHTML = show ? ICO.eyeOff : ICO.eye;
    });
    btnSaveKey.addEventListener('click', saveKey);
  }

  /* ── Settings ──────────────────────────────────────────── */
  function showSettings() {
    apiKeyInput.value = apiKey;
    keyStatus.textContent = ''; keyStatus.className = 'key-status';
    settingsModal.style.display = 'flex';
    setTimeout(() => apiKeyInput.focus(), 100);
  }
  function hideSettings() { settingsModal.style.display = 'none'; }

  async function saveKey() {
    const key = apiKeyInput.value.trim();
    if (!key) {
      keyStatus.textContent = 'Please enter an API key';
      keyStatus.className = 'key-status error';
      return;
    }

    // Bypass the OpenRouter network validation ping.
    // Free models can queue during peak load, causing false-positive validation errors.
    apiKey = key;
    await chrome.storage.local.set({ [SK_KEY]: key });

    keyStatus.textContent = 'Key saved successfully!';
    keyStatus.className = 'key-status success';
    setTimeout(hideSettings, 1000);
  }

  /* ── Message Router ────────────────────────────────────── */
  function onMessage(msg) {
    if (msg.type === 'TEXT_SELECTION') handleTextSel(msg.text, msg.source);
    if (msg.type === 'SCREENSHOT_CAPTURED') handleScreenshot(msg.imageBase64, msg.dimensions);
    if (msg.type === 'PAGE_SUMMARIZE') handlePageSum(msg.data);
    if (msg.type === 'IMAGE_URL') handleImgUrl(msg.url, msg.source);
  }

  async function handleTextSel(text, src) {
    removeWelcome();
    addUserBubble(`Explain Selection:\n"${text}"`, src);
    await callText(`Briefly explain or answer the following text selection. Be concise and informative.\n\nText: "${text}"`);
  }

  async function handleScreenshot(b64, dim) {
    removeWelcome();
    const bubble = mkBubble('user');
    const hdr = mkHeader('You', 'user');
    const body = document.createElement('div'); body.className = 'bubble-content';
    const img = document.createElement('img');
    img.src = `data:image/png;base64,${b64}`;
    img.className = 'screenshot-thumb'; img.alt = 'Captured area';
    img.addEventListener('click', () => window.open(img.src, '_blank'));
    body.appendChild(img);
    const lbl = document.createElement('div');
    lbl.textContent = `Area captured (${dim.w}x${dim.h}px)`;
    lbl.style.cssText = 'font-size:11px;color:var(--tx-3);margin-top:2px;';
    body.appendChild(lbl);
    bubble.append(hdr, body);
    chatMessages.appendChild(bubble);
    scrollEnd();
    await callMultimodal('Extract and solve the main question shown in this image. If it contains a math problem, solve it step by step. If it contains text, explain or answer it. If it contains code, analyze and explain it.', b64);
  }

  async function handlePageSum(data) {
    removeWelcome();
    addUserBubble(`Summarize Page:\n"${data.title}"`, data.url);
    await callText(`Provide a concise summary of this web page. Highlight key points and takeaways.\n\nTitle: "${data.title}"\nURL: ${data.url}\n\nContent:\n${data.content}`);
  }

  async function handleImgUrl(url, src) {
    removeWelcome();
    const bubble = mkBubble('user');
    const hdr = mkHeader('You', 'user');
    const body = document.createElement('div'); body.className = 'bubble-content';
    const img = document.createElement('img');
    img.src = url; img.className = 'screenshot-thumb';
    body.appendChild(img);
    bubble.append(hdr, body);
    chatMessages.appendChild(bubble);
    scrollEnd();
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const b64 = await blobToB64(blob);
      await callMultimodal('Describe and explain what is shown in this image in detail. If it contains text, transcribe it. If it contains a problem, solve it.', b64);
    } catch (e) { addErrorBubble(`Failed to fetch image: ${e.message}`); }
  }

  async function handleSend() {
    const text = userInput.value.trim();
    if (!text || isProcessing) return;
    removeWelcome();
    userInput.value = ''; userInput.style.height = 'auto';
    addUserBubble(text);
    await callText(text);
  }

  /* ── SSE Stream Processor ──────────────────────────────── */
  async function processStream(res, loader) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let accumulatedText = '';
    let buffer = '';
    let firstChunkReceived = false;

    // Create the AI chat bubble immediately
    const b = mkBubble('ai');
    const hdr = mkHeader('AiSolutions', 'ai');
    const c = document.createElement('div'); c.className = 'bubble-content';
    b.append(hdr, c);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (!firstChunkReceived) {
        // When the first chunk arrives, immediately remove the "Thinking" loader
        loader.remove();
        chatMessages.appendChild(b);
        scrollEnd();
        firstChunkReceived = true;
      }

      buffer += decoder.decode(value, { stream: true });
      // Split chunks by the \n\n delimiter
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop(); // Keep the last incomplete chunk in the buffer

      for (const chunk of chunks) {
        const line = chunk.trim();
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            // Parse JSON safely and ignore data: [DONE]
            const parsed = JSON.parse(line.slice(6));
            const content = parsed.choices[0]?.delta?.content || '';
            if (content) {
              accumulatedText += content;
              // Re-run the Markdown parser on the accumulated text so formatting renders live
              c.innerHTML = renderMd(accumulatedText);
              // Call scrollEnd() during the stream so the chat auto-scrolls
              scrollEnd();
            }
          } catch (e) {
            // Ignore parse errors from incomplete chunks
          }
        }
      }
    }

    // In case the stream ended without any chunks (rare)
    if (!firstChunkReceived) {
      loader.remove();
      chatMessages.appendChild(b);
    }

    // Append copy actions when stream is complete
    const acts = document.createElement('div'); acts.className = 'bubble-actions';
    const cp = document.createElement('button'); cp.className = 'btn-copy';
    cp.innerHTML = `${ICO.copy} Copy`;
    cp.addEventListener('click', () => {
      navigator.clipboard.writeText(accumulatedText).then(() => {
        cp.innerHTML = `${ICO.check} Copied`; cp.classList.add('copied');
        setTimeout(() => { cp.innerHTML = `${ICO.copy} Copy`; cp.classList.remove('copied'); }, 2000);
      });
    });
    acts.appendChild(cp);
    b.appendChild(acts);
    scrollEnd();

    return accumulatedText || 'No response generated.';
  }

  /* ── OpenRouter: Text ──────────────────────────────────── */
  async function callText(prompt) {
    if (!apiKey) { addErrorBubble('No API key configured. Open settings to add your OpenRouter key.'); return; }
    isProcessing = true;
    const loader = addLoader();
    try {
      // Build conversation in OpenAI format
      convHistory.push({ role: 'user', content: prompt });
      const recent = convHistory.slice(-10);

      const res = await fetchWithRetry(API_URL, {
        method: 'POST',
        headers: openRouterHeaders(),
        body: JSON.stringify({
          model: MODEL_TEXT,
          messages: recent,
          max_tokens: 2048,
          temperature: 0.7,
          stream: true
        })
      });

      const txt = await processStream(res, loader);
      convHistory.push({ role: 'assistant', content: txt });
      // Only call saveHistory() after the stream has completely finished
      saveHistory();
    } catch (e) { loader.remove(); addErrorBubble(e.message); }
    finally { isProcessing = false; }
  }

  /* ── OpenRouter: Vision ────────────────────────────────── */
  async function callMultimodal(prompt, b64) {
    if (!apiKey) { addErrorBubble('No API key configured. Open settings to add your OpenRouter key.'); return; }
    isProcessing = true;
    const loader = addLoader();
    try {
      // OpenAI vision format: content as array of parts
      const res = await fetchWithRetry(API_URL, {
        method: 'POST',
        headers: openRouterHeaders(),
        body: JSON.stringify({
          model: MODEL_VISION,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } }
            ]
          }],
          max_tokens: 4096,
          temperature: 0.4,
          stream: true
        })
      });

      const txt = await processStream(res, loader);
      convHistory.push({ role: 'assistant', content: txt });
      // Only call saveHistory() after the stream has completely finished
      saveHistory();
    } catch (e) { loader.remove(); addErrorBubble(e.message); }
    finally { isProcessing = false; }
  }

  /* ── Bubble Builders ───────────────────────────────────── */
  function mkBubble(type) { const d = document.createElement('div'); d.className = `chat-bubble ${type}`; return d; }

  function mkHeader(name, type) {
    const h = document.createElement('div'); h.className = 'bubble-header';
    h.innerHTML = `<span class="bubble-avatar">${type === 'user' ? ICO.user : ICO.ai}</span><span>${name}</span>`;
    return h;
  }

  function addUserBubble(text, src) {
    const b = mkBubble('user');
    const hdr = mkHeader('You', 'user');
    const c = document.createElement('div'); c.className = 'bubble-content'; c.textContent = text;
    b.append(hdr, c);
    if (src) {
      try { const badge = document.createElement('div'); badge.className = 'source-badge'; badge.textContent = new URL(src).hostname; b.appendChild(badge); } catch (e) { }
    }
    chatMessages.appendChild(b); scrollEnd();
  }

  // Preserved for history restoration
  function addAiBubble(md) {
    const b = mkBubble('ai');
    const hdr = mkHeader('AiSolutions', 'ai');
    const c = document.createElement('div'); c.className = 'bubble-content'; c.innerHTML = renderMd(md);
    const acts = document.createElement('div'); acts.className = 'bubble-actions';
    const cp = document.createElement('button'); cp.className = 'btn-copy';
    cp.innerHTML = `${ICO.copy} Copy`;
    cp.addEventListener('click', () => {
      navigator.clipboard.writeText(md).then(() => {
        cp.innerHTML = `${ICO.check} Copied`; cp.classList.add('copied');
        setTimeout(() => { cp.innerHTML = `${ICO.copy} Copy`; cp.classList.remove('copied'); }, 2000);
      });
    });
    acts.appendChild(cp);
    b.append(hdr, c, acts);
    chatMessages.appendChild(b); scrollEnd();
  }

  function addLoader() {
    const b = mkBubble('ai');
    const hdr = mkHeader('AiSolutions', 'ai');
    const c = document.createElement('div'); c.className = 'bubble-content';
    c.innerHTML = '<div class="loading-bar"><div class="bar"></div><span>Thinking</span></div>';
    b.append(hdr, c);
    chatMessages.appendChild(b); scrollEnd();
    return b;
  }

  function addErrorBubble(msg) {
    const b = mkBubble('ai');
    const hdr = mkHeader('AiSolutions', 'ai');
    const c = document.createElement('div'); c.className = 'error-content';
    c.innerHTML = `<strong>Error:</strong> ${esc(msg)}`;
    b.append(hdr, c);
    chatMessages.appendChild(b); scrollEnd();
  }

  /* ── Markdown ──────────────────────────────────────────── */
  function renderMd(t) {
    if (!t) return '';
    let h = esc(t);
    h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_, l, c) => `<pre><code class="lang-${l}">${c.trim()}</code></pre>`);
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
    h = h.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    h = h.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    h = h.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    h = h.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
    h = h.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    h = h.replace(/^---$/gm, '<hr>');
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    h = h.replace(/\n\n/g, '</p><p>');
    h = h.replace(/\n/g, '<br>');
    h = `<p>${h}</p>`;
    h = h.replace(/<p>\s*<\/p>/g, '');
    h = h.replace(/<p>(<(?:h[1-4]|pre|ul|blockquote)>)/g, '$1');
    h = h.replace(/(<\/(?:h[1-4]|pre|ul|blockquote)>)<\/p>/g, '$1');
    return h;
  }

  /* ── Utilities ─────────────────────────────────────────── */
  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function scrollEnd() { requestAnimationFrame(() => { chatContainer.scrollTop = chatContainer.scrollHeight; }); }
  function removeWelcome() { const w = chatMessages.querySelector('.welcome-card'); if (w) w.remove(); }

  function clearChat() {
    chatMessages.innerHTML = ''; convHistory = [];
    chrome.storage.local.remove(SK_HIST);
    chatMessages.innerHTML = '<div class="welcome-card"><div class="welcome-mark"><svg viewBox="0 0 24 24" fill="none" stroke="#09090b" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div><h2>Chat cleared</h2><p>Ready for new conversations</p></div>';
  }

  function blobToB64(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onloadend = () => res(r.result.split(',')[1]);
      r.onerror = rej; r.readAsDataURL(blob);
    });
  }

  /* ── History Persistence ───────────────────────────────── */
  function saveHistory() {
    const bubbles = chatMessages.querySelectorAll('.chat-bubble');
    const hist = [];
    bubbles.forEach(b => {
      const isU = b.classList.contains('user');
      const c = b.querySelector('.bubble-content'); if (!c) return;
      const img = c.querySelector('.screenshot-thumb');
      hist.push({ type: isU ? 'user' : 'ai', text: c.textContent || '', html: isU ? null : c.innerHTML, image: img ? img.src : null });
    });
    chrome.storage.local.set({ [SK_HIST]: hist.slice(-MAX_HIST) });
  }

  function restoreHistory(hist) {
    if (!hist?.length) return;
    removeWelcome();
    hist.forEach(e => {
      if (e.type === 'user') {
        if (e.image) {
          const b = mkBubble('user'); const hdr = mkHeader('You', 'user');
          const c = document.createElement('div'); c.className = 'bubble-content';
          const img = document.createElement('img'); img.src = e.image; img.className = 'screenshot-thumb';
          c.appendChild(img);
          if (e.text) { const l = document.createElement('div'); l.textContent = e.text; l.style.cssText = 'font-size:11px;color:var(--tx-3);'; c.appendChild(l); }
          b.append(hdr, c); chatMessages.appendChild(b);
        } else { addUserBubble(e.text); }
      } else if (e.html) {
        const b = mkBubble('ai'); const hdr = mkHeader('AiSolutions', 'ai');
        const c = document.createElement('div'); c.className = 'bubble-content'; c.innerHTML = e.html;
        const acts = document.createElement('div'); acts.className = 'bubble-actions';
        const cp = document.createElement('button'); cp.className = 'btn-copy';
        cp.innerHTML = `${ICO.copy} Copy`;
        cp.addEventListener('click', () => {
          navigator.clipboard.writeText(c.textContent).then(() => {
            cp.innerHTML = `${ICO.check} Copied`; cp.classList.add('copied');
            setTimeout(() => { cp.innerHTML = `${ICO.copy} Copy`; cp.classList.remove('copied'); }, 2000);
          });
        });
        acts.appendChild(cp);
        b.append(hdr, c, acts); chatMessages.appendChild(b);
      }
    });
    scrollEnd();
  }

  init();
})();
