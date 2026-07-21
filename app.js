const OFFLINE_SAMPLE = [
  { id:"offline-1", title:"대체투자 뉴스 연결을 준비하고 있습니다", source:"AltBrief", published_at:new Date().toISOString(), category:"Private Credit", region:"Global", event_type:"Market Update", summary:"첫 자동 수집이 완료되기 전 표시되는 안내입니다. GitHub Actions 실행이 끝나면 실제 기사로 교체됩니다.", implication:"정식 기사 분석 전 원문과 운용사 공식 자료를 우선 확인하세요.", importance:80, url:"#" }
];

const state = {
  articles: [], filtered: [], categories: ["전체"], activeCategory: "전체",
  query: "", sort: "latest", view: "feed",
  favorites: new Set(JSON.parse(localStorage.getItem("altbrief-favorites") || "[]")),
  deferredPrompt: null, live: false
};
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const els = {
  list: $("#newsList"), empty: $("#emptyState"), chips: $("#categoryChips"), search: $("#searchInput"),
  sort: $("#sortSelect"), refresh: $("#refreshButton"), today: $("#todayCount"), priority: $("#priorityCount"),
  categoryCount: $("#categoryCount"), updated: $("#updatedTime"), liveBadge: $("#liveBadge"),
  sourceStatus: $("#sourceStatus"), updatedSide: $("#updatedSide"), brief: $("#briefList"), toast: $("#toast"),
  pageTitle: $("#pageTitle"), pageDescription: $("#pageDescription"), resultTitle: $("#resultTitle"),
  resultLabel: $("#resultLabel"), dialog: $("#settingsDialog"), install: $("#installButton"),
  installMobile: $("#installButtonMobile"), dashboard: $("#dashboardSection"), controls: $("#controlsSection")
};

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" }).format(new Date(value));
}
function formatTime(value) {
  return new Intl.DateTimeFormat("ko-KR", { hour:"2-digit", minute:"2-digit" }).format(new Date(value));
}
function showToast(message) {
  els.toast.textContent = message; els.toast.classList.add("show"); clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2300);
}
function saveFavorites() { localStorage.setItem("altbrief-favorites", JSON.stringify([...state.favorites])); }

async function fetchNews(force = false) {
  document.body.classList.add("loading");
  els.refresh.disabled = true;
  els.refresh.innerHTML = force ? "<span>↻</span> 확인 중…" : "<span>↻</span> 불러오는 중…";
  try {
    const response = await fetch(`./news.json${force ? `?t=${Date.now()}` : ""}`, { cache: force ? "no-store" : "default" });
    if (!response.ok) throw new Error(`데이터 응답 ${response.status}`);
    const data = await response.json();
    state.articles = data.articles?.length ? data.articles : OFFLINE_SAMPLE;
    state.live = Boolean(data.live);
    localStorage.setItem("altbrief-news-cache", JSON.stringify(data));
    state.categories = ["전체", ...new Set(state.articles.map((item) => item.category))];
    renderChips(); updateStats(data.updated_at); applyFilters();
    if (force) showToast("배포된 최신 데이터를 확인했습니다.");
  } catch (error) {
    console.error(error);
    const cached = JSON.parse(localStorage.getItem("altbrief-news-cache") || "null");
    if (cached?.articles?.length) {
      state.articles = cached.articles;
      state.live = Boolean(cached.live);
      updateStats(cached.updated_at);
      showToast("오프라인 저장 데이터를 표시합니다.");
    } else {
      state.articles = OFFLINE_SAMPLE;
      state.live = false;
      updateStats(new Date());
      showToast("첫 자동 수집 완료 후 실제 뉴스가 표시됩니다.");
    }
    state.categories = ["전체", ...new Set(state.articles.map((item) => item.category))];
    renderChips(); applyFilters();
  } finally {
    document.body.classList.remove("loading"); els.refresh.disabled = false; els.refresh.innerHTML = "<span>↻</span> 최신 데이터 확인";
  }
}

function renderChips() {
  els.chips.innerHTML = "";
  state.categories.forEach((category) => {
    const button = document.createElement("button");
    button.className = `chip ${state.activeCategory === category ? "active" : ""}`;
    button.textContent = category;
    button.addEventListener("click", () => { state.activeCategory = category; renderChips(); applyFilters(); });
    els.chips.appendChild(button);
  });
}

function updateStats(updatedAt) {
  const recent = state.articles.filter((a) => Date.now() - new Date(a.published_at).getTime() < 24 * 60 * 60 * 1000).length;
  els.today.textContent = recent || state.articles.length;
  els.priority.textContent = state.articles.filter((a) => a.importance >= 85).length;
  els.categoryCount.textContent = new Set(state.articles.map((a) => a.category)).size;
  els.updated.textContent = formatTime(updatedAt || new Date());
  els.liveBadge.textContent = state.live ? "auto RSS" : "sample";
  els.sourceStatus.textContent = state.live ? "자동 수집 정상" : "초기 데이터 표시";
  els.updatedSide.textContent = `${formatDate(updatedAt || new Date())} 업데이트`;
  $(".status-dot").style.background = state.live ? "var(--mint)" : "var(--gold)";
}

function applyFilters() {
  const q = state.query.trim().toLowerCase();
  let items = state.articles.filter((item) => {
    const categoryMatch = state.activeCategory === "전체" || item.category === state.activeCategory;
    const haystack = `${item.title} ${item.summary} ${item.source} ${item.region} ${item.category} ${item.event_type || ""}`.toLowerCase();
    const queryMatch = !q || haystack.includes(q);
    const savedMatch = state.view !== "saved" || state.favorites.has(item.id);
    return categoryMatch && queryMatch && savedMatch;
  });
  items.sort((a,b) => state.sort === "importance" ? b.importance - a.importance : new Date(b.published_at) - new Date(a.published_at));
  state.filtered = items; renderNews(); renderBrief(); renderWatch();
}

function renderNews() {
  els.list.innerHTML = ""; els.empty.classList.toggle("hidden", state.filtered.length > 0);
  const template = $("#newsCardTemplate");
  state.filtered.forEach((item) => {
    const fragment = template.content.cloneNode(true);
    fragment.querySelector(".category-tag").textContent = item.category;
    fragment.querySelector(".region-tag").textContent = item.region;
    fragment.querySelector(".event-tag").textContent = item.event_type || "Market Update";
    fragment.querySelector(".news-title").textContent = item.title;
    fragment.querySelector(".news-summary").textContent = item.summary;
    fragment.querySelector(".news-implication").textContent = item.implication;
    fragment.querySelector(".news-source").textContent = item.source;
    fragment.querySelector(".news-date").textContent = formatDate(item.published_at);
    fragment.querySelector(".importance-score").textContent = `${item.importance} / 100`;
    const link = fragment.querySelector(".article-link");
    if (!item.url || item.url === "#") { link.removeAttribute("href"); link.classList.add("disabled"); link.textContent = "연결 준비 중"; }
    else link.href = item.url;
    const save = fragment.querySelector(".save-button");
    const saved = state.favorites.has(item.id); save.classList.toggle("saved", saved); save.textContent = saved ? "♥" : "♡";
    save.addEventListener("click", () => {
      state.favorites.has(item.id) ? state.favorites.delete(item.id) : state.favorites.add(item.id);
      saveFavorites(); showToast(state.favorites.has(item.id) ? "뉴스를 저장했습니다." : "저장을 해제했습니다."); applyFilters();
    });
    els.list.appendChild(fragment);
  });
}

function renderBrief() {
  const top = [...state.articles].sort((a,b) => b.importance - a.importance).slice(0,4);
  els.brief.innerHTML = top.map((item,index) => `<div class="brief-item"><b>${index + 1}</b><div><strong>${escapeHtml(item.title)}</strong><small>${item.category} · ${item.importance}점</small></div></div>`).join("");
}
function renderWatch() {
  const counts = state.articles.reduce((acc,item) => { acc[item.category] = (acc[item.category] || 0) + 1; return acc; }, {});
  const top = Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0,3);
  if (!top.length) return;
  $("#watchList").innerHTML = top.map(([category,count],index) => `<li><span>${String(index + 1).padStart(2,"0")}</span>${category} 신규 뉴스 ${count}건</li>`).join("");
}
function escapeHtml(value) { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }

function setView(view) {
  state.view = view;
  $$('[data-view]').forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  els.dashboard.classList.toggle("hidden", view !== "feed");
  if (view === "feed") {
    els.pageTitle.innerHTML = "오늘의 시장을<br><em>빠르게 읽으세요.</em>";
    els.pageDescription.textContent = "대체투자 핵심 뉴스를 3시간마다 자동 수집해 자산군별로 정리합니다.";
    els.resultLabel.textContent = "LATEST INTELLIGENCE"; els.resultTitle.textContent = "최신 뉴스";
  } else if (view === "briefing") {
    els.pageTitle.innerHTML = "중요한 흐름만<br><em>한 번에 보세요.</em>";
    els.pageDescription.textContent = "중요도 점수와 자산군별 시사점을 기준으로 핵심 이슈를 정리했습니다.";
    els.resultLabel.textContent = "DAILY BRIEFING"; els.resultTitle.textContent = "핵심 뉴스 브리핑";
    state.sort = "importance"; els.sort.value = "importance";
  } else {
    els.pageTitle.innerHTML = "나중에 볼 뉴스를<br><em>한곳에 모으세요.</em>";
    els.pageDescription.textContent = "관심 있는 기사는 현재 휴대폰이나 PC에 안전하게 저장됩니다.";
    els.resultLabel.textContent = "SAVED INTELLIGENCE"; els.resultTitle.textContent = "저장한 뉴스";
  }
  applyFilters(); window.scrollTo({ top:0, behavior:"smooth" });
}

async function shareApp() {
  const data = { title:"AltBrief", text:"부서 대체투자 뉴스 앱", url:window.location.href };
  try {
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(window.location.href); showToast("공유 링크를 복사했습니다."); }
  } catch (error) { if (error.name !== "AbortError") showToast("주소창의 URL을 복사해 주세요."); }
}

els.search.addEventListener("input", (event) => { state.query = event.target.value; applyFilters(); });
els.sort.addEventListener("change", (event) => { state.sort = event.target.value; applyFilters(); });
els.refresh.addEventListener("click", () => fetchNews(true));
$("#dialogRefresh").addEventListener("click", () => fetchNews(true));
$$('[data-view]').forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
$("#openBriefing").addEventListener("click", () => setView("briefing"));
$("#openSettings").addEventListener("click", () => els.dialog.showModal());
$("#mobileSettings").addEventListener("click", () => els.dialog.showModal());
["#shareButton", "#shareButtonMobile", "#shareButtonSide", "#dialogShare"].forEach((selector) => $(selector)?.addEventListener("click", shareApp));
document.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); els.search.focus(); } });

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault(); state.deferredPrompt = event; els.install.classList.remove("hidden"); els.installMobile.classList.remove("hidden");
});
async function installApp() {
  if (!state.deferredPrompt) { showToast("브라우저 메뉴에서 ‘홈 화면에 추가’를 선택하세요."); return; }
  state.deferredPrompt.prompt(); await state.deferredPrompt.userChoice; state.deferredPrompt = null;
  els.install.classList.add("hidden"); els.installMobile.classList.add("hidden");
}
els.install.addEventListener("click", installApp); els.installMobile.addEventListener("click", installApp);
window.addEventListener("appinstalled", () => showToast("AltBrief가 설치되었습니다."));
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.error));
fetchNews(false);
