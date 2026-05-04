const root = document.documentElement;
const scenes = [...document.querySelectorAll(".scene")];
const navLinks = [...document.querySelectorAll('nav a[href^="#"]')];

scenes.forEach((scene) => {
  const tunnel = document.createElement("div");
  tunnel.className = "scene-tunnel";
  tunnel.setAttribute("aria-hidden", "true");
  scene.prepend(tunnel);
});

const copyBlocks = [...document.querySelectorAll(".scene .copy")];
const decorativeTextBlocks = [...document.querySelectorAll(".laugh-cards span, .taunt-cards > span")];
const contentWarning = document.querySelector(".content-warning");
const warningEnter = document.querySelector(".warning-enter");
const loadingGate = document.querySelector(".loading-gate");
const returnFade = document.querySelector(".return-fade");
const returnButtons = [...document.querySelectorAll('.profile-copy .button[href="#top"]')];
const autoplayStorageKey = "mistia-initial-autoplay-complete";
const autoplayStorage = sessionStorage;
const minimumLoadingGateDuration = 2000;
const loadingRealProgressLimit = 0.9;
const preloadAssets = [
  "assets/bamboo-forest-world.png",
  "assets/mistia-night-sparrow.png",
  "assets/mistia-yatai-ending.png",
  "assets/mokou-bonks-mystia.png"
];
const durationScale = 1.72;
const autoplayDuration = 180000;
const sceneCount = scenes.length;
const textRevealDelays = new Map([
  ["day", 0.03],
  ["cart", 1.32]
]);
const textRevealWindows = new Map();
const decorativeTextRevealWindows = new Map([
  ["taunt", 0.26],
  ["devour", 0.26]
]);
const decorativeCardRevealDelay = 0.11;
const typedKickerScenes = new Set(["day", "cart", "profile"]);
const fadeWidth = 0.44;
const sceneIndexByName = new Map(scenes.map((scene, index) => [scene.dataset.scene, index]));
const scrollAnchors = [...document.querySelectorAll(".scroll-track span[id]")];
const controlledScroll = {
  target: 0,
  frame: null,
  touchY: null
};
const controlledScrollEase = 0.11;
const controlledScrollStopDistance = 0.55;
const wheelStep = 230;
const touchStepScale = 1.35;
const headlineTextSpeed = 0.5;
const textReadHoldDuration = 0.2;
const longTextReadHoldDuration = 0.5;
const headlineTextSpeeds = new Map([
  ["breath", 2]
]);
const kickerTextSpeeds = new Map();
const textReadHoldDurations = new Map([
  ["panic", longTextReadHoldDuration],
  ["night", longTextReadHoldDuration],
  ["taunt", longTextReadHoldDuration],
  ["devour", longTextReadHoldDuration]
]);
const sceneDurationOverrides = new Map([
  ["day", 1.42],
  ["breath", 0.72],
  ["profile", 1.13]
]);
const sceneBaseDurations = scenes.map((scene) => {
  const duration = Number(scene.dataset.duration);
  return (Number.isFinite(duration) && duration > 0 ? duration : 1) * durationScale;
});
const sceneDurations = sceneBaseDurations.map((duration, index) => (
  sceneDurationOverrides.get(scenes[index].dataset.scene) ?? duration + getSceneTextReadHoldDuration(index)
));
const sceneAnchorOffsets = scenes.map((scene) => {
  const offset = Number(scene.dataset.anchorOffset);
  return Number.isFinite(offset) && offset > 0 ? offset : 0;
});
const scenePositions = sceneDurations.reduce((positions, duration, index) => {
  positions[index] = index === 0 ? 0 : positions[index - 1] + sceneDurations[index - 1];
  return positions;
}, []);
const lastSceneIndex = Math.max(0, scenePositions.length - 1);
const maxStoryProgress = (scenePositions[lastSceneIndex] + sceneDurations[lastSceneIndex]) || 1;
const revealCopies = [];
const revealDecorations = [];
let autoplayFrame = null;
let autoplayStarted = false;
let autoplayPreparing = false;
let preloadComplete = false;
let preloadStarted = false;
let preloadPromise = null;
let loadingFinishFrame = null;
const initialAutoplayEnabled = true;

root.style.setProperty("--scene-count", (maxStoryProgress + 1).toFixed(2));

function setLoadingProgress(progress) {
  root.style.setProperty("--loading-progress", clamp(progress).toFixed(3));
}

function showLoadingGate() {
  if (!loadingGate) return;
  loadingGate.classList.add("is-active");
}

function hideLoadingGate() {
  if (!loadingGate) return;
  loadingGate.classList.remove("is-active");
}

function getAutoplayEase(progress) {
  return progress;
}

function renderInitialAutoplayAt(elapsed) {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const progress = clamp(elapsed / autoplayDuration);
  const eased = getAutoplayEase(progress);

  window.scrollTo(0, maxScroll * eased);
  update();
}

function finishLoadingProgress(onProgress) {
  if (loadingFinishFrame) {
    cancelAnimationFrame(loadingFinishFrame);
  }

  const startedAt = performance.now();

  return new Promise((resolve) => {
    function tick(now) {
      const progress = clamp((now - startedAt) / minimumLoadingGateDuration);
      setLoadingProgress(loadingRealProgressLimit + (1 - loadingRealProgressLimit) * progress);
      onProgress?.(progress);

      if (progress < 1) {
        loadingFinishFrame = requestAnimationFrame(tick);
        return;
      }

      loadingFinishFrame = null;
      resolve();
    }

    loadingFinishFrame = requestAnimationFrame(tick);
  });
}

function preloadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      if (image.decode) {
        image.decode().then(resolve, resolve);
        return;
      }

      resolve();
    };
    image.onerror = resolve;
    image.src = src;
  });
}

function preloadStoryAssets() {
  if (preloadPromise) return preloadPromise;

  preloadStarted = true;
  let loaded = 0;
  setLoadingProgress(0);

  preloadPromise = Promise.all(preloadAssets.map((src) => (
    preloadImage(src).then(() => {
      loaded += 1;
      setLoadingProgress((loaded / preloadAssets.length) * loadingRealProgressLimit);
    })
  ))).then(() => {
    preloadComplete = true;
    setLoadingProgress(loadingRealProgressLimit);
  });

  return preloadPromise;
}

function waitForPageLoad() {
  if (document.readyState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.addEventListener("load", resolve, { once: true });
  });
}

function hideContentWarning() {
  if (!contentWarning) return;
  contentWarning.classList.add("is-hidden");
  document.body.classList.remove("warning-open");

  prepareAutoplayStart();
}

if (contentWarning) {
  document.body.classList.add("warning-open");
  warningEnter?.focus({ preventScroll: true });
  preloadStoryAssets();

  warningEnter?.addEventListener("click", () => hideContentWarning());
}

function prepareTextReveal() {
  copyBlocks.forEach((copy) => {
    const scene = copy.closest(".scene");
    const sceneIndex = scenes.indexOf(scene);
    const sceneName = scene?.dataset.scene;
    const typedKickerSelector = typedKickerScenes.has(sceneName) ? ", .eyebrow, .ending-kicker" : "";
    const textBlocks = [...copy.querySelectorAll(`h1, h2, p:not(.eyebrow):not(.ending-kicker), .button${typedKickerSelector}`)];
    const chars = [];

    textBlocks.forEach((block) => {
      const isHeadline = block.matches("h1, h2");
      const isKicker = block.matches(".eyebrow, .ending-kicker");
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      const textNodes = [];

      while (walker.nextNode()) {
        textNodes.push(walker.currentNode);
      }

      textNodes.forEach((node) => {
        const fragment = document.createDocumentFragment();
        let word = document.createElement("span");
        word.className = "reveal-word";

        function appendWord() {
          if (!word.hasChildNodes()) return;
          fragment.appendChild(word);
          word = document.createElement("span");
          word.className = "reveal-word";
        }

        [...node.textContent].forEach((char) => {
          if (/\s/.test(char)) {
            appendWord();
          }

          const span = document.createElement("span");
          span.className = /\s/.test(char) ? "reveal-char reveal-space" : "reveal-char";
          if (isHeadline) {
            span.classList.add("reveal-headline");
          }
          if (isKicker) {
            span.classList.add("reveal-kicker");
          }
          span.textContent = /\s/.test(char) ? " " : char;
          chars.push({ span, isHeadline });
          if (/\s/.test(char)) {
            fragment.appendChild(span);
          } else {
            word.appendChild(span);
          }
        });

        appendWord();
        node.replaceWith(fragment);
      });
    });

    const last = Math.max(1, chars.length - 1);
    chars.forEach(({ span, isHeadline }, index) => {
      span.style.setProperty("--char-ratio", ((index / last) * 0.94).toFixed(4));
    });

    if (sceneIndex >= 0 && chars.length > 0) {
      revealCopies.push({ copy, sceneIndex });
      copy.style.setProperty("--text-reveal", "0");
    }
  });

  decorativeTextBlocks.forEach((block) => {
    const scene = block.closest(".scene");
    const sceneIndex = scenes.indexOf(scene);
    const chars = [];
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const textNodes = [];

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    textNodes.forEach((node) => {
      const fragment = document.createDocumentFragment();

      [...node.textContent].forEach((char) => {
        const span = document.createElement("span");
        span.className = /\s/.test(char) ? "reveal-char reveal-space" : "reveal-char";
        span.textContent = /\s/.test(char) ? " " : char;
        chars.push(span);
        fragment.appendChild(span);
      });

      node.replaceWith(fragment);
    });

    const last = Math.max(1, chars.length - 1);
    chars.forEach((char, index) => {
      char.style.setProperty("--char-ratio", ((index / last) * 0.94).toFixed(4));
    });

    if (sceneIndex >= 0 && chars.length > 0) {
      const inner = document.createElement("span");
      inner.className = "decorative-type";

      while (block.firstChild) {
        inner.appendChild(block.firstChild);
      }

      block.appendChild(inner);
      const siblings = [...block.parentElement.children].filter((child) => child.tagName === block.tagName);
      const cardIndex = Math.max(0, siblings.indexOf(block));
      revealDecorations.push({ block, sceneIndex, cardIndex });
      block.style.setProperty("--text-reveal", "0");
      block.style.setProperty("--card-reveal", "0");
    }
  });
}

function updateTextReveal(storyProgress) {
  revealCopies.forEach(({ copy, sceneIndex }) => {
    const duration = sceneBaseDurations[sceneIndex];
    const start = scenePositions[sceneIndex];
    const sceneName = scenes[sceneIndex]?.dataset.scene;
    const textDelay = textRevealDelays.get(sceneName) ?? 0;
    const headlineSpeed = headlineTextSpeeds.get(sceneName) ?? headlineTextSpeed;
    const kickerSpeed = kickerTextSpeeds.get(sceneName) ?? 1;
    const revealWindow = textRevealWindows.get(sceneName) ?? Math.max(0.78, Math.min(1.45, duration * 0.68));
    const reveal = clamp((storyProgress - start - textDelay + 0.08) / revealWindow);
    const headlineReveal = clamp((storyProgress - start - textDelay + 0.08) / (revealWindow / headlineSpeed));
    const kickerReveal = clamp((storyProgress - start - textDelay + 0.08) / (revealWindow / kickerSpeed));

    copy.style.setProperty("--text-reveal", reveal.toFixed(4));
    copy.style.setProperty("--headline-reveal", headlineReveal.toFixed(4));
    copy.style.setProperty("--kicker-reveal", kickerReveal.toFixed(4));
  });

  revealDecorations.forEach(({ block, sceneIndex, cardIndex }) => {
    const duration = sceneBaseDurations[sceneIndex];
    const start = scenePositions[sceneIndex];
    const sceneName = scenes[sceneIndex]?.dataset.scene;
    const revealWindow = decorativeTextRevealWindows.get(sceneName) ?? Math.max(0.6, Math.min(1.1, duration * 0.48));
    const cardDelay = cardIndex * decorativeCardRevealDelay;
    const reveal = clamp((storyProgress - start + 0.04 - cardDelay) / revealWindow);
    const cardReveal = clamp((storyProgress - start + 0.12 - cardDelay) / 0.18);

    block.style.setProperty("--text-reveal", reveal.toFixed(4));
    block.style.setProperty("--card-reveal", cardReveal.toFixed(4));
  });
}

function isContentWarningVisible() {
  return contentWarning && !contentWarning.classList.contains("is-hidden");
}

function shouldRunInitialAutoplay() {
  return initialAutoplayEnabled &&
    !autoplayStarted &&
    autoplayStorage.getItem(autoplayStorageKey) !== "true" &&
    !window.location.hash &&
    !isContentWarningVisible();
}

function prepareAutoplayStart() {
  if (!shouldRunInitialAutoplay()) {
    hideLoadingGate();
    return;
  }

  if (autoplayPreparing) return;
  autoplayPreparing = true;
  showLoadingGate();

  Promise.all([
    preloadStoryAssets(),
    waitForPageLoad()
  ]).then(() => {
    finishLoadingProgress().then(() => {
      hideLoadingGate();
      autoplayPreparing = false;
      startInitialAutoplay();
    });
  });
}

function blockAutoplayInput(event) {
  if (!document.body.classList.contains("autoplay-lock")) return;
  event.preventDefault();
}

function completeInitialAutoplay() {
  autoplayFrame = null;
  document.body.classList.remove("autoplay-lock");
  autoplayStorage.setItem(autoplayStorageKey, "true");
  syncControlledTarget();
  update();
}

function startInitialAutoplay(initialElapsed = 0) {
  if (!shouldRunInitialAutoplay()) return;

  autoplayStarted = true;
  document.body.classList.add("autoplay-lock");
  renderInitialAutoplayAt(initialElapsed);

  const startedAt = performance.now() - initialElapsed;

  function tick(now) {
    const progress = clamp((now - startedAt) / autoplayDuration);

    renderInitialAutoplayAt(now - startedAt);

    if (progress < 1) {
      autoplayFrame = requestAnimationFrame(tick);
      return;
    }

    completeInitialAutoplay();
  }

  autoplayFrame = requestAnimationFrame(tick);
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function getSceneTextReadHoldDuration(index) {
  const scene = scenes[index];

  if (!scene?.querySelector(".copy")) return 0;
  return textReadHoldDurations.get(scene.dataset.scene) ?? textReadHoldDuration;
}

function getMaxScrollTop() {
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

function isScrollControlPaused() {
  return isContentWarningVisible() || document.body.classList.contains("autoplay-lock");
}

function syncControlledTarget() {
  controlledScroll.target = clamp(window.scrollY || document.documentElement.scrollTop, 0, getMaxScrollTop());
}

function animateControlledScroll() {
  const current = window.scrollY || document.documentElement.scrollTop;
  const distance = controlledScroll.target - current;

  if (Math.abs(distance) <= controlledScrollStopDistance) {
    controlledScroll.frame = null;
    window.scrollTo(0, controlledScroll.target);
    return;
  }

  window.scrollTo(0, current + distance * controlledScrollEase);
  controlledScroll.frame = requestAnimationFrame(animateControlledScroll);
}

function setControlledScrollTarget(target, immediate = false) {
  controlledScroll.target = clamp(target, 0, getMaxScrollTop());

  if (immediate) {
    if (controlledScroll.frame) {
      cancelAnimationFrame(controlledScroll.frame);
      controlledScroll.frame = null;
    }

    window.scrollTo(0, controlledScroll.target);
    update();
    return;
  }

  if (!controlledScroll.frame) {
    controlledScroll.frame = requestAnimationFrame(animateControlledScroll);
  }
}

function controlledScrollBy(delta) {
  if (isScrollControlPaused()) return;
  setControlledScrollTarget(controlledScroll.target + delta);
}

function normalizeWheelDelta(event) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 34;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * window.innerHeight;
  return event.deltaY;
}

function handleControlledWheel(event) {
  if (isScrollControlPaused()) return;
  event.preventDefault();

  const direction = Math.sign(normalizeWheelDelta(event));
  if (direction === 0) return;

  controlledScrollBy(direction * wheelStep);
}

function handleControlledTouchStart(event) {
  if (isScrollControlPaused() || event.touches.length !== 1) return;
  controlledScroll.touchY = event.touches[0].clientY;
}

function handleControlledTouchMove(event) {
  if (isScrollControlPaused() || controlledScroll.touchY === null || event.touches.length !== 1) return;
  event.preventDefault();

  const nextY = event.touches[0].clientY;
  const delta = (controlledScroll.touchY - nextY) * touchStepScale;
  controlledScroll.touchY = nextY;
  controlledScrollBy(delta);
}

function handleControlledTouchEnd() {
  controlledScroll.touchY = null;
}

function isEditableTarget(target) {
  return target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function handleControlledKeydown(event) {
  if (isScrollControlPaused() || isEditableTarget(event.target)) return;

  const keyScrolls = new Map([
    ["ArrowDown", wheelStep],
    ["ArrowUp", -wheelStep],
    ["PageDown", window.innerHeight * 0.86],
    ["PageUp", -window.innerHeight * 0.86],
    [" ", window.innerHeight * (event.shiftKey ? -0.86 : 0.86)],
    ["Home", -getMaxScrollTop()],
    ["End", getMaxScrollTop()]
  ]);
  const delta = keyScrolls.get(event.key);

  if (delta === undefined) return;
  event.preventDefault();

  if (event.key === "Home") {
    setControlledScrollTarget(0);
    return;
  }

  if (event.key === "End") {
    setControlledScrollTarget(getMaxScrollTop());
    return;
  }

  controlledScrollBy(delta);
}

function smoothstep(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function sceneVisibility(distance, index) {
  const sceneName = scenes[index]?.dataset.scene;
  const fullVisibilityDistance = sceneName === "day" ? 0.06 : sceneName === "scare" ? 0.02 : 0.22;
  const exitFadeWidth = sceneName === "day" ? 0.22 : sceneName === "scare" ? 0.06 : fadeWidth;

  if (distance <= fullVisibilityDistance) return 1;
  return smoothstep(1 - (distance - fullVisibilityDistance) / exitFadeWidth);
}

function sceneDistance(storyProgress, index) {
  const start = scenePositions[index];
  const sceneName = scenes[index]?.dataset.scene;
  const duration = sceneName === "day" ? sceneDurations[index] : sceneBaseDurations[index];
  const readHold = getSceneTextReadHoldDuration(index);
  const enterOffset = sceneName === "scare" ? 0.1 : 0;
  const holdRatio = sceneName === "day" ? 0.62 : 0.74;
  const breathAfterTextHold = (maxStoryProgress / (autoplayDuration / 1000)) * 1.45;
  const breathRevealWindow = Math.max(0.78, Math.min(1.45, duration * 0.68));
  const breathTextComplete = start - 0.08 + (breathRevealWindow / (headlineTextSpeeds.get("breath") ?? headlineTextSpeed));
  const holdEnd = sceneName === "breath"
    ? breathTextComplete + breathAfterTextHold
    : start + Math.max(0.7, duration * holdRatio) + readHold;

  if (storyProgress < start + enterOffset) return start + enterOffset - storyProgress;
  if (index === lastSceneIndex) return 0;
  if (storyProgress > holdEnd) return storyProgress - holdEnd;
  return 0;
}

function sceneScrollTop(sceneIndex) {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const targetPosition = (scenePositions[sceneIndex] ?? 0) + sceneAnchorOffsets[sceneIndex];
  return maxScroll * (targetPosition / maxStoryProgress);
}

function scrollToScene(sceneIndex, behavior = "smooth") {
  setControlledScrollTarget(sceneScrollTop(sceneIndex), behavior === "auto");
}

function returnToForestEntrance(event) {
  event.preventDefault();

  if (!returnFade) {
    setControlledScrollTarget(0, true);
    return;
  }

  returnFade.classList.add("is-active");

  window.setTimeout(() => {
    setControlledScrollTarget(0, true);
    history.replaceState(null, "", window.location.pathname + window.location.search);

    window.setTimeout(() => {
      returnFade.classList.remove("is-active");
    }, 240);
  }, 940);
}

function syncScrollAnchors() {
  const sceneHeight = Number.parseFloat(getComputedStyle(root).getPropertyValue("--scene-count")) * 280;

  scrollAnchors.forEach((anchor) => {
    const sceneIndex = sceneIndexByName.get(anchor.id);
    if (sceneIndex === undefined) return;

    const targetPosition = scenePositions[sceneIndex] + sceneAnchorOffsets[sceneIndex];
    anchor.style.top = `${(targetPosition / (maxStoryProgress + 1)) * sceneHeight}vh`;
  });
}

function update() {
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const progress = maxScroll > 0 ? clamp(scrollTop / maxScroll) : 0;
  const displayScrollTop = controlledScroll.frame ? controlledScroll.target : scrollTop;
  const displayProgress = maxScroll > 0 ? clamp(displayScrollTop / maxScroll) : 0;
  const darkProgress = clamp((progress - 0.24) / 0.42);
  const headerProgress = clamp((progress - 0.08) / 0.34);
  const headerBg = 0.24 + headerProgress * 0.5;
  const headerBlur = 3 + headerProgress * 7;
  const storyProgress = progress * maxStoryProgress;
  const dayPosition = scenePositions[sceneIndexByName.get("day") ?? 0] ?? 0;
  const vanishPosition = scenePositions[sceneIndexByName.get("vanish") ?? 3] ?? 3;
  const uneasePosition = scenePositions[sceneIndexByName.get("unease") ?? 4] ?? 4;
  const stillnessPosition = scenePositions[sceneIndexByName.get("night") ?? sceneIndexByName.size] ?? maxStoryProgress;
  const chaseProgress = clamp((storyProgress - dayPosition) / Math.max(1, vanishPosition - dayPosition));
  const chaseRate = 1 + chaseProgress * 2.35;
  const afterVanish = smoothstep((storyProgress - uneasePosition + 0.1) / 0.32);
  const walkPhase = scrollTop / (38 / (1 + chaseProgress * 1.55));
  const stillness = smoothstep((storyProgress - stillnessPosition + 0.12) / 0.22);
  const vanishStillness = smoothstep((storyProgress - vanishPosition + 0.02) / 0.16) *
    (1 - smoothstep((storyProgress - uneasePosition + 0.06) / 0.24));
  const chaseBob = 2 + chaseProgress * 8;
  const chaseSway = 1 + chaseProgress * 4;
  const lookAroundBob = 1.4 + afterVanish * 1.4;
  const lookAroundSway = 2.4 + afterVanish * 1.6;
  const bobBase = storyProgress < uneasePosition ? chaseBob : lookAroundBob;
  const swayBase = storyProgress < uneasePosition ? chaseSway : lookAroundSway;
  const bob = Math.sin(walkPhase * chaseRate) * bobBase * (1 - vanishStillness) * (1 - stillness);
  const sway = Math.sin(walkPhase * (storyProgress < uneasePosition ? .68 : .24)) * swayBase * (1 - vanishStillness) * (1 - stillness);
  const watchedPosition = scenePositions[sceneIndexByName.get("watched") ?? 7] ?? 7;
  const gazeEndPosition = scenePositions[sceneIndexByName.get("breath") ?? sceneIndexByName.get("scare") ?? 12] ?? 12;
  const cartPosition = scenePositions[sceneIndexByName.get("cart") ?? sceneIndexByName.size] ?? maxStoryProgress;
  const panicPosition = scenePositions[sceneIndexByName.get("panic") ?? sceneIndexByName.size] ?? maxStoryProgress;
  const nightPosition = scenePositions[sceneIndexByName.get("night") ?? sceneIndexByName.size] ?? maxStoryProgress;
  const tauntPosition = scenePositions[sceneIndexByName.get("taunt") ?? sceneIndexByName.size] ?? maxStoryProgress;
  const breathPosition = scenePositions[sceneIndexByName.get("breath") ?? sceneIndexByName.get("scare") ?? 12] ?? maxStoryProgress;
  const firstApproachProgress = smoothstep((storyProgress - dayPosition) / Math.max(1, vanishPosition - dayPosition));
  const secondApproachProgress = smoothstep((storyProgress - uneasePosition) / Math.max(1, panicPosition - uneasePosition));
  const approachScale = firstApproachProgress * 0.3 + secondApproachProgress * 0.15;
  const tunnelProgress = smoothstep((storyProgress - dayPosition) / Math.max(1, panicPosition - dayPosition));
  const blackoutProgress = smoothstep((storyProgress - panicPosition) / Math.max(0.5, nightPosition - panicPosition));
  const tunnelExit = 1 - smoothstep((storyProgress - breathPosition + 0.08) / 0.16);
  const tunnelOpacity = clamp(tunnelProgress * 0.88 + blackoutProgress * 0.12) * tunnelExit;
  const tunnelCenter = 58 - tunnelProgress * 39 - blackoutProgress * 13;
  const easterEyeProgress = smoothstep((storyProgress - panicPosition + 0.12) / Math.max(0.8, tauntPosition - panicPosition + 0.16));
  const gazeOpacity = clamp((storyProgress - watchedPosition + 0.18) / 0.24) *
    (1 - clamp((storyProgress - gazeEndPosition + 0.26) / 0.1));
  const lateDarkOpacity = smoothstep((storyProgress - stillnessPosition + 0.08) / 0.18) *
    (1 - smoothstep((storyProgress - cartPosition + 0.15) / 0.45));
  root.style.setProperty("--progress", progress.toFixed(4));
  root.style.setProperty("--display-progress", displayProgress.toFixed(4));
  root.style.setProperty("--dark-progress", darkProgress.toFixed(4));
  root.style.setProperty("--header-bg", headerBg.toFixed(3));
  root.style.setProperty("--header-blur", `${headerBlur.toFixed(2)}px`);
  root.style.setProperty("--camera-bob", `${bob.toFixed(2)}px`);
  root.style.setProperty("--camera-sway", `${sway.toFixed(2)}px`);
  root.style.setProperty("--approach-scale", approachScale.toFixed(4));
  root.style.setProperty("--tunnel-opacity", tunnelOpacity.toFixed(4));
  root.style.setProperty("--tunnel-center", `${tunnelCenter.toFixed(2)}%`);
  root.style.setProperty("--easter-eye-progress", easterEyeProgress.toFixed(4));
  root.style.setProperty("--persistent-gaze-opacity", gazeOpacity.toFixed(4));
  root.style.setProperty("--late-dark-opacity", lateDarkOpacity.toFixed(4));

  let activeSceneIndex = 0;
  let activeSceneVisibility = -1;

  scenes.forEach((scene, index) => {
    const distance = sceneDistance(storyProgress, index);
    const visibility = sceneVisibility(distance, index);
    const localLead = scene.dataset.scene === "scare" ? 0 : 0.5;
    const local = clamp((storyProgress - scenePositions[index] + localLead) / sceneDurations[index]);
    const linear = clamp((storyProgress - scenePositions[index]) / sceneDurations[index]);
    const sparrowLead = index === 0 ? 0 : 0.34;
    const sparrowMotion = clamp((storyProgress - scenePositions[index] + sparrowLead) / sceneDurations[index]);
    if (scene.dataset.scene === "cart") {
      const sceneName = scene.dataset.scene;
      const duration = sceneBaseDurations[index];
      const textDelay = textRevealDelays.get(sceneName) ?? 0;
      const revealWindow = textRevealWindows.get(sceneName) ?? Math.max(0.78, Math.min(1.45, duration * 0.68));
      const bonkStart = scenePositions[index] + textDelay - 0.08 + revealWindow * 0.72;
      const bonkReveal = smoothstep((storyProgress - bonkStart) / 0.18);

      scene.style.setProperty("--bonk-reveal", bonkReveal.toFixed(4));
    }
    scene.style.setProperty("--scene-opacity", visibility.toFixed(4));
    scene.style.setProperty("--scene-visibility", visibility.toFixed(4));
    scene.style.setProperty("--scene-progress", local.toFixed(4));
    scene.style.setProperty("--scene-linear", linear.toFixed(4));
    if (scene.dataset.scene === "scare") {
      scene.style.setProperty("--scare-copy-reveal", smoothstep((linear - 0.24) / 0.22).toFixed(4));
    }
    scene.style.setProperty("--sparrow-motion", sparrowMotion.toFixed(4));
    scene.classList.toggle("is-active", visibility > 0.5);

    if (visibility > activeSceneVisibility) {
      activeSceneVisibility = visibility;
      activeSceneIndex = index;
    }
  });

  document.body.dataset.currentScene = scenes[activeSceneIndex]?.dataset.scene ?? "";
  updateTextReveal(storyProgress);
}

navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = link.getAttribute("href").slice(1);
    const sceneIndex = sceneIndexByName.get(target);

    if (sceneIndex === undefined) return;
    event.preventDefault();

    scrollToScene(sceneIndex);
  });
});

returnButtons.forEach((button) => {
  button.addEventListener("click", returnToForestEntrance);
});

function scrollToInitialHash() {
  const target = window.location.hash.slice(1);
  const sceneIndex = sceneIndexByName.get(target);

  if (sceneIndex === undefined) return;
  requestAnimationFrame(() => {
    scrollToScene(sceneIndex, "auto");
    update();
  });
}

syncScrollAnchors();
window.addEventListener("scroll", update, { passive: true });
window.addEventListener("resize", () => {
  syncScrollAnchors();
  syncControlledTarget();
  update();
});
window.addEventListener("hashchange", scrollToInitialHash);
window.addEventListener("wheel", blockAutoplayInput, { passive: false });
window.addEventListener("touchmove", blockAutoplayInput, { passive: false });
window.addEventListener("keydown", blockAutoplayInput);
window.addEventListener("wheel", handleControlledWheel, { passive: false });
window.addEventListener("touchstart", handleControlledTouchStart, { passive: true });
window.addEventListener("touchmove", handleControlledTouchMove, { passive: false });
window.addEventListener("touchend", handleControlledTouchEnd);
window.addEventListener("touchcancel", handleControlledTouchEnd);
window.addEventListener("keydown", handleControlledKeydown);
prepareTextReveal();
update();
syncControlledTarget();
scrollToInitialHash();
prepareAutoplayStart();
