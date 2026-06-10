/**
 * AiSolutions — Area Selector (Dynamic Injection)
 * Injected on Ctrl+Shift+S · Obsidian + Gold palette
 */
(() => {
  'use strict';
  const OID = 'aisolutions-area-overlay';
  if (document.getElementById(OID)) {
    document.getElementById(OID)?.remove();
    document.getElementById('ais-badge')?.remove();
    document.getElementById('ais-astyle')?.remove();
    document.documentElement.style.overflow = '';
    return;
  }

  let sx = 0, sy = 0, drawing = false;
  const savedOF = document.documentElement.style.overflow;

  const stEl = document.createElement('style');
  stEl.id = 'ais-astyle';
  stEl.textContent = `
    @keyframes ais-bi{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
    @keyframes ais-fl{0%{background:rgba(255,255,255,0.45)}100%{background:transparent}}
  `;
  document.head.appendChild(stEl);

  const ov = document.createElement('div');
  ov.id = OID;
  Object.assign(ov.style, { position:'fixed',top:'0',left:'0',width:'100vw',height:'100vh',zIndex:'2147483646',cursor:'crosshair',background:'rgba(0,0,0,0.18)',backdropFilter:'blur(1px)' });

  const badge = document.createElement('div');
  badge.id = 'ais-badge';
  Object.assign(badge.style, {
    position:'fixed',top:'20px',left:'50%',transform:'translateX(-50%)',padding:'9px 22px',borderRadius:'10px',
    background:'linear-gradient(135deg,#1a1a22,#22222c)',border:'1px solid rgba(201,168,78,0.2)',
    color:'#c9a84e',fontFamily:"'Segoe UI',-apple-system,sans-serif",fontSize:'13px',fontWeight:'600',
    boxShadow:'0 4px 20px rgba(0,0,0,0.5)',zIndex:'2147483647',animation:'ais-bi .3s ease forwards',
    pointerEvents:'none',userSelect:'none',whiteSpace:'nowrap',letterSpacing:'.2px'
  });
  badge.textContent = 'Click and drag to select area \u00B7 ESC to cancel';

  const rect = document.createElement('div');
  Object.assign(rect.style, { position:'fixed',border:'2px solid rgba(201,168,78,0.7)',borderRadius:'3px',background:'rgba(201,168,78,0.04)',boxShadow:'0 0 0 9999px rgba(0,0,0,0.4),inset 0 0 0 1px rgba(255,255,255,0.06)',display:'none',zIndex:'2147483647',pointerEvents:'none' });

  const dim = document.createElement('div');
  Object.assign(dim.style, { position:'fixed',padding:'2px 7px',borderRadius:'5px',background:'rgba(13,13,16,0.9)',color:'#a3a3a0',fontFamily:"'Consolas',monospace",fontSize:'10.5px',zIndex:'2147483647',display:'none',pointerEvents:'none' });

  document.documentElement.style.overflow = 'hidden';
  ov.append(rect, dim);
  document.body.append(ov, badge);

  ov.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    drawing = true; sx = e.clientX; sy = e.clientY;
    rect.style.display = 'block'; rect.style.left = sx+'px'; rect.style.top = sy+'px'; rect.style.width = '0'; rect.style.height = '0';
    dim.style.display = 'block'; badge.style.display = 'none';
  });

  ov.addEventListener('mousemove', (e) => {
    if (!drawing) return;
    const x = Math.min(e.clientX, sx), y = Math.min(e.clientY, sy), w = Math.abs(e.clientX - sx), h = Math.abs(e.clientY - sy);
    rect.style.left = x+'px'; rect.style.top = y+'px'; rect.style.width = w+'px'; rect.style.height = h+'px';
    dim.textContent = w + ' \u00D7 ' + h;
    dim.style.left = (x+w+6)+'px'; dim.style.top = (y+h+6)+'px';
  });

  ov.addEventListener('mouseup', async (e) => {
    if (!drawing) return; drawing = false;
    const x = Math.min(e.clientX, sx), y = Math.min(e.clientY, sy), w = Math.abs(e.clientX - sx), h = Math.abs(e.clientY - sy);
    if (w < 10 || h < 10) { cleanup(); return; }

    ov.style.background = 'transparent'; ov.style.backdropFilter = 'none';
    rect.style.display = 'none'; dim.style.display = 'none'; badge.style.display = 'none';
    await new Promise(r => setTimeout(r, 60));

    try {
      const res = await chrome.runtime.sendMessage({ type: 'CAPTURE_TAB' });
      if (res.error) { cleanup(); return; }
      const b64 = await crop(res.dataUrl, x, y, w, h);
      flash();
      chrome.runtime.sendMessage({ type: 'SCREENSHOT_CAPTURED', imageBase64: b64, dimensions: { x, y, w, h } });
    } catch (e) { console.error('[AiSolutions]', e); }
    setTimeout(cleanup, 200);
  });

  function onKey(e) { if (e.key === 'Escape') cleanup(); }
  document.addEventListener('keydown', onKey);

  function crop(url, cx, cy, cw, ch) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const d = devicePixelRatio || 1, c = document.createElement('canvas');
        c.width = cw*d; c.height = ch*d;
        c.getContext('2d').drawImage(img, cx*d, cy*d, cw*d, ch*d, 0, 0, cw*d, ch*d);
        res(c.toDataURL('image/png').split(',')[1]);
      };
      img.onerror = rej; img.src = url;
    });
  }

  function flash() {
    const f = document.createElement('div');
    Object.assign(f.style, { position:'fixed',top:'0',left:'0',width:'100vw',height:'100vh',zIndex:'2147483647',pointerEvents:'none',animation:'ais-fl .3s ease-out forwards' });
    document.body.appendChild(f); setTimeout(() => f.remove(), 350);
  }

  function cleanup() {
    document.documentElement.style.overflow = savedOF;
    document.removeEventListener('keydown', onKey);
    ov.remove(); badge.remove(); stEl.remove();
  }
})();
