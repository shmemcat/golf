import { designs as originalDesigns } from "./designs.js";
import { designs as largerDesigns } from "./designs-large.js";
import { designs as refinedDesigns } from "./designs-refined.js";
import { designs as patternDesigns } from "./designs-patterns.js";
import { designs as textileDesigns } from "./designs-textiles.js";

const collections = {
  original: { designs: originalDesigns, first: 1, title: "The first 20 card backs.", intro: "The first collection, at table size for comparison.<br />The same sage, forest green, and blush palette.", storage: "golf.card-back-concepts.shortlist.v1", label: "first collection" },
  large: { designs: largerDesigns, first: 21, title: "20 bolder card backs.", intro: "Argyle-sized patterns. Simple, generous motifs.<br />10 patterns and 10 botanical or emblem designs.", storage: "golf.card-back-concepts.shortlist.large.v1", label: "larger motifs" },
  refined: { designs: refinedDesigns, first: 41, title: "A calmer collection.", intro: "Botanical silhouettes, classic repeats, and open space.<br />20 new designs, including two golf motifs.", storage: "golf.card-back-concepts.shortlist.refined.v1", label: "new collection" },
  patterns: { designs: patternDesigns, first: 81, title: "More patterns. A little larger.", intro: "The first collection’s style, with more generous repeats.<br />20 flat SVG patterns in the same palette.", storage: "golf.card-back-concepts.shortlist.patterns.v1", label: "larger pattern collection" },
  textiles: { designs: textileDesigns, first: 61, title: "The textile collection.", intro: "Gingham, checks, herringbone, and stripes.<br />20 flat SVG textile patterns in the Golf palette.", storage: "golf.card-back-concepts.shortlist.textiles.v1", label: "textile collection" },
};
const requestedCollection = new URL(location.href).searchParams.get("collection");
const collectionId = Object.hasOwn(collections, requestedCollection) ? requestedCollection : "patterns";
const collection = collections[collectionId];
const designs = collection.designs;
const firstNumber = collection.first;
document.title = `${collection.title.replace(/\.$/, "")} · Golf`;
document.getElementById("collection-title").textContent = collection.title;
document.getElementById("collection-intro").innerHTML = collection.intro;
for (const id of Object.keys(collections)) {
  const link = document.getElementById(`collection-${id}`);
  if (id === collectionId) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
}
document.getElementById("research-references").hidden = collectionId !== "refined";

const gallery = document.getElementById("gallery");
const filter = document.getElementById("shortlist-filter");
const dialog = document.getElementById("detail");
const detailPick = document.getElementById("detail-pick");
const copyButton = document.getElementById("copy-picks");
const storageKey = collection.storage;
let saved = [];
try {
  const value = JSON.parse(localStorage.getItem(storageKey) || "[]");
  if (Array.isArray(value)) saved = value.filter(id => designs.some(design => design.id === id));
} catch { /* The preview also works when browser storage is unavailable. */ }
const picks = new Set(saved);
let onlyPicks = false;
let current = 0;
let opener;

const number = index => String(index + firstNumber).padStart(2, "0");
const image = (design, theme, className = "") => `<img class="${className}" src="assets/${design.id}-${theme}.svg" width="240" height="336" alt="${design.name}, ${theme} mode" draggable="false" />`;

gallery.innerHTML = designs.map((design, index) => `<article class="concept" data-id="${design.id}">
  <div class="concept-header"><span class="number">${number(index)}</span><h3>${design.name}</h3></div>
  <button type="button" class="preview-pair" data-open="${index}" aria-label="Enlarge ${number(index)} ${design.name}, light and dark previews">
    ${["light", "dark"].map(theme => `<span class="swatch ${theme}">${image(design, theme)}<span class="swatch-label">${theme}</span></span>`).join("")}
  </button>
  <div class="concept-footer"><span class="family">${design.family}</span><button type="button" class="pick" data-pick="${design.id}" aria-pressed="false" aria-label="Shortlist ${number(index)} ${design.name}">+ Shortlist</button></div>
</article>`).join("");

function announce(message) {
  document.getElementById("announcement").textContent = message;
}

function update() {
  for (const article of gallery.children) {
    const selected = picks.has(article.dataset.id);
    article.hidden = onlyPicks && !selected;
    const button = article.querySelector(".pick");
    button.setAttribute("aria-pressed", String(selected));
    button.textContent = selected ? "✓ Shortlisted" : "+ Shortlist";
  }
  filter.setAttribute("aria-pressed", String(onlyPicks));
  filter.firstChild.textContent = onlyPicks ? "Show all · Picks " : "Shortlist ";
  document.getElementById("pick-count").textContent = picks.size;
  document.getElementById("empty").hidden = !(onlyPicks && picks.size === 0);
  copyButton.disabled = picks.size === 0;
  copyButton.textContent = "Copy picks";
  const selected = designs.flatMap((design, index) => picks.has(design.id) ? [`${number(index)} ${design.name}`] : []);
  document.getElementById("picks-summary").textContent = selected.length ? `Your picks: ${selected.join(" · ")}` : "No favorites yet.";
  const active = picks.has(designs[current].id);
  detailPick.setAttribute("aria-pressed", String(active));
  detailPick.textContent = active ? "✓ Shortlisted" : "+ Shortlist";
}

function togglePick(id) {
  if (picks.has(id)) picks.delete(id); else picks.add(id);
  try { localStorage.setItem(storageKey, JSON.stringify([...picks])); } catch { /* Selection still works for this visit. */ }
  update();
  announce(`${designs.find(design => design.id === id).name} ${picks.has(id) ? "added to" : "removed from"} shortlist. ${picks.size} selected.`);
}

function showDetail(index) {
  current = (index + designs.length) % designs.length;
  const design = designs[current];
  document.getElementById("detail-title").textContent = `${number(current)} · ${design.name}`;
  document.getElementById("detail-family").textContent = design.family;
  document.getElementById("detail-description").textContent = design.description;
  document.getElementById("detail-pair").innerHTML = ["light", "dark"].map(theme => `<section class="detail-swatch ${theme}" aria-label="${theme} mode"><h3>${theme} mode</h3>${image(design, theme, "detail-large")}<div class="game-size"><div>${image(design, theme, "opponent-size")}<span>Opponent · 56 px</span></div><div>${image(design, theme, "hand-size")}<span>Your hand · 76 px</span></div></div></section>`).join("");
  update();
  if (!dialog.open) dialog.showModal();
}

gallery.addEventListener("click", event => {
  const pick = event.target.closest("[data-pick]");
  if (pick) togglePick(pick.dataset.pick);
  const open = event.target.closest("[data-open]");
  if (open) {
    opener = open;
    showDetail(Number(open.dataset.open));
  }
});
filter.addEventListener("click", () => {
  onlyPicks = !onlyPicks;
  update();
  announce(onlyPicks ? `Showing ${picks.size} shortlisted designs.` : "Showing all 20 designs.");
});
document.querySelectorAll('input[name="mode"]').forEach(input => input.addEventListener("change", () => {
  gallery.dataset.mode = input.value;
  announce(input.value === "both" ? "Showing light and dark mode together." : `Showing ${input.value} mode.`);
}));
document.getElementById("preview-size").addEventListener("change", event => {
  const size = event.target.value;
  gallery.dataset.size = size;
  document.querySelector(".original-pair").style.setProperty("--reference-card-width", `${size}px`);
  const label = { 40: "compact size", 56: "opponent size", 76: "your hand size", 112: "enlarged size" }[size];
  document.getElementById("size-caption").textContent = `Shown at ${label}: ${size} px wide.`;
  announce(`Card previews changed to ${size} pixels wide.`);
});
detailPick.addEventListener("click", () => togglePick(designs[current].id));
document.getElementById("close-detail").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => {
  if (opener?.closest("article")?.hidden) filter.focus(); else opener?.focus();
});
document.getElementById("previous").addEventListener("click", () => showDetail(current - 1));
document.getElementById("next").addEventListener("click", () => showDetail(current + 1));
dialog.addEventListener("keydown", event => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    showDetail(current + (event.key === "ArrowLeft" ? -1 : 1));
  }
});
copyButton.addEventListener("click", async () => {
  const text = `My Golf card-back picks (${collection.label}): ${designs.flatMap((design, index) => picks.has(design.id) ? [`${number(index)} ${design.name}`] : []).join(", ")}.`;
  try {
    await navigator.clipboard.writeText(text);
    copyButton.textContent = "Copied";
    announce("Your picks were copied.");
  } catch {
    announce("Copy is unavailable. Your picks are listed at the bottom of the gallery.");
    document.getElementById("picks-summary").scrollIntoView({ block: "center" });
  }
});
update();
