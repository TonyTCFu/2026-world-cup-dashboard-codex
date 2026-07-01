# 2026 World Cup Dashboard

一个面向 2026 世界杯的静态 Dashboard，聚合：

- 每日赛程快报
- 当日战况与比分状态
- 淘汰赛 32 强至冠军路径树状对战表
- 淘汰赛点球大战比分与晋级结果
- 每组剩余对决的赛前预估

## 方案说明

### 为什么先用静态站点

- 成本低，适合快速公网发布
- 多设备访问稳定
- 通过定时更新 `data/latest.json`，可以把日更流程自动化

### 数据来源

- ESPN 公共赛程接口：赛程、比分、比赛状态、场馆、DraftKings 公开盘口
- 赔率看板：Bet365、威廉希尔、立博为基于 DraftKings 公共盘口公平概率的模型折算；波胆比分为条件比分分布推算，不冒充实时官方报价
- ESPN 公共积分接口：分组积分榜与晋级态势
- FIFA 官方页面：作为赛事官方核对入口
- 淘汰赛阶段：ESPN 赛程里的 `Round of 32`、`Round of 16`、`Quarterfinals` 等场次会归入「淘汰赛」树状对战表，页面打开后同样参与 30 秒比分同步；未公开的半决赛、决赛、季军战先显示待官方赛程更新
- 点球大战：使用 ESPN `FT-Pens` 状态与 `advance x-y on penalties` 说明写入比赛结果，普通比分与点球比分会同时展示

## 本地使用

1. 生成最新数据

```bash
npm run build:data
```

2. 本地预览

```bash
python3 -m http.server 4173
```

然后访问 `http://localhost:4173`。

## 自动更新

- 当前公网发布使用 GitHub Pages 的 `main` 分支静态发布
- 本地可执行 `npm run publish:public`，会把公开文件镜像到公网仓库
- 当前云端刷新节奏：GitHub Pages 固定每 1 小时重建并发布一次。
- 页面打开后会由浏览器每 30 秒直接抓取 ESPN 公开比分接口，更新今日、明日与淘汰赛看板里的比分与比赛状态；这个实时比分轮询不触发 GitHub Pages 重建。
- 若后续接入实时赔率抓取，赔率源可独立按更高频率更新，但不强制触发整站高频发布。
- 自动更新需要同时重建最新赛程、比分、积分榜和赛前预估，再一并发布到公网
- 云端自动更新使用 GitHub Actions 执行，不依赖本机持续开机
- 本地 Codex 自动任务可保留为备用，但正式日更以云端工作流为准

当前独立仓库：

- `https://github.com/TonyTCFu/2026-world-cup-dashboard-codex`

## 公网部署建议

推荐 GitHub Pages：

1. 把当前目录推到 GitHub 仓库
2. 在仓库 `Settings -> Pages`
3. `Build and deployment` 选择 `Deploy from a branch`
4. 选择 `main` 分支和 `/ (root)`

当前公网地址：

- `https://tonytcfu.github.io/2026-world-cup-dashboard-codex/`

这样页面和数据会一起静态发布，手机、平板、电脑都能访问同一个公网地址。
