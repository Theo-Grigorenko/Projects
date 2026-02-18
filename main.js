document.querySelectorAll("video[data-src]").forEach((video) => {
  function onFirstPlay(e) {
    // only trigger if no src yet
    if (!video.src && video.dataset.src) {
      e.preventDefault(); // stop the no-op
      video.removeEventListener("play", onFirstPlay);

      // 1) point src at the real URL so browser starts fetching & shows its spinner
      video.src = video.dataset.src;
      // 2) load+play
      video.load();
      video.play().catch(() => {});
    }
  }
  video.addEventListener("play", onFirstPlay);
});

const blobUrlCache = new Map();
const getBlobUrl = (url) => {
  if (!blobUrlCache.has(url)) {
    blobUrlCache.set(
      url,
      fetch(url)
        .then((r) => r.blob())
        .then((b) => URL.createObjectURL(b))
    );
  }
  return blobUrlCache.get(url);
};

/* Configure basic attributes synchronously */
document.querySelectorAll("video").forEach((v) => {
  v.muted = true;
  v.playsinline = true;
  if (!v.classList.contains("logo-video")) v.controls = true;
});

/* ─── MAIN LOADING PIPELINE ─── */
window.addEventListener("load", async () => {
  /* 1 — Logo video */
  const logo = document.querySelector("video.logo-video[data-src]");
  if (logo) {
    try {
      logo.src = await getBlobUrl(logo.dataset.src);
      logo.load();
      logo.play().catch(() => {});
    } catch (e) {
      console.warn("Logo video failed:", e);
    }
  }

  /* 1b — Version video posters (latest first) */
  const loadPoster = (video) => {
    const poster = video.dataset.src.replace(/\.\w+$/, ".webp");
    video.poster = poster;
    return new Promise((res) => {
      const img = new Image();
      img.onload = img.onerror = res;
      img.src = poster;
    });
  };

  const version5a = document.querySelector('video[data-src*="Version5a"]');
  const version5b = document.querySelector('video[data-src*="Version5b"]');
  const version4 = document.querySelector('video[data-src*="Version4"]');
  const version3 = document.querySelector('video[data-src*="Version3"]');
  const version2 = document.querySelector('video[data-src*="Version2"]');

  await Promise.all([
    version5a && loadPoster(version5a),
    version5b && loadPoster(version5b),
  ].filter(Boolean));

  if (version4) await loadPoster(version4);
  if (version3) await loadPoster(version3);
  if (version2) await loadPoster(version2);

  /* 2 — Design images in order: 1, 2, 3 */
  const loadImage = (img) => {
    return new Promise((res) => {
      img.onload = img.onerror = res;
      img.src = img.dataset.src;
    });
  };

  const design1 = document.querySelector('img[data-src*="Design1"]');
  const design2 = document.querySelector('img[data-src*="Design2"]');
  const design3 = document.querySelector('img[data-src*="Design3"]');

  if (design1) await loadImage(design1);
  if (design2) await loadImage(design2);
  if (design3) await loadImage(design3);

  /* 3 — Hero video posters (satya, drone, ev) */
  const heroVids = Array.from(
    document.querySelectorAll(
      'video[data-src*="satya-video"],video[data-src*="drone-video"],video[data-src*="ev-video"]'
    )
  );

  await Promise.all(heroVids.map(loadPoster));

  /* 4 — Remaining inline <img> elements */
  document.querySelectorAll("img[data-src]").forEach((img) => {
    if (!img.src || img.src.includes("base64")) {
      img.src = img.dataset.src;
    }
  });

  /* 5 — Posters for any remaining videos */
  const allVideos = Array.from(
    document.querySelectorAll("video[data-src]:not(.logo-video)")
  );
  const extraPosterPromises = allVideos
    .filter((v) => !v.poster)
    .map(loadPoster);

  await Promise.all(extraPosterPromises);

  /* 6 — Finally load EVERY video file */
  const groups = allVideos.reduce((acc, el) => {
    (acc[el.dataset.src] ??= []).push(el);
    return acc;
  }, {});

  await Promise.all(
    Object.entries(groups).map(async ([url, els]) => {
      try {
        const blobUrl = await getBlobUrl(url);
        els.forEach((v) => {
          v.src = blobUrl;
          v.load();
        });
      } catch (e) {
        console.warn("Video failed:", url, e);
      }
    })
  );

  /* 7 — Now load the whitepaper PDF */
  const pdfEl = document.getElementById("whitepaper");
  if (pdfEl && pdfEl.dataset.src) {
    pdfEl.src = pdfEl.dataset.src;
  }
});

/* ——— INTERACTIVITY ——— */
document.addEventListener("DOMContentLoaded", () => {
  const pauseNonLogoVideos = () =>
    document
      .querySelectorAll("video:not(.logo-video)")
      .forEach((v) => v.pause());

  /* ─── OTHER PROJECTS INTERACTIVITY ─── */
  const featured = document.querySelector(".featured-projects");
  const detailContainer = document.querySelector(
    ".selected-project-container"
  );
  const buttons = document.querySelectorAll(".project-btn");
  const featuredCards = featured.querySelectorAll(".project");
  const title = document.getElementById("projects-title");
  let currentId = null;

  /* ─── DRONE TRACKING VIDEO HOVER INTERACTIVITY ─── */
  const latestLayout = document.querySelector(".latest-videos-layout");
  const latestVids = latestLayout
    ? Array.from(latestLayout.querySelectorAll("video"))
    : [];
  const droneVideos = document.querySelectorAll(
    ".drone-videos-layout .media-item, .latest-videos-layout .media-item"
  );

  // Latest videos: hover on the container plays both together
  if (latestLayout) {
    latestLayout.addEventListener("mouseenter", () => {
      // Pause all other drone/featured videos
      document.querySelectorAll(".drone-videos-layout .media-item video").forEach((v) => v.pause());
      featuredCards.forEach((card) => {
        const v = card.querySelector("video");
        if (v) v.pause();
      });
      // Play both latest videos together
      latestVids.forEach((v) => { if (v.paused && v.src) v.play(); });
    });

    // First play triggers the other, then they become independent
    let linked = true;
    latestVids.forEach((vid) => {
      vid.addEventListener("play", () => {
        if (!linked) return;
        linked = false;
        latestVids.forEach((other) => {
          if (other !== vid && other.paused && other.src) other.play();
        });
      });
    });
  }

  // Previous version videos: same as before but also pause latest
  document.querySelectorAll(".drone-videos-layout .media-item").forEach((item) => {
    const vid = item.querySelector("video");
    if (vid) {
      item.addEventListener("mouseenter", () => {
        // Pause all other drone videos
        document.querySelectorAll(".drone-videos-layout .media-item video").forEach((v) => {
          if (v !== vid) v.pause();
        });
        // Pause latest videos
        latestVids.forEach((v) => v.pause());
        // Pause all featured project videos
        featuredCards.forEach((card) => {
          const v = card.querySelector("video");
          if (v) v.pause();
        });
        // Play this video
        if (vid.paused && vid.src) vid.play();
      });
    }
  });

  function clearSelection() {
    pauseNonLogoVideos();
    detailContainer
      .querySelectorAll(".selected-project")
      .forEach((d) => (d.style.display = "none"));
    buttons.forEach((b) => b.classList.remove("active"));
    featured.classList.remove("hidden");
    title.textContent = "Other Projects:";
    currentId = null;
  }

  function selectProject(id) {
    pauseNonLogoVideos();
    featured.classList.add("hidden");

    if (currentId) {
      const prev = detailContainer.querySelector(
        `.selected-project[data-id="${currentId}"]`
      );
      if (prev) prev.style.display = "none";
      document
        .querySelector(`.project-btn[data-id="${currentId}"]`)
        .classList.remove("active");
    }

    const detail = detailContainer.querySelector(
      `.selected-project[data-id="${id}"]`
    );
    if (!detail) return;
    detail.style.display = "block";
    detail.querySelector("video")?.play();
    document
      .querySelector(`.project-btn[data-id="${id}"]`)
      .classList.add("active");
    currentId = id;
    title.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  featuredCards.forEach((card) => {
    const vid = card.querySelector("video");
    card.addEventListener("mouseenter", () => {
      // Pause all other featured videos
      featuredCards.forEach((otherCard) => {
        if (otherCard !== card) {
          const otherVid = otherCard.querySelector("video");
          if (otherVid) otherVid.pause();
        }
      });
      // Play this video
      if (vid && vid.paused && vid.src) vid.play();
    });
    card.addEventListener("click", (e) => {
      if (
        ["a", "video"].includes(e.target.tagName.toLowerCase()) ||
        e.target.closest("video")
      )
        return;
      selectProject(card.dataset.id);
    });
  });

  buttons.forEach((btn) =>
    btn.addEventListener("click", () => {
      btn.dataset.id === currentId
        ? clearSelection()
        : selectProject(btn.dataset.id);
    })
  );

  title.addEventListener("click", () => currentId && clearSelection());
});

/* ─── SWIPER CAROUSEL INITIALIZATION ─── */
document.addEventListener("DOMContentLoaded", () => {
  const swiper = new Swiper(".drone-designs-swiper", {
    effect: "slide",
    slidesPerView: 1.3,
    spaceBetween: 20,
    centeredSlides: true,
    loop: false,
    watchSlidesProgress: true,
    pagination: {
      el: ".swiper-pagination",
      clickable: true,
      type: "bullets",
      renderBullet: function (index, className) {
        // Only render 3 bullets (for the 3 unique designs)
        if (index < 3) {
          return (
            '<span class="' +
            className +
            '" data-index="' +
            index +
            '"></span>'
          );
        }
        return "";
      },
    },
    navigation: {
      nextEl: ".drone-designs-swiper .swiper-button-next",
      prevEl: ".drone-designs-swiper .swiper-button-prev",
    },
    breakpoints: {
      768: {
        slidesPerView: 3,
        spaceBetween: 16,
        centeredSlides: false,
        loop: false,
      },
    },
    on: {
      init: function () {
        updateSlideScale(this);
        updatePagination(this);
      },
      slideChange: function () {
        updateSlideScale(this);
        updatePagination(this);
      },
      transitionEnd: function () {
        updateSlideScale(this);
        updatePagination(this);
      },
    },
  });

  function updatePagination(swiper) {
    const paginationEl = document.querySelector(
      ".drone-designs-swiper .swiper-pagination"
    );
    if (window.innerWidth < 768) {
      if (paginationEl) paginationEl.style.display = "block";
      const activeSlide = swiper.slides[swiper.activeIndex];
      const designIndex =
        parseInt(activeSlide.getAttribute("data-design")) - 1;
      const bullets = document.querySelectorAll(
        ".drone-designs-swiper .swiper-pagination-bullet"
      );
      bullets.forEach((bullet, index) => {
        if (index === designIndex) {
          bullet.classList.add("swiper-pagination-bullet-active");
        } else {
          bullet.classList.remove("swiper-pagination-bullet-active");
        }
      });
    } else {
      if (paginationEl) paginationEl.style.display = "none";
    }
  }

  function updateSlideScale(swiper) {
    if (window.innerWidth < 768) {
      swiper.slides.forEach((slide) => {
        slide.style.transition = "transform 0.3s ease, opacity 0.3s ease";
        if (slide.classList.contains("swiper-slide-active")) {
          slide.style.transform = "scale(1)";
          slide.style.opacity = "1";
        } else {
          slide.style.transform = "scale(0.85)";
          slide.style.opacity = "0.6";
        }
      });
    } else {
      swiper.slides.forEach((slide) => {
        slide.style.transform = "";
        slide.style.opacity = "";
      });
    }
  }

  window.addEventListener("resize", () => {
    swiper.update();
    updateSlideScale(swiper);
    updatePagination(swiper);
  });
});
