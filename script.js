const root = document.documentElement;
const scenes = [...document.querySelectorAll(".scene")];
const navLinks = [...document.querySelectorAll('nav a[href^="#"]')];
const sceneCount = scenes.length;
const fadeWidth = 0.44;
const sceneIndexByName = new Map(scenes.map((scene, index) => [scene.dataset.scene, index]));
const sceneDurations = scenes.map((scene) => {
  const duration = Number(scene.dataset.duration);
  return Number.isFinite(duration) && duration > 0 ? duration : 1;
});
const scenePositions = sceneDurations.reduce((positions, duration, index) => {
  positions[index] = index === 0 ? 0 : positions[index - 1] + sceneDurations[index - 1];
  return positions;
}, []);
const maxStoryProgress = scenePositions[scenePositions.length - 1] || 1;

root.style.setProperty("--scene-count", (maxStoryProgress + 1).toFixed(2));

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
  if (duration <= 1) return Math.abs(storyProgress - start);

  const holdEnd = start + duration - 1;
  if (storyProgress < start) return start - storyProgress;
  if (storyProgress > holdEnd) return storyProgress - holdEnd;
  return 0;
}

function update() {
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const progress = maxScroll > 0 ? clamp(scrollTop / maxScroll) : 0;
  const darkProgress = clamp((progress - 0.24) / 0.42);
  const headerProgress = clamp((progress - 0.08) / 0.34);
  const headerBg = 0.24 + headerProgress * 0.5;
  const headerBlur = 3 + headerProgress * 7;
  const walkPhase = scrollTop / 38;
  const bob = Math.sin(walkPhase) * (2 + progress * 5);
  const sway = Math.sin(walkPhase * 0.5) * (1 + progress * 4);
  const storyProgress = progress * maxStoryProgress;
  const watchedPosition = scenePositions[sceneIndexByName.get("watched") ?? 7] ?? 7;
  const gazeEndPosition = scenePositions[sceneIndexByName.get("breath") ?? sceneIndexByName.get("scare") ?? 12] ?? 12;
  const gazeOpacity = clamp((storyProgress - watchedPosition + 0.18) / 0.24) *
    (1 - clamp((storyProgress - gazeEndPosition + 0.08) / 0.18));
  root.style.setProperty("--progress", progress.toFixed(4));
  root.style.setProperty("--dark-progress", darkProgress.toFixed(4));
  root.style.setProperty("--header-bg", headerBg.toFixed(3));
  root.style.setProperty("--header-blur", `${headerBlur.toFixed(2)}px`);
  root.style.setProperty("--camera-bob", `${bob.toFixed(2)}px`);
  root.style.setProperty("--camera-sway", `${sway.toFixed(2)}px`);
  root.style.setProperty("--persistent-gaze-opacity", gazeOpacity.toFixed(4));

  scenes.forEach((scene, index) => {
    const distance = sceneDistance(storyProgress, index);
    const visibility = sceneVisibility(distance);
    const local = clamp((storyProgress - scenePositions[index] + 0.5) / sceneDurations[index]);
    scene.style.setProperty("--scene-opacity", visibility.toFixed(4));
    scene.style.setProperty("--scene-visibility", visibility.toFixed(4));
    scene.style.setProperty("--scene-progress", local.toFixed(4));
    scene.classList.toggle("is-active", visibility > 0.5);
  });
}

navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = link.getAttribute("href").slice(1);
    const sceneIndex = sceneIndexByName.get(target);

    if (sceneIndex === undefined) return;
    event.preventDefault();

    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const targetPosition = scenePositions[sceneIndex];
    window.scrollTo({
      top: maxScroll * (targetPosition / maxStoryProgress),
      behavior: "smooth"
    });
  });
});

window.addEventListener("scroll", update, { passive: true });
window.addEventListener("resize", update);
update();
