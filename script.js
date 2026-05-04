const root = document.documentElement;
const scenes = [...document.querySelectorAll(".scene")];
const navLinks = [...document.querySelectorAll('nav a[href^="#"]')];
const copyBlocks = [...document.querySelectorAll(".scene .copy")];
const contentWarning = document.querySelector(".content-warning");
const warningEnter = document.querySelector(".warning-enter");
const warningSkip = document.querySelector(".warning-skip");
const warningStorageKey = "mistia-content-warning-dismissed";
const autoplayStorageKey = "mistia-initial-autoplay-complete";
const durationScale = 1.72;
const autoplayDuration = 180000;
const sceneCount = scenes.length;
const textRevealDelays = new Map([
  ["cart", 1.32]
]);
const fadeWidth = 0.44;
const sceneIndexByName = new Map(scenes.map((scene, index) => [scene.dataset.scene, index]));
const scrollAnchors = [...document.querySelectorAll(".scroll-track span[id]")];
const sceneDurations = scenes.map((scene) => {
  const duration = Number(scene.dataset.duration);
  return (Number.isFinite(duration) && duration > 0 ? duration : 1) * durationScale;
});
const sceneAnchorOffsets = scenes.map((scene) => {
  const offset = Number(scene.dataset.anchorOffset);
  return Number.isFinite(offset) && offset > 0 ? offset : 0;
});
const scenePositions = sceneDurations.reduce((positions, duration, index) => {
  positions[index] = index === 0 ? 0 : positions[index - 1] + sceneDurations[index - 1];
  return positions;
}, []);
const maxStoryProgress = scenePositions[scenePositions.length - 1] || 1;
const revealCopies = [];
let autoplayFrame = null;
let autoplayStarted = false;

root.style.setProperty("--scene-count", (maxStoryProgress + 1).toFixed(2));

function hideContentWarning(remember = false) {
  if (!contentWarning) return;
  contentWarning.classList.add("is-hidden");
  document.body.classList.remove("warning-open");

  if (remember) {
    localStorage.setItem(warningStorageKey, "true");
  }

  startInitialAutoplay();
}

if (contentWarning) {
  const warningDismissed = localStorage.getItem(warningStorageKey) === "true";

  if (warningDismissed) {
    hideContentWarning();
  } else {
    document.body.classList.add("warning-open");
    warningEnter?.focus({ preventScroll: true });
  }

  warningEnter?.addEventListener("click", () => hideContentWarning());
  warningSkip?.addEventListener("click", () => hideContentWarning(true));
}

function prepareTextReveal() {
  copyBlocks.forEach((copy) => {
    const scene = copy.closest(".scene");
    const sceneIndex = scenes.indexOf(scene);
    const textBlocks = [...copy.querySelectorAll("h1, h2, p:not(.eyebrow):not(.ending-kicker)")];
    const chars = [];

    textBlocks.forEach((block) => {
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
    });

    const last = Math.max(1, chars.length - 1);
    chars.forEach((char, index) => {
      char.style.setProperty("--char-ratio", ((index / last) * 0.94).toFixed(4));
    });

    if (sceneIndex >= 0 && chars.length > 0) {
      revealCopies.push({ copy, sceneIndex });
      copy.style.setProperty("--text-reveal", "0");
    }
  });
}

function updateTextReveal(storyProgress) {
  revealCopies.forEach(({ copy, sceneIndex }) => {
    const duration = sceneDurations[sceneIndex];
    const start = scenePositions[sceneIndex];
    const sceneName = scenes[sceneIndex]?.dataset.scene;
    const textDelay = textRevealDelays.get(sceneName) ?? 0;
    const revealWindow = Math.max(0.78, Math.min(1.45, duration * 0.68));
    const reveal = clamp((storyProgress - start - textDelay + 0.08) / revealWindow);

    copy.style.setProperty("--text-reveal", reveal.toFixed(4));
  });
}

function isContentWarningVisible() {
  return contentWarning && !contentWarning.classList.contains("is-hidden");
}

function shouldRunInitialAutoplay() {
  return !autoplayStarted &&
    localStorage.getItem(autoplayStorageKey) !== "true" &&
    !window.location.hash &&
    !isContentWarningVisible();
}

function blockAutoplayInput(event) {
  if (!document.body.classList.contains("autoplay-lock")) return;
  event.preventDefault();
}

function completeInitialAutoplay() {
  autoplayFrame = null;
  document.body.classList.remove("autoplay-lock");
  localStorage.setItem(autoplayStorageKey, "true");
  update();
}

function startInitialAutoplay() {
  if (!shouldRunInitialAutoplay()) return;

  autoplayStarted = true;
  document.body.classList.add("autoplay-lock");
  window.scrollTo(0, 0);
  update();

  const startedAt = performance.now();

  function tick(now) {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const progress = clamp((now - startedAt) / autoplayDuration);
    const eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    window.scrollTo(0, maxScroll * eased);
    update();

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

function smoothstep(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function sceneVisibility(distance) {
  if (distance <= 0.22) return 1;
  return smoothstep(1 - (distance - 0.22) / fadeWidth);
}

function sceneDistance(storyProgress, index) {
  const start = scenePositions[index];
  const duration = sceneDurations[index];
  const holdEnd = start + Math.max(0.7, duration * 0.74);

  if (storyProgress < start) return start - storyProgress;
  if (storyProgress > holdEnd) return storyProgress - holdEnd;
  return 0;
}

function sceneScrollTop(sceneIndex) {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const targetPosition = (scenePositions[sceneIndex] ?? 0) + sceneAnchorOffsets[sceneIndex];
  return maxScroll * (targetPosition / maxStoryProgress);
}

function scrollToScene(sceneIndex, behavior = "smooth") {
  window.scrollTo({
    top: sceneScrollTop(sceneIndex),
    behavior
  });
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
  const gazeOpacity = clamp((storyProgress - watchedPosition + 0.18) / 0.24) *
    (1 - clamp((storyProgress - gazeEndPosition + 0.08) / 0.18));
  const lateDarkOpacity = smoothstep((storyProgress - stillnessPosition + 0.08) / 0.18) *
    (1 - smoothstep((storyProgress - cartPosition + 0.15) / 0.45));
  root.style.setProperty("--progress", progress.toFixed(4));
  root.style.setProperty("--dark-progress", darkProgress.toFixed(4));
  root.style.setProperty("--header-bg", headerBg.toFixed(3));
  root.style.setProperty("--header-blur", `${headerBlur.toFixed(2)}px`);
  root.style.setProperty("--camera-bob", `${bob.toFixed(2)}px`);
  root.style.setProperty("--camera-sway", `${sway.toFixed(2)}px`);
  root.style.setProperty("--persistent-gaze-opacity", gazeOpacity.toFixed(4));
  root.style.setProperty("--late-dark-opacity", lateDarkOpacity.toFixed(4));

  scenes.forEach((scene, index) => {
    const distance = sceneDistance(storyProgress, index);
    const visibility = sceneVisibility(distance);
    const local = clamp((storyProgress - scenePositions[index] + 0.5) / sceneDurations[index]);
    const linear = clamp((storyProgress - scenePositions[index]) / sceneDurations[index]);
    const sparrowLead = index === 0 ? 0 : 0.34;
    const sparrowMotion = clamp((storyProgress - scenePositions[index] + sparrowLead) / sceneDurations[index]);
    scene.style.setProperty("--scene-opacity", visibility.toFixed(4));
    scene.style.setProperty("--scene-visibility", visibility.toFixed(4));
    scene.style.setProperty("--scene-progress", local.toFixed(4));
    scene.style.setProperty("--scene-linear", linear.toFixed(4));
    scene.style.setProperty("--sparrow-motion", sparrowMotion.toFixed(4));
    scene.classList.toggle("is-active", visibility > 0.5);
  });

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
  update();
});
window.addEventListener("hashchange", scrollToInitialHash);
window.addEventListener("wheel", blockAutoplayInput, { passive: false });
window.addEventListener("touchmove", blockAutoplayInput, { passive: false });
window.addEventListener("keydown", blockAutoplayInput);
prepareTextReveal();
update();
scrollToInitialHash();
startInitialAutoplay();
