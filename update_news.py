#!/usr/bin/env python3
"""AltBrief public RSS collector. Standard library only."""
from __future__ import annotations

import hashlib
import html
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "news.json"
MAX_ARTICLES = 140
CUTOFF_DAYS = 45

FEEDS = [
    ("Private Equity", 'private equity fund final close OR fundraising OR acquisition when:14d', "en-US", "US", "US:en"),
    ("Private Credit", 'private credit OR direct lending fund OR asset based lending when:14d', "en-US", "US", "US:en"),
    ("Infrastructure", 'infrastructure fund investment OR final close OR energy transition fund when:14d', "en-US", "US", "US:en"),
    ("Real Estate", 'real estate private equity fund OR real estate debt fund when:14d', "en-US", "US", "US:en"),
    ("Secondaries", 'private markets secondaries fund OR continuation fund when:14d', "en-US", "US", "US:en"),
    ("GP Stakes", 'GP stakes fund OR asset manager minority stake when:30d', "en-US", "US", "US:en"),
    ("ABF", 'asset backed finance private credit OR asset based finance fund when:30d', "en-US", "US", "US:en"),
    ("SRT", 'significant risk transfer SRT bank private credit when:30d', "en-US", "US", "US:en"),
    ("CLO", 'CLO equity fund OR collateralized loan obligation manager when:14d', "en-US", "US", "US:en"),
    ("국내 LP", '국민연금 OR 한국투자공사 OR 공제회 OR 우정사업본부 대체투자 출자 펀드 when:30d', "ko", "KR", "KR:ko"),
    ("Private Markets", 'Apollo OR Blackstone OR KKR OR Ares OR Carlyle OR Brookfield alternative investments when:14d', "en-US", "US", "US:en"),
]

CATEGORY_RULES = [
    ("국내 LP", re.compile(r"국민연금|한국투자공사|공제회|우정사업본부|사학연금|교직원공제회", re.I)),
    ("SRT", re.compile(r"significant risk transfer|\bsrt\b|risk transfer transaction", re.I)),
    ("ABF", re.compile(r"asset[- ]backed finance|asset[- ]based finance|specialty finance", re.I)),
    ("CLO", re.compile(r"\bclo\b|collateralized loan obligation", re.I)),
    ("GP Stakes", re.compile(r"gp stakes|minority stake in .*manager|asset manager stake", re.I)),
    ("Secondaries", re.compile(r"secondar(?:y|ies)|continuation fund|gp-led", re.I)),
    ("Infrastructure", re.compile(r"infrastructure|energy transition|renewable|data cent(?:er|re)", re.I)),
    ("Real Estate", re.compile(r"real estate|property fund|commercial property", re.I)),
    ("Private Credit", re.compile(r"private credit|direct lending|private debt|middle market lending", re.I)),
    ("Private Equity", re.compile(r"private equity|buyout|growth equity", re.I)),
]

IMPLICATIONS = {
    "Private Equity": "진입 밸류에이션, 운용사의 섹터 전문성과 회수 경로",
    "Private Credit": "담보 구조, 선순위 비중, 스프레드와 손실보호 조항",
    "Infrastructure": "계약형 현금흐름, 규제 노출, 개발단계 및 전력가격 위험",
    "Real Estate": "자산별 임대현황, 리파이낸싱 일정과 금리 민감도",
    "Secondaries": "할인율, NAV 기준일, 기초자산 집중도와 잔존기간",
    "GP Stakes": "수익배분 구조, GP 성장 가정과 핵심인력 의존도",
    "ABF": "기초자산 성과, 오리진ेशन 채널, 트리거 및 선순위 보호",
    "SRT": "참조 포트폴리오의 신용도, 손실구간과 규제자본 효과",
    "CLO": "빈티지, 담보대출 품질, 매니저 트랙레코드와 트랜치 구조",
    "국내 LP": "출자 일정, 제안요청서 요건과 전략별 목표 비중",
    "Private Markets": "거래 구조, 기대수익과 주요 하방위험",
}

EVENT_LABELS = {
    "Fundraising": "펀드레이징",
    "Investment": "투자·인수",
    "Product Launch": "신규 전략 출시",
    "People": "인사·조직",
    "Exit": "회수",
    "Regulation": "규제",
    "LP Activity": "기관 출자",
    "Market Update": "시장 동향",
}


def fetch_xml(category: str, query: str, hl: str, gl: str, ceid: str) -> list[dict]:
    params = urllib.parse.urlencode({"q": query, "hl": hl, "gl": gl, "ceid": ceid})
    url = f"https://news.google.com/rss/search?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "AltBrief/3.0 public RSS reader"})
    with urllib.request.urlopen(req, timeout=20) as response:
        payload = response.read()
    root = ET.fromstring(payload)
    articles = []
    for item in root.findall(".//item")[:18]:
        raw_title = text(item.find("title"))
        link = text(item.find("link"))
        source = text(item.find("source")) or "Google News"
        title = re.sub(rf"\s+-\s+{re.escape(source)}$", "", html.unescape(raw_title), flags=re.I).strip()
        description = strip_html(html.unescape(text(item.find("description"))))
        published = parse_date(text(item.find("pubDate")))
        if not title or not link:
            continue
        actual_category = classify_category(title, category)
        event_type = classify_event(title)
        region = classify_region(title)
        articles.append({
            "id": "n-" + hashlib.sha1(f"{title}|{source}|{link}".encode("utf-8")).hexdigest()[:14],
            "title": title,
            "source": source,
            "published_at": published.isoformat(),
            "category": actual_category,
            "region": region,
            "event_type": event_type,
            "summary": build_summary(title, source, actual_category, event_type, description),
            "implication": build_implication(actual_category, event_type),
            "importance": score_importance(title, actual_category, event_type, region),
            "url": link,
        })
    return articles


def text(node) -> str:
    return node.text.strip() if node is not None and node.text else ""


def strip_html(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]*>", " ", value)).strip()


def parse_date(value: str) -> datetime:
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return datetime.now(timezone.utc)


def classify_category(title: str, fallback: str) -> str:
    for category, pattern in CATEGORY_RULES:
        if pattern.search(title):
            return category
    return fallback


def classify_event(title: str) -> str:
    lower = title.lower()
    if re.search(r"final close|first close|closes? .* fund|raised|raises|fundraising|commitment", lower):
        return "Fundraising"
    if re.search(r"acquire|acquisition|invests? in|buys|purchase|takeover", lower):
        return "Investment"
    if re.search(r"launch|unveil|new fund|strategy", lower):
        return "Product Launch"
    if re.search(r"appoint|hire|joins|names .* head|promotion", lower):
        return "People"
    if re.search(r"exit|sale|sells|ipo|distribution", lower):
        return "Exit"
    if re.search(r"regulation|rule|guidance|policy|capital requirement", lower):
        return "Regulation"
    if re.search(r"출자|선정|공고|위탁운용", title):
        return "LP Activity"
    return "Market Update"


def classify_region(title: str) -> str:
    lower = f" {title.lower()} "
    if re.search(r"korea|korean|한국|국내|국민연금|서울", lower):
        return "Korea"
    if re.search(r"japan|china|hong kong|singapore|india|asia|asian|australia", lower):
        return "Asia-Pacific"
    if re.search(r"europe|\buk\b|britain|germany|france|italy|spain|nordic", lower):
        return "Europe"
    if re.search(r"united states|u\.s\.|\bus\b|america|canada|north america", lower):
        return "North America"
    if re.search(r"middle east|uae|saudi|dubai", lower):
        return "Middle East"
    return "Global"


def build_summary(title: str, source: str, category: str, event_type: str, description: str) -> str:
    cleaned = description.replace(title, "").replace(source, "").strip()
    if len(cleaned) > 70 and "Google News" not in cleaned:
        return cleaned[:209].rstrip() + ("…" if len(cleaned) > 209 else "")
    return f"{source}가 {category} 분야의 {EVENT_LABELS.get(event_type, '시장 동향')} 관련 소식을 전했습니다. 원문에서 거래 규모, 투자자 구성과 향후 일정을 확인할 수 있습니다."


def build_implication(category: str, event_type: str) -> str:
    if event_type == "Fundraising":
        action = "목표 규모와 클로징 진행률을 확인하고"
    elif event_type == "LP Activity":
        action = "잠재적인 세일즈 일정과 제출 요건을 확인하고"
    else:
        action = "원문의 수치와 거래 조건을 확인하고"
    return f"{action} {IMPLICATIONS.get(category, IMPLICATIONS['Private Markets'])}를 중심으로 검토할 필요가 있습니다."


def score_importance(title: str, category: str, event_type: str, region: str) -> int:
    lower = title.lower()
    score = 67
    if event_type in {"Fundraising", "LP Activity"}: score += 8
    if event_type == "Regulation": score += 6
    if re.search(r"\$|€|£|billion|\bbn\b|trillion|조원|억원", lower): score += 8
    if re.search(r"final close|first close|largest|record|exclusive|strategic", lower): score += 5
    if re.search(r"apollo|blackstone|kkr|ares|carlyle|brookfield|oaktree|blackrock|goldman sachs|jpmorgan|canyon|hps|blue owl|sixth street", lower): score += 5
    if category == "국내 LP" or region == "Korea": score += 7
    return min(99, score)


def normalize_title(title: str) -> str:
    return re.sub(r"[^a-z0-9가-힣]", "", title.lower())[:100]


def load_existing() -> dict:
    try:
        return json.loads(OUTPUT.read_text(encoding="utf-8"))
    except Exception:
        return {"articles": []}


def main() -> int:
    now = datetime.now(timezone.utc)
    collected: list[dict] = []
    errors: list[str] = []
    for feed in FEEDS:
        try:
            collected.extend(fetch_xml(*feed))
        except Exception as exc:
            errors.append(f"{feed[0]}: {type(exc).__name__}: {exc}")

    seen: set[str] = set()
    cutoff = now - timedelta(days=CUTOFF_DAYS)
    deduped = []
    for item in sorted(collected, key=lambda x: x["published_at"], reverse=True):
        key = normalize_title(item["title"])
        try:
            published = datetime.fromisoformat(item["published_at"].replace("Z", "+00:00"))
        except Exception:
            published = now
        if not key or key in seen or published < cutoff:
            continue
        seen.add(key)
        deduped.append(item)
        if len(deduped) >= MAX_ARTICLES:
            break

    existing = load_existing()
    if deduped:
        articles = deduped
        live = True
        mode = "github-actions-public-rss"
    else:
        articles = existing.get("articles") or []
        live = bool(existing.get("live"))
        mode = "preserved-previous-data"

    payload = {
        "articles": articles,
        "updated_at": now.isoformat(),
        "live": live,
        "mode": mode,
        "source_count": len(FEEDS),
        "errors": errors[:8],
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"AltBrief: {len(articles)} articles, {len(errors)} feed errors, live={live}")
    for error in errors:
        print(error, file=sys.stderr)
    return 0 if articles else 1


if __name__ == "__main__":
    raise SystemExit(main())
