/**
 * AiSolutions — Background Service Worker
 * OpenRouter API · Model cascade with timeout · SSE streaming · Context menus
 */

/* ── Constants ───────────────────────────────────────────── */
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REFERER = 'https://github.com/ai-sidekick';

// Model cascade: try fast models first, fallback if they queue too long
const INLINE_MODELS = [
  'google/gemma-4-26b-a4b-it:free',     // Compact Gemma 4, fast
  'qwen/qwen3-coder:free',              // Reliable coder model
  'openrouter/auto'                       // Let OpenRouter pick
];
const INLINE_TIMEOUT_MS = 12000; // 12 seconds per model attempt

/* ── Side Panel ──────────────────────────────────────────── */
chrome.action.onClicked.addListener(async (tab) => {
  try { await chrome.sidePanel.open({ tabId: tab.id }); } catch (e) {}
});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

/* ── Exponential Backoff Fetch (returns raw Response) ────── */
async function fetchWithRetry(url, options, maxRetries = 4) {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, options);

    if (res.status === 429 || res.status === 503) {
      if (i === maxRetries - 1) throw new Error('Server overloaded. Please try again in a minute.');
      const wait = Math.pow(2, i) * 1000 + Math.random() * 500;
      console.log(`[AiSolutions] Retry ${i + 1}/${maxRetries} in ${Math.round(wait)}ms`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    if (!res.ok) {
      let errStr = `API Error ${res.status}`;
      try { const d = await res.json(); if (d?.error?.message) errStr = d.error.message; } catch (e) {}
      throw new Error(errStr);
    }
    return res;
  }
}

/* ── Context Menus ───────────────────────────────────────── */
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'explain-selection', title: 'Answer with AI', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'summarize-page', title: 'Summarize This Page', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'explain-image', title: 'Explain This Image', contexts: ['image'] });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case 'explain-selection':
      if (info.selectionText) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (text) => {
              if (window.__aisolutions_content_loaded)
                document.dispatchEvent(new CustomEvent('aisolutions-answer', { detail: text }));
            },
            args: [info.selectionText]
          });
        } catch (e) {}
      }
      break;
    case 'summarize-page':
      await handlePageSummarize(tab);
      break;
    case 'explain-image':
      if (info.srcUrl) {
        await chrome.sidePanel.open({ tabId: tab.id });
        setTimeout(() => chrome.runtime.sendMessage({ type: 'IMAGE_URL', url: info.srcUrl, source: tab.url }), 500);
      }
      break;
  }
});

/* ── Shortcuts ───────────────────────────────────────────── */
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'toggle-area-select') {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['area_selector.js'] });
    } catch (e) {}
  }
  if (command === 'summarize-page') await handlePageSummarize(tab);
});

/* ── Page Summarize ──────────────────────────────────────── */
async function handlePageSummarize(tab) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const sels = ['article', 'main', '[role="main"]', '.content', '#content', 'body'];
        let content = '';
        for (const s of sels) { const el = document.querySelector(s); if (el?.innerText.trim().length > 100) { content = el.innerText.trim(); break; } }
        return { title: document.title, url: location.href, content: content.slice(0, 8000) };
      }
    });
    if (results?.[0]?.result) {
      await chrome.sidePanel.open({ tabId: tab.id });
      setTimeout(() => chrome.runtime.sendMessage({ type: 'PAGE_SUMMARIZE', data: results[0].result }), 500);
    }
  } catch (e) {}
}

/* ── Message Relay ───────────────────────────────────────── */
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg.type === 'TEXT_SELECTION' && sender.tab) {
    chrome.sidePanel.open({ tabId: sender.tab.id }).then(() =>
      setTimeout(() => chrome.runtime.sendMessage(msg), 300)
    );
    respond({ status: 'ok' });
  }
  if (msg.type === 'CAPTURE_TAB') {
    chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 100 })
      .then(dataUrl => respond({ dataUrl }))
      .catch(err => respond({ error: err.message }));
    return true;
  }
  if (msg.type === 'SCREENSHOT_CAPTURED' && sender.tab) {
    chrome.sidePanel.open({ tabId: sender.tab.id }).then(() =>
      setTimeout(() => chrome.runtime.sendMessage(msg), 300)
    );
    respond({ status: 'ok' });
  }
  return false;
});

/* ── Streaming with Model Cascade ────────────────────────── */
async function tryStreamModel(model, key, text, port) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INLINE_TIMEOUT_MS);

  try {
    port.postMessage({ type: 'status', text: `Connecting to ${model.split('/')[1]?.split(':')[0] || model}...` });

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'HTTP-Referer': REFERER },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: `You are a precise answer engine. If the selection is a question, answer it directly. If it's a concept, explain briefly. If it's a problem (math, code, etc.), solve step by step. Be concise. Use markdown.\n\nSelected text: "${text}"` }],
        max_tokens: 768,
        temperature: 0.3,
        stream: true
      })
    });

    clearTimeout(timer);

    if (res.status === 429 || res.status === 503) throw new Error('RATE_LIMITED');
    if (!res.ok) {
      let errStr = `API Error ${res.status}`;
      try { const d = await res.json(); if (d?.error?.message) errStr = d.error.message; } catch (e) {}
      throw new Error(errStr);
    }

    // Stream succeeded — read chunks
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '', gotContent = false;

    // Secondary timeout: if we got a 200 but no content arrives in 10s, abort
    let contentTimer = setTimeout(() => {
      if (!gotContent) { reader.cancel(); }
    }, 10000);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop();

      for (const part of parts) {
        const line = part.trim();
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const parsed = JSON.parse(line.slice(6));
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              if (!gotContent) { gotContent = true; clearTimeout(contentTimer); }
              port.postMessage({ type: 'chunk', content });
            }
          } catch (e) {}
        }
      }
    }

    return gotContent; // true = success

  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      console.log(`[AiSolutions] ${model} timed out after ${INLINE_TIMEOUT_MS}ms, trying next...`);
      return false; // Signal to try next model
    }
    if (e.message === 'RATE_LIMITED') return false;
    throw e; // Real error, don't retry
  }
}

/* ── Port-based Streaming with Cascade ───────────────────── */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'inline-stream') return;

  port.onMessage.addListener(async (msg) => {
    if (msg.type !== 'INLINE_ANSWER_STREAM') return;

    const stored = await chrome.storage.local.get('aisolutions_api_key');
    const key = stored['aisolutions_api_key'];
    if (!key) {
      port.postMessage({ type: 'error', error: 'No API key set. Click the extension icon to open settings.' });
      return;
    }

    try {
      let success = false;

      for (let i = 0; i < INLINE_MODELS.length; i++) {
        const model = INLINE_MODELS[i];
        try {
          success = await tryStreamModel(model, key, msg.text, port);
          if (success) break;
          // Model timed out or rate-limited, try next
          if (i < INLINE_MODELS.length - 1) {
            port.postMessage({ type: 'status', text: 'Switching to faster model...' });
          }
        } catch (e) {
          // Real API error (not timeout), report it
          port.postMessage({ type: 'error', error: e.message });
          return;
        }
      }

      if (success) {
        port.postMessage({ type: 'done' });
      } else {
        port.postMessage({ type: 'error', error: 'All models are busy. Please try again in a moment.' });
      }

    } catch (e) {
      port.postMessage({ type: 'error', error: e.message || 'Unknown error' });
    }
  });
});

console.log('[AiSolutions] Service worker ready (Model Cascade + Streaming).');
