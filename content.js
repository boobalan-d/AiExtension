/**
 * AiSolutions — Content Script (Inline Answer Mode)
 * Draggable popup · Pin · Follow-ups · Resize · Shadow DOM
 */
(() => {
  'use strict';
  if (window.__aisolutions_content_loaded) return;
  window.__aisolutions_content_loaded = true;

  // Self-destruct: if extension reloaded, clean up everything and stop
  function selfDestruct() {
    rmBtn(); rmPopup();
    window.__aisolutions_content_loaded = false;
  }

  const BID = 'aisolutions-explain-btn';
  const PID = 'aisolutions-inline-popup';
  let curBtn = null, curPopup = null, answering = false, pinned = false;

  // Guard: check if extension context is still valid before any chrome API call
  function isAlive() { try { return !!chrome.runtime?.id; } catch (e) { return false; } }

  // SVG icons
  const ICO = {
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17v5"/><path d="M9 3h6l-1 7h3l-5 7-1-7H8z"/></svg>',
    move: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>',
    simplify: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    translate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8l6 10"/><path d="M4 14h8"/><path d="M2 5h12"/><path d="M7 2v3"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    keyboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6.01" y2="8"/><line x1="10" y1="8" x2="10.01" y2="8"/><line x1="14" y1="8" x2="14.01" y2="8"/><line x1="18" y1="8" x2="18.01" y2="8"/><line x1="6" y1="12" x2="6.01" y2="12"/><line x1="10" y1="12" x2="10.01" y2="12"/><line x1="14" y1="12" x2="14.01" y2="12"/><line x1="18" y1="12" x2="18.01" y2="12"/><line x1="8" y1="16" x2="16" y2="16"/></svg>'
  };

  /* ── Shadow DOM Popup Styles ───────────────────────────── */
  const STYLES = `
    :host{all:initial;position:absolute;z-index:2147483647;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-size:13.5px;line-height:1.55;color:#eaeae8;pointer-events:auto}
    *{box-sizing:border-box;margin:0;padding:0}

    .popup{width:400px;min-width:260px;display:flex;flex-direction:column;background:linear-gradient(165deg,#0d0d10,#131318 50%,#111116);border:1px solid rgba(201,168,78,0.12);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.55),0 4px 16px rgba(0,0,0,0.35),0 0 1px rgba(201,168,78,0.2);overflow:hidden;animation:popIn .25s cubic-bezier(.16,1,.3,1) forwards;opacity:0;transform:scale(.93) translateY(6px);resize:both}
    .popup.closing{animation:popOut .15s ease-out forwards}

    /* Draggable header */
    .hdr{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(201,168,78,0.04);border-bottom:1px solid rgba(255,255,255,0.04);cursor:grab;user-select:none;-webkit-user-select:none}
    .hdr:active{cursor:grabbing}
    .hdr-left{display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:600;color:#c9a84e;letter-spacing:.4px;text-transform:uppercase}
    .hdr-left .mark{width:17px;height:17px;border-radius:4px;background:linear-gradient(135deg,#c9a84e,#a68a3a);display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .hdr-left .mark svg{width:9px;height:9px;stroke:#09090b}
    .hdr-left .grip{color:#3a3a35;font-size:9px;margin-left:2px;display:flex;align-items:center}
    .hdr-left .grip svg{width:11px;height:11px;stroke:#3a3a35}
    .acts{display:flex;gap:1px}
    .ib{width:25px;height:25px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;border-radius:5px;color:#5a5a55;cursor:pointer;transition:all .15s ease;font-size:11px}
    .ib:hover{background:rgba(201,168,78,0.08);color:#eaeae8}
    .ib.active{color:#c9a84e;background:rgba(201,168,78,0.1)}
    .ib svg{width:12px;height:12px}

    /* Body */
    .body{padding:12px 14px;max-height:350px;overflow-y:auto;overflow-x:hidden;font-size:13px;color:#d0d0cc;line-height:1.6;word-wrap:break-word;flex:1}
    .body::-webkit-scrollbar{width:3px}
    .body::-webkit-scrollbar-track{background:transparent}
    .body::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.06);border-radius:10px}

    .body p{margin-bottom:7px}.body p:last-child{margin-bottom:0}
    .body strong{color:#dfc06a;font-weight:600}
    .body em{color:#a3a3a0}
    .body code{background:rgba(201,168,78,0.08);padding:1px 5px;border-radius:3px;font-family:'SF Mono','Consolas',monospace;font-size:12px;color:#dfc06a}
    .body pre{background:#09090b;border:1px solid rgba(255,255,255,0.05);border-radius:6px;padding:10px 12px;overflow-x:auto;margin:8px 0}
    .body pre code{background:transparent;padding:0;font-size:12px;color:#a3a3a0}
    .body ul,.body ol{padding-left:18px;margin:6px 0}
    .body li{margin-bottom:3px}
    .body h1,.body h2,.body h3,.body h4{font-weight:700;color:#c9a84e;margin:10px 0 4px}
    .body h1{font-size:15px}.body h2{font-size:14.5px}.body h3{font-size:14px}
    .body blockquote{border-left:2px solid #a68a3a;padding-left:12px;margin:8px 0;color:#a3a3a0;font-style:italic}
    .body a{color:#c9a84e;text-decoration:none}.body a:hover{text-decoration:underline}
    .body table{width:100%;border-collapse:collapse;margin:8px 0;font-size:12px}
    .body th,.body td{padding:5px 8px;border:1px solid rgba(255,255,255,0.05);text-align:left}
    .body th{background:rgba(201,168,78,0.05);font-weight:600;color:#c9a84e}

    /* Quick actions bar */
    .qbar{display:flex;gap:4px;padding:8px 12px;border-top:1px solid rgba(255,255,255,0.04);flex-wrap:wrap}
    .qbtn{display:flex;align-items:center;gap:4px;padding:4px 10px;font-size:10.5px;font-weight:500;font-family:inherit;color:#6b6b68;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:6px;cursor:pointer;transition:all .15s ease;white-space:nowrap}
    .qbtn:hover{color:#c9a84e;border-color:rgba(201,168,78,0.2);background:rgba(201,168,78,0.05)}
    .qbtn.loading{opacity:.5;pointer-events:none}
    .qbtn svg{width:11px;height:11px}

    /* States */
    .loading{display:flex;align-items:center;gap:8px;padding:4px 0;color:#6b6b68;font-size:12.5px}
    .bar-wrap{width:56px;height:3px;background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden;position:relative}
    .bar-wrap::after{content:'';position:absolute;top:0;left:-40%;width:40%;height:100%;background:linear-gradient(90deg,transparent,#c9a84e,transparent);animation:slide 1.2s ease-in-out infinite}
    .load-status{font-size:10px;color:#5a5a55;margin-top:4px}
    .load-timer{font-size:10px;color:#3a3a35;font-family:'Consolas',monospace}
    .load-abort{margin-top:6px;padding:3px 10px;font-size:10px;font-family:inherit;color:#6b6b68;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:5px;cursor:pointer;transition:all .15s ease}
    .load-abort:hover{color:#e8a09e;border-color:rgba(232,160,158,0.2);background:rgba(232,160,158,0.05)}

    .err{color:#e8a09e;font-size:12px;padding:4px 0}.err b{color:#d4504c}
    .foot{padding:4px 12px 6px;font-size:9px;color:#2d2d28;text-align:right;border-top:1px solid rgba(255,255,255,0.02);letter-spacing:.2px}
    .toast{position:absolute;top:8px;right:50px;padding:3px 9px;background:rgba(76,173,106,0.9);color:#fff;font-size:10.5px;font-weight:600;border-radius:5px;animation:popIn .2s ease forwards;pointer-events:none}

    /* Math rendering */
    .math-block{display:block;text-align:center;padding:8px 4px;margin:6px 0;font-size:14px;color:#e8e0c8;font-family:'Cambria Math','Times New Roman',serif;letter-spacing:.3px;background:rgba(201,168,78,0.03);border-radius:6px;border:1px solid rgba(255,255,255,0.03);overflow-x:auto}
    .math-inline{font-family:'Cambria Math','Times New Roman',serif;color:#e8e0c8;font-size:13.5px;padding:0 2px}
    .frac{display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;margin:0 3px;position:relative;top:-1px}
    .frac-num{border-bottom:1px solid #9a9a95;padding:0 4px 1px;font-size:0.85em;line-height:1.2}
    .frac-den{padding:1px 4px 0;font-size:0.85em;line-height:1.2}
    .math-text{font-family:'Segoe UI',system-ui,sans-serif;font-style:normal}

    /* Chat input */
    .chat-bar{display:flex;gap:6px;padding:8px 12px;border-top:1px solid rgba(255,255,255,0.04);align-items:center}
    .chat-input{flex:1;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:6px 10px;color:#d0d0cc;font-size:11.5px;font-family:inherit;outline:none;transition:border-color .15s ease;resize:none;min-height:18px;max-height:60px}
    .chat-input:focus{border-color:rgba(201,168,78,0.25)}
    .chat-input::placeholder{color:#3a3a35}
    .chat-send{width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:rgba(201,168,78,0.08);border:1px solid rgba(201,168,78,0.15);border-radius:6px;color:#c9a84e;cursor:pointer;transition:all .15s ease;flex-shrink:0}
    .chat-send:hover{background:rgba(201,168,78,0.15)}
    .chat-send svg{width:12px;height:12px}

    /* Type-it mode */
    .type-overlay{padding:10px 14px;border-top:1px solid rgba(255,255,255,0.04)}
    .type-msg{font-size:11px;color:#c9a84e;margin-bottom:8px;display:flex;align-items:center;gap:6px}
    .type-msg svg{width:14px;height:14px;animation:pulse 1.5s ease infinite}
    .type-progress{font-size:10px;color:#6b6b68;margin-top:4px}
    .type-progress .bar{height:2px;background:#c9a84e;border-radius:1px;transition:width .15s ease}
    .speed-row{display:flex;align-items:center;gap:6px;margin-top:6px}
    .speed-label{font-size:9.5px;color:#5a5a55;text-transform:uppercase;letter-spacing:.4px}
    .speed-btn{padding:2px 8px;font-size:9.5px;font-family:inherit;color:#5a5a55;background:transparent;border:1px solid rgba(255,255,255,0.06);border-radius:4px;cursor:pointer;transition:all .15s ease}
    .speed-btn:hover,.speed-btn.active{color:#c9a84e;border-color:rgba(201,168,78,0.25);background:rgba(201,168,78,0.06)}
    .type-stop{margin-left:auto;padding:2px 8px;font-size:9.5px;font-family:inherit;color:#e8a09e;background:transparent;border:1px solid rgba(232,160,158,0.15);border-radius:4px;cursor:pointer}
    .type-stop:hover{background:rgba(232,160,158,0.06)}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

    /* Resize handle */
    .resize-h{position:absolute;bottom:0;right:0;width:16px;height:16px;cursor:nwse-resize;opacity:0.3}
    .resize-h:hover{opacity:0.6}
    .resize-h::after{content:'';position:absolute;bottom:4px;right:4px;width:6px;height:6px;border-right:2px solid #5a5a55;border-bottom:2px solid #5a5a55}

    @keyframes popIn{to{opacity:1;transform:scale(1) translateY(0)}}
    @keyframes popOut{to{opacity:0;transform:scale(.93) translateY(6px)}}
    @keyframes slide{to{left:100%}}
  `;

  /* ── Create Answer Button ──────────────────────────────── */
  function mkBtn(x, y, text) {
    rmBtn(); if (answering) return;
    const btn = document.createElement('button');
    btn.id = BID;
    btn.innerHTML = `<span class="ais-icon">${ICO.bolt}</span><span class="ais-label">Answer</span>`;
    const sx = scrollX, sy = scrollY;
    btn.style.left = (x + sx + 8) + 'px';
    btn.style.top = (y + sy - 40) + 'px'; // Position ABOVE the selection

    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!isAlive()) { selfDestruct(); return; }
      const r = btn.getBoundingClientRect(); rmBtn();
      showPopup(r.left + scrollX, r.top + scrollY - 10, text);
    });

    document.body.appendChild(btn); curBtn = btn;
    requestAnimationFrame(() => {
      const r = btn.getBoundingClientRect();
      if (r.right > innerWidth) btn.style.left = (x + sx - r.width - 8) + 'px';
      if (r.top < 0) btn.style.top = (y + sy + 12) + 'px'; // Flip below if no room above
    });
  }

  function rmBtn() {
    if (!curBtn) return;
    curBtn.classList.add('ais-fadeout');
    const ref = curBtn; setTimeout(() => ref.remove(), 120); curBtn = null;
  }

  /* ── Inline Popup (Shadow DOM) ─────────────────────────── */
  function showPopup(px, py, question) {
    if (!isAlive()) { selfDestruct(); return; }
    rmPopup(); answering = true; pinned = false;
    const host = document.createElement('div');
    host.id = PID;
    host.style.cssText = `position:absolute;top:${py}px;left:${px}px;z-index:2147483647;pointer-events:auto;`;

    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style'); style.textContent = STYLES;
    shadow.appendChild(style);

    const popup = document.createElement('div'); popup.className = 'popup';

    // ── Header (draggable) ──
    const hdr = document.createElement('div'); hdr.className = 'hdr';
    hdr.innerHTML = `
      <div class="hdr-left">
        <span class="mark">${ICO.bolt}</span>
        <span>AI Answer</span>
        <span class="grip">${ICO.move}</span>
      </div>
      <div class="acts">
        <button class="ib" id="pin" title="Pin (keep open)">${ICO.pin}</button>
        <button class="ib" id="cp" title="Copy answer">${ICO.copy}</button>
        <button class="ib" id="cl" title="Close (Esc)">&#10005;</button>
      </div>`;
    popup.appendChild(hdr);

    // ── Body ──
    const body = document.createElement('div'); body.className = 'body';
    body.innerHTML = '<div class="loading"><div class="bar-wrap"></div><span>Thinking</span></div>';
    popup.appendChild(body);

    // ── Quick Actions Bar ──
    const qbar = document.createElement('div'); qbar.className = 'qbar';
    qbar.style.display = 'none';
    const actions = [
      { id: 'typeit', icon: ICO.keyboard, label: 'Type it' },
      { id: 'simplify', icon: ICO.simplify, label: 'Simplify', prompt: `Rewrite the following answer in much simpler terms, as if explaining to a beginner. Keep it very short.\n\nOriginal answer:` },
      { id: 'expand', icon: ICO.expand, label: 'Expand', prompt: `Expand and elaborate on the following answer with more details, examples, and depth.\n\nOriginal answer:` },
      { id: 'translate', icon: ICO.translate, label: 'Translate', prompt: `Translate the following answer into simple, clear Hindi (Devanagari script). Keep formatting.\n\nOriginal answer:` },
      { id: 'search', icon: ICO.search, label: 'Google it', prompt: null }
    ];
    actions.forEach(a => {
      const btn = document.createElement('button'); btn.className = 'qbtn'; btn.id = `q-${a.id}`;
      btn.innerHTML = `${a.icon} ${a.label}`;
      qbar.appendChild(btn);
    });
    popup.appendChild(qbar);

    // ── Chat Follow-up Bar ──
    const chatBar = document.createElement('div'); chatBar.className = 'chat-bar';
    chatBar.style.display = 'none';
    const chatInput = document.createElement('input'); chatInput.className = 'chat-input';
    chatInput.type = 'text'; chatInput.placeholder = 'Ask a follow-up...';
    chatInput.setAttribute('autocomplete', 'off');
    const chatSend = document.createElement('button'); chatSend.className = 'chat-send';
    chatSend.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
    chatBar.appendChild(chatInput); chatBar.appendChild(chatSend);
    popup.appendChild(chatBar);

    // ── Footer ──
    const foot = document.createElement('div'); foot.className = 'foot';
    foot.textContent = 'OpenRouter \u00B7 Drag to move';
    popup.appendChild(foot);

    // ── Resize handle ──
    const resizeH = document.createElement('div'); resizeH.className = 'resize-h';
    popup.appendChild(resizeH);

    shadow.appendChild(popup);
    document.body.appendChild(host);
    curPopup = host;

    let rawText = '', origQuestion = question;

    // ── Drag Logic ──
    let isDragging = false, dragOffX = 0, dragOffY = 0;
    hdr.addEventListener('mousedown', (e) => {
      if (e.target.closest('.ib')) return; // Don't drag when clicking buttons
      isDragging = true;
      dragOffX = e.clientX - host.getBoundingClientRect().left;
      dragOffY = e.clientY - host.getBoundingClientRect().top;
      e.preventDefault();
    });

    const onDragMove = (e) => {
      if (!isDragging) return;
      host.style.left = (e.clientX - dragOffX + scrollX) + 'px';
      host.style.top = (e.clientY - dragOffY + scrollY) + 'px';
    };
    const onDragEnd = () => { isDragging = false; };
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);

    // Store cleanup for drag listeners
    host._cleanupDrag = () => {
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragEnd);
    };

    // ── Resize Logic ──
    let isResizing = false, resizeStartW = 0, resizeStartH = 0, resizeStartX = 0, resizeStartY = 0;
    resizeH.addEventListener('mousedown', (e) => {
      isResizing = true;
      resizeStartW = popup.offsetWidth;
      resizeStartH = popup.offsetHeight;
      resizeStartX = e.clientX;
      resizeStartY = e.clientY;
      e.preventDefault(); e.stopPropagation();
    });
    const onResizeMove = (e) => {
      if (!isResizing) return;
      const nw = Math.max(260, resizeStartW + (e.clientX - resizeStartX));
      const nh = Math.max(200, resizeStartH + (e.clientY - resizeStartY));
      popup.style.width = nw + 'px';
      body.style.maxHeight = (nh - 120) + 'px'; // Adjust body scroll area
    };
    const onResizeEnd = () => { isResizing = false; };
    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onResizeEnd);
    host._cleanupResize = () => {
      document.removeEventListener('mousemove', onResizeMove);
      document.removeEventListener('mouseup', onResizeEnd);
    };

    // ── Button Handlers ──
    shadow.getElementById('cl').addEventListener('click', rmPopup);

    // Pin toggle
    shadow.getElementById('pin').addEventListener('click', () => {
      pinned = !pinned;
      const pinBtn = shadow.getElementById('pin');
      pinBtn.classList.toggle('active', pinned);
      pinBtn.title = pinned ? 'Unpin' : 'Pin (keep open)';
    });

    // Copy
    shadow.getElementById('cp').addEventListener('click', () => {
      if (!rawText) return;
      navigator.clipboard.writeText(rawText).then(() => {
        const t = document.createElement('div'); t.className = 'toast'; t.textContent = 'Copied';
        popup.appendChild(t); setTimeout(() => t.remove(), 1400);
      });
    });

    // Quick action handlers (attached after answer loads)
    let typingSpeed = 35;
    let typingAbort = null;

    function attachQuickActions() {
      qbar.style.display = 'flex';
      chatBar.style.display = 'flex';

      // Type it
      shadow.getElementById('q-typeit')?.addEventListener('click', () => startTypeMode());
      // Simplify
      shadow.getElementById('q-simplify')?.addEventListener('click', () => followUp('simplify', actions[1].prompt + ` "${rawText}"`));
      // Expand
      shadow.getElementById('q-expand')?.addEventListener('click', () => followUp('expand', actions[2].prompt + ` "${rawText}"`));
      // Translate
      shadow.getElementById('q-translate')?.addEventListener('click', () => followUp('translate', actions[3].prompt + ` "${rawText}"`));
      // Google it
      shadow.getElementById('q-search')?.addEventListener('click', () => {
        window.open(`https://www.google.com/search?q=${encodeURIComponent(origQuestion)}`, '_blank');
      });

      // Chat follow-up
      function sendFollowUp() {
        const q = chatInput.value.trim();
        if (!q || answering) return;
        chatInput.value = '';
        const contextPrompt = `Context from previous answer:\n"${rawText}"\n\nUser's follow-up question: ${q}\n\nAnswer concisely using markdown.`;
        answering = true;
        qbar.querySelectorAll('.qbtn').forEach(b => b.classList.add('loading'));
        body.innerHTML = '<div class="loading"><div class="bar-wrap"></div><span>Thinking</span></div>';
        streamAnswer(contextPrompt, body, () => {
          qbar.querySelectorAll('.qbtn').forEach(b => b.classList.remove('loading'));
          answering = false;
        });
      }
      chatSend.addEventListener('click', sendFollowUp);
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFollowUp(); }
      });
    }

    // ── Type-it Mode ──
    let typeClickCleanup = null; // store cleanup so we can cancel

    function startTypeMode() {
      if (!rawText) return;
      // Cancel any previous type-mode listener
      if (typeClickCleanup) { typeClickCleanup(); typeClickCleanup = null; }

      pinned = true;
      const pinBtn = shadow.getElementById('pin');
      if (pinBtn) { pinBtn.classList.add('active'); pinBtn.title = 'Unpin'; }

      // Show overlay in popup
      let typePanel = shadow.querySelector('.type-overlay');
      if (typePanel) typePanel.remove();
      typePanel = document.createElement('div'); typePanel.className = 'type-overlay';
      typePanel.innerHTML = `
        <div class="type-msg">${ICO.keyboard} Click any text field to start typing</div>
        <div class="speed-row">
          <span class="speed-label">Speed</span>
          <button class="speed-btn" data-speed="80">Slow</button>
          <button class="speed-btn active" data-speed="35">Medium</button>
          <button class="speed-btn" data-speed="10">Fast</button>
          <button class="speed-btn" data-speed="0">Instant</button>
          <button class="type-stop">Cancel</button>
        </div>`;
      popup.insertBefore(typePanel, popup.querySelector('.foot'));

      // Speed buttons
      typePanel.querySelectorAll('.speed-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          typePanel.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          typingSpeed = parseInt(btn.dataset.speed);
        });
      });

      // Add a page-wide cursor hint
      document.body.style.cursor = 'crosshair';

      // Helper: find the actual editable element from a click target
      function findEditable(el) {
        if (!el) return null;
        // Direct match
        if (el.tagName === 'TEXTAREA') return el;
        if (el.tagName === 'INPUT' && isTextInput(el)) return el;
        if (el.isContentEditable) return el;
        // Look inside the clicked element for an input/textarea (common with wrapper divs)
        const inner = el.querySelector('input, textarea, [contenteditable="true"]');
        if (inner) {
          if (inner.tagName === 'TEXTAREA') return inner;
          if (inner.tagName === 'INPUT' && isTextInput(inner)) return inner;
          if (inner.isContentEditable) return inner;
        }
        // Walk up to check parent (some inputs are clicked on their label)
        let parent = el.parentElement;
        for (let i = 0; i < 3 && parent; i++) {
          const found = parent.querySelector('input, textarea, [contenteditable="true"]');
          if (found) {
            if (found.tagName === 'TEXTAREA') return found;
            if (found.tagName === 'INPUT' && isTextInput(found)) return found;
            if (found.isContentEditable) return found;
          }
          parent = parent.parentElement;
        }
        return null;
      }

      function isTextInput(el) {
        const t = (el.type || 'text').toLowerCase();
        return ['text','search','email','url','tel','number','password',''].includes(t);
      }

      // Use mousedown to capture the target element
      const onMouseDown = (e) => {
        // Ignore clicks on our popup
        if (e.target.closest && e.target.closest(`#${PID}`)) return;
        if (e.target.id === PID) return;

        const target = findEditable(e.target);
        if (!target) return; // Not a text field, keep listening

        e.stopImmediatePropagation();
        cleanup();

        // Let the browser fully activate the field before typing
        requestAnimationFrame(() => {
          target.focus();
          // Place cursor at the end
          if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            target.selectionStart = target.selectionEnd = target.value.length;
          } else if (target.isContentEditable) {
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(target);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }

          // Update panel to show progress
          typePanel.innerHTML = `
            <div class="type-msg">${ICO.keyboard} Typing into field...</div>
            <div class="type-progress"><div class="bar" style="width:0%;background:#c9a84e;height:3px;border-radius:2px;transition:width 0.1s ease"></div></div>
            <div class="speed-row"><button class="type-stop">Stop</button></div>`;
          const progressBar = typePanel.querySelector('.bar');
          const stopBtn = typePanel.querySelector('.type-stop');

          typingAbort = new AbortController();
          stopBtn.addEventListener('click', () => typingAbort.abort());

          typeIntoField(target, stripMd(rawText), typingSpeed, progressBar, typingAbort.signal).then((ok) => {
            typePanel.innerHTML = `<div class="type-msg" style="color:${ok ? '#4cad6a' : '#e8a09e'};animation:none">${ok ? '✓ Typed successfully!' : 'Stopped.'}</div>`;
            setTimeout(() => { if (typePanel.parentNode) typePanel.remove(); }, 2500);
          });
        });
      };

      function cleanup() {
        document.removeEventListener('mousedown', onMouseDown, true);
        document.body.style.cursor = '';
        typeClickCleanup = null;
      }

      // Cancel button
      typePanel.querySelector('.type-stop')?.addEventListener('click', () => {
        cleanup();
        typePanel.innerHTML = `<div class="type-msg" style="color:#e8a09e;animation:none">Cancelled.</div>`;
        setTimeout(() => { if (typePanel.parentNode) typePanel.remove(); }, 1500);
      });

      document.addEventListener('mousedown', onMouseDown, true);
      typeClickCleanup = cleanup;
    }

    // Follow-up: stream API again with modified prompt
    function followUp(id, prompt) {
      const btn = shadow.getElementById(`q-${id}`);
      if (!btn || answering) return;
      if (!isAlive()) { selfDestruct(); return; }
      qbar.querySelectorAll('.qbtn').forEach(b => b.classList.add('loading'));
      answering = true;
      body.innerHTML = '<div class="loading"><div class="bar-wrap"></div><span>Thinking</span></div>';
      streamAnswer(prompt, body, () => {
        qbar.querySelectorAll('.qbtn').forEach(b => b.classList.remove('loading'));
        answering = false;
      });
    }

    // ── Viewport fix ──
    requestAnimationFrame(() => {
      const r = host.getBoundingClientRect();
      if (r.right > innerWidth - 10) host.style.left = Math.max(10, innerWidth - r.width - 20 + scrollX) + 'px';
      if (r.bottom > innerHeight - 10) host.style.top = (py - r.height - 12) + 'px';
    });

    // ── Stream API via port ──
    streamAnswer(question, body, () => {
      answering = false;
      attachQuickActions();
      requestAnimationFrame(() => {
        const r = host.getBoundingClientRect();
        if (r.right > innerWidth - 10) host.style.left = Math.max(10, innerWidth - r.width - 20 + scrollX) + 'px';
        if (r.bottom > innerHeight - 10) host.style.top = (py - r.height - 12) + 'px';
      });
    });

    // Streaming helper with elapsed timer and abort support
    function streamAnswer(text, targetBody, onDone) {
      if (!isAlive()) {
        targetBody.innerHTML = '<div class="err">Extension was reloaded. Please refresh this page.</div>';
        onDone?.(); return;
      }
      let port, accumulated = '', finished = false, aborted = false;
      const finish = () => { if (finished) return; finished = true; clearInterval(tick); onDone?.(); };

      // Show loading UI with timer and abort button
      const startTime = Date.now();
      targetBody.innerHTML = '<div class="loading"><div class="bar-wrap"></div><span>Connecting</span></div><div class="load-status"></div><div class="load-timer">0s</div><button class="load-abort">Cancel</button>';
      const statusEl = targetBody.querySelector('.load-status');
      const timerEl = targetBody.querySelector('.load-timer');
      const abortBtn = targetBody.querySelector('.load-abort');
      const tick = setInterval(() => {
        if (timerEl) timerEl.textContent = Math.round((Date.now() - startTime) / 1000) + 's';
      }, 1000);

      try {
        port = chrome.runtime.connect({ name: 'inline-stream' });
      } catch (e) {
        clearInterval(tick);
        targetBody.innerHTML = '<div class="err">Extension was reloaded. Please refresh this page.</div>';
        finish(); return;
      }

      // Abort button handler
      abortBtn?.addEventListener('click', () => {
        aborted = true;
        try { port.disconnect(); } catch (e) {}
        targetBody.innerHTML = '<div class="err">Cancelled. Select text again to retry.</div>';
        finish();
      });

      port.postMessage({ type: 'INLINE_ANSWER_STREAM', text });
      port.onMessage.addListener((msg) => {
        if (aborted) return;
        if (msg.type === 'status' && statusEl) {
          statusEl.textContent = msg.text;
        } else if (msg.type === 'chunk') {
          accumulated += msg.content;
          rawText = accumulated;
          targetBody.innerHTML = renderMd(accumulated);
        } else if (msg.type === 'done') {
          try { port.disconnect(); } catch (e) {}
          if (!accumulated) targetBody.innerHTML = '<div class="err">No response received.</div>';
          finish();
        } else if (msg.type === 'error') {
          try { port.disconnect(); } catch (e) {}
          targetBody.innerHTML = `<div class="err"><b>Error:</b> ${esc(msg.error)}</div>`;
          finish();
        }
      });
      port.onDisconnect.addListener(() => finish());
    }
  }

  function rmPopup() {
    if (!curPopup) { answering = false; return; }
    // Cleanup drag/resize listeners
    curPopup._cleanupDrag?.();
    curPopup._cleanupResize?.();
    try {
      const s = curPopup.shadowRoot;
      if (s) {
        const p = s.querySelector('.popup');
        if (p) { p.classList.add('closing'); setTimeout(() => { curPopup?.remove(); curPopup = null; }, 150); answering = false; pinned = false; return; }
      }
    } catch (e) {}
    curPopup.remove(); curPopup = null; answering = false; pinned = false;
  }

  /* ── Markdown + LaTeX ────────────────────────────────────── */
  function renderMd(t) {
    if (!t) return '';

    // Extract math blocks BEFORE escaping (they contain special chars)
    const mathStore = [];
    // Block math: $$...$$
    t = t.replace(/\$\$([\s\S]*?)\$\$/g, (_, expr) => {
      mathStore.push({ block: true, expr: expr.trim() });
      return `%%M${mathStore.length - 1}%%`;
    });
    // Inline math: $...$  (but not $$)
    t = t.replace(/\$([^\$\n]+?)\$/g, (_, expr) => {
      mathStore.push({ block: false, expr: expr.trim() });
      return `%%M${mathStore.length - 1}%%`;
    });

    let h = esc(t);
    // Code
    h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_, l, c) => `<pre><code>${c.trim()}</code></pre>`);
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold / Italic
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
    // Headings
    h = h.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // Blockquote
    h = h.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    // Lists
    h = h.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    h = h.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
    h = h.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    // HR, links
    h = h.replace(/^---$/gm, '<hr>');
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    // Paragraphs
    h = h.replace(/\n\n/g, '</p><p>');
    h = h.replace(/\n/g, '<br>');
    h = `<p>${h}</p>`;
    h = h.replace(/<p>\s*<\/p>/g, '');
    h = h.replace(/<p>(<(?:h[1-4]|pre|ul|blockquote)>)/g, '$1');
    h = h.replace(/(<\/(?:h[1-4]|pre|ul|blockquote)>)<\/p>/g, '$1');

    // Restore math blocks with rendered HTML
    h = h.replace(/%%M(\d+)%%/g, (_, i) => {
      const m = mathStore[parseInt(i)];
      const rendered = renderLatex(m.expr);
      return m.block
        ? `<div class="math-block">${rendered}</div>`
        : `<span class="math-inline">${rendered}</span>`;
    });

    return h;
  }

  function renderLatex(expr) {
    let h = expr;
    // \text{...} → normal text (process first before escaping)
    h = h.replace(/\\text\{([^}]*)\}/g, '%%TEXT:$1%%');
    h = esc(h);
    h = h.replace(/%%TEXT:([^%]*)%%/g, '<span class="math-text">$1</span>');
    // Fractions: \frac{a}{b}
    h = h.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '<span class="frac"><span class="frac-num">$1</span><span class="frac-den">$2</span></span>');
    // Superscript: ^{...} or ^x
    h = h.replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>');
    h = h.replace(/\^(\w)/g, '<sup>$1</sup>');
    // Subscript: _{...} or _x
    h = h.replace(/_\{([^}]+)\}/g, '<sub>$1</sub>');
    h = h.replace(/_(\w)/g, '<sub>$1</sub>');
    // Square root
    h = h.replace(/\\sqrt\{([^}]+)\}/g, '√<span style="text-decoration:overline;text-decoration-color:#7a7a75">$1</span>');
    // Greek letters
    h = h.replace(/\\pi/g, 'π').replace(/\\alpha/g, 'α').replace(/\\beta/g, 'β');
    h = h.replace(/\\theta/g, 'θ').replace(/\\lambda/g, 'λ').replace(/\\mu/g, 'μ');
    h = h.replace(/\\sigma/g, 'σ').replace(/\\delta/g, 'δ').replace(/\\gamma/g, 'γ');
    h = h.replace(/\\Delta/g, 'Δ').replace(/\\Sigma/g, 'Σ').replace(/\\Omega/g, 'Ω');
    h = h.replace(/\\phi/g, 'φ').replace(/\\psi/g, 'ψ').replace(/\\omega/g, 'ω');
    // Operators
    h = h.replace(/\\times/g, '×').replace(/\\div/g, '÷').replace(/\\pm/g, '±');
    h = h.replace(/\\cdot/g, '·').replace(/\\ldots/g, '…').replace(/\\cdots/g, '⋯');
    h = h.replace(/\\le/g, '≤').replace(/\\ge/g, '≥').replace(/\\ne/g, '≠');
    h = h.replace(/\\approx/g, '≈').replace(/\\infty/g, '∞').replace(/\\equiv/g, '≡');
    h = h.replace(/\\rightarrow/g, '→').replace(/\\leftarrow/g, '←').replace(/\\Rightarrow/g, '⇒');
    h = h.replace(/\\sum/g, '∑').replace(/\\prod/g, '∏').replace(/\\int/g, '∫');
    h = h.replace(/\\forall/g, '∀').replace(/\\exists/g, '∃').replace(/\\in/g, '∈');
    h = h.replace(/\\cup/g, '∪').replace(/\\cap/g, '∩').replace(/\\subset/g, '⊂');
    // Cleanup
    h = h.replace(/\\left/g, '').replace(/\\right/g, '');
    h = h.replace(/\\\\/g, '').replace(/\\,/g, ' ').replace(/\\;/g, ' ').replace(/\\quad/g, '  ');
    h = h.replace(/\\ /g, ' ');
    return h;
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  /* ── Strip Markdown to clean plaintext (for Type-it) ──── */
  function stripMd(t) {
    if (!t) return '';
    let s = t;
    // Extract code blocks → preserve content with indentation
    s = s.replace(/```\w*\n([\s\S]*?)```/g, (_, code) => code.trimEnd());
    // Remove inline code backticks but keep content
    s = s.replace(/`([^`]+)`/g, '$1');
    // Remove LaTeX block/inline markers, convert common symbols
    s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_, expr) => latexToText(expr));
    s = s.replace(/\$([^\$\n]+?)\$/g, (_, expr) => latexToText(expr));
    // Remove heading markers
    s = s.replace(/^#{1,4}\s+/gm, '');
    // Remove bold/italic markers
    s = s.replace(/\*\*(.+?)\*\*/g, '$1');
    s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');
    // Remove blockquote markers
    s = s.replace(/^>\s?/gm, '');
    // Remove list markers but keep content and indentation
    s = s.replace(/^[\-\*]\s+/gm, '• ');
    s = s.replace(/^(\d+)\.\s+/gm, '$1. ');
    // Remove link markdown, keep text
    s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    // Remove horizontal rules
    s = s.replace(/^---$/gm, '');
    // Normalize multiple blank lines to single
    s = s.replace(/\n{3,}/g, '\n\n');
    return s.trim();
  }

  function latexToText(expr) {
    let s = expr.trim();
    s = s.replace(/\\text\{([^}]*)\}/g, '$1');
    s = s.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1/$2)');
    s = s.replace(/\^\{([^}]+)\}/g, '^$1').replace(/\^(\w)/g, '^$1');
    s = s.replace(/_\{([^}]+)\}/g, '_$1').replace(/_(\w)/g, '_$1');
    s = s.replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)');
    s = s.replace(/\\pi/g, 'π').replace(/\\times/g, '×').replace(/\\div/g, '÷');
    s = s.replace(/\\cdot/g, '·').replace(/\\pm/g, '±').replace(/\\infty/g, '∞');
    s = s.replace(/\\le/g, '≤').replace(/\\ge/g, '≥').replace(/\\ne/g, '≠');
    s = s.replace(/\\approx/g, '≈').replace(/\\equiv/g, '≡');
    s = s.replace(/\\alpha/g, 'α').replace(/\\beta/g, 'β').replace(/\\theta/g, 'θ');
    s = s.replace(/\\lambda/g, 'λ').replace(/\\sigma/g, 'σ').replace(/\\delta/g, 'δ');
    s = s.replace(/\\left|\\right/g, '').replace(/\\\\/g, '');
    s = s.replace(/\\,|\\;|\\quad/g, ' ').replace(/\\ /g, ' ');
    return s;
  }

  /* ── Human Typing Engine ────────────────────────────────── */
  async function typeIntoField(el, text, speed, progressBar, signal) {
    const total = text.length;

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) return false;

      const char = text[i];
      el.focus();

      // Primary: execCommand works on BOTH input/textarea AND contentEditable
      let inserted = false;
      try { inserted = document.execCommand('insertText', false, char); } catch (e) {}

      if (!inserted) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const nativeSet = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          const pos = el.selectionStart ?? el.value.length;
          const before = el.value.slice(0, pos);
          const after = el.value.slice(el.selectionEnd ?? pos);
          if (nativeSet) nativeSet.call(el, before + char + after);
          else el.value = before + char + after;
          el.selectionStart = el.selectionEnd = pos + 1;
          el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: char, bubbles: true }));
        } else {
          el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: char, bubbles: true, cancelable: true }));
          const sel = window.getSelection();
          if (sel.rangeCount) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(char));
            range.collapse(false);
          }
          el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: char, bubbles: true }));
        }
      }

      if (progressBar) {
        progressBar.style.width = Math.round(((i + 1) / total) * 100) + '%';
      }

      if (speed > 0) {
        const jitter = speed * 0.4 * (Math.random() - 0.5);
        await new Promise(r => setTimeout(r, speed + jitter));
      } else if (i % 50 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }
    return true;
  }

  /* ── Events ────────────────────────────────────────────── */
  document.addEventListener('mouseup', (e) => {
    if (!isAlive()) { selfDestruct(); return; }
    if (e.target.closest(`#${BID}`) || e.target.closest(`#${PID}`)) return;
    setTimeout(() => {
      const sel = getSelection(); const txt = sel?.toString().trim();
      if (txt?.length > 2 && !answering) {
        const r = sel.getRangeAt(0).getBoundingClientRect();
        mkBtn(r.left, r.top, txt); // Position above selection
      } else if (!answering) rmBtn();
    }, 10);
  });

  document.addEventListener('mousedown', (e) => {
    if (e.target.closest(`#${BID}`) || e.target.closest(`#${PID}`)) return;
    rmBtn();
    if (curPopup && !pinned) rmPopup();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { rmBtn(); rmPopup(); }
  });

  document.addEventListener('aisolutions-answer', (e) => {
    if (!isAlive()) { selfDestruct(); return; }
    if (!e.detail || answering) return;
    showPopup(scrollX + innerWidth / 2 - 200, scrollY + 80, e.detail);
  });
})();
