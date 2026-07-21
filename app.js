const OFFLINE_SAMPLE = [{
  id: "offline-1",
  title: "실시간 뉴스 연결을 확인하고 있습니다",
  source: "AltBrief",
  published_at: new Date().toISOString(),
  category: "Private Markets",
  region: "Global",
  event_type: "Market Update",
  summary: "공개 RSS 변환 서비스 연결에 실패하면 기존 저장 데이터를 표시합니다.",
  implication: "원문과 운용사 공식 발표를 우선 확인하세요.",
  importance: 75,
  url: "#"
}];

const FEEDS = [
  ["Private Equity", "private equity fund final close fundraising acquisition when:14d", "en-US", "US", "US:en"],
  ["Private Credit", "private credit direct lending fund asset based lending when:14d", "en-US", "US", "US:en"],
  ["Infrastructure", "infrastructure fund investment energy transition final close when:14d", "en-US", "US", "US:en"],
  ["Real Estate", "real estate private equity debt fund when:14d", "en-US", "US", "US:en"],
  ["Secondaries", "private markets secondaries continuation fund when:14d", "en-US", "US", "US:en"],
  ["GP Stakes", "GP stakes asset manager minority stake when:30d", "en-US", "US", "US:en"],
  ["ABF", "asset backed finance asset based finance private credit when:30d", "en-US", "US", "US:en"],
  ["SRT", "significant risk transfer SRT bank private credit when:30d", "en-US", "US", "US:en"],
  ["CLO", "CLO equity fund collateralized loan obligation manager when:14d", "en-US", "US", "US:en"],
  ["국내 LP", "국민연금 한국투자공사 공제회 우정사업본부 대체투자 출자 when:30d", "ko", "KR", "KR:ko"]
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
  list: $("#newsList"), empty: $("#emptyState"), chips: $("#categoryChips"),
  search: $("#searchInput"), sort: $("#sortSelect"), refresh: $("#refreshButton"),
  today: $("#todayCount"), priority: $("#priorityCount"), categoryCount: $("#categoryCount"),
  updated: $("#updatedTime"), liveBadge: $("#liveBadge"), sourceStatus: $("#sourceStatus"),
  updatedSide: $("#updatedSide"), brief: $("#briefList"), toast: $("#toast"),
  pageTitle: $("#pageTitle"), pageDescription: $("#pageDescription"),
  resultTitle: $("#resultTitle"), resultLabel: $("#resultLabel"),
  dialog: $("#settingsDialog"), install: $("#installButton"),
  installMobile: $("#installButtonMobile"), dashboard: $("#dashboardSection"),
  controls: $("#controlsSection")
};

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
function formatTime(value) {
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
function showToast(message) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2300);
}
function saveFavorites() {
  localStorage.setItem("altbrief-favorites", JSON.stringify([...state.favorites]));
}
function stripHtml(value = "") {
  const div = document.createElement("div");
  div.innerHTML = value;
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}
function normalizeTitle(title = "") {
  return title.toLowerCase().replace(/[^a-z0-9가-힣]/g, "").slice(0, 120);
}
function hashText(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(36);
}
function classifyCategory(title, fallback) {
  const t = title.toLowerCase();
  const rules = [
    ["국내 LP", /국민연금|한국투자공사|공제회|우정사업본부|사학연금|교직원공제회/i],
    ["SRT", /significant risk transfer|\bsrt\b|risk transfer transaction/i],
    ["ABF", /asset[- ]backed finance|asset[- ]based finance|specialty finance/i],
    ["CLO", /\bclo\b|collateralized loan obligation/i],
    ["GP Stakes", /gp stakes|asset manager stake|minority stake.*manager/i],
    ["Secondaries", /secondar(y|ies)|continuation fund|gp-led/i],
    ["Infrastructure", /infrastructure|energy transition|renewable|data cent(er|re)/i],
    ["Real Estate", /real estate|property fund|commercial property/i],
    ["Private Credit", /private credit|direct lending|private debt|middle market lending/i],
    ["Private Equity", /private equity|buyout|growth equity/i]
  ];
  return (rules.find(([, pattern]) => pattern.test(t)) || [fallback])[0];
}
function classifyEvent(title) {
  const t = title.toLowerCase();
  if (/final close|first close|raised|raises|fundraising|commitment/.test(t)) return "Fundraising";
  if (/acquire|acquisition|invests? in|buys|purchase|takeover/.test(t)) return "Investment";
  if (/launch|unveil|new fund|strategy/.test(t)) return "Product Launch";
  if (/appoint|hire|joins|names .* head|promotion/.test(t)) return "People";
  if (/exit|sale|sells|ipo|distribution/.test(t)) return "Exit";
  if (/regulation|rule|guidance|policy|capital requirement/.test(t)) return "Regulation";
  if (/출자|선정|공고|위탁운용/.test(title)) return "LP Activity";
  return "Market Update";
}
function classifyRegion(title) {
  const t = ` ${title.toLowerCase()} `;
  if (/korea|korean|한국|국내|국민연금|서울/.test(t)) return "Korea";
  if (/japan|china|hong kong|singapore|india|asia|asian|australia/.test(t)) return "Asia-Pacific";
  if (/europe|\buk\b|britain|germany|france|italy|spain|nordic/.test(t)) return "Europe";
  if (/united states|u\.s\.|\bus\b|america|canada|north america/.test(t)) return "North America";
  if (/middle east|uae|saudi|dubai/.test(t)) return "Middle East";
  return "Global";
}
function scoreImportance(title, category, eventType, region) {
  const t = title.toLowerCase();
  let score = 67;
  if (["Fundraising", "LP Activity"].includes(eventType)) score += 8;
  if (eventType === "Regulation") score += 6;
  if (/\$|€|£|billion|\bbn\b|trillion|조원|억원/.test(t)) score += 8;
  if (/final close|first close|largest|record|exclusive|strategic/.test(t)) score += 5;
  if (/apollo|blackstone|kkr|ares|carlyle|brookfield|oaktree|blackrock|goldman sachs|jpmorgan|canyon|hps|blue owl|sixth street/.test(t)) score += 5;
  if (category === "국내 LP" || region === "Korea") score += 7;
  return Math.min(99, score);
}
function implicationFor(category, eventType) {
  const focus = {
    "Private Equity": "진입 밸류에이션, 운용사의 섹터 전문성과 회수 경로",
    "Private Credit": "담보 구조, 선순위 비중, 스프레드와 손실보호 조항",
    "Infrastructure": "계약형 현금흐름, 규제 노출과 개발단계 위험",
    "Real Estate": "임대현황, 리파이낸싱 일정과 금리 민감도",
    "Secondaries": "할인율, NAV 기준일과 잔존기간",
    "GP Stakes": "수익배분 구조, GP 성장 가정과 핵심인력 의존도",
    "ABF": "기초자산 성과, 오리진ेशन 채널과 트리거 구조",
    "SRT": "참조 포트폴리오 신용도와 손실구간",
    "CLO": "담보대출 품질, 매니저 트랙레코드와 트랜치 구조",
    "국내 LP": "출자 일정, 제안요청서 요건과 목표 비중"
  }[category] || "거래 구조, 기대수익과 주요 하방위험";
  const action = eventType === "Fundraising" ? "목표 규모와 클로징 진행률을 확인하고" : eventType === "LP Activity" ? "세일즈 일정과 제출 요건을 확인하고" : "원문의 수치와 거래 조건을 확인하고";
  return `${action} ${focus}를 중심으로 검토할 필요가 있습니다.`;
}
function toArticle(item, fallbackCategory) {
  const rawTitle = stripHtml(item.title || "");
  const source = stripHtml(item.author || item.feedTitle || "Google News");
  const title = rawTitle.replace(new RegExp(`\\s+-\\s+${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), "").trim();
  const category = classifyCategory(title, fallbackCategory);
  const eventType = classifyEvent(title);
  const region = classifyRegion(title);
  const description = stripHtml(item.description || item.content || "");
  return {
    id: `n-${hashText(`${title}|${source}|${item.link}`)}`,
    title,
    source,
    published_at: item.pubDate ? new Date(item.pubDate.replace(" ", "T") + "Z").toISOString() : new Date().toISOString(),
    category,
    region,
    event_type: eventType,
    summary: description && description.length > 50 ? description.slice(0, 220) + (description.length > 220 ? "…" : "") : `${source}가 ${category} 분야의 주요 시장 소식을 전했습니다. 원문에서 거래 규모와 향후 일정을 확인할 수 있습니다.`,
    implication: implicationFor(category, eventType),
    importance: scoreImportance(title, category, eventType, region),
    url: item.link || "#"
  };
}
function googleNewsRss(query, hl, gl, ceid) {
  const params = new URLSearchParams({ q: query, hl, gl, ceid });
  return `https://news.google.com/rss/search?${params.toString()}`;
}
async function fetchFeed(feed) {
  const [category, query, hl, gl, ceid] = feed;
  const rssUrl = googleNewsRss(query, hl, gl, ceid);
  const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
  const response = await fetch(apiUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`RSS API ${response.status}`);
  const data = await response.json();
  if (data.status !== "ok" || !Array.isArray(data.items)) throw new Error(data.message || "RSS 변환 실패");
  return data.items.slice(0, 12).map((item) => toArticle({ ...item, feedTitle: data.feed?.title }, category));
}
async function fetchLiveNews(force = false) {
  const cacheKey = "altbrief-live-cache-v1";
  if (!force) {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
      if (cached && Date.now() - cached.savedAt < 60 * 60 * 1000 && cached.articles?.length) return cached;
    } catch (_) {}
  }
  const settled = await Promise.allSettled(FEEDS.map(fetchFeed));
  const collected = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const seen = new Set();
  const articles = collected
    .filter((item) => {
      const key = normalizeTitle(item.title);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
    .slice(0, 100);
  if (!articles.length) throw new Error("실시간 RSS 결과 없음");
  const payload = { articles, updated_at: new Date().toISOString(), live: true, mode: "browser-rss", savedAt: Date.now() };
  localStorage.setItem(cacheKey, JSON.stringify(payload));
  return payload;
}
async function fetchNews(force = false) {
  document.body.classList.add("loading");
  if (els.refresh) {
    els.refresh.disabled = true;
    els.refresh.innerHTML = force ? "↻ 확인 중…" : "↻ 불러오는 중…";
  }
  try {
    let data;
    try {
      data = await fetchLiveNews(force);
    } catch (liveError) {
      console.warn("Live RSS failed", liveError);
      const response = await fetch(`./news.json${force ? `?t=${Date.now()}` : ""}`, { cache: force ? "no-store" : "default" });
      if (!response.ok) throw new Error(`데이터 응답 ${response.status}`);
      data = await response.json();
    }
    state.articles = data.articles?.length ? data.articles : OFFLINE_SAMPLE;
    state.live = Boolean(data.live);
    localStorage.setItem("altbrief-news-cache", JSON.stringify(data));
    state.categories = ["전체", ...new Set(state.articles.map((item) => item.category))];
    renderChips();
    updateStats(data.updated_at);
    applyFilters();
    if (force) showToast(state.live ? "실시간 뉴스를 새로 불러왔습니다." : "저장된 데이터를 확인했습니다.");
  } catch (error) {
    console.error(error);
    const cached = JSON.parse(localStorage.getItem("altbrief-news-cache") || "null");
    state.articles = cached?.articles?.length ? cached.articles : OFFLINE_SAMPLE;
    state.live = Boolean(cached?.live);
    state.categories = ["전체", ...new Set(state.articles.map((item) => item.category))];
    renderChips();
    updateStats(cached?.updated_at || new Date());
    applyFilters();
    showToast("뉴스 연결에 실패해 저장 데이터를 표시합니다.");
  } finally {
    document.body.classList.remove("loading");
    if (els.refresh) {
      els.refresh.disabled = false;
      els.refresh.innerHTML = "↻ 최신 뉴스 확인";
    }
  }
}
function renderChips() {
  if (!els.chips) return;
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
  if (els.today) els.today.textContent = recent || state.articles.length;
  if (els.priority) els.priority.textContent = state.articles.filter((a) => a.importance >= 85).length;
  if (els.categoryCount) els.categoryCount.textContent = new Set(state.articles.map((a) => a.category)).size;
  if (els.updated) els.updated.textContent = formatTime(updatedAt || new Date());
  if (els.liveBadge) els.liveBadge.textContent = state.live ? "live RSS" : "saved";
  if (els.sourceStatus) els.sourceStatus.textContent = state.live ? "열 때마다 자동 수집" : "저장 데이터 표시";
  if (els.updatedSide) els.updatedSide.textContent = `${formatDate(updatedAt || new Date())} 업데이트`;
  const dot = $(".status-dot");
  if (dot) dot.style.background = state.live ? "var(--mint)" : "var(--gold)";
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
  items.sort((a, b) => state.sort === "importance" ? b.importance - a.importance : new Date(b.published_at) - new Date(a.published_at));
  state.filtered = items;
  renderNews(); renderBrief(); renderWatch();
}
function renderNews() {
  if (!els.list) return;
  els.list.innerHTML = "";
  els.empty?.classList.toggle("hidden", state.filtered.length > 0);
  const template = $("#newsCardTemplate");
  if (!template) return;
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
    const saved = state.favorites.has(item.id);
    save.classList.toggle("saved", saved);
    save.textContent = saved ? "♥" : "♡";
    save.addEventListener("click", () => {
      state.favorites.has(item.id) ? state.favorites.delete(item.id) : state.favorites.add(item.id);
      saveFavorites(); showToast(state.favorites.has(item.id) ? "뉴스를 저장했습니다." : "저장을 해제했습니다."); applyFilters();
    });
    els.list.appendChild(fragment);
  });
}
function escapeHtml(value) { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }
function renderBrief() {
  if (!els.brief) return;
  const top = [...state.articles].sort((a, b) => b.importance - a.importance).slice(0, 4);
  els.brief.innerHTML = top.map((item, index) => `<article><strong>${index + 1}</strong><div><p>${escapeHtml(item.title)}</p><span>${item.category} · ${item.importance}점</span></div></article>`).join("");
}
function renderWatch() {
  const watch = $("#watchList"); if (!watch) return;
  const counts = state.articles.reduce((acc, item) => { acc[item.category] = (acc[item.category] || 0) + 1; return acc; }, {});
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  watch.innerHTML = top.map(([category, count], index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><p>${category} 신규 뉴스 ${count}건</p></li>`).join("");
}
function setView(view) {
  state.view = view;
  $$('[data-view]').forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  els.dashboard?.classList.toggle("hidden", view !== "feed");
  if (view === "feed") {
    els.pageTitle.innerHTML = "오늘의 시장을<br>빠르게 읽으세요.";
    els.pageDescription.textContent = "앱을 열거나 새로고침할 때 공개 RSS에서 대체투자 뉴스를 자동으로 가져옵니다.";
    els.resultLabel.textContent = "LATEST INTELLIGENCE"; els.resultTitle.textContent = "최신 뉴스";
  } else if (view === "briefing") {
    els.pageTitle.innerHTML = "중요한 흐름만<br>한 번에 보세요.";
    els.pageDescription.textContent = "중요도 점수와 자산군별 시사점을 기준으로 핵심 이슈를 정리했습니다.";
    els.resultLabel.textContent = "DAILY BRIEFING"; els.resultTitle.textContent = "핵심 뉴스 브리핑";
    state.sort = "importance"; if (els.sort) els.sort.value = "importance";
  } else {
    els.pageTitle.innerHTML = "나중에 볼 뉴스를<br>한곳에 모으세요.";
    els.pageDescription.textContent = "관심 있는 기사는 현재 휴대폰이나 PC에 저장됩니다.";
    els.resultLabel.textContent = "SAVED INTELLIGENCE"; els.resultTitle.textContent = "저장한 뉴스";
  }
  applyFilters(); window.scrollTo({ top: 0, behavior: "smooth" });
}
async function shareApp() {
  const data = { title: "AltBrief", text: "부서 대체투자 뉴스 앱", url: window.location.href };
  try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(window.location.href); showToast("공유 링크를 복사했습니다."); } }
  catch (error) { if (error.name !== "AbortError") showToast("주소창의 URL을 복사해 주세요."); }
}

els.search?.addEventListener("input", (event) => { state.query = event.target.value; applyFilters(); });
els.sort?.addEventListener("change", (event) => { state.sort = event.target.value; applyFilters(); });
els.refresh?.addEventListener("click", () => fetchNews(true));
$("#dialogRefresh")?.addEventListener("click", () => fetchNews(true));
$$('[data-view]').forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
$("#openBriefing")?.addEventListener("click", () => setView("briefing"));
$("#openSettings")?.addEventListener("click", () => els.dialog?.showModal());
$("#mobileSettings")?.addEventListener("click", () => els.dialog?.showModal());
["#shareButton", "#shareButtonMobile", "#shareButtonSide", "#dialogShare"].forEach((selector) => $(selector)?.addEventListener("click", shareApp));
document.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); els.search?.focus(); } });
window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); state.deferredPrompt = event; els.install?.classList.remove("hidden"); els.installMobile?.classList.remove("hidden"); });
async function installApp() {
  if (!state.deferredPrompt) { showToast("브라우저 메뉴에서 ‘홈 화면에 추가’를 선택하세요."); return; }
  state.deferredPrompt.prompt(); await state.deferredPrompt.userChoice; state.deferredPrompt = null;
  els.install?.classList.add("hidden"); els.installMobile?.classList.add("hidden");
}
els.install?.addEventListener("click", installApp);
els.installMobile?.addEventListener("click", installApp);
window.addEventListener("appinstalled", () => showToast("AltBrief가 설치되었습니다."));
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.error));
if (els.pageDescription) els.pageDescription.textContent = "앱을 열거나 새로고침할 때 공개 RSS에서 대체투자 뉴스를 자동으로 가져옵니다.";
fetchNews(false);
