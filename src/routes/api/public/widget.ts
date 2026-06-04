import { createFileRoute } from "@tanstack/react-router";

const JS = `(function(){
  var s = document.currentScript;
  var TITLE = (s && s.dataset.title) || "Chat with us";
  var COLOR = (s && s.dataset.color) || "#4A6FA5";
  var COLOR_DARK = (s && s.dataset.colorDark) || "#2E3A59";
  var GREETING_DELAY = parseInt((s && s.dataset.greetingDelay) || "60", 10) * 1000;
  var CHAT_URL = (s && s.src ? new URL(s.src).origin : location.origin) + '/api/public/chat';
  var STORAGE_KEY = 'alc_chat_session_v1';
  var sessionId = null;
  var visitorSecret = null;
  var locked = false;
  try {
    var stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (stored && stored.sessionId && stored.visitorSecret) {
      sessionId = stored.sessionId; visitorSecret = stored.visitorSecret;
    }
  } catch(e){}
  function saveSession(){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId: sessionId, visitorSecret: visitorSecret })); } catch(e){}
  }
  function clearSession(){
    try { localStorage.removeItem(STORAGE_KEY); } catch(e){}
    sessionId = null; visitorSecret = null;
  }

  var css = '.alc-btn{position:fixed;bottom:20px;right:20px;background:'+COLOR_DARK+';color:#fff;border:none;border-radius:999px;padding:14px 18px;font:600 14px system-ui;box-shadow:0 8px 24px rgba(46,58,89,.25);cursor:pointer;z-index:2147483646}'+
  '.alc-wrap{position:fixed;bottom:80px;right:20px;width:340px;max-width:calc(100vw - 40px);height:480px;max-height:calc(100vh - 120px);background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(46,58,89,.25);display:none;flex-direction:column;overflow:hidden;font:14px system-ui;z-index:2147483647;border:1px solid #e5e7eb}'+
  '.alc-wrap.open{display:flex}.alc-hd{background:'+COLOR_DARK+';color:#fff;padding:12px 14px;font-weight:600;display:flex;justify-content:space-between;align-items:center}'+
  '.alc-x{background:transparent;border:none;color:#fff;font-size:18px;cursor:pointer}'+
  '.alc-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f7f7f9}'+
  '.alc-m{padding:8px 12px;border-radius:12px;max-width:80%;white-space:pre-wrap;word-wrap:break-word;line-height:1.4}'+
  '.alc-m.user{background:'+COLOR+';color:#fff;align-self:flex-end;border-bottom-right-radius:4px}'+
  '.alc-m.bot{background:#fff;color:#111;align-self:flex-start;border:1px solid #eee;border-bottom-left-radius:4px}'+
  '.alc-typing{align-self:flex-start;background:'+COLOR_DARK+';padding:10px 14px;border-radius:14px;display:flex;gap:4px}'+
  '.alc-typing span{width:6px;height:6px;background:#fff;border-radius:50%;animation:alc-pulse 1.2s infinite}'+
  '.alc-typing span:nth-child(2){animation-delay:.2s}.alc-typing span:nth-child(3){animation-delay:.4s}'+
  '@keyframes alc-pulse{0%,60%,100%{opacity:.3}30%{opacity:1}}'+
  '.alc-in{display:flex;gap:6px;padding:10px;border-top:1px solid #eee;background:#fff}'+
  '.alc-in input{flex:1;border:1px solid #ddd;border-radius:8px;padding:8px 10px;font:14px system-ui;outline:none}'+
  '.alc-in input:disabled{background:#f3f4f6;color:#9ca3af}'+
  '.alc-in button{background:'+COLOR+';color:#fff;border:none;border-radius:8px;padding:0 14px;cursor:pointer;font-weight:600}'+
  '.alc-in button:disabled{background:#cbd5e1;cursor:not-allowed}'+
  '.alc-human{background:transparent;border:none;color:'+COLOR+';font-size:12px;cursor:pointer;padding:6px;text-align:center}'+
  '.alc-locked{padding:10px;text-align:center;font-size:12px;color:#6b7280;background:#f3f4f6;border-top:1px solid #eee}'+
  '.alc-form{padding:12px;background:#fff;border-top:1px solid #eee;display:flex;flex-direction:column;gap:8px}'+
  '.alc-form h4{margin:0 0 4px;font-size:13px;color:#111}'+
  '.alc-form input{border:1px solid #ddd;border-radius:8px;padding:8px 10px;font:13px system-ui;outline:none;width:100%;box-sizing:border-box}'+
  '.alc-form .row{display:flex;gap:8px}.alc-form .row>*{flex:1}'+
  '.alc-form button{background:'+COLOR+';color:#fff;border:none;border-radius:8px;padding:9px;font-weight:600;cursor:pointer}'+
  '.alc-form .skip{background:transparent;color:#6b7280;font-weight:400;font-size:12px;padding:4px}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var btn = document.createElement('button'); btn.className='alc-btn'; btn.textContent='💬 Chat';
  var wrap = document.createElement('div'); wrap.className='alc-wrap';
  wrap.innerHTML = '<div class="alc-hd"><span>'+TITLE+'</span><button class="alc-x">×</button></div>'+
    '<div class="alc-msgs"></div>'+
    '<div class="alc-extra"></div>'+
    '<button class="alc-human">Talk to a human</button>'+
    '<form class="alc-in"><input placeholder="Type a message..." maxlength="2000" required/><button type="submit">Send</button></form>';
  document.body.appendChild(btn); document.body.appendChild(wrap);

  var msgs = wrap.querySelector('.alc-msgs');
  var extra = wrap.querySelector('.alc-extra');
  var inp = wrap.querySelector('.alc-in input');
  var sendBtn = wrap.querySelector('.alc-in button');
  var lastSeenAt = new Date(0).toISOString();
  var seenIds = {};
  var pollTimer = null;
  var greetingTimer = null;
  var typingEl = null;
  var realtimeCh = null;

  function add(role, content){
    var d = document.createElement('div'); d.className='alc-m '+(role==='user'?'user':'bot');
    d.textContent = content; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
  }
  function showTyping(){
    if(typingEl) return;
    typingEl = document.createElement('div'); typingEl.className='alc-typing';
    typingEl.innerHTML='<span></span><span></span><span></span>';
    msgs.appendChild(typingEl); msgs.scrollTop = msgs.scrollHeight;
  }
  function hideTyping(){ if(typingEl){ typingEl.remove(); typingEl=null; } }
  function callFn(_name, payload){
    return fetch(CHAT_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload||{})
    }).then(function(r){return r.json()});
  }
  function lock(msg){
    locked = true;
    extra.innerHTML = '<div class="alc-locked">'+(msg||'This chat has ended.')+'</div>';
    inp.disabled = true; sendBtn.disabled = true;
    var humanBtn = wrap.querySelector('.alc-human'); if(humanBtn) humanBtn.style.display='none';
    if(pollTimer){ clearInterval(pollTimer); pollTimer=null; }
  }
  function showContactForm(prefix){
    if(extra.querySelector('.alc-form')) return;
    var html = '<div class="alc-form">'+
      '<h4>'+(prefix||"Let's get you a quote")+'</h4>'+
      '<input name="name" placeholder="Full name" required/>'+
      '<div class="row"><input name="business" placeholder="Business name"/><input name="business_type" placeholder="Business type"/></div>'+
      '<input name="email" type="email" placeholder="Email" required/>'+
      '<input name="phone" placeholder="Phone"/>'+
      '<button type="submit">Get Me a Quote</button>'+
      '<button type="button" class="skip">Maybe later</button></div>';
    extra.innerHTML = html;
    var form = extra.querySelector('.alc-form');
    form.querySelector('.skip').onclick = function(){ extra.innerHTML=''; };
    form.onsubmit = function(e){
      e.preventDefault();
      var fd = {};
      ['name','business','business_type','email','phone'].forEach(function(n){
        fd[n] = (form.querySelector('[name="'+n+'"]')||{}).value || null;
      });
      callFn('chat', { action:'contact', sessionId: sessionId, visitorSecret: visitorSecret, contact: fd })
        .then(function(){
          extra.innerHTML = '<div class="alc-locked">Thanks! A member of the AstroLabs team will be in touch shortly.</div>';
        });
    };
  }
  function poll(){
    if(!sessionId || !visitorSecret || locked) return;
    callFn('chat', { action:'poll', sessionId: sessionId, visitorSecret: visitorSecret, since: lastSeenAt })
      .then(function(r){
        if(r && Array.isArray(r.messages)){
          r.messages.forEach(function(m){
            if(m.created_at > lastSeenAt) lastSeenAt = m.created_at;
            if(seenIds[m.id]) return;
            seenIds[m.id] = 1;
            if(m.role === 'human' || m.role === 'assistant'){
              hideTyping();
              add(m.role, m.content);
            }
          });
        }
        if(r && r.status === 'closed' && !locked){ lock('This chat has ended.'); }
      }).catch(function(){});
  }

  function subscribeTyping(){
    if(realtimeCh || !sessionId) return;
    // Lightweight realtime via fetch-based broadcast not used; rely on polling for messages.
    // Typing indicator from human via a separate poll on broadcasts is out of scope for the no-SDK widget,
    // so we display a typing bubble only while AI is processing (handled at send time).
  }

  function openWidget(){
    wrap.classList.add('open');
    btn.style.display='none';
    if(!sessionId && msgs.children.length===0){ add('bot', 'Hi! How can we help?'); }
    if(!pollTimer && !locked) pollTimer = setInterval(poll, 3000);
  }
  function closeWidget(){
    wrap.classList.remove('open');
    btn.style.display='';
    if(sessionId && visitorSecret && !locked){
      // Show contact form before locking
      openWidget();
      showContactForm("Before you go — leave your details and we'll be in touch.");
      // Mark session as closed
      callFn('chat', { action:'close', sessionId: sessionId, visitorSecret: visitorSecret }).then(function(){
        lock('This chat has ended.');
      });
    }
  }

  btn.onclick = openWidget;
  wrap.querySelector('.alc-x').onclick = closeWidget;

  // Auto-open after configured delay
  if(GREETING_DELAY > 0){
    greetingTimer = setTimeout(function(){
      if(!wrap.classList.contains('open')) openWidget();
    }, GREETING_DELAY);
  }

  wrap.querySelector('.alc-in').onsubmit = function(e){
    e.preventDefault();
    if(locked) return;
    var v = inp.value.trim();
    if(!v) return;
    add('user', v);
    inp.value='';
    showTyping();
    callFn('chat', { sessionId: sessionId, visitorSecret: visitorSecret, pageUrl: location.href, message: v })
      .then(function(r){
        hideTyping();
        if(r && r.error === 'Forbidden'){
          // stale/invalid secret — drop and let next send create a fresh session
          clearSession();
          add('bot', '⚠ Session expired. Please send your message again.');
          return;
        }
        if(r.error === 'closed'){ lock('This chat has ended.'); return; }
        if(r.sessionId) {
          sessionId = r.sessionId;
          if(r.visitorSecret) visitorSecret = r.visitorSecret;
          saveSession();
          if(!pollTimer) pollTimer = setInterval(poll, 3000);
          subscribeTyping();
        }
        if(r.replyId) seenIds[r.replyId] = 1;
        if(r.reply) add('bot', r.reply);
        if(r.showContact) showContactForm("Let's get your details — we'll reply with a quote.");
        else if(r.error) add('bot', '⚠ '+r.error);
      })
      .catch(function(){ hideTyping(); add('bot', '⚠ Network error'); });
  };
  wrap.querySelector('.alc-human').onclick = function(){
    if(!sessionId){ add('bot', 'Send a message first so we can pick up the conversation.'); return; }
    showContactForm("Leave your details and a human will reach out.");
  };
})();`;

export const Route = createFileRoute("/api/public/widget")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JS, {
          status: 200,
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*",
          },
        }),
    },
  },
});
