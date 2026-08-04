/*
 * Embeddable floating chat widget (Round 10) -- the ONLY non-Python code
 * in this whole project, and unavoidably so: "drop this into any website"
 * means code that runs in THAT website's browser tab, which has to be
 * HTML/CSS/JS no matter what language the chatbot itself is written in.
 * This file does no thinking of its own -- it's a thin shell (a floating
 * bubble button + a toggleable panel) around an <iframe> pointing at the
 * real chatbot (app.py, still 100% Python, running as its own Streamlit
 * server). Every actual AI/RAG feature lives entirely in that iframe.
 *
 * Usage -- one line, anywhere in a host page's HTML:
 *   <script src="widget.js" data-chat-url="https://your-chatbot-url"></script>
 *
 * Optional attributes on the same <script> tag:
 *   data-position="left"   -- bottom-left instead of bottom-right (default: right)
 *   data-color="#635bff"   -- bubble accent color (default: a neutral indigo)
 *
 * The iframe is lazy: it doesn't load (and doesn't cost the chatbot
 * server a session) until a visitor actually clicks the bubble open.
 * `?embed=true` is Streamlit's own built-in embed mode -- it strips the
 * hamburger menu, the "Deploy" toolbar, and the footer, none of which
 * belong inside a small floating panel on someone else's website.
 */
(function () {
  "use strict";

  var currentScript = document.currentScript;
  var chatUrl = (currentScript && currentScript.getAttribute("data-chat-url")) || "http://localhost:8501";
  var position = (currentScript && currentScript.getAttribute("data-position")) === "left" ? "left" : "right";
  var accentColor = (currentScript && currentScript.getAttribute("data-color")) || "#635bff";

  var style = document.createElement("style");
  style.textContent =
    "#rag-widget-bubble{" +
    "position:fixed;bottom:24px;" + position + ":24px;z-index:2147483000;" +
    "width:60px;height:60px;border-radius:50%;border:none;" +
    "background:" + accentColor + ";color:#fff;font-size:26px;line-height:1;" +
    "box-shadow:0 4px 16px rgba(0,0,0,.25);cursor:pointer;" +
    "display:flex;align-items:center;justify-content:center;" +
    "transition:transform .15s ease;font-family:system-ui,sans-serif;}" +
    "#rag-widget-bubble:hover{transform:scale(1.06);}" +
    "#rag-widget-panel{" +
    "position:fixed;bottom:96px;" + position + ":24px;z-index:2147483000;" +
    "width:380px;max-width:calc(100vw - 32px);" +
    "height:600px;max-height:calc(100vh - 140px);" +
    "border-radius:16px;overflow:hidden;background:#fff;" +
    "box-shadow:0 12px 40px rgba(0,0,0,.3);border:1px solid rgba(0,0,0,.08);" +
    "display:none;}" +
    "#rag-widget-panel.rag-widget-open{display:block;}" +
    "#rag-widget-panel iframe{width:100%;height:100%;border:0;display:block;}";
  document.head.appendChild(style);

  var bubble = document.createElement("button");
  bubble.id = "rag-widget-bubble";
  bubble.type = "button";
  bubble.setAttribute("aria-label", "Open chat assistant");
  bubble.textContent = "💬"; // 💬

  var panel = document.createElement("div");
  panel.id = "rag-widget-panel";

  var iframe = document.createElement("iframe");
  iframe.title = "Chat assistant";
  iframe.loading = "lazy";
  panel.appendChild(iframe);

  var iframeLoaded = false;

  bubble.addEventListener("click", function () {
    var isOpen = panel.classList.toggle("rag-widget-open");
    bubble.textContent = isOpen ? "✕" : "💬"; // ✕ : 💬
    bubble.setAttribute("aria-label", isOpen ? "Close chat assistant" : "Open chat assistant");
    if (isOpen && !iframeLoaded) {
      var separator = chatUrl.indexOf("?") === -1 ? "?" : "&";
      iframe.src = chatUrl + separator + "embed=true";
      iframeLoaded = true;
    }
  });

  function mount() {
    document.body.appendChild(panel);
    document.body.appendChild(bubble);
  }

  if (document.body) {
    mount();
  } else {
    document.addEventListener("DOMContentLoaded", mount);
  }
})();
