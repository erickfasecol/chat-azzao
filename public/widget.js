/**
 * Widget de chat AZZAO
 * --------------------
 * Se pega en cualquier página con una sola línea:
 *
 *   <script src="https://SU-DOMINIO/widget.js" data-api="https://SU-DOMINIO"></script>
 *
 * Colores y tipografías tomados del Manual de Marca AZZAO:
 *   Carbón tibio #363636 · Tierra brasa #7F492C · Verde origen #39593E
 *   Amarillo suave #F2C46D · Arena hogar #F2E8C9
 *   Fraunces (títulos) · Poppins (texto)
 *
 * Todo vive dentro de un Shadow DOM, así que los estilos de la página no lo
 * afectan y el widget tampoco daña el diseño del sitio.
 */
(function () {
  'use strict';
 
  if (window.__azzaoChatCargado) return;
  window.__azzaoChatCargado = true;
 
  const script = document.currentScript;
  const cfg = {
    api: (script?.dataset.api || '').replace(/\/$/, '') || window.location.origin,
    saludo:
      script?.dataset.saludo ||
      'Bienvenido a AZZAO. No vendemos asadores: vendemos domingos. Estamos por abrir la tienda y con gusto le cuento de qué se trata. ¿Qué le gustaría saber?',
    invitacion: script?.dataset.invitacion || 'No vendemos asadores. Vendemos domingos.',
    posicion: script?.dataset.posicion === 'izquierda' ? 'izquierda' : 'derecha',
  };
 
  // --- Tipografías de marca ---
  if (!document.getElementById('azzao-fuentes')) {
    const pre = document.createElement('link');
    pre.rel = 'preconnect';
    pre.href = 'https://fonts.gstatic.com';
    pre.crossOrigin = 'anonymous';
    document.head.appendChild(pre);
 
    const fuentes = document.createElement('link');
    fuentes.id = 'azzao-fuentes';
    fuentes.rel = 'stylesheet';
    fuentes.href =
      'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Poppins:wght@300;400;500;600&display=swap';
    document.head.appendChild(fuentes);
  }
 
  // --- Identificador del visitante ---
  let idVisitante;
  try {
    idVisitante = localStorage.getItem('azzao_chat_id');
    if (!idVisitante) {
      idVisitante = 'web-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('azzao_chat_id', idVisitante);
    }
  } catch (e) {
    idVisitante = 'web-' + Math.random().toString(36).slice(2, 10);
  }
 
  const anfitrion = document.createElement('div');
  anfitrion.id = 'azzao-chat';
  document.body.appendChild(anfitrion);
  const raiz = anfitrion.attachShadow({ mode: 'open' });
 
  const lado = cfg.posicion === 'izquierda' ? 'left' : 'right';
 
  // Marca de fuego: la misma idea de la "O" encendida del logotipo.
  const LLAMA = `
    <svg viewBox="0 0 32 40" aria-hidden="true">
      <path d="M16 1c.6 4.2-1.2 6.6-3.4 8.9C9.7 12.7 6 15.9 6 21.9 6 28.6 10.8 34 16 34s10-5.4 10-12.1c0-4.4-2.2-7.2-4.3-9.6-.7 1.4-1.6 2.3-2.7 2.8.5-2.4.2-5-.9-7.2C17.2 5.9 16.7 3.2 16 1z"/>
    </svg>`;
 
  raiz.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
 
      .capa {
        --carbon: #363636;
        --carbon-hondo: #262626;
        --brasa: #7F492C;
        --verde: #39593E;
        --oro: #F2C46D;
        --arena: #F2E8C9;
        position: fixed;
        bottom: 22px;
        ${lado}: 22px;
        z-index: 2147483000;
        font-family: "Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 15px;
        font-weight: 400;
        line-height: 1.55;
      }
 
      /* --- Burbuja --- */
      .burbuja {
        width: 62px; height: 62px;
        border-radius: 50%;
        border: none;
        background: linear-gradient(145deg, #F7D89A, var(--oro) 55%, #D9A24E);
        cursor: pointer;
        box-shadow: 0 8px 26px rgba(54, 32, 14, .38);
        display: grid;
        place-items: center;
        transition: transform .2s ease, box-shadow .2s ease;
      }
      .burbuja:hover { transform: scale(1.06); box-shadow: 0 12px 32px rgba(54, 32, 14, .46); }
      .burbuja:focus-visible { outline: 3px solid var(--oro); outline-offset: 4px; }
      .burbuja svg { width: 26px; height: 32px; fill: #4A2B14; }
      .burbuja .equis { display: none; width: 24px; height: 24px; }
      .abierto .burbuja .llama { display: none; }
      .abierto .burbuja .equis { display: block; }
 
      /* --- Globo de invitación --- */
      .globo {
        position: absolute;
        bottom: 78px;
        ${lado}: 2px;
        background: var(--carbon);
        color: var(--arena);
        border: 1px solid rgba(242, 196, 109, .35);
        border-radius: 14px;
        padding: 13px 17px;
        box-shadow: 0 10px 30px rgba(20, 12, 6, .4);
        width: max-content;
        max-width: 246px;
        font-size: 14px;
        cursor: pointer;
      }
      .globo b {
        display: block;
        font-family: "Fraunces", Georgia, serif;
        font-weight: 600;
        color: var(--oro);
        margin-bottom: 3px;
        font-size: 15px;
      }
      .globo .x {
        position: absolute; top: -9px; ${lado}: -9px;
        width: 23px; height: 23px; border-radius: 50%;
        background: var(--brasa); color: var(--arena);
        border: 1px solid rgba(242,232,201,.3);
        font-size: 12px; line-height: 1; cursor: pointer;
        font-family: inherit;
      }
      .abierto .globo, .globo.oculto { display: none; }
 
      /* --- Panel --- */
      .panel {
        position: absolute;
        bottom: 80px;
        ${lado}: 0;
        width: 382px;
        height: 566px;
        max-height: calc(100vh - 130px);
        background: var(--carbon-hondo);
        border-radius: 18px;
        box-shadow: 0 22px 56px rgba(20, 12, 6, .5);
        display: none;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid rgba(242, 196, 109, .22);
      }
      .abierto .panel { display: flex; animation: entrar .22s ease-out; }
      @keyframes entrar {
        from { opacity: 0; transform: translateY(14px) scale(.985); }
        to   { opacity: 1; transform: none; }
      }
 
      header {
        background:
          radial-gradient(120% 140% at 12% 0%, rgba(127, 73, 44, .95), transparent 62%),
          linear-gradient(135deg, #3E2417, var(--carbon) 58%, #2B3A2D);
        padding: 17px 20px;
        display: flex;
        align-items: center;
        gap: 13px;
        flex: none;
        border-bottom: 1px solid rgba(242, 196, 109, .2);
      }
      .sello {
        width: 40px; height: 40px; border-radius: 50%;
        background: linear-gradient(145deg, rgba(242,196,109,.28), rgba(242,196,109,.08));
        border: 1px solid rgba(242, 196, 109, .45);
        display: grid; place-items: center; flex: none;
      }
      .sello svg { width: 17px; height: 21px; fill: var(--oro); }
      .marca {
        font-family: "Fraunces", Georgia, serif;
        font-weight: 600;
        font-size: 19px;
        letter-spacing: .09em;
        background: linear-gradient(100deg, #F7DCA4, var(--oro) 50%, #D9A24E);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      header p { font-size: 12px; color: rgba(242, 232, 201, .72); letter-spacing: .02em; }
 
      /* Cerrar desde la cabecera. En celular es la única salida, porque allá
         el panel ocupa toda la pantalla y la burbuja se esconde. */
      .cerrarPanel {
        display: none;
        margin-left: auto;
        width: 34px; height: 34px;
        border-radius: 50%;
        border: 1px solid rgba(242, 196, 109, .4);
        background: rgba(242, 232, 201, .08);
        color: var(--oro);
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
        font-family: inherit;
        flex: none;
      }
 
      .mensajes {
        flex: 1;
        overflow-y: auto;
        padding: 20px 16px 8px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scrollbar-color: rgba(242,196,109,.3) transparent;
      }
      .mensajes::-webkit-scrollbar { width: 6px; }
      .mensajes::-webkit-scrollbar-thumb {
        background: rgba(242,196,109,.28); border-radius: 3px;
      }
 
      .msj {
        max-width: 85%;
        padding: 11px 15px;
        border-radius: 15px;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow-wrap: anywhere;
        font-size: 14.5px;
      }
      .bot {
        background: #383735;
        color: var(--arena);
        align-self: flex-start;
        border-bottom-left-radius: 5px;
      }
      .yo {
        background: var(--brasa);
        color: var(--arena);
        align-self: flex-end;
        border-bottom-right-radius: 5px;
      }
      .nota {
        align-self: center;
        background: rgba(57, 89, 62, .35);
        border: 1px solid rgba(242, 196, 109, .3);
        color: var(--arena);
        font-size: 13px;
        padding: 9px 15px;
        border-radius: 11px;
        text-align: center;
        max-width: 92%;
      }
 
      .puntos { display: flex; gap: 5px; padding: 15px; }
      .puntos i {
        width: 7px; height: 7px; border-radius: 50%;
        background: var(--oro); display: block; opacity: .55;
        animation: latir 1.3s infinite;
      }
      .puntos i:nth-child(2) { animation-delay: .17s; }
      .puntos i:nth-child(3) { animation-delay: .34s; }
      @keyframes latir {
        0%, 60%, 100% { transform: translateY(0); opacity: .4; }
        30% { transform: translateY(-5px); opacity: 1; }
      }
 
      .sugerencias {
        display: flex; flex-wrap: wrap; gap: 7px;
        padding: 6px 16px 14px;
      }
      .sugerencias button {
        background: transparent;
        border: 1px solid rgba(242, 196, 109, .55);
        color: var(--oro);
        border-radius: 17px;
        padding: 7px 14px;
        font-size: 13px;
        font-family: inherit;
        cursor: pointer;
        transition: background .15s ease, color .15s ease;
      }
      .sugerencias button:hover { background: var(--oro); color: #3A2410; }
 
      form {
        display: flex;
        align-items: flex-end;
        gap: 9px;
        padding: 13px;
        border-top: 1px solid rgba(242, 196, 109, .18);
        background: var(--carbon);
        flex: none;
      }
      textarea {
        flex: 1;
        border: 1px solid rgba(242, 232, 201, .22);
        background: rgba(242, 232, 201, .07);
        border-radius: 21px;
        padding: 11px 16px;
        font: inherit;
        font-size: 14.5px;
        color: var(--arena);
        resize: none;
        max-height: 98px;
      }
      textarea::placeholder { color: rgba(242, 232, 201, .45); }
      textarea:focus { outline: none; border-color: var(--oro); }
      .enviar {
        width: 43px; height: 43px;
        border-radius: 50%;
        border: none;
        background: linear-gradient(145deg, #F7D89A, var(--oro) 60%, #D9A24E);
        cursor: pointer;
        flex: none;
        display: grid; place-items: center;
      }
      .enviar:disabled { opacity: .4; cursor: default; }
      .enviar svg { width: 18px; height: 18px; fill: #4A2B14; }
 
      .pie {
        text-align: center;
        font-size: 11px;
        font-weight: 300;
        color: rgba(242, 232, 201, .42);
        padding: 0 12px 11px;
        background: var(--carbon);
        letter-spacing: .02em;
      }
 
      @media (max-width: 480px) {
        .capa { bottom: 16px; ${lado}: 16px; }
        .panel {
          position: fixed; inset: 0;
          width: 100%; height: 100%; max-height: 100%;
          border-radius: 0; border: none;
        }
        .globo { display: none; }
        /* La burbuja tapaba el botón de enviar, porque el panel es pantalla
           completa. Se esconde y se cierra desde la cabecera. */
        .abierto .burbuja { display: none; }
        .cerrarPanel { display: block; }
        .mensajes { padding-bottom: 12px; }
      }
      @media (prefers-reduced-motion: reduce) {
        * { animation: none !important; transition: none !important; }
      }
    </style>
 
    <div class="capa">
      <div class="globo oculto" id="globo" role="button" tabindex="0">
        <button class="x" id="cerrarGlobo" aria-label="Cerrar aviso">✕</button>
        <b id="textoGlobo"></b>
        Pregúnteme lo que quiera saber.
      </div>
 
      <div class="panel" role="dialog" aria-label="Chat con AZZAO">
        <header>
          <div class="sello">${LLAMA}</div>
          <div>
            <div class="marca">AZZAO</div>
            <p>La calidez que nos reúne</p>
          </div>
          <button class="cerrarPanel" id="cerrarPanel" aria-label="Cerrar chat">✕</button>
        </header>
 
        <div class="mensajes" id="mensajes" role="log" aria-live="polite"></div>
 
        <div class="sugerencias" id="sugerencias">
          <button type="button">¿Cómo funciona?</button>
          <button type="button">¿Eléctrico o al carbón?</button>
          <button type="button">¿Cuándo abre la tienda?</button>
          <button type="button">Avísenme cuando abran</button>
        </div>
 
        <form id="formulario">
          <textarea id="entrada" rows="1" placeholder="Escriba su mensaje…"
                    aria-label="Mensaje"></textarea>
          <button type="submit" class="enviar" id="enviar" aria-label="Enviar mensaje">
            <svg viewBox="0 0 24 24"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </form>
        <div class="pie">Asistente automatizado de AZZAO</div>
      </div>
 
      <button class="burbuja" id="burbuja" aria-label="Abrir chat" aria-expanded="false">
        <span class="llama">${LLAMA}</span>
        <svg class="equis" viewBox="0 0 24 24"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>
    </div>
  `;
 
  raiz.getElementById('textoGlobo').textContent = cfg.invitacion;
 
  const capa = raiz.querySelector('.capa');
  const burbuja = raiz.getElementById('burbuja');
  const globo = raiz.getElementById('globo');
  const cerrarGlobo = raiz.getElementById('cerrarGlobo');
  const mensajes = raiz.getElementById('mensajes');
  const sugerencias = raiz.getElementById('sugerencias');
  const formulario = raiz.getElementById('formulario');
  const entrada = raiz.getElementById('entrada');
  const botonEnviar = raiz.getElementById('enviar');
 
  let abierto = false;
  let saludado = false;
  let enviando = false;
 
  function pintar(clase, texto) {
    const div = document.createElement('div');
    div.className = clase;
    div.textContent = texto;
    mensajes.appendChild(div);
    mensajes.scrollTop = mensajes.scrollHeight;
    return div;
  }
 
  function alternar() {
    abierto = !abierto;
    capa.classList.toggle('abierto', abierto);
    burbuja.setAttribute('aria-label', abierto ? 'Cerrar chat' : 'Abrir chat');
    burbuja.setAttribute('aria-expanded', String(abierto));
    if (abierto) {
      if (!saludado) {
        saludado = true;
        pintar('msj bot', cfg.saludo);
      }
      if (window.innerWidth > 480) entrada.focus();
    }
  }
 
  burbuja.addEventListener('click', alternar);
  raiz.getElementById('cerrarPanel').addEventListener('click', alternar);
  globo.addEventListener('click', (e) => {
    if (e.target === cerrarGlobo) return;
    alternar();
  });
  globo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); }
  });
  cerrarGlobo.addEventListener('click', (e) => {
    e.stopPropagation();
    globo.classList.add('oculto');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && abierto) alternar();
  });
 
  sugerencias.addEventListener('click', (e) => {
    const boton = e.target.closest('button');
    if (!boton) return;
    entrada.value = boton.textContent;
    formulario.requestSubmit();
  });
 
  entrada.addEventListener('input', () => {
    entrada.style.height = 'auto';
    entrada.style.height = Math.min(entrada.scrollHeight, 98) + 'px';
  });
 
  entrada.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      formulario.requestSubmit();
    }
  });
 
  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = entrada.value.trim();
    if (!texto || enviando) return;
 
    enviando = true;
    botonEnviar.disabled = true;
    sugerencias.style.display = 'none';
 
    pintar('msj yo', texto);
    entrada.value = '';
    entrada.style.height = 'auto';
 
    const esperando = document.createElement('div');
    esperando.className = 'msj bot puntos';
    esperando.innerHTML = '<i></i><i></i><i></i>';
    mensajes.appendChild(esperando);
    mensajes.scrollTop = mensajes.scrollHeight;
 
    // Sin un tope de espera, si el servidor se queda pensando el chat se
    // congela para siempre y el visitante no sabe qué pasó.
    const reloj = new AbortController();
    const cortar = setTimeout(() => reloj.abort(), 60000);
 
    try {
      const peticion = await fetch(cfg.api + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefono: idVisitante, texto }),
        signal: reloj.signal,
      });
      const datos = await peticion.json().catch(() => ({}));
      esperando.remove();
 
      if (!peticion.ok || datos.error) {
        pintar('nota', datos.error || 'No pudimos procesar su mensaje. Intente de nuevo.');
      } else {
        pintar('msj bot', datos.respuesta);
      }
    } catch (error) {
      esperando.remove();
      pintar(
        'nota',
        error.name === 'AbortError'
          ? 'La respuesta está tardando más de lo normal. Intente de nuevo, por favor.'
          : 'No pudimos conectarnos. Por favor intente de nuevo en un momento.'
      );
    } finally {
      clearTimeout(cortar);
      enviando = false;
      botonEnviar.disabled = false;
      if (window.innerWidth > 480) entrada.focus();
    }
  });
 
  setTimeout(() => {
    if (!abierto) globo.classList.remove('oculto');
  }, 6000);
 
  // Para abrir el chat desde un botón de la página: window.AzzaoChat.abrir()
  window.AzzaoChat = {
    abrir: () => { if (!abierto) alternar(); },
    cerrar: () => { if (abierto) alternar(); },
  };
})();
 