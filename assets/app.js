function el(html) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

function statusClass(status) {
  if (status === "in") return "status-in";
  if (status === "post") return "status-post";
  return "status-pre";
}

function groupNameFromNote(note = "") {
  const groupMatch = String(note).match(/Group\s+([A-Z])/i);
  return groupMatch ? `Group ${groupMatch[1].toUpperCase()}` : "Knockout";
}

const KNOCKOUT_ROUNDS = [
  { id: "round-of-32", label: "32强", matchLabel: "32强", pattern: /Round of 32/i, slots: 16 },
  { id: "round-of-16", label: "16强", matchLabel: "16强", pattern: /Round of 16/i, slots: 8 },
  { id: "quarterfinals", label: "8强", matchLabel: "8强", pattern: /Quarterfinal/i, slots: 4 },
  { id: "semifinals", label: "半决赛", matchLabel: "半决赛", pattern: /Semifinal/i, slots: 2 },
  { id: "final", label: "决赛", matchLabel: "决赛", pattern: /\bFinal\b/i, slots: 1 },
  { id: "third-place", label: "季军战", matchLabel: "季军战", pattern: /Third Place/i, slots: 1 }
];

function knockoutRoundId(match) {
  const stageText = `${match.stage ?? ""} ${match.round ?? ""}`;
  return KNOCKOUT_ROUNDS.find((round) => round.pattern.test(stageText))?.id ?? "round-of-32";
}

function formatPlaceholderTeamName(name = "待定") {
  return String(name)
    .replace(/Round of 32 (\d+) Winner/i, "32强第$1场胜者")
    .replace(/Round of 16 (\d+) Winner/i, "16强第$1场胜者")
    .replace(/Quarterfinals? (\d+) Winner/i, "8强第$1场胜者")
    .replace(/Semifinals? (\d+) Winner/i, "半决赛第$1场胜者");
}

function teamScoreLabel(team) {
  const score = team?.score ?? "-";
  return team?.penaltyScore !== undefined && team?.penaltyScore !== null
    ? `${score} (${team.penaltyScore})`
    : score;
}

function shootoutLabel(match) {
  if (!match?.shootout) return "";
  const homePenalty = match.shootout.home ?? match.homeTeam?.penaltyScore;
  const awayPenalty = match.shootout.away ?? match.awayTeam?.penaltyScore;
  if (homePenalty === undefined || awayPenalty === undefined || homePenalty === null || awayPenalty === null) {
    return match.shootout.text ?? "";
  }
  const winnerSide = matchWinnerSide(match);
  if (winnerSide) {
    const winner = winnerSide === "home" ? match.homeTeam : match.awayTeam;
    const winnerPenalty = winnerSide === "home" ? homePenalty : awayPenalty;
    const loserPenalty = winnerSide === "home" ? awayPenalty : homePenalty;
    return `${winner.name} 点球 ${winnerPenalty}-${loserPenalty} 晋级`;
  }
  return `点球：${match.homeTeam.name} ${homePenalty} : ${awayPenalty} ${match.awayTeam.name}`;
}

function extractShootoutScoreFromEvent(competition, home, away) {
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
      text: `${winner.team?.displayName ?? "胜者"} 点球 ${noteScore[1]}-${noteScore[2]} 晋级`
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

const SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719";
const LIVE_SCORE_POLL_MS = 30 * 1000;

let dashboardData = null;
let liveScoreTimer = null;

function renderProbabilityBar(preview) {
  if (!preview.probabilities?.length) {
    return `<div class="probability-empty">暂无公开赔率概率</div>`;
  }

  const segments = preview.probabilities
    .map(
      (outcome) => `
        <div class="prob-segment prob-${outcome.key}" style="width: ${outcome.probability}%">
          <span>${outcome.probability}%</span>
        </div>
      `
    )
    .join("");

  const legend = preview.probabilities
    .map(
      (outcome) => `
        <div class="probability-legend-item">
          <span class="probability-legend-name">${outcome.label}</span>
          <strong class="probability-legend-value">${outcome.probability}%</strong>
        </div>
      `
    )
    .join("");

  return `
    <div class="probability-label">胜平负隐含概率</div>
    <div class="probability-bar">${segments}</div>
    <div class="probability-legend">${legend}</div>
  `;
}

function renderMarketSelection(selection) {
  return `
    <div class="market-selection">
      <div>
        <strong>${selection.label}</strong>
        ${selection.line && selection.line !== "N/A" ? `<span>${selection.line}</span>` : ""}
      </div>
      <div class="market-price">
        <span>开盘 ${selection.open}</span>
        <b>${selection.current}</b>
        <em class="movement-${selection.direction}">${selection.movement}</em>
      </div>
    </div>
  `;
}

function renderSourceMarket(market) {
  if (!market.available) {
    return `
      <div class="source-market source-market-muted">
        <div class="source-market-name">${market.name}</div>
        <div class="source-market-note">${market.note}</div>
      </div>
    `;
  }

  return `
    <div class="source-market">
      <div class="source-market-name">${market.name}</div>
      <div class="market-selection-list">
        ${market.selections.map(renderMarketSelection).join("")}
      </div>
    </div>
  `;
}

function renderBettingSources(match) {
  if (!match.preview.bettingSources?.length) {
    return "";
  }

  return `
    <button class="odds-modal-trigger" type="button" data-match-id="${match.id}">
      <span>查看赔率看板</span>
      <small>已验证稳定来源</small>
    </button>
  `;
}

function renderModalProbabilityBar(preview) {
  if (!preview.probabilities?.length) return "";

  const labels = preview.probabilities
    .map(
      (outcome) => `
        <div class="modal-probability-label modal-probability-${outcome.key}">
          <span></span>
          <strong>${outcome.label} ${outcome.probability}%</strong>
        </div>
      `
    )
    .join("");
  const segments = preview.probabilities
    .map(
      (outcome) => `
        <div class="modal-probability-segment modal-probability-${outcome.key}" style="width: ${outcome.probability}%"></div>
      `
    )
    .join("");

  return `
    <section class="odds-probability-panel">
      <h4>AI 胜平负概率预测</h4>
      <div class="modal-probability-labels">${labels}</div>
      <div class="modal-probability-bar">${segments}</div>
    </section>
  `;
}

function renderOddsTable(match, marketIndex = 0) {
  const sources = match.preview.bettingSources ?? [];
  const marketNames = [
    ...new Set(sources.flatMap((source) => (source.markets ?? []).map((market) => market.name)))
  ];
  if (match.preview.scoreOdds?.cards?.length) {
    marketNames.push(match.preview.scoreOdds.name);
  }
  const marketName = marketNames[marketIndex] ?? marketNames[0];

  if (!marketName) {
    return `<div class="odds-modal-empty">当前没有稳定赔率市场。</div>`;
  }

  const tabs = marketNames
    .map(
      (name, index) => `
        <button class="odds-market-tab ${index === marketIndex ? "is-active" : ""}" type="button" data-market-index="${index}">
          ${name}
        </button>
      `
    )
    .join("");
  const activeMarket = sources
    .flatMap((source) => source.markets ?? [])
    .find((market) => market.name === marketName);

  if (marketName === match.preview.scoreOdds?.name) {
    return `
      <section class="odds-board-panel">
        <h4>赔率看板</h4>
        <div class="odds-market-tabs">${tabs}</div>
        ${renderScoreOddsGrid(match.preview.scoreOdds)}
      </section>
    `;
  }

  if (!activeMarket) {
    return `<div class="odds-modal-empty">当前没有稳定赔率市场。</div>`;
  }

  const columns = activeMarket.selections
    .map((selection) => `<th>${selection.label}${selection.line !== "N/A" ? ` ${selection.line}` : ""}</th>`)
    .join("");
  const stackedRows = sources
    .map((source) => {
      const sourceMarket = source.markets.find((item) => item.name === marketName);
      if (!sourceMarket) return "";

      const cards = sourceMarket.selections
        .map(
          (selection) => `
            <div class="odds-stacked-card">
              <div>
                <strong>${selection.label}</strong>
                ${selection.line !== "N/A" ? `<span>${selection.line}</span>` : ""}
              </div>
              <div>
                <b>${selection.current}</b>
                <em class="movement-${selection.direction}">${selection.movement}</em>
              </div>
            </div>
          `
        )
        .join("");

      return `
        <div class="odds-stacked-source">
          <div class="bookmaker-name">${source.name}</div>
          <div class="odds-stacked-list">${cards}</div>
        </div>
      `;
    })
    .join("");
  const rows = sources
    .map((source) => {
      const sourceMarket = source.markets.find((item) => item.name === marketName);
      if (!sourceMarket) return "";

      const cells = sourceMarket.selections
        .map(
          (selection) => `
            <td>
              <strong>${selection.current}</strong>
              <span class="odds-move movement-${selection.direction}">${selection.movement}</span>
            </td>
          `
        )
        .join("");

      return `
        <tr>
          <td class="bookmaker-name">${source.name}</td>
          ${cells}
        </tr>
      `;
    })
    .join("");

  return `
    <section class="odds-board-panel">
      <h4>赔率看板</h4>
      <div class="odds-market-tabs">${tabs}</div>
      <div class="odds-table-wrap">
        <table class="odds-table">
          <thead>
            <tr>
              <th>来源</th>
              ${columns}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="odds-stacked-wrap">${stackedRows}</div>
    </section>
  `;
}

function renderScoreOddsGrid(scoreOdds) {
  const cards = scoreOdds.cards
    .map(
      (card) => `
        <article class="score-odds-card">
          <strong>${card.score}</strong>
          <div class="score-odds-lines">
            ${card.rows
              .map(
                (row) => `
                  <div>
                    <span>${row.name}</span>
                    <b>${row.current}</b>
                  </div>
                `
              )
              .join("")}
          </div>
        </article>
      `
    )
    .join("");

  return `<div class="score-odds-grid">${cards}</div>`;
}

function renderOddsModal(match, marketIndex = 0) {
  return `
    <div class="odds-modal-backdrop" id="odds-modal-backdrop" data-match-id="${match.id}">
      <section class="odds-modal" role="dialog" aria-modal="true" aria-label="${match.homeTeam.name} vs ${match.awayTeam.name} 赔率看板">
        <button class="odds-modal-close" type="button" aria-label="关闭赔率看板">×</button>
        <div class="odds-modal-meta">
          <strong>${match.group}</strong>
          <span>${match.venue}</span>
          <span>${match.localKickoff}</span>
        </div>
        <div class="odds-modal-teams">
          <div>
            ${match.homeTeam.logo ? `<img src="${match.homeTeam.logo}" alt="${match.homeTeam.name}" />` : ""}
            <strong>${match.homeTeam.name}</strong>
          </div>
          <span>PREVIEW</span>
          <div>
            ${match.awayTeam.logo ? `<img src="${match.awayTeam.logo}" alt="${match.awayTeam.name}" />` : ""}
            <strong>${match.awayTeam.name}</strong>
          </div>
        </div>
        ${renderModalProbabilityBar(match.preview)}
        ${renderOddsTable(match, marketIndex)}
      </section>
    </div>
  `;
}

function findMatchById(matchId) {
  const matches = [
    ...(dashboardData?.today?.matches ?? []),
    ...(dashboardData?.tomorrow?.matches ?? []),
    ...(dashboardData?.knockout?.matches ?? [])
  ];
  return matches.find((match) => match.id === matchId);
}

function openOddsModal(matchId, marketIndex = 0) {
  const match = findMatchById(matchId);
  if (!match) return;

  const existing = document.querySelector("#odds-modal-backdrop");
  if (existing) existing.remove();
  document.body.appendChild(el(renderOddsModal(match, marketIndex)));
  document.body.classList.add("modal-open");
}

function closeOddsModal() {
  document.querySelector("#odds-modal-backdrop")?.remove();
  document.body.classList.remove("modal-open");
}

function renderAnalysisFactors(match) {
  if (!match.analysisFactors?.length) {
    return "";
  }

  return `
    <div class="factor-grid">
      ${match.analysisFactors
        .map(
          (factor) => `
            <div class="factor-card factor-${factor.status ?? "neutral"}">
              <div class="factor-label">${factor.label}</div>
              <div class="factor-value">${factor.value}</div>
              <div class="factor-detail">${factor.detail}</div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderMetrics(headline) {
  const target = document.querySelector("#hero-stats");
  const metrics = [
    { label: "今日进行中", value: headline.liveCount },
    { label: "今日待开球", value: headline.scheduledCount },
    { label: "已完赛", value: headline.completedCount }
  ];

  target.innerHTML = "";
  metrics.forEach((metric) => {
    target.appendChild(
      el(`
        <div class="metric-card">
          <div class="metric-label">${metric.label}</div>
          <div class="metric-value">${metric.value}</div>
        </div>
      `)
    );
  });
}

function renderHeroMeta(data) {
  const target = document.querySelector("#hero-inline-meta");
  const items = [
    `比赛日：${data.meta.snapshotDate}`,
    `明日重点：${data.tomorrow.matches.length} 场`
  ];

  target.innerHTML = items
    .map((item) => `<span class="hero-meta-chip">${item}</span>`)
    .join("");
}

function renderUpdateText(data, liveScoreUpdatedAt = null) {
  const staticUpdatedAt = new Date(data.meta.generatedAt).toLocaleString("zh-CN", {
    timeZone: data.meta.timezone,
    hour12: false
  });
  const liveText = liveScoreUpdatedAt
    ? ` · 比分抓取：${liveScoreUpdatedAt.toLocaleTimeString("zh-CN", {
        timeZone: data.meta.timezone,
        hour12: false
      })}`
    : "";

  document.querySelector("#fixtures-update-text").textContent =
    `数据更新时间：${staticUpdatedAt}（${data.meta.timezone}）${liveText}`;
}

function renderLiveSummary(match) {
  return `
    <div class="match-summary-box">
      <div class="match-summary-label">即时战况</div>
      <div class="match-summary-text">${match.shortDetail || "比赛进行中"}，当前比分 ${match.homeTeam.name} ${match.homeTeam.score} : ${match.awayTeam.score} ${match.awayTeam.name}</div>
    </div>
  `;
}

function renderFinalSummary(match) {
  const shootoutText = shootoutLabel(match);
  return `
    <div class="report-box">
      <div class="report-scoreboard">
        <div class="report-team">
          <img src="${match.homeTeam.logo}" alt="${match.homeTeam.name}" />
          <div class="report-team-name">${match.homeTeam.name}</div>
        </div>
        <div class="report-center">
          <div class="report-scoreline">${teamScoreLabel(match.homeTeam)} : ${teamScoreLabel(match.awayTeam)}</div>
          ${shootoutText ? `<div class="shootout-note">${shootoutText}</div>` : ""}
        </div>
        <div class="report-team">
          <img src="${match.awayTeam.logo}" alt="${match.awayTeam.name}" />
          <div class="report-team-name">${match.awayTeam.name}</div>
        </div>
      </div>
      <div class="report-meta">
        <span class="report-chip">完赛</span>
        ${match.shootout ? `<span class="report-chip">点球大战</span>` : ""}
        <span>${match.localKickoff}</span>
        <span>${match.venue}</span>
      </div>
    </div>
  `;
}

function renderPreviewBox(match) {
  if (match.status === "pre") {
    return `
      <div class="preview-box">
        <div class="preview-topline">
          <div class="preview-title">赛前预估：倾向 ${match.preview.lean}</div>
          <span class="heat-pill">预测热度：${match.preview.heat ?? match.preview.confidence}</span>
        </div>
        ${renderProbabilityBar(match.preview)}
        ${renderBettingSources(match)}
        ${renderAnalysisFactors(match)}
      </div>
    `;
  }

  if (match.status === "in") {
    return renderLiveSummary(match);
  }

  return renderFinalSummary(match);
}

function renderMatchCard(match) {
  return el(`
    <article class="match-card">
      <div class="match-topline">
        <span>${match.group}</span>
        <span class="status-pill ${statusClass(match.status)}">${match.statusLabel}</span>
      </div>
      <div class="team-block">
        <div class="team-row">
          <div class="team-left">
            <img src="${match.homeTeam.logo}" alt="${match.homeTeam.name}" />
            <strong>${match.homeTeam.name}</strong>
          </div>
          <div class="team-score-stack">
            <div class="team-score">${match.homeTeam.score}</div>
            ${match.homeTeam.penaltyScore !== undefined && match.homeTeam.penaltyScore !== null ? `<div class="team-penalty-score">点球 ${match.homeTeam.penaltyScore}</div>` : ""}
          </div>
        </div>
        <div class="team-row">
          <div class="team-left">
            <img src="${match.awayTeam.logo}" alt="${match.awayTeam.name}" />
            <strong>${match.awayTeam.name}</strong>
          </div>
          <div class="team-score-stack">
            <div class="team-score">${match.awayTeam.score}</div>
            ${match.awayTeam.penaltyScore !== undefined && match.awayTeam.penaltyScore !== null ? `<div class="team-penalty-score">点球 ${match.awayTeam.penaltyScore}</div>` : ""}
          </div>
        </div>
      </div>
      ${match.status === "post" ? "" : `<p class="venue-text">${match.localKickoff} · ${match.venue}</p>`}
      ${renderPreviewBox(match)}
    </article>
  `);
}

function renderMatches(selector, matches, emptyText) {
  const target = document.querySelector(selector);
  target.innerHTML = "";

  if (!matches.length) {
    target.appendChild(el(`<div class="storyline-item">${emptyText}</div>`));
    return;
  }

  matches.forEach((match) => target.appendChild(renderMatchCard(match)));
}

function renderGroups(groups) {
  const groupsGrid = document.querySelector("#groups-grid");
  groupsGrid.innerHTML = "";
  groups.forEach((group) => groupsGrid.appendChild(renderGroupCard(group)));
}

function renderKnockout(knockout) {
  const summary = document.querySelector("#knockout-summary-text");
  if (summary) summary.textContent = knockout?.summary ?? "";

  const bracket = document.querySelector("#knockout-bracket");
  const podium = document.querySelector("#knockout-podium");
  if (!bracket || !podium) return;

  const rounds = buildKnockoutRounds(knockout?.matches ?? []);
  podium.innerHTML = renderKnockoutPodium(rounds);
  bracket.innerHTML = rounds.map((round, index) => renderKnockoutRound(round, index)).join("");
}

function buildKnockoutRounds(matches) {
  return KNOCKOUT_ROUNDS.map((round) => {
    const roundMatches = matches
      .filter((match) => knockoutRoundId(match) === round.id)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const placeholders = Array.from({ length: Math.max(0, round.slots - roundMatches.length) }, (_, index) =>
      createKnockoutPlaceholder(round, roundMatches.length + index + 1)
    );

    return {
      ...round,
      matches: [...roundMatches, ...placeholders]
    };
  });
}

function createKnockoutPlaceholder(round, index) {
  return {
    id: `pending-${round.id}-${index}`,
    status: "pending",
    statusLabel: "待官方赛程",
    shortDetail: "待官方赛程",
    localKickoff: "待定",
    venue: "待定",
    stage: round.label,
    homeTeam: { name: "待定", score: "-", logo: "" },
    awayTeam: { name: "待定", score: "-", logo: "" }
  };
}

function matchWinnerSide(match) {
  if (match.status !== "post") return "";
  const homeWon = match.homeTeam?.winner === true;
  const awayWon = match.awayTeam?.winner === true;
  if (homeWon) return "home";
  if (awayWon) return "away";

  const homeScore = Number(match.homeTeam?.score);
  const awayScore = Number(match.awayTeam?.score);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore === awayScore) return "";
  return homeScore > awayScore ? "home" : "away";
}

function winnerTeam(match) {
  const side = matchWinnerSide(match);
  return side ? match[`${side}Team`] : null;
}

function loserTeam(match) {
  const side = matchWinnerSide(match);
  if (!side) return null;
  return match[side === "home" ? "awayTeam" : "homeTeam"];
}

function renderBracketTeam(team, isWinner) {
  const name = formatPlaceholderTeamName(team?.name ?? "待定");
  return `
    <div class="bracket-team ${isWinner ? "is-winner" : ""}">
      <span class="bracket-team-name">
        ${team?.logo ? `<img src="${team.logo}" alt="${name}" />` : ""}
        ${name}
      </span>
      <strong>${teamScoreLabel(team)}</strong>
    </div>
  `;
}

function renderKnockoutMatch(match, index, round) {
  const winnerSide = matchWinnerSide(match);
  const isPending = match.status === "pending";
  const kickoffText = isPending ? "待官方赛程更新" : `${match.localKickoff} · ${match.venue}`;
  const shootoutText = shootoutLabel(match);

  return `
    <article class="bracket-match ${isPending ? "is-pending" : ""}">
      <div class="bracket-match-head">
        <span>${round.matchLabel} ${index + 1}</span>
        <em class="status-pill ${statusClass(match.status)}">${match.statusLabel}</em>
      </div>
      ${renderBracketTeam(match.homeTeam, winnerSide === "home")}
      ${renderBracketTeam(match.awayTeam, winnerSide === "away")}
      ${shootoutText ? `<div class="bracket-shootout">${shootoutText}</div>` : ""}
      <div class="bracket-match-meta">${kickoffText}</div>
    </article>
  `;
}

function renderKnockoutRound(round, roundIndex) {
  const played = round.matches.filter((match) => match.status === "post").length;
  const realMatches = round.matches.filter((match) => match.status !== "pending").length;

  return `
    <section class="bracket-round bracket-round-${round.id}" style="--round-index: ${roundIndex}">
      <div class="bracket-round-head">
        <h3>${round.label}</h3>
        <span>${played}/${realMatches || round.slots} 已完成</span>
      </div>
      <div class="bracket-match-list">
        ${round.matches.map((match, index) => renderKnockoutMatch(match, index, round)).join("")}
      </div>
    </section>
  `;
}

function renderKnockoutPodium(rounds) {
  const finalMatch = rounds.find((round) => round.id === "final")?.matches.find((match) => match.status !== "pending");
  const thirdPlaceMatch = rounds.find((round) => round.id === "third-place")?.matches.find((match) => match.status !== "pending");
  const champion = finalMatch ? winnerTeam(finalMatch) : null;
  const runnerUp = finalMatch ? loserTeam(finalMatch) : null;
  const third = thirdPlaceMatch ? winnerTeam(thirdPlaceMatch) : null;

  return `
    <div class="podium-card podium-card-champion">
      <span>冠军</span>
      <strong>${champion ? formatPlaceholderTeamName(champion.name) : "待决赛产生"}</strong>
    </div>
    <div class="podium-card">
      <span>亚军</span>
      <strong>${runnerUp ? formatPlaceholderTeamName(runnerUp.name) : "待决赛产生"}</strong>
    </div>
    <div class="podium-card">
      <span>季军</span>
      <strong>${third ? formatPlaceholderTeamName(third.name) : "待季军战产生"}</strong>
    </div>
  `;
}

function updateMatchFromEvent(match, event) {
  const competition = event.competitions?.[0];
  if (!competition) return false;

  const competitors = competition.competitors ?? [];
  const home = competitors.find((item) => item.homeAway === "home");
  const away = competitors.find((item) => item.homeAway === "away");
  const status = competition.status?.type?.state ?? match.status;
  const statusLabel = competition.status?.type?.description ?? match.statusLabel;
  const shortDetail = competition.status?.type?.shortDetail ?? match.shortDetail;
  const homeScore = home?.score ?? match.homeTeam.score;
  const awayScore = away?.score ?? match.awayTeam.score;
  const homeWinner = home?.winner ?? match.homeTeam.winner;
  const awayWinner = away?.winner ?? match.awayTeam.winner;
  const shootout = extractShootoutScoreFromEvent(competition, home, away);
  const homePenaltyScore = shootout?.home ?? null;
  const awayPenaltyScore = shootout?.away ?? null;
  const changed =
    match.status !== status ||
    match.statusLabel !== statusLabel ||
    match.shortDetail !== shortDetail ||
    match.homeTeam.score !== homeScore ||
    match.awayTeam.score !== awayScore ||
    match.homeTeam.winner !== homeWinner ||
    match.awayTeam.winner !== awayWinner ||
    JSON.stringify(match.shootout ?? null) !== JSON.stringify(shootout) ||
    (match.homeTeam.penaltyScore ?? null) !== homePenaltyScore ||
    (match.awayTeam.penaltyScore ?? null) !== awayPenaltyScore;

  if (!changed) return false;

  match.status = status;
  match.statusLabel = statusLabel;
  match.shortDetail = shortDetail;
  match.homeTeam.score = homeScore;
  match.awayTeam.score = awayScore;
  match.homeTeam.winner = homeWinner;
  match.awayTeam.winner = awayWinner;
  match.shootout = shootout;
  match.homeTeam.penaltyScore = homePenaltyScore;
  match.awayTeam.penaltyScore = awayPenaltyScore;
  return true;
}

function refreshHeadlineCounts(data) {
  const todayMatches = data.today?.matches ?? [];
  data.headline.liveCount = todayMatches.filter((match) => match.status === "in").length;
  data.headline.completedCount = todayMatches.filter((match) => match.status === "post").length;
  data.headline.scheduledCount = todayMatches.filter((match) => match.status === "pre").length;
}

function sortLiveStandings(standings) {
  return [...standings]
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.team.localeCompare(b.team, "zh-CN");
    })
    .map((team, index) => ({
      ...team,
      rank: index + 1,
      note: index < 2 ? "Advance to Round of 32" : index === 2 ? "Best 8 advance" : "Eliminated"
    }));
}

function buildLiveGroupOutlook(group, groupEvents) {
  const leader = group.standings[0];
  const runnerUp = group.standings[1];
  const sleeper = group.standings[2];
  const liveCount = groupEvents.filter((event) => {
    const status = event.competitions?.[0]?.status?.type?.state ?? event.status?.type?.state;
    return status === "in";
  }).length;
  const upcomingEvent = groupEvents.find((event) => {
    const status = event.competitions?.[0]?.status?.type?.state ?? event.status?.type?.state;
    return status === "pre";
  });
  const competitors = upcomingEvent?.competitions?.[0]?.competitors ?? [];
  const home = competitors.find((item) => item.homeAway === "home");
  const away = competitors.find((item) => item.homeAway === "away");

  return {
    ...group.outlook,
    summary: [
      leader
        ? `${leader.team} 暂时领跑，${leader.points} 分、净胜球 ${leader.goalDiff >= 0 ? "+" : ""}${leader.goalDiff}。`
        : "当前暂无完整积分数据。",
      runnerUp
        ? `${runnerUp.team} 仍在直接晋级区附近，和榜首差距主要体现在积分或净胜球。`
        : "第二名形势暂未明确。",
      sleeper
        ? `${sleeper.team} 仍有机会争取最佳第三，后续对决的拿分效率很关键。`
        : "小组第三名争夺尚待展开。"
    ].join(" "),
    liveAlert: liveCount ? `${group.name} 当前有 ${liveCount} 场比赛正在进行，排名可能随时变化。` : "",
    keyMatch:
      home?.team?.displayName && away?.team?.displayName
        ? `${home.team.displayName} vs ${away.team.displayName} 是下一场值得重点关注的对决。`
        : "本组已无待赛对决。"
  };
}

function updateGroupStandingsFromScoreboard(data, scoreboard) {
  let changed = false;

  data.groups.forEach((group) => {
    const groupEvents = (scoreboard.events ?? []).filter((event) => {
      const competition = event.competitions?.[0];
      return groupNameFromNote(competition?.altGameNote) === group.name;
    });
    if (!groupEvents.length) return;

    const teams = new Map(
      group.standings.map((team) => [
        team.shortName,
        {
          ...team,
          points: 0,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDiff: 0
        }
      ])
    );

    groupEvents.forEach((event) => {
      const competition = event.competitions?.[0];
      const status = competition?.status?.type?.state ?? event.status?.type?.state;
      if (status === "pre") return;

      const competitors = competition?.competitors ?? [];
      const home = competitors.find((item) => item.homeAway === "home");
      const away = competitors.find((item) => item.homeAway === "away");
      const homeTeam = teams.get(home?.team?.abbreviation);
      const awayTeam = teams.get(away?.team?.abbreviation);
      if (!homeTeam || !awayTeam) return;

      const homeScore = Number(home?.score) || 0;
      const awayScore = Number(away?.score) || 0;
      homeTeam.played += 1;
      awayTeam.played += 1;
      homeTeam.goalsFor += homeScore;
      homeTeam.goalsAgainst += awayScore;
      awayTeam.goalsFor += awayScore;
      awayTeam.goalsAgainst += homeScore;

      if (homeScore > awayScore) {
        homeTeam.wins += 1;
        homeTeam.points += 3;
        awayTeam.losses += 1;
      } else if (homeScore < awayScore) {
        awayTeam.wins += 1;
        awayTeam.points += 3;
        homeTeam.losses += 1;
      } else {
        homeTeam.draws += 1;
        awayTeam.draws += 1;
        homeTeam.points += 1;
        awayTeam.points += 1;
      }
    });

    const nextStandings = sortLiveStandings(
      [...teams.values()].map((team) => ({
        ...team,
        goalDiff: team.goalsFor - team.goalsAgainst
      }))
    );
    const before = JSON.stringify(group.standings.map(({ team, rank, points, played, goalDiff }) => ({ team, rank, points, played, goalDiff })));
    const after = JSON.stringify(nextStandings.map(({ team, rank, points, played, goalDiff }) => ({ team, rank, points, played, goalDiff })));

    if (before !== after) {
      group.standings = nextStandings;
      group.outlook = buildLiveGroupOutlook(group, groupEvents);
      changed = true;
    }
  });

  return changed;
}

async function refreshLiveScores() {
  if (!dashboardData) return;

  try {
    const response = await fetch(`${SCOREBOARD_URL}&_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`比分接口 ${response.status}`);

    const scoreboard = await response.json();
    const eventMap = new Map((scoreboard.events ?? []).map((event) => [event.id, event]));
    const matches = [
      ...(dashboardData.today?.matches ?? []),
      ...(dashboardData.tomorrow?.matches ?? []),
      ...(dashboardData.knockout?.matches ?? [])
    ];
    const changed = matches.reduce((hasChanged, match) => {
      const event = eventMap.get(match.id);
      return event ? updateMatchFromEvent(match, event) || hasChanged : hasChanged;
    }, false);
    const groupsChanged = updateGroupStandingsFromScoreboard(dashboardData, scoreboard);

    if (changed) {
      refreshHeadlineCounts(dashboardData);
      renderMetrics(dashboardData.headline);
      renderMatches("#today-matches", dashboardData.today.matches, "今天暂无赛程数据。");
      renderMatches("#tomorrow-matches", dashboardData.tomorrow.matches, "明天暂无重点赛程数据。");
      renderKnockout(dashboardData.knockout);
    }
    if (groupsChanged) {
      renderGroups(dashboardData.groups);
    }

    renderUpdateText(dashboardData, new Date());
  } catch (error) {
    console.warn("实时比分刷新失败", error);
  }
}

function startLiveScorePolling() {
  if (liveScoreTimer) clearInterval(liveScoreTimer);
  refreshLiveScores();
  liveScoreTimer = setInterval(refreshLiveScores, LIVE_SCORE_POLL_MS);
}

function qualificationClass(team) {
  if (team.rank <= 2) return "direct";
  if (team.rank === 3) return "potential";
  return "outside";
}

function qualificationProbability(team) {
  const rankBase = team.rank === 1 ? 94 : team.rank === 2 ? 82 : team.rank === 3 ? 22 : 2;
  const goalDiffBonus = Math.max(-8, Math.min(8, team.goalDiff * 2));
  const pointsBonus = Math.max(-6, Math.min(6, (team.points - 3) * 2));
  const probability = rankBase + goalDiffBonus + pointsBonus;
  return Math.max(2, Math.min(98, Math.round(probability)));
}

function renderQualificationBars(group) {
  return group.standings
    .map((team) => {
      const probability = qualificationProbability(team);
      return `
        <div class="qualification-bar-row">
          <span class="qualification-team">
            <img src="${team.logo}" alt="${team.team}" />
            ${team.team}
          </span>
          <span class="qualification-track"><i style="width: ${probability}%"></i></span>
          <strong>${probability}%</strong>
        </div>
      `;
    })
    .join("");
}

function renderGroupCard(group) {
  const rows = group.standings
    .map(
      (team) => `
        <tr class="qualification-${qualificationClass(team)}">
          <td class="rank-cell">${team.rank}</td>
          <td class="team-cell">
            <img src="${team.logo}" alt="${team.team}" />
            <strong>${team.team}</strong>
          </td>
          <td>${team.played}</td>
          <td>${team.wins}-${team.draws}-${team.losses}</td>
          <td>${team.goalDiff >= 0 ? "+" : ""}${team.goalDiff}</td>
          <td><strong>${team.points}</strong></td>
        </tr>
      `
    )
    .join("");

  const nextMatches = group.nextMatches.length
    ? group.nextMatches
        .map(
          (match) => `
            <div class="mini-item">
              <strong>${match.homeTeam} vs ${match.awayTeam}</strong><br />
              ${match.kickoff} · 倾向 ${match.preview.lean} · 热度 ${match.preview.heat ?? match.preview.confidence}
            </div>
          `
        )
        .join("")
    : `<div class="mini-item">本组暂无待赛对决。</div>`;

  return el(`
    <article class="group-card">
      <div class="group-topline">
        <div class="group-name">${group.name} 小组积分榜</div>
        <span class="group-rule">出线：前 2 + 8 个成绩最好第 3</span>
      </div>
      <table class="table group-standings-table">
        <thead>
          <tr>
            <th>排名</th>
            <th>球队</th>
            <th>场</th>
            <th>胜-平-负</th>
            <th>净</th>
            <th>分</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="outlook-box">
        <h3 class="outlook-title">AI 晋级出线模拟概率</h3>
        <div class="outlook-text">${group.outlook.summary}</div>
        <div class="qualification-bars">
          ${renderQualificationBars(group)}
        </div>
      </div>
      <div class="mini-list">
        <div class="mini-item">${group.outlook.keyMatch}</div>
        ${group.outlook.liveAlert ? `<div class="mini-item">${group.outlook.liveAlert}</div>` : ""}
        ${nextMatches}
      </div>
    </article>
  `);
}

function switchDashboardView(view) {
  document.querySelectorAll(".dashboard-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === view);
  });
  document.querySelectorAll(".dashboard-view").forEach((section) => {
    section.classList.toggle("is-hidden", !section.classList.contains(`dashboard-view-${view}`));
  });
}

async function main() {
  const response = await fetch("./data/latest.json?v=20260702-live-knockout", { cache: "no-store" });
  const data = await response.json();
  dashboardData = data;

  renderMetrics(data.headline);
  renderHeroMeta(data);
  renderUpdateText(data);

  renderMatches("#today-matches", data.today.matches, "今天暂无赛程数据。");
  renderMatches("#tomorrow-matches", data.tomorrow.matches, "明天暂无重点赛程数据。");

  renderGroups(data.groups);
  renderKnockout(data.knockout);

  document.querySelector("#fifa-schedule-link").href = data.links.fifaSchedule;
  document.querySelector("#fifa-standings-link").href = data.links.fifaStandings;
  startLiveScorePolling();
}

document.addEventListener("click", (event) => {
  const trigger = event.target.closest(".odds-modal-trigger");
  if (trigger) {
    openOddsModal(trigger.dataset.matchId);
    return;
  }

  if (
    event.target.matches(".odds-modal-close") ||
    event.target.matches(".odds-modal-backdrop")
  ) {
    closeOddsModal();
    return;
  }

  const tab = event.target.closest(".odds-market-tab");
  if (tab) {
    const modal = document.querySelector("#odds-modal-backdrop");
    const matchId = modal?.dataset.matchId;
    if (matchId) {
      openOddsModal(matchId, Number(tab.dataset.marketIndex) || 0);
    }
  }

  const dashboardTab = event.target.closest(".dashboard-tab");
  if (dashboardTab) {
    switchDashboardView(dashboardTab.dataset.view);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeOddsModal();
  }
});

main().catch((error) => {
  console.error(error);
  document.querySelector("#fixtures-update-text").textContent =
    "数据加载失败，请稍后刷新页面或检查最新构建结果。";
});
