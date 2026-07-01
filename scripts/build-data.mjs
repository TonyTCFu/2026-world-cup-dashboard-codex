import { mkdir, writeFile } from "node:fs/promises";

const SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719";
const STANDINGS_URL =
  "https://site.web.api.espn.com/apis/v2/sports/soccer/fifa.world/standings";
const OUTPUT_DIR = new URL("../data/", import.meta.url);
const OUTPUT_FILE = new URL("../data/latest.json", import.meta.url);
const FIFA_SCHEDULE_URL =
  "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures";
const FIFA_STANDINGS_URL =
  "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/standings";
const SUMMARY_URL = (eventId) =>
  `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${eventId}`;
const TEAM_NAME_MAP = {
  Algeria: "阿尔及利亚",
  Argentina: "阿根廷",
  Australia: "澳大利亚",
  Austria: "奥地利",
  Belgium: "比利时",
  "Bosnia-Herzegovina": "波黑",
  Brazil: "巴西",
  Canada: "加拿大",
  "Cape Verde": "佛得角",
  Colombia: "哥伦比亚",
  "Congo DR": "刚果民主共和国",
  Croatia: "克罗地亚",
  "Curaçao": "库拉索",
  Czechia: "捷克",
  Ecuador: "厄瓜多尔",
  Egypt: "埃及",
  England: "英格兰",
  France: "法国",
  Germany: "德国",
  Ghana: "加纳",
  Haiti: "海地",
  Iran: "伊朗",
  Iraq: "伊拉克",
  "Ivory Coast": "科特迪瓦",
  Japan: "日本",
  Jordan: "约旦",
  Mexico: "墨西哥",
  Morocco: "摩洛哥",
  Netherlands: "荷兰",
  "New Zealand": "新西兰",
  Norway: "挪威",
  Panama: "巴拿马",
  Paraguay: "巴拉圭",
  Portugal: "葡萄牙",
  Qatar: "卡塔尔",
  "Saudi Arabia": "沙特阿拉伯",
  Scotland: "苏格兰",
  Senegal: "塞内加尔",
  "South Africa": "南非",
  "South Korea": "韩国",
  Spain: "西班牙",
  Sweden: "瑞典",
  Switzerland: "瑞士",
  Tunisia: "突尼斯",
  Türkiye: "土耳其",
  "United States": "美国",
  Uruguay: "乌拉圭",
  Uzbekistan: "乌兹别克斯坦"
};
const INJURY_PATTERNS = [
  /\binjury\b/i,
  /\binjured\b/i,
  /\bruled out\b/i,
  /\bdoubt\b/i,
  /\bdoubtful\b/i,
  /\bquestionable\b/i,
  /\bsuspended\b/i,
  /\bsuspension\b/i,
  /\bfitness\b/i
];
const BOOKMAKER_MODELS = [
  { name: "Bet365", statusLabel: "模型折算", vig: 0.95 },
  { name: "威廉希尔", statusLabel: "模型折算", vig: 0.94 },
  { name: "立博", statusLabel: "模型折算", vig: 0.93 }
];
const CORRECT_SCORE_WEIGHTS = {
  home: [
    ["1-0", 0.16],
    ["2-0", 0.13],
    ["2-1", 0.13],
    ["3-0", 0.08],
    ["3-1", 0.08],
    ["3-2", 0.05],
    ["4-0", 0.03],
    ["4-1", 0.03]
  ],
  draw: [
    ["1-1", 0.5],
    ["0-0", 0.3],
    ["2-2", 0.15],
    ["3-3", 0.05]
  ],
  away: [
    ["0-1", 0.16],
    ["0-2", 0.13],
    ["1-2", 0.13],
    ["0-3", 0.08],
    ["1-3", 0.08],
    ["2-3", 0.05],
    ["0-4", 0.03],
    ["1-4", 0.03]
  ]
};

function translateTeamName(name) {
  const value = String(name ?? "");
  const roundOf32Winner = value.match(/Round of 32 (\d+) Winner/i);
  if (roundOf32Winner) return `32强第${roundOf32Winner[1]}场胜者`;
  const roundOf16Winner = value.match(/Round of 16 (\d+) Winner/i);
  if (roundOf16Winner) return `16强第${roundOf16Winner[1]}场胜者`;
  const quarterfinalWinner = value.match(/Quarterfinals? (\d+) Winner/i);
  if (quarterfinalWinner) return `8强第${quarterfinalWinner[1]}场胜者`;
  const semifinalWinner = value.match(/Semifinals? (\d+) Winner/i);
  if (semifinalWinner) return `半决赛第${semifinalWinner[1]}场胜者`;
  return TEAM_NAME_MAP[name] ?? name;
}

function knockoutRoundFromNote(note = "") {
  const value = String(note);
  if (/Round of 32/i.test(value)) return "32强";
  if (/Round of 16/i.test(value)) return "16强";
  if (/Quarterfinal/i.test(value)) return "8强";
  if (/Semifinal/i.test(value)) return "半决赛";
  if (/Third Place/i.test(value)) return "季军战";
  if (/\bFinal\b/i.test(value)) return "决赛";
  return "";
}

function extractShootoutScore(competition, home, away) {
  const statusText = [
    competition?.status?.type?.name,
    competition?.status?.type?.description,
    competition?.status?.type?.detail,
    competition?.status?.type?.shortDetail
  ].join(" ");
  const notesText = (competition?.notes ?? [])
    .map((note) => `${note.headline ?? ""} ${note.text ?? ""}`)
    .join(" ");
  const hasShootout = /pen|shootout/i.test(`${statusText} ${notesText}`);

  if (!hasShootout) return null;

  const noteScore = notesText.match(/advance\s+(\d+)-(\d+)\s+on penalties/i);
  const winner = home?.winner ? home : away?.winner ? away : null;
  const loser = winner === home ? away : winner === away ? home : null;

  if (noteScore && winner && loser) {
    return {
      home: winner === home ? noteScore[1] : noteScore[2],
      away: winner === away ? noteScore[1] : noteScore[2],
      text: `${translateTeamName(winner.team?.displayName ?? "胜者")} 点球 ${noteScore[1]}-${noteScore[2]} 晋级`
    };
  }

  const scored = { [home?.team?.id]: 0, [away?.team?.id]: 0 };
  (competition?.details ?? []).forEach((detail) => {
    if (!detail.shootout || !/scored/i.test(detail.type?.text ?? "")) return;
    const teamId = detail.team?.id;
    if (teamId in scored) scored[teamId] += 1;
  });

  if (scored[home?.team?.id] || scored[away?.team?.id]) {
    return {
      home: String(scored[home?.team?.id] ?? 0),
      away: String(scored[away?.team?.id] ?? 0),
      text: `点球 ${scored[home?.team?.id] ?? 0}-${scored[away?.team?.id] ?? 0}`
    };
  }

  return null;
}

function formatDateParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return {
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
    compactDate: `${parts.year}${parts.month}${parts.day}`
  };
}

function formatLocalTime(isoString, timeZone) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(isoString));
}

function getStat(entry, name) {
  return entry.stats.find((stat) => stat.name === name)?.value ?? 0;
}

function readAmericanOdds(outcome) {
  const rawOdds = outcome?.close?.odds ?? outcome?.open?.odds;
  const numericOdds = Number(rawOdds);

  if (!Number.isFinite(numericOdds) || numericOdds === 0) {
    return null;
  }

  return numericOdds;
}

function formatAmericanOdds(odds) {
  if (!Number.isFinite(odds)) return "N/A";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function americanToDecimalOdds(odds) {
  if (!Number.isFinite(odds) || odds === 0) return null;
  const decimalOdds = odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
  return Math.round(decimalOdds * 100) / 100;
}

function formatDecimalOdds(odds) {
  const decimalOdds = americanToDecimalOdds(odds);
  return decimalOdds === null ? "N/A" : decimalOdds.toFixed(2);
}

function formatModeledDecimalOdds(odds) {
  return Number.isFinite(odds) ? odds.toFixed(2) : "N/A";
}

function readOddsValue(price) {
  const numericOdds = Number(price?.close?.odds ?? price?.open?.odds ?? price?.moneyLine);
  return Number.isFinite(numericOdds) && numericOdds !== 0 ? numericOdds : null;
}

function formatLineValue(value) {
  if (value === undefined || value === null || value === "") return "N/A";
  return String(value);
}

function formatOddsChange(openOdds, currentOdds) {
  const openProbability = impliedProbabilityFromAmericanOdds(openOdds);
  const currentProbability = impliedProbabilityFromAmericanOdds(currentOdds);

  if (openProbability === null || currentProbability === null) {
    return {
      label: "暂无变化",
      direction: "flat"
    };
  }

  const delta = Math.round((currentProbability - openProbability) * 1000) / 10;
  if (Math.abs(delta) < 0.1) {
    return {
      label: "基本持平",
      direction: "flat"
    };
  }

  return {
    label: `${delta > 0 ? "+" : ""}${delta.toFixed(1)}pct`,
    direction: delta > 0 ? "up" : "down"
  };
}

function buildMarketSelection(label, price, line = "") {
  const openOdds = readOddsValue({ open: price?.open });
  const currentOdds = readOddsValue({ close: price?.close, open: price?.open });
  const movement = formatOddsChange(openOdds, currentOdds);

  return {
    label,
    line: formatLineValue(price?.close?.line ?? price?.open?.line ?? line),
    open: formatDecimalOdds(openOdds),
    current: formatDecimalOdds(currentOdds),
    movement: movement.label,
    direction: movement.direction
  };
}

function buildDraftKingsMarkets(odds, homeName, awayName) {
  if (!odds) return [];

  const markets = [];

  if (odds.moneyline) {
    markets.push({
      name: "胜平负",
      available: true,
      selections: [
        buildMarketSelection(`${homeName}胜`, odds.moneyline.home),
        buildMarketSelection("平局", odds.moneyline.draw ?? odds.drawOdds),
        buildMarketSelection(`${awayName}胜`, odds.moneyline.away)
      ]
    });
  }

  if (odds.pointSpread) {
    markets.push({
      name: "让分",
      available: true,
      selections: [
        buildMarketSelection(homeName, odds.pointSpread.home),
        buildMarketSelection(awayName, odds.pointSpread.away)
      ]
    });
  }

  if (odds.total) {
    markets.push({
      name: "大小球",
      available: true,
      selections: [
        buildMarketSelection("大球", odds.total.over),
        buildMarketSelection("小球", odds.total.under)
      ]
    });
  }

  return markets;
}

function deriveModeledMarket(baseMarket, bookmaker) {
  const pricedSelections = baseMarket.selections
    .map((selection) => {
      const decimalOdds = Number(selection.current);
      const rawProbability = Number.isFinite(decimalOdds) && decimalOdds > 1 ? 1 / decimalOdds : null;
      return { ...selection, rawProbability };
    })
    .filter((selection) => selection.rawProbability !== null);
  const rawTotal = pricedSelections.reduce((sum, selection) => sum + selection.rawProbability, 0);

  if (!rawTotal || pricedSelections.length !== baseMarket.selections.length) return null;

  return {
    name: baseMarket.name,
    available: true,
    model: "draftkings-fair-probability-vig",
    selections: pricedSelections.map((selection) => {
      const fairProbability = selection.rawProbability / rawTotal;
      return {
        label: selection.label,
        line: selection.line,
        open: "N/A",
        current: formatModeledDecimalOdds(bookmaker.vig / fairProbability),
        movement: "-",
        direction: "flat"
      };
    })
  };
}

function buildModeledMarkets(draftKingsMarkets, bookmaker) {
  return draftKingsMarkets.map((market) => deriveModeledMarket(market, bookmaker)).filter(Boolean);
}

function getMoneylineFairProbabilities(odds) {
  const entries = [
    ["home", readAmericanOdds(odds?.moneyline?.home)],
    ["draw", readAmericanOdds(odds?.moneyline?.draw ?? odds?.drawOdds)],
    ["away", readAmericanOdds(odds?.moneyline?.away)]
  ]
    .map(([key, value]) => [key, impliedProbabilityFromAmericanOdds(value)])
    .filter(([, probability]) => probability !== null);
  const total = entries.reduce((sum, [, probability]) => sum + probability, 0);

  if (!total || entries.length < 3) return null;

  return Object.fromEntries(entries.map(([key, probability]) => [key, probability / total]));
}

function buildCorrectScoreOdds(odds) {
  const fairProbabilities = getMoneylineFairProbabilities(odds);
  if (!fairProbabilities) return null;

  const scoreProbabilities = Object.entries(CORRECT_SCORE_WEIGHTS).flatMap(([direction, weights]) => {
    const directionTotal = weights.reduce((sum, [, weight]) => sum + weight, 0);
    return weights.map(([score, weight]) => ({
      score,
      probability: (weight / directionTotal) * fairProbabilities[direction]
    }));
  });
  const cards = scoreProbabilities
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 8)
    .map((item) => ({
      score: item.score,
      rows: BOOKMAKER_MODELS.map((bookmaker) => ({
        name: bookmaker.name,
        current: formatModeledDecimalOdds(bookmaker.vig / item.probability)
      }))
    }));

  return {
    name: "波胆比分 (Score)",
    model: "conditional-score-distribution",
    cards
  };
}

function buildBettingSources(odds, match, generatedAt) {
  const providerName = odds?.provider?.displayName ?? odds?.provider?.name ?? "DraftKings";
  if (!odds) return [];

  const draftKingsMarkets = buildDraftKingsMarkets(odds, match.homeTeam.name, match.awayTeam.name);
  if (!draftKingsMarkets.length) return [];

  return [
    {
      name: providerName,
      status: "active",
      statusLabel: "稳定来源",
      sourceUrl: odds.link?.href ?? "",
      updatedAt: generatedAt,
      statusNote: "",
      markets: draftKingsMarkets
    },
    ...BOOKMAKER_MODELS.map((bookmaker) => ({
      name: bookmaker.name,
      status: "modeled",
      statusLabel: bookmaker.statusLabel,
      sourceUrl: odds.link?.href ?? "",
      updatedAt: generatedAt,
      statusNote: "",
      markets: buildModeledMarkets(draftKingsMarkets, bookmaker)
    })).filter((source) => source.markets.length)
  ];
}

function impliedProbabilityFromAmericanOdds(odds) {
  if (!Number.isFinite(odds) || odds === 0) return null;
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function normalizeProbabilities(outcomes) {
  const rawTotal = outcomes.reduce((sum, outcome) => sum + (outcome.rawProbability ?? 0), 0);

  if (!rawTotal) return [];

  const normalized = outcomes.map((outcome) => ({
    ...outcome,
    probability: Math.round((outcome.rawProbability / rawTotal) * 100)
  }));

  const drift = 100 - normalized.reduce((sum, outcome) => sum + outcome.probability, 0);
  const favorite = normalized.reduce(
    (best, outcome, index) =>
      outcome.probability > normalized[best].probability ? index : best,
    0
  );
  normalized[favorite].probability += drift;

  return normalized;
}

function summarizeRecentEvents(teamName, events = []) {
  if (!events.length) {
    return {
      label: "近期状态",
      value: "暂无近况",
      detail: `${teamName} 暂无公开近 5 场数据。`,
      status: "neutral"
    };
  }

  const stats = events.reduce(
    (acc, event) => {
      const result = event.gameResult ?? "";
      if (result === "W") acc.wins += 1;
      if (result === "D") acc.draws += 1;
      if (result === "L") acc.losses += 1;
      acc.goalsFor += Number(event.awayTeamId === event.teamId ? event.awayTeamScore : event.homeTeamScore) || 0;
      acc.goalsAgainst += Number(event.awayTeamId === event.teamId ? event.homeTeamScore : event.awayTeamScore) || 0;
      return acc;
    },
    { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 }
  );

  const status = stats.wins >= 3 ? "positive" : stats.losses >= 3 ? "negative" : "neutral";

  return {
    label: "近期状态",
    value: `${stats.wins}胜${stats.draws}平${stats.losses}负`,
    detail: `${teamName} 近 ${events.length} 场进 ${stats.goalsFor} 球、失 ${stats.goalsAgainst} 球。`,
    status
  };
}

function getTeamRecentFactor(summary, team) {
  const teamBlock = summary?.lastFiveGames?.find((item) => item.team?.id === team.id);
  const events = (teamBlock?.events ?? []).map((event) => ({
    ...event,
    teamId: team.id
  }));
  return summarizeRecentEvents(team.name, events);
}

function getHeadToHeadFactor(summary, homeTeam, awayTeam) {
  const h2hEvents = (summary?.headToHeadGames ?? [])
    .flatMap((item) => item.events ?? [])
    .filter(Boolean);

  if (!h2hEvents.length) {
    return {
      label: "历史交锋",
      value: "暂无直接交锋",
      detail: `${homeTeam.name} 与 ${awayTeam.name} 近期没有公开直接交锋记录。`,
      status: "neutral"
    };
  }

  const latest = h2hEvents[0];
  return {
    label: "历史交锋",
    value: `${h2hEvents.length}场记录`,
    detail: `最近一次：${latest.score ?? "比分待查"}，赛事为 ${latest.competitionName ?? "未知赛事"}。`,
    status: "neutral"
  };
}

function getAvailabilityFactor(summary, match) {
  const newsItems = Array.isArray(summary?.news) ? summary.news : summary?.news?.articles ?? [];
  const teamNames = [
    match.homeTeam.rawName ?? match.homeTeam.name,
    match.awayTeam.rawName ?? match.awayTeam.name
  ].map((name) => name.toLowerCase());
  const injuryNews = newsItems.filter((item) => {
    const text = `${item.headline ?? ""} ${item.description ?? ""}`;
    const lowerText = text.toLowerCase();
    return (
      teamNames.some((teamName) => lowerText.includes(teamName)) &&
      INJURY_PATTERNS.some((pattern) => pattern.test(text))
    );
  });

  if (injuryNews.length) {
    return {
      label: "伤停/阵容",
      value: "发现相关新闻",
      detail: injuryNews
        .slice(0, 2)
        .map((item) => item.headline)
        .join("；"),
      status: "warning"
    };
  }

  return {
    label: "伤停/阵容",
    value: "未见公开伤停",
    detail: "当前公开 summary/news 接口未发现主力伤停关键词，仍建议赛前结合官方名单复核。",
    status: "neutral"
  };
}

function getTournamentPressureFactor(match) {
  const homeRecord = match.homeTeam.record || "暂无";
  const awayRecord = match.awayTeam.record || "暂无";

  return {
    label: "小组压力",
    value: `${homeRecord} / ${awayRecord}`,
    detail: `${match.homeTeam.name} 当前记录 ${homeRecord}，${match.awayTeam.name} 当前记录 ${awayRecord}；同分时净胜球会显著影响排序。`,
    status: "neutral"
  };
}

function getKeyPlayerFactor(match) {
  const players = [match.homeTeam.keyPlayer, match.awayTeam.keyPlayer].filter(Boolean);

  if (!players.length) {
    return {
      label: "关键球员",
      value: "暂无领跑数据",
      detail: "公开接口暂未返回本场明确的进球领跑球员。",
      status: "neutral"
    };
  }

  return {
    label: "关键球员",
    value: players.map((player) => player.name).join(" / "),
    detail: players.map((player) => `${player.team}：${player.name}（${player.value}）`).join("；"),
    status: "positive"
  };
}

function buildAnalysisFactors(match, summary) {
  return [
    {
      label: "赔率市场",
      value: match.preview.probabilities?.length ? `${match.preview.lean} ${match.preview.confidence}` : "暂无赔率",
      detail: match.preview.summary,
      status: match.preview.probabilities?.length ? "positive" : "neutral"
    },
    getTeamRecentFactor(summary, match.homeTeam),
    getTeamRecentFactor(summary, match.awayTeam),
    getHeadToHeadFactor(summary, match.homeTeam, match.awayTeam),
    getAvailabilityFactor(summary, match),
    getTournamentPressureFactor(match),
    getKeyPlayerFactor(match),
    {
      label: "场地/旅程",
      value: match.city || match.venue,
      detail: `比赛地：${match.venue}${match.city ? `，${match.city}` : ""}。`,
      status: "neutral"
    }
  ];
}

function summarizeOdds(match, generatedAt) {
  const moneyline = match.odds?.moneyline;
  const bettingSources = buildBettingSources(match.rawOdds, match, generatedAt);
  const scoreOdds = buildCorrectScoreOdds(match.rawOdds);
  const marketUpdatePolicy = {
    label: "双信息更新",
    detail: "当前静态 Dashboard 固定每 1 小时更新；实时赔率抓取频率将由后续独立数据源决定。"
  };

  if (!moneyline) {
    return {
      lean: "暂无公开赔率",
      confidence: "低",
      heat: "低",
      probabilityModel: "unavailable",
      probabilities: [],
      summary: "当前接口未返回这场比赛的公开赔率，页面先按积分和近期走势做中性观察。",
      bettingSources,
      scoreOdds,
      marketUpdatePolicy
    };
  }

  const home = readAmericanOdds(moneyline.home);
  const away = readAmericanOdds(moneyline.away);
  const draw = readAmericanOdds(moneyline.draw);

  const probabilities = normalizeProbabilities(
    [
      {
        key: "home",
        label: `${match.homeTeam.name}胜`,
        team: match.homeTeam.name,
        odds: home,
        oddsLabel: formatAmericanOdds(home),
        rawProbability: impliedProbabilityFromAmericanOdds(home)
      },
      {
        key: "draw",
        label: "平局",
        team: "平局",
        odds: draw,
        oddsLabel: formatAmericanOdds(draw),
        rawProbability: impliedProbabilityFromAmericanOdds(draw)
      },
      {
        key: "away",
        label: `${match.awayTeam.name}胜`,
        team: match.awayTeam.name,
        odds: away,
        oddsLabel: formatAmericanOdds(away),
        rawProbability: impliedProbabilityFromAmericanOdds(away)
      }
    ].filter((item) => item.rawProbability !== null)
  );

  if (probabilities.length === 0) {
    return {
      lean: "暂无明确倾向",
      confidence: "低",
      heat: "低",
      probabilityModel: "unavailable",
      probabilities: [],
      summary: "赔率数据不完整，暂不输出强判断。",
      bettingSources,
      scoreOdds,
      marketUpdatePolicy
    };
  }

  const sorted = [...probabilities].sort((a, b) => b.probability - a.probability);
  const favorite = sorted[0];
  const runnerUp = sorted[1];
  const probabilityGap = runnerUp ? favorite.probability - runnerUp.probability : 0;
  const confidence = probabilityGap >= 18 ? "高" : probabilityGap >= 9 ? "中" : "低";
  const heat = probabilityGap >= 18 ? "高" : probabilityGap >= 9 ? "中" : "低";

  return {
    lean: favorite.team,
    confidence,
    heat,
    probabilityModel: "normalized-implied-odds",
    probabilities,
    bettingSources,
    scoreOdds,
    marketUpdatePolicy,
    summary:
      favorite.team === "平局"
        ? `赔率隐含概率更偏向僵持局面，平局约 ${favorite.probability}%。`
        : `赔率隐含概率更偏向 ${favorite.team}，约 ${favorite.probability}%，倾向强度为${confidence}。`
  };
}

function normalizeMatch(event, timeZone, generatedAt) {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors ?? [];
  const home = competitors.find((item) => item.homeAway === "home");
  const away = competitors.find((item) => item.homeAway === "away");
  const status = competition?.status?.type?.state ?? "pre";
  const note = competition?.altGameNote ?? "";
  const groupMatch = note.match(/Group\s+([A-Z])/i);
  const odds = competition?.odds?.[0] ?? null;
  const shootout = extractShootoutScore(competition, home, away);
  const keyPlayerFor = (competitor) => {
    const leader = competitor?.leaders?.find((item) => item.name === "goals")?.leaders?.[0];
    if (!leader?.athlete?.displayName) return null;
    if ((Number(leader.value) || 0) <= 0) return null;
    return {
      name: leader.athlete.displayName,
      value: leader.displayValue ?? "",
      team: translateTeamName(competitor?.team?.displayName ?? "")
    };
  };

  return {
    id: event.id,
    date: event.date,
    localKickoff: formatLocalTime(event.date, timeZone),
    stage: note,
    group: groupMatch ? `Group ${groupMatch[1].toUpperCase()}` : "Knockout",
    round: groupMatch ? "" : knockoutRoundFromNote(note),
    status,
    statusLabel: competition?.status?.type?.description ?? "Scheduled",
    shortDetail: competition?.status?.type?.shortDetail ?? "",
    shootout,
    venue: competition?.venue?.fullName ?? competition?.venue?.displayName ?? "待定",
    city: competition?.venue?.address?.city ?? "",
    homeTeam: {
      id: home?.team?.id ?? "",
      rawName: home?.team?.displayName ?? "TBD",
      name: translateTeamName(home?.team?.displayName ?? "TBD"),
      shortName: home?.team?.abbreviation ?? "TBD",
      logo: home?.team?.logo ?? home?.team?.logos?.[0]?.href ?? "",
      score: home?.score ?? "0",
      penaltyScore: shootout?.home ?? null,
      winner: home?.winner ?? false,
      record: home?.records?.[0]?.summary ?? "",
      form: home?.form ?? "",
      keyPlayer: keyPlayerFor(home)
    },
    awayTeam: {
      id: away?.team?.id ?? "",
      rawName: away?.team?.displayName ?? "TBD",
      name: translateTeamName(away?.team?.displayName ?? "TBD"),
      shortName: away?.team?.abbreviation ?? "TBD",
      logo: away?.team?.logo ?? away?.team?.logos?.[0]?.href ?? "",
      score: away?.score ?? "0",
      penaltyScore: shootout?.away ?? null,
      winner: away?.winner ?? false,
      record: away?.records?.[0]?.summary ?? "",
      form: away?.form ?? "",
      keyPlayer: keyPlayerFor(away)
    },
    odds: odds
      ? {
          details: odds.details ?? "",
          moneyline: {
            home: odds.moneyline?.home ?? null,
            away: odds.moneyline?.away ?? null,
            draw: odds.moneyline?.draw ?? null
          },
          spread: odds.pointSpread ?? null,
          total: odds.total ?? null
        }
      : null,
    preview: summarizeOdds({
      homeTeam: { name: translateTeamName(home?.team?.displayName ?? "主队") },
      awayTeam: { name: translateTeamName(away?.team?.displayName ?? "客队") },
      rawOdds: odds,
      odds: odds
        ? {
            moneyline: {
              home: odds.moneyline?.home ?? null,
              away: odds.moneyline?.away ?? null,
              draw: odds.moneyline?.draw ?? null
            }
          }
        : null
    }, generatedAt),
    summaryLink:
      event.links?.find((link) => link.rel?.includes("summary"))?.href ?? ""
  };
}

async function enrichMatchAnalysis(matches) {
  await Promise.all(
    matches.map(async (match) => {
      try {
        const summary = await fetchJson(SUMMARY_URL(match.id));
        match.analysisFactors = buildAnalysisFactors(match, summary);
      } catch (error) {
        match.analysisFactors = [
          {
            label: "多因素分析",
            value: "summary 读取失败",
            detail: "本场 summary 接口暂时不可用，已保留赔率与基础赛程数据。",
            status: "warning"
          }
        ];
      }
    })
  );
}

function buildGroupOutlook(groupName, standings, groupMatches) {
  const sorted = [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.goalDiff - a.goalDiff;
  });
  const leader = sorted[0];
  const runnerUp = sorted[1];
  const sleeper = sorted[2];
  const liveMatches = groupMatches.filter((match) => match.status === "in");
  const upcomingMatches = groupMatches.filter((match) => match.status === "pre");

  const line1 = leader
    ? `${leader.team} 暂时领跑，${leader.points} 分、净胜球 ${leader.goalDiff >= 0 ? "+" : ""}${leader.goalDiff}。`
    : "当前暂无完整积分数据。";
  const line2 = runnerUp
    ? `${runnerUp.team} 仍在直接晋级区附近，和榜首差距主要体现在积分或净胜球。`
    : "第二名形势暂未明确。";
  const line3 = sleeper
    ? `${sleeper.team} 仍有机会争取最佳第三，后续对决的拿分效率很关键。`
    : "小组第三名争夺尚待展开。";

  return {
    title: `${groupName} 走势预估`,
    summary: [line1, line2, line3].join(" "),
    liveAlert:
      liveMatches.length > 0
        ? `${groupName} 当前有 ${liveMatches.length} 场比赛正在进行，排名可能随时变化。`
        : "",
    keyMatch:
      upcomingMatches[0]
        ? `${upcomingMatches[0].homeTeam.name} vs ${upcomingMatches[0].awayTeam.name} 是下一场值得重点关注的对决。`
        : "本组已无待赛对决。"
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "world-cup-dashboard/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed: ${url} ${response.status}`);
  }

  return response.json();
}

async function main() {
  const timeZone = "Asia/Shanghai";
  const now = new Date();
  const { isoDate, compactDate } = formatDateParts(now, timeZone);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const { compactDate: compactTomorrow } = formatDateParts(tomorrow, timeZone);

  const [scoreboard, standings] = await Promise.all([
    fetchJson(SCOREBOARD_URL),
    fetchJson(STANDINGS_URL)
  ]);

  const matches = (scoreboard.events ?? [])
    .map((event) => normalizeMatch(event, timeZone, now.toISOString()))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const todayMatches = matches.filter((match) => {
    const dateKey = formatDateParts(new Date(match.date), timeZone).compactDate;
    return dateKey === compactDate;
  });

  const tomorrowMatches = matches.filter((match) => {
    const dateKey = formatDateParts(new Date(match.date), timeZone).compactDate;
    return dateKey === compactTomorrow;
  });

  const knockoutMatches = matches.filter((match) => match.group === "Knockout");
  const upcomingKnockoutMatches = knockoutMatches.filter((match) => match.status === "pre");
  const recentKnockoutMatches = knockoutMatches.filter((match) => match.status !== "pre").slice(-8);
  const knockoutRoundCounts = knockoutMatches.reduce((counts, match) => {
    const round = match.round || "待定轮次";
    counts[round] = (counts[round] ?? 0) + 1;
    return counts;
  }, {});
  const knockoutPreviewMatches = [
    ...todayMatches.filter((match) => match.group === "Knockout"),
    ...tomorrowMatches.filter((match) => match.group === "Knockout"),
    ...upcomingKnockoutMatches.slice(0, 4)
  ];
  const analysisMatches = [...new Map([...todayMatches, ...tomorrowMatches, ...knockoutPreviewMatches].map((match) => [match.id, match])).values()];

  await enrichMatchAnalysis(analysisMatches);

  const groups = (standings.children ?? []).map((group) => {
    const entries = (group.standings?.entries ?? []).map((entry) => ({
      team: translateTeamName(entry.team.displayName),
      shortName: entry.team.abbreviation,
      logo: entry.team.logos?.[0]?.href ?? "",
      points: getStat(entry, "points"),
      played: getStat(entry, "gamesPlayed"),
      wins: getStat(entry, "wins"),
      draws: getStat(entry, "ties"),
      losses: getStat(entry, "losses"),
      goalsFor: getStat(entry, "pointsFor"),
      goalsAgainst: getStat(entry, "pointsAgainst"),
      goalDiff: getStat(entry, "pointDifferential"),
      rank: getStat(entry, "rank"),
      note: entry.note?.description ?? ""
    }));

    const groupMatches = matches.filter((match) => match.group === group.name);
    const upcomingMatches = groupMatches.filter((match) => match.status === "pre").slice(0, 3);

    return {
      id: group.id,
      name: group.name,
      standings: entries.sort((a, b) => a.rank - b.rank),
      outlook: buildGroupOutlook(group.name, entries, groupMatches),
      nextMatches: upcomingMatches.map((match) => ({
        id: match.id,
        kickoff: match.localKickoff,
        homeTeam: match.homeTeam.name,
        awayTeam: match.awayTeam.name,
        preview: match.preview
      })),
      recentMatches: groupMatches
        .filter((match) => match.status !== "pre")
        .slice(-2)
        .map((match) => ({
          id: match.id,
          status: match.status,
          kickoff: match.localKickoff,
          homeTeam: match.homeTeam.name,
          homeScore: match.homeTeam.score,
          awayTeam: match.awayTeam.name,
          awayScore: match.awayTeam.score
        }))
    };
  });

  const liveCount = todayMatches.filter((match) => match.status === "in").length;
  const completedCount = todayMatches.filter((match) => match.status === "post").length;
  const scheduledCount = todayMatches.filter((match) => match.status === "pre").length;
  const isMatchDay = todayMatches.length > 0;
  const recentlyFinishedCount = todayMatches.filter((match) => {
    if (match.status !== "post") return false;
    const kickoff = new Date(match.date);
    const hoursSinceKickoff = (now.getTime() - kickoff.getTime()) / (1000 * 60 * 60);
    return hoursSinceKickoff >= 0 && hoursSinceKickoff <= 4;
  }).length;

  const hasMatchWithinOneHour = matches.some((match) => {
    if (match.status !== "pre") return false;
    const kickoff = new Date(match.date);
    const minutesToKickoff = (kickoff.getTime() - now.getTime()) / (1000 * 60);
    return minutesToKickoff >= 0 && minutesToKickoff <= 60;
  });

  const refreshCadenceHours = 1;
  const refreshCadenceLabel = "GitHub Pages 每 1 小时";
  const refreshStrategy = liveCount > 0 || hasMatchWithinOneHour
    ? "hourly-static-site-market-watch"
    : "hourly-static-site";

  const data = {
    meta: {
      title: "2026 世界杯每日赛程快报及战况分析",
      generatedAt: now.toISOString(),
      snapshotDate: isoDate,
      timezone: timeZone,
      refreshCadenceHours,
      refreshCadenceLabel,
      refreshStrategy,
      liveScorePollSeconds: 30,
      liveScorePollLabel: "浏览器每 30 秒抓取公开比分",
      sources: [
        {
          name: "ESPN Scoreboard API",
          url: SCOREBOARD_URL
        },
        {
          name: "ESPN Standings API",
          url: STANDINGS_URL
        },
        {
          name: "FIFA 官方赛程",
          url: FIFA_SCHEDULE_URL
        },
        {
          name: "FIFA 官方积分榜",
          url: FIFA_STANDINGS_URL
        }
      ]
    },
    headline: {
      liveCount,
      completedCount,
      scheduledCount,
      summary:
        liveCount > 0
          ? `今天有 ${liveCount} 场比赛正在进行，另外还有 ${scheduledCount} 场待开球。`
          : `今天已完成 ${completedCount} 场比赛，另有 ${scheduledCount} 场待开球。`,
      storylines: [
        liveCount > 0 ? `今天仍有 ${liveCount} 场比赛在进行中，页面会优先展示即时比分。` : "",
        scheduledCount > 0 ? `今天还有 ${scheduledCount} 场比赛未开球，赛前预估会只保留在未开赛场次。` : "",
        scheduledCount > 0 && todayMatches.some((match) => match.preview.probabilities?.length)
          ? "未开赛场次会继续显示赔率概率、盘口变化和多因素分析，方便赛前快速判断。"
          : ""
      ].filter(Boolean)
    },
    today: {
      date: isoDate,
      matches: todayMatches
    },
    tomorrow: {
      date: formatDateParts(tomorrow, timeZone).isoDate,
      matches: tomorrowMatches
    },
    knockout: {
      title: "32强对战表与冠军路径",
      summary:
        knockoutMatches.length > 0
          ? `已接入 ${knockoutMatches.length} 场淘汰赛公开赛程；未公开的半决赛、决赛、季军战会在官方赛程返回后自动补上。`
          : "淘汰赛公开赛程暂未返回，数据源更新后会自动显示。",
      roundCounts: knockoutRoundCounts,
      upcomingCount: upcomingKnockoutMatches.length,
      completedCount: knockoutMatches.length - upcomingKnockoutMatches.length,
      matches: knockoutMatches,
      upcomingMatches: upcomingKnockoutMatches.slice(0, 12),
      recentMatches: recentKnockoutMatches
    },
    groups,
    links: {
      fifaSchedule: FIFA_SCHEDULE_URL,
      fifaStandings: FIFA_STANDINGS_URL
    }
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify(data, null, 2), "utf8");
  console.log(`Wrote ${OUTPUT_FILE.pathname}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
