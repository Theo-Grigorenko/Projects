/* ============================================================
   Theo Grigorenko — "Rail"
   1. Lazy media (no fetch, no blob URLs — plain src on approach)
   2. Play intent: hover on fine pointers, tap everywhere
   3. Exclusive playback, with a sync group for the latest pair
   4. Rail active state (IntersectionObserver)
   5. Other Projects: cards <-> detail panels
   6. Designs: native scroll-snap carousel + dots
   ============================================================ */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var scrollBehavior = reduce ? "auto" : "smooth";

  /* ── 1. Lazy media ──────────────────────────────────────── */

  var videos = Array.prototype.slice.call(
    document.querySelectorAll("video[data-src]")
  );

  /* videos and the heavy design PNGs share one attach path: plain src,
     no fetch, no blob URLs, so the HTTP cache dedupes repeats for free */
  function attach(el) {
    if (!el || el.dataset.attached) return;
    el.dataset.attached = "1";
    if (el.tagName === "VIDEO") {
      if (el.dataset.poster) el.poster = el.dataset.poster;
      el.preload = "metadata";
    }
    el.src = el.dataset.src;
  }

  /* a target is either a media element itself or a wrapper holding some */
  function onApproach(entries, obs) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      if (el.dataset.src) attach(el);
      else el.querySelectorAll("[data-src]").forEach(attach);
      obs.unobserve(el);
    });
  }

  var approach = new IntersectionObserver(onApproach, { rootMargin: "400px 0px" });

  videos.forEach(function (v) {
    if (v.hasAttribute("data-logo")) return;
    approach.observe(v);
    /* a tap on the native controls must not race the observer, and a tap
       is play intent, so escalate preload exactly as hover does */
    v.addEventListener("pointerdown", function () {
      attach(v);
      v.preload = "auto";
    }, { passive: true });

    /* the wrapper carries the play badge; clear it while the clip runs */
    var wrap = v.parentElement;
    if (wrap && wrap.classList.contains("mw")) {
      v.addEventListener("play", function () {
        wrap.classList.add("is-playing");
      });
      ["pause", "ended"].forEach(function (evt) {
        v.addEventListener(evt, function () {
          wrap.classList.remove("is-playing");
        });
      });
    }
  });

  /* The design renders are 410KB of PNG and the single heaviest thing on
     the page. They are one strip that scrolls sideways below 768px, and a
     slide scrolled out of that strip is clipped out of the observer's
     reach, so watch the strip and attach the set together. */
  document.querySelectorAll(".designs").forEach(function (strip) {
    approach.observe(strip);
  });

  /* ── 2 & 3. Play intent + exclusive playback ────────────── */

  function syncGroup(v) {
    var g = v.dataset.syncGroup;
    if (!g) return [v];
    return videos.filter(function (o) {
      return o.dataset.syncGroup === g;
    });
  }

  function start(v) {
    syncGroup(v).forEach(function (o) {
      attach(o);
      o.preload = "auto";
      var p = o.play();
      if (p && p.catch) p.catch(function () {});
    });
  }

  if (finePointer) {
    document.querySelectorAll(".mw").forEach(function (mw) {
      var v = mw.querySelector("video[data-src]");
      if (!v) return;
      mw.addEventListener("pointerenter", function () {
        start(v);
      });
    });
  }

  /* one capture listener: whoever starts playing silences the rest */
  document.addEventListener(
    "play",
    function (e) {
      var t = e.target;
      if (!t || t.tagName !== "VIDEO") return;
      var g = t.dataset.syncGroup;

      document.querySelectorAll("video").forEach(function (v) {
        if (v === t || v.hasAttribute("data-logo")) return;
        if (g && v.dataset.syncGroup === g) return;
        if (!v.paused) v.pause();
      });

      /* the latest pair plays together, as it does on the live site */
      if (g) {
        syncGroup(t).forEach(function (o) {
          if (o === t || !o.paused) return;
          attach(o);
          var p = o.play();
          if (p && p.catch) p.catch(function () {});
        });
      }
    },
    true
  );

  /* ambient signature — decorative, exempt from the above. It has no loop
     attribute: it draws itself once and then holds its final frame, which is
     the completed signature. */
  var logo = document.querySelector("video[data-logo]");
  if (logo) {
    if (reduce) logo.removeAttribute("autoplay");
    logo.preload = "auto";
    logo.src = logo.dataset.src;
    if (!reduce) {
      var lp = logo.play();
      if (lp && lp.catch) lp.catch(function () {});
    } else {
      /* No animation allowed, so jump straight to the finished signature
         instead of sitting on a near-blank first frame. Guarded: a seek
         cannot complete until the clip actually reports a seekable range. */
      var settle = function () {
        if (logo.readyState < 2 || !logo.seekable || !logo.seekable.length) return;
        logo.removeEventListener("loadeddata", settle);
        logo.removeEventListener("canplaythrough", settle);
        var end = Math.min(
          logo.duration || 0,
          logo.seekable.end(logo.seekable.length - 1)
        );
        if (end > 0) logo.currentTime = Math.max(0, end - 0.05);
      };
      logo.addEventListener("loadeddata", settle);
      logo.addEventListener("canplaythrough", settle);
      logo.load();
    }
  }

  /* ── 4. Rail active state ───────────────────────────────── */

  var railItems = Array.prototype.slice.call(
    document.querySelectorAll(".rail-item")
  );

  if (railItems.length) {
    var order = railItems.map(function (a) {
      return a.dataset.rail;
    });
    var secs = order.map(function (id) {
      return document.getElementById(id);
    });
    var activeId = null;

    function paint(id) {
      if (id === activeId) return;
      activeId = id;
      railItems.forEach(function (a) {
        var on = a.dataset.rail === id;
        a.classList.toggle("is-active", on);
        if (on) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    }

    /* the section that owns the reading line, just below the top edge */
    function compute() {
      var line = Math.min(window.innerHeight * 0.25, 140);
      var id = order[0];
      secs.forEach(function (sec, i) {
        if (sec && sec.getBoundingClientRect().top <= line) id = order[i];
      });
      /* a short final section can never reach the line — claim it at the end */
      var doc = document.documentElement;
      if (window.scrollY + window.innerHeight >= doc.scrollHeight - 24) {
        id = order[order.length - 1];
      }
      paint(id);
    }

    /* IntersectionObserver drives the updates; a thin band at the reading
       line means it fires exactly when the answer can change. */
    if ("IntersectionObserver" in window) {
      var spy = new IntersectionObserver(compute, {
        rootMargin: "-14% 0px -84% 0px",
        threshold: 0
      });
      secs.forEach(function (sec) {
        if (sec) spy.observe(sec);
      });
    }

    /* safety net for the page edges (top of page, bottom of page) */
    var queued = false;
    window.addEventListener(
      "scroll",
      function () {
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () {
          queued = false;
          compute();
        });
      },
      { passive: true }
    );

    compute();
  }

  /* ── 5. Other Projects ──────────────────────────────────── */

  var grid = document.getElementById("proj-grid");
  var section = document.getElementById("projects");
  var title = document.getElementById("projects-h");
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  var panels = Array.prototype.slice.call(document.querySelectorAll(".panel"));
  var openId = null;

  function pauseAll() {
    document.querySelectorAll("video").forEach(function (v) {
      if (!v.hasAttribute("data-logo") && !v.paused) v.pause();
    });
  }

  function setTabs() {
    tabs.forEach(function (b) {
      b.setAttribute("aria-expanded", String(b.dataset.id === openId));
    });
  }

  function openProject(id) {
    if (!grid) return;
    pauseAll();
    openId = id;
    grid.hidden = true;
    panels.forEach(function (p) {
      p.hidden = p.dataset.id !== id;
    });
    setTabs();

    /* whitepaper bytes only when Satya is opened, and only once */
    if (id === "satya") {
      var wp = document.getElementById("whitepaper");
      if (wp && !wp.src && wp.dataset.src) wp.src = wp.dataset.src;
    }

    var panel = document.getElementById("panel-" + id);
    if (panel) {
      var v = panel.querySelector("video[data-src]");
      if (v) start(v);
    }
    if (section) section.scrollIntoView({ behavior: scrollBehavior, block: "start" });
  }

  function closeProject(refocus) {
    if (!grid || !openId) return;
    var last = openId;
    pauseAll();
    openId = null;
    panels.forEach(function (p) {
      p.hidden = true;
    });
    grid.hidden = false;
    setTabs();
    if (refocus) {
      var btn = document.querySelector('.tab[data-id="' + last + '"]');
      if (btn) btn.focus();
    }
  }

  tabs.forEach(function (b) {
    b.addEventListener("click", function () {
      if (b.dataset.id === openId) closeProject(false);
      else openProject(b.dataset.id);
    });
  });

  document.querySelectorAll(".proj-open").forEach(function (b) {
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      openProject(b.dataset.id);
    });
  });

  document.querySelectorAll(".proj").forEach(function (card) {
    card.addEventListener("click", function (e) {
      if (e.target.closest("video, a, button")) return;
      openProject(card.dataset.id);
    });
  });

  document.querySelectorAll(".panel-close").forEach(function (b) {
    b.addEventListener("click", function () {
      closeProject(true);
    });
  });

  /* the section title still collapses the panel, as it does today — the
     heading stays visible at every width so this is always reachable */
  if (title) {
    title.addEventListener("click", function () {
      if (openId) closeProject(true);
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && openId) closeProject(true);
  });

  /* ── 6. Designs carousel ────────────────────────────────── */

  var designs = document.getElementById("designs");
  var dots = Array.prototype.slice.call(
    document.querySelectorAll("#design-dots .dot")
  );

  /* it is a scroll container below 768px only; above that it is a plain
     3-up grid, so it must not stay a tab stop that cannot scroll */
  if (designs) {
    var threeUp = window.matchMedia("(min-width: 768px)");
    var syncCarouselFocus = function () {
      if (threeUp.matches) designs.removeAttribute("tabindex");
      else designs.setAttribute("tabindex", "0");
    };
    syncCarouselFocus();
    if (threeUp.addEventListener) threeUp.addEventListener("change", syncCarouselFocus);
    else if (threeUp.addListener) threeUp.addListener(syncCarouselFocus);
  }

  if (designs && dots.length) {
    var slides = Array.prototype.slice.call(designs.children);

    dots.forEach(function (dot) {
      dot.addEventListener("click", function () {
        var slide = slides[Number(dot.dataset.slide)];
        if (!slide) return;
        var left =
          designs.scrollLeft +
          slide.getBoundingClientRect().left -
          designs.getBoundingClientRect().left -
          (designs.clientWidth - slide.clientWidth) / 2;
        designs.scrollTo({ left: left, behavior: scrollBehavior });
      });
    });

    var ticking = false;
    designs.addEventListener(
      "scroll",
      function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          var mid = designs.getBoundingClientRect().left + designs.clientWidth / 2;
          var best = 0;
          var bestDist = Infinity;
          slides.forEach(function (slide, i) {
            var r = slide.getBoundingClientRect();
            var d = Math.abs(r.left + r.width / 2 - mid);
            if (d < bestDist) {
              bestDist = d;
              best = i;
            }
          });
          dots.forEach(function (dot, i) {
            dot.classList.toggle("is-on", i === best);
            if (i === best) dot.setAttribute("aria-current", "true");
            else dot.removeAttribute("aria-current");
          });
        });
      },
      { passive: true }
    );
  }
})();
