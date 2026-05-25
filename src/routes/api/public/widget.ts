import { createFileRoute } from "@tanstack/react-router";

const SUPA_URL = "https://rjvlscwkwzjuksnwwujo.supabase.co";
const SUPA_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqdmxzY3drd3pqdWtzbnd3dWpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjAzMzEsImV4cCI6MjA5NDkzNjMzMX0.HFnEkzwacpDVSDUhchJSDZzs96UWZNNNPonSu89HrFE";

const JS = `(function(){
  var s = document.currentScript;
  var TITLE = (s && s.dataset.title) || "Chat with us";
  var COLOR = (s && s.dataset.color) || "#4A6FA5";
  var COLOR_DARK = (s && s.dataset.colorDark) || "#2E3A59";
  var SUPA = ${JSON.stringify(SUPA_URL)};
  var KEY = ${JSON.stringify(SUPA_ANON)};
  var sessionId = null;

  var css = '.alc-btn{position:fixed;bottom:20px;right:20px;background:'+COLOR_DARK+';color:#fff;border:none;border-radius:999px;padding:14px 18px;font:600 14px system-ui;box-shadow:0 8px 24px rgba(46,58,89,.25);cursor:pointer;z-index:2147483646}'+
  '.alc-wrap{position:fixed;bottom:80px;right:20px;width:340px;max-width:calc(100vw - 40px);height:480px;max-height:calc(100vh - 120px);background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(46,58,89,.25);display:none;flex-direction:column;overflow:hidden;font:14px system-ui;z-index:2147483647;border:1px solid #e5e7eb}'+
  '.alc-wrap.open{display:flex}.alc-hd{background:'+COLOR_DARK+';color:#fff;padding:12px 14px;font-weight:600;display:flex;justify-content:space-between;align-items:center}'+
  '.alc-x{background:transparent;border:none;color:#fff;font-size:18px;cursor:pointer}'+
  '.alc-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f7f7f9}'+
  '.alc-m{padding:8px 12px;border-radius:12px;max-width:80%;white-space:pre-wrap;word-wrap:break-word;line-height:1.4}'+
  '.alc-m.user{background:'+COLOR+';color:#fff;align-self:flex-end;border-bottom-right-radius:4px}'+
  '.alc-m.bot{background:#fff;color:#111;align-self:flex-start;border:1px solid #eee;border-bottom-left-radius:4px}'+
  '.alc-in{display:flex;gap:6px;padding:10px;border-top:1px solid #eee;background:#fff}'+
  '.alc-in input{flex:1;border:1px solid #ddd;border-radius:8px;padding:8px 10px;font:14px system-ui;outline:none}'+
  '.alc-in button{background:'+COLOR+';color:#fff;border:none;border-radius:8px;padding:0 14px;cursor:pointer;font-weight:600}'+
  '.alc-human{background:transparent;border:none;color:'+COLOR+';font-size:12px;cursor:pointer;padding:6px;text-align:center}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var btn = document.createElement('button'); btn.className='alc-btn'; btn.textContent='💬 Chat';
  var wrap = document.createElement('div'); wrap.className='alc-wrap';
  wrap.innerHTML = '<div class="alc-hd"><span>'+TITLE+'</span><button class="alc-x">×</button></div>'+
    '<div class="alc-msgs"></div>'+
    '<button class="alc-human">Talk to a human</button>'+
    '<form class="alc-in"><input placeholder="Type a message..." maxlength="2000" required/><button type="submit">Send</button></form>';
  document.body.appendChild(btn); document.body.appendChild(wrap);

  var msgs = wrap.querySelector('.alc-msgs');
  var transcript = [];
  var lastSeenAt = new Date(0).toISOString();
  var pollTimer = null;
  var sessionStatus = 'ai_handling';

  function add(role, content){
    var d = document.createElement('div'); d.className='alc-m '+(role==='user'?'user':'bot'); d.textContent = content; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
    transcript.push((role==='user'?'VISITOR':role==='human'?'AGENT':'BOT')+': '+content);
  }
  function callFn(name, payload){
    return fetch(SUPA+'/functions/v1/'+name,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+KEY,'apikey':KEY},
      body:JSON.stringify(payload||{})
    }).then(function(r){return r.json()});
  }

  function poll(){
    if(!sessionId) return;
    callFn('chat', { action:'poll', sessionId: sessionId, since: lastSeenAt })
      .then(function(r){
        if(r && Array.isArray(r.messages)){
          r.messages.forEach(function(m){
            if(m.created_at > lastSeenAt){
              lastSeenAt = m.created_at;
              if(m.role === 'human' || m.role === 'assistant'){
                add(m.role, m.content);
              }
            }
          });
        }
        if(r && r.status) sessionStatus = r.status;
      }).catch(function(){});
  }

  btn.onclick = function(){
    wrap.classList.add('open');
    if(!sessionId && transcript.length===0){ add('bot', 'Hi! How can we help?'); }
    if(!pollTimer) pollTimer = setInterval(poll, 3000);
  };
  wrap.querySelector('.alc-x').onclick = function(){ wrap.classList.remove('open'); };
  wrap.querySelector('.alc-in').onsubmit = function(e){
    e.preventDefault();
    var inp = wrap.querySelector('input');
    var v = inp.value.trim();
    if(!v) return;
    add('user', v);
    inp.value='';
    callFn('chat', { sessionId: sessionId, pageUrl: location.href, message: v })
      .then(function(r){
        if(r.sessionId) {
          sessionId = r.sessionId;
          if(!pollTimer) pollTimer = setInterval(poll, 3000);
        }
        if(r.reply) {
          add('bot', r.reply);
          lastSeenAt = new Date().toISOString();
        } else if(r.error) add('bot', '⚠ '+r.error);
      })
      .catch(function(err){ add('bot', '⚠ Network error'); console.error(err); });
  };
  wrap.querySelector('.alc-human').onclick = function(){
    if(!sessionId){ add('bot', 'Send a message first so we can pick up the conversation.'); return; }
    callFn('handoff', { sessionId: sessionId, pageUrl: location.href, transcript: transcript.join('\\n') })
      .then(function(){ add('bot', "Connecting you to a human… we'll be in touch shortly."); });
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
