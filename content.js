(() => {
  "use strict";

  /*
   * YouTube : Better Cinema Mode
   * - En mode cinéma (et seulement là), la navbar YouTube peut être masquée.
   * - Un bouton dans le lecteur (visible seulement en mode cinéma) bascule l'affichage.
   * - Le choix est mémorisé (chrome.storage.sync) et partagé entre onglets.
   * - Hors mode cinéma, en plein écran, sur l'accueil, les Shorts ou en mini-lecteur :
   *   navbar normale, pas de bouton.
   */

  const ROOT = document.documentElement;
  const HIDE_CLASS = "bcm-hide-nav"; // navbar masquée
  const PEEK_CLASS = "bcm-peek";     // navbar affichée temporairement (recherche « / »)
  const WATCH_SEL = "ytd-watch-flexy, ytd-watch-grid";
  const INSTANCE = Math.random().toString(36).slice(2);

  let hideNav = true;   // préférence (défaut : masquée en mode cinéma)
  let ready = false;    // préférence chargée
  let alive = true;
  let rafId = 0;
  let slowTimer = 0;
  let saveTimer = 0;
  let writing = false;
  let pollTimer = 0;
  let myBtn = null;     // le bouton créé par CETTE instance
  const observers = [];

  // Une seule instance active : une nouvelle injection (extension rechargée) prend la main.
  ROOT.dataset.bcmInstance = INSTANCE;

  const isFr = () => (ROOT.lang || navigator.language || "").toLowerCase().startsWith("fr");

  // ---------- Contexte ----------

  function getWatch() {
    for (const el of document.querySelectorAll(WATCH_SEL)) {
      if (!el.hasAttribute("hidden")) return el;
    }
    return null;
  }

  // Mode cinéma réel : page de lecture visible, attribut theater, pas en plein écran.
  // Couvre /watch, /live/…, et exclut accueil, Shorts, recherche, mini-lecteur.
  function inCinema() {
    const w = getWatch();
    return !!w &&
      w.hasAttribute("theater") &&
      !w.hasAttribute("fullscreen") &&
      !document.fullscreenElement;
  }

  function extensionAlive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function checkAlive() {
    if (!alive) return false;
    if (!extensionAlive() || ROOT.dataset.bcmInstance !== INSTANCE) {
      teardown();
      return false;
    }
    return true;
  }

  // ---------- Mise à jour ----------

  function update() {
    rafId = 0;
    if (!ready || !checkAlive()) return;

    const cinema = inCinema();
    const active = hideNav && cinema;

    if (ROOT.classList.contains(HIDE_CLASS) !== active) {
      ROOT.classList.toggle(HIDE_CLASS, active);
      if (!active) ROOT.classList.remove(PEEK_CLASS);
      // Le lecteur recalcule sa taille.
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    }
    syncButton(cinema);
  }

  // Changements d'état (theater, plein écran, navigation) : dans la frame suivante, sans flash.
  function schedule() {
    if (!rafId && alive) rafId = requestAnimationFrame(update);
  }

  // Changements du DOM (lecteur reconstruit, pub…) : regroupés pour rester léger.
  function scheduleSlow() {
    if (slowTimer || !alive) return;
    slowTimer = setTimeout(() => {
      slowTimer = 0;
      schedule();
    }, 150);
  }

  // ---------- Bouton ----------

  function createButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ytp-button bcm-btn";

    // Pas d'innerHTML : YouTube impose Trusted Types.
    const NS = "http://www.w3.org/2000/svg";
    const mk = (tag, attrs) => {
      const el = document.createElementNS(NS, tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    };
    // Même gabarit que les icônes natives du lecteur (SVG inline 24x24).
    const svg = mk("svg", { viewBox: "0 0 24 24", width: "24", height: "24", fill: "none", "aria-hidden": "true" });
    svg.append(
      mk("rect", { class: "bcm-frame", x: "2.5", y: "4.5", width: "19", height: "15", rx: "2.2" }),
      mk("rect", { class: "bcm-bar", x: "2.5", y: "4.5", width: "19", height: "4.5", rx: "1.2" })
    );
    btn.append(svg);

    btn.addEventListener("click", onButtonClick);
    // Le lecteur ne doit pas interpréter le clic (pause, double-clic plein écran…).
    btn.addEventListener("dblclick", (e) => e.stopPropagation());
    return btn;
  }

  function onButtonClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!checkAlive()) return;
    hideNav = !hideNav;
    update(); // appliquer d'abord, sauvegarder ensuite
    save();
    // Clic souris : rendre le focus au lecteur pour garder les raccourcis (espace, k, f, t…).
    if (e.detail > 0) e.currentTarget.blur();
  }

  function renderButton(btn) {
    const pressed = String(hideNav);
    if (btn.dataset.hidden !== pressed) btn.dataset.hidden = pressed;
    if (btn.getAttribute("aria-pressed") !== pressed) btn.setAttribute("aria-pressed", pressed);
    const label = isFr()
      ? (hideNav ? "Afficher la barre YouTube" : "Masquer la barre YouTube")
      : (hideNav ? "Show YouTube bar" : "Hide YouTube bar");
    if (btn.title !== label) {
      btn.title = label;
      btn.setAttribute("aria-label", label);
    }
  }

  function syncButton(cinema) {
    const watch = getWatch();
    const controls = cinema && watch
      ? watch.querySelector("#movie_player .ytp-right-controls") || watch.querySelector(".ytp-right-controls")
      : null;

    // Ne garder que NOTRE bouton : un bouton laissé par une ancienne version de l'extension
    // (mise à jour, rechargement) ou une copie n'a plus de gestionnaire de clic valide.
    document.querySelectorAll(".bcm-btn").forEach((b) => { if (b !== myBtn) b.remove(); });

    if (!controls) {
      if (myBtn) myBtn.remove();
      return;
    }
    if (!myBtn) myBtn = createButton();

    // Juste après « Mode cinéma », avant « Plein écran ». Repositionné si le lecteur se reconstruit.
    const size = controls.querySelector(".ytp-size-button");
    if (size) {
      if (size.nextElementSibling !== myBtn) size.after(myBtn);
    } else if (!controls.contains(myBtn)) {
      controls.prepend(myBtn);
    }
    renderButton(myBtn);
  }

  // ---------- Recherche « / » quand la navbar est masquée ----------

  function isEditable(t) {
    return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  }

  function onKeyDown(e) {
    if (!alive || !ROOT.classList.contains(HIDE_CLASS)) return;
    if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditable(e.target)) {
      ROOT.classList.add(PEEK_CLASS); // la barre apparaît par-dessus la vidéo, le temps de chercher
      // Après la frappe (le « / » n'est pas saisi) : si YouTube n'a pas placé le focus, on le fait.
      setTimeout(() => {
        const mh = document.getElementById("masthead-container");
        if (!mh || mh.contains(document.activeElement)) return;
        const input = mh.querySelector('input[name="search_query"], input#search');
        if (input) input.focus();
        else ROOT.classList.remove(PEEK_CLASS);
      }, 0);
    } else if (e.key === "Escape" && ROOT.classList.contains(PEEK_CLASS)) {
      ROOT.classList.remove(PEEK_CLASS);
      if (document.activeElement) document.activeElement.blur();
    }
  }

  function onFocusOut() {
    if (!ROOT.classList.contains(PEEK_CLASS)) return;
    setTimeout(() => {
      const mh = document.getElementById("masthead-container");
      if (!mh || !mh.contains(document.activeElement)) ROOT.classList.remove(PEEK_CLASS);
    }, 200);
  }

  // ---------- Stockage ----------

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = 0;
      writing = true;
      try {
        chrome.storage.sync.set({ hideNav }, () => {
          void chrome.runtime.lastError;
          setTimeout(() => { writing = false; }, 300);
        });
      } catch (_) {
        writing = false;
        checkAlive();
      }
    }, 250);
  }

  function onStorageChanged(changes, area) {
    if (area !== "sync" || !changes.hideNav || !alive) return;
    // Ignore l'écho de notre propre écriture (évite d'annuler un clic rapide).
    if (saveTimer || writing) return;
    hideNav = changes.hideNav.newValue !== false;
    schedule();
  }

  function load() {
    try {
      chrome.storage.sync.get({ hideNav: true }, (res) => {
        if (!chrome.runtime.lastError && res) hideNav = res.hideNav !== false;
        ready = true;
        schedule();
      });
    } catch (_) {
      ready = true; // valeur par défaut
      schedule();
    }
  }

  // ---------- Cycle de vie ----------

  function teardown() {
    if (!alive) return;
    alive = false;
    observers.forEach((o) => o.disconnect());
    clearInterval(pollTimer);
    clearTimeout(slowTimer);
    clearTimeout(saveTimer);
    if (rafId) cancelAnimationFrame(rafId);
    window.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("focusout", onFocusOut, true);
    document.removeEventListener("fullscreenchange", schedule);
    document.removeEventListener("yt-navigate-finish", schedule);
    document.removeEventListener("yt-page-data-updated", schedule);
    try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch (_) {}
    if (myBtn) myBtn.remove();

    // Ne nettoie la page que si aucune instance plus récente n'a pris le relais :
    // YouTube retrouve sa navbar normale (extension désactivée, mise à jour…).
    if (ROOT.dataset.bcmInstance === INSTANCE) {
      ROOT.classList.remove(HIDE_CLASS, PEEK_CLASS);
      document.querySelectorAll(".bcm-btn").forEach((b) => b.remove());
      delete ROOT.dataset.bcmInstance;
      window.dispatchEvent(new Event("resize"));
    }
  }

  function start() {
    // Passage en/hors mode cinéma (bouton ou touche « t »), plein écran, mini-lecteur, navigation.
    const attrObs = new MutationObserver(schedule);
    attrObs.observe(ROOT, {
      subtree: true,
      attributes: true,
      attributeFilter: ["theater", "fullscreen", "hidden"]
    });
    // Lecteur (re)construit : réinjection du bouton.
    const domObs = new MutationObserver(scheduleSlow);
    domObs.observe(ROOT, { subtree: true, childList: true });
    observers.push(attrObs, domObs);

    document.addEventListener("fullscreenchange", schedule);
    document.addEventListener("yt-navigate-finish", schedule);
    document.addEventListener("yt-page-data-updated", schedule);
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusout", onFocusOut, true);
    try { chrome.storage.onChanged.addListener(onStorageChanged); } catch (_) {}

    // Filet de sécurité (et détection d'une extension rechargée/désactivée).
    pollTimer = setInterval(() => (checkAlive() ? schedule() : 0), 1000);

    load();
  }

  start();
})();
