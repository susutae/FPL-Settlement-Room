"use client";

import { useEffect, useMemo, useState } from "react";

type Manager = { id: number; name: string; team: string; overallPoints: number; overallRank: number | null; weeklyTotal: number };
type WeekRow = Manager & { gw: number; gross: number; hit: number; net: number; bench: number; rank: number; prize: number; cumulative: number };
type EntryHistory = { event: number; points: number; total_points: number; overall_rank: number | null; event_transfers_cost: number; points_on_bench?: number };
type LeagueStanding = { entry: number; player_name: string; entry_name: string; event_total: number; total: number };
type LoadState = "loading" | "live" | "demo";

// LiveFPL reference: /leagues/73572?id=1878287. The path value (73572) is the
// classic mini-league ID; the query value (1878287) is a manager entry ID.
const LEAGUE_ID = 73572;
const FPL_ORIGIN = "https://fantasy.premierleague.com";

// Blank proxy uses the included same-origin relay (app/api/fpl/route.ts), which
// avoids browser CORS restrictions. A custom proxy prefix can be configured in
// Data settings; its encoded FPL URL is appended automatically.
const apiUrl = (path: string, proxy: string) => {
  const direct = `${FPL_ORIGIN}${path}`;
  return proxy ? `${proxy}${encodeURIComponent(direct)}` : `/api/fpl?path=${encodeURIComponent(path)}`;
};
const money = (value: number) => `${value >= 0 ? "+" : "−"}$${Math.abs(value)}`;
const rankLabel = (rank: number | null) => rank ? rank.toLocaleString() : "—";
function weeklyPrize(rank: number) { if (rank === 1) return 10; if (rank <= 4) return 5; if (rank === 15) return -10; if (rank >= 12 && rank <= 14) return -5; return 0; }
function seasonPrize(rank: number) { if (rank === 1) return 130; if (rank === 2) return 80; if (rank === 3) return 50; if (rank === 4) return 30; if (rank <= 8) return -25; if (rank <= 12) return -30; return -40; }

const demoNames = [
  ["Marcus Tan","Expected Toulouse"],["Jamie Koh","Son of a Pitch"],["Daniel Lim","No Kane No Gain"],["Isaac Wong","Ctrl Alt De Ligt"],
  ["Ryan Teo","Game of Throw-ins"],["Adrian Goh","Rice Rice Baby"],["Ben Chua","Old Havertz Die Hard"],["Sean Lee","Moves Like Agger"],
  ["Keith Ng","Net Six and Chill"],["Joel Tay","Gueye Pride"],["Darren Low","Bayer Neverlusen"],["Ethan Ho","The Big LeBowski"],
  ["Lucas Ang","Inter Row Z"],["Matt Ong","Tea & Busquets"],["Caleb Yeo","Lallanas in Pyjamas"],
];
function demoData() {
  const managers: Manager[] = demoNames.map(([name,team], index) => ({ id:9000+index,name,team,overallPoints:505-index*9,overallRank:104233+index*13577,weeklyTotal:0 }));
  const weeks = Array.from({length:6},(_,weekIndex) => {
    const gw=weekIndex+1;
    const raw=managers.map((manager,index)=>{const gross=44+((index*13+gw*17)%39);const hit=(index+gw)%6===0?4:0;const bench=2+((index*5+gw*3)%14);return{...manager,gw,gross,hit,net:gross-hit,bench};}).sort((a,b)=>b.net-a.net||b.bench-a.bench||a.name.localeCompare(b.name));
    return raw.map((row,index)=>({...row,rank:index+1,prize:weeklyPrize(index+1),cumulative:0}));
  });
  const running=new Map<number,number>(); weeks.forEach(rows=>rows.forEach(row=>{const cumulative=(running.get(row.id)??0)+row.prize;running.set(row.id,cumulative);row.cumulative=cumulative;}));
  managers.forEach(manager=>manager.weeklyTotal=running.get(manager.id)??0); return {managers,weeks};
}
async function getJson(path:string,proxy:string){const response=await fetch(apiUrl(path,proxy),{headers:{Accept:"application/json"}});if(!response.ok)throw new Error(`FPL returned ${response.status}`);return response.json();}
async function loadLive(proxy:string){
  const[first,bootstrap]=await Promise.all([getJson(`/api/leagues-classic/${LEAGUE_ID}/standings/?page_standings=1`,proxy),getJson("/api/bootstrap-static/",proxy)]);const pages=[first];let page=2;
  while(pages.at(-1)?.standings?.has_next&&page<=5)pages.push(await getJson(`/api/leagues-classic/${LEAGUE_ID}/standings/?page_standings=${page++}`,proxy));
  const standings:LeagueStanding[]=pages.flatMap(p=>p.standings?.results??[]).slice(0,15);if(!standings.length)throw new Error("No league entries returned");
  const standingsById=new Map(standings.map(entry=>[Number(entry.entry),entry]));const managers:Manager[]=standings.map(entry=>({id:Number(entry.entry),name:String(entry.player_name),team:String(entry.entry_name),overallPoints:Number(entry.total??0),overallRank:null,weeklyTotal:0}));
  const currentEvent=(bootstrap.events??[]).find((event:{is_current?:boolean})=>event.is_current);const provisionalGw=currentEvent&&!currentEvent.finished?Number(currentEvent.id):null;
  const histories=await Promise.all(managers.map(m=>getJson(`/api/entry/${m.id}/history/`,proxy)));const maxGw=Math.max(provisionalGw??0,...histories.flatMap(h=>(h.current??[]).map((x:EntryHistory)=>x.event)));
  const historyMaps=histories.map(h=>new Map<number,EntryHistory>((h.current??[]).map((x:EntryHistory)=>[x.event,x])));const weeks:WeekRow[][]=[];const running=new Map<number,number>();
  for(let gw=1;gw<=maxGw;gw++){
    const missingBench=historyMaps.some(map=>map.get(gw)?.points_on_bench==null);
    const picks=missingBench?await Promise.all(managers.map(m=>getJson(`/api/entry/${m.id}/event/${gw}/picks/`,proxy).catch(()=>null))):managers.map(()=>null);
    const raw=managers.map((manager,i)=>{const history=historyMaps[i].get(gw);const fallback=picks[i]?.entry_history;const standing=standingsById.get(manager.id);const isProvisional=gw===provisionalGw;const hit=Number(history?.event_transfers_cost??fallback?.event_transfers_cost??0);const currentTotal=Number(isProvisional?standing?.total??history?.total_points??fallback?.total_points??manager.overallPoints:history?.total_points??fallback?.total_points??manager.overallPoints);const previousTotal=Number(historyMaps[i].get(gw-1)?.total_points??0);const net=isProvisional?Number(standing?.event_total??currentTotal-previousTotal):history?currentTotal-previousTotal:Number(fallback?.points??0)-hit;return{...manager,gw,hit,net,gross:net+hit,bench:Number(history?.points_on_bench??fallback?.points_on_bench??0),overallPoints:currentTotal,overallRank:history?.overall_rank??manager.overallRank};}).sort((a,b)=>b.net-a.net||b.bench-a.bench||a.name.localeCompare(b.name));
    weeks.push(raw.map((row,i)=>{const rank=i+1;const prize=weeklyPrize(rank);const cumulative=(running.get(row.id)??0)+prize;running.set(row.id,cumulative);return{...row,rank,prize,cumulative};}));
  }
  managers.forEach((m,i)=>{const latest=[...historyMaps[i].values()].at(-1);m.weeklyTotal=running.get(m.id)??0;if(!provisionalGw)m.overallPoints=latest?.total_points??m.overallPoints;m.overallRank=latest?.overall_rank??null;});return{managers,weeks,leagueName:first.league?.name||`League ${LEAGUE_ID}`,provisionalGw};
}

export default function Home(){
  const seed=useMemo(()=>demoData(),[]);const[managers,setManagers]=useState(seed.managers);const[weeks,setWeeks]=useState<WeekRow[][]>(seed.weeks);const[selectedGw,setSelectedGw]=useState(seed.weeks.length);const[state,setState]=useState<LoadState>("loading");const[leagueName,setLeagueName]=useState("Weekly Treat League");const[proxy,setProxy]=useState("");const[settingsOpen,setSettingsOpen]=useState(false);const[lastUpdated,setLastUpdated]=useState("—");const[provisionalGw,setProvisionalGw]=useState<number|null>(null);const[cupWinner,setCupWinner]=useState<number|null>(null);const[cupRunnerUp,setCupRunnerUp]=useState<number|null>(null);
  async function refresh(proxyOverride?:string){const nextProxy=proxyOverride??proxy;setState("loading");try{const live=await loadLive(nextProxy.trim());setManagers(live.managers);setWeeks(live.weeks);setLeagueName(live.leagueName);setProvisionalGw(live.provisionalGw);setSelectedGw(Math.max(1,live.weeks.length));setState("live");setLastUpdated(new Date().toLocaleString([],{dateStyle:"medium",timeStyle:"short"}));}catch(error){console.warn("FPL live data unavailable; showing demo data.",error);setManagers(seed.managers);setWeeks(seed.weeks);setSelectedGw(seed.weeks.length);setProvisionalGw(null);setState("demo");setLastUpdated("Demo snapshot");}}
  // Browser-only persisted settings are intentionally loaded once on mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(()=>{const saved=window.localStorage.getItem("fpl-proxy")??"";setProxy(saved);void refresh(saved);},[]);
  const currentRows=weeks[selectedGw-1]??[];const overall=[...managers].sort((a,b)=>b.overallPoints-a.overallPoints||(a.overallRank??Infinity)-(b.overallRank??Infinity));const byWeekly=[...managers].sort((a,b)=>b.weeklyTotal-a.weeklyTotal);const projected=overall.map((m,i)=>{const cup=m.id===cupWinner?30:m.id===cupRunnerUp?20:0;return{...m,season:seasonPrize(i+1),cup,projected:m.weeklyTotal+seasonPrize(i+1)+cup}});const pot=projected.reduce((sum,m)=>sum+m.season+m.cup,0);
  return <main>
    <header className="topbar"><a className="brand" href="#top" aria-label="League home"><span className="brand-mark">FPL</span><span>SETTLEMENT<br/>ROOM</span></a><div className="season">2026/27 SEASON</div><div className="header-actions"><span className={`status ${state}`}><i/>{state==="live"?"Live data":state==="loading"?"Connecting":"Demo mode"}</span><button className="icon-button" onClick={()=>void refresh()} aria-label="Refresh data" title="Refresh data">↻</button><button className="text-button" onClick={()=>setSettingsOpen(true)}>Data settings</button></div></header>
    <section className="hero" id="top"><div><p className="eyebrow">PRIVATE MINI-LEAGUE · ID {LEAGUE_ID}</p><h1>{leagueName}</h1><p className="dek">Every point, hit and dollar—settled. Weekly rankings use net points, with bench points breaking ties.</p></div><div className="roundel"><strong>{weeks.length}</strong><span>gameweeks<br/>scored</span></div></section>
    {state==="demo"&&<div className="notice"><strong>Previewing with sample data.</strong> The 2026/27 league may not be live yet, or this browser blocked the FPL API. Add a proxy in Data settings and retry.</div>}
    {state==="live"&&managers.length<15&&<div className="notice"><strong>Live league data loaded.</strong> FPL currently returns {managers.length} of the expected 15 managers. The remaining positions will appear automatically as managers join.</div>}
    <section className="summary-grid" aria-label="League summary">
      <article className="summary-card top-four"><div className="card-kicker"><span>Current top four</span><em>SEASON</em></div><ol>{overall.slice(0,4).map((m,i)=><li key={m.id}><b>{i+1}</b><span>{m.name}<small>{m.team}</small></span><strong>{m.overallPoints}</strong></li>)}</ol></article>
      <article className="summary-card bottom-four"><div className="card-kicker"><span>Bottom four</span><em>WATCHLIST</em></div><ol>{overall.slice(-4).map((m,i)=><li key={m.id}><b>{overall.length-3+i}</b><span>{m.name}<small>{m.team}</small></span><strong>{m.overallPoints}</strong></li>)}</ol></article>
      <article className="summary-card money-card positive"><div className="card-kicker"><span>Biggest weekly winner</span><em>TO DATE</em></div><p className="big-money">{money(byWeekly[0]?.weeklyTotal??0)}</p><h3>{byWeekly[0]?.name}</h3><p>{byWeekly[0]?.team}</p></article>
      <article className="summary-card money-card negative"><div className="card-kicker"><span>Biggest weekly loser</span><em>TO DATE</em></div><p className="big-money">{money(byWeekly.at(-1)?.weeklyTotal??0)}</p><h3>{byWeekly.at(-1)?.name}</h3><p>{byWeekly.at(-1)?.team}</p></article>
    </section>
    <section className="score-section"><div className="section-heading"><div><p className="eyebrow">WEEKLY LEDGER</p><h2>Gameweek {selectedGw}{selectedGw===provisionalGw&&<span className="provisional-badge">Provisional live</span>}</h2></div><div className="gw-control"><button onClick={()=>setSelectedGw(g=>Math.max(1,g-1))} disabled={selectedGw<=1} aria-label="Previous gameweek">←</button><label><span>SELECT GAMEWEEK</span><select value={selectedGw} onChange={e=>setSelectedGw(Number(e.target.value))}>{weeks.map((_,i)=><option value={i+1} key={i}>GW {i+1}{i+1===provisionalGw?" (live)":""}</option>)}</select></label><button onClick={()=>setSelectedGw(g=>Math.min(weeks.length,g+1))} disabled={selectedGw>=weeks.length} aria-label="Next gameweek">→</button></div></div>
      <div className="table-wrap"><table><thead><tr><th>Rank</th><th>Manager / Team</th><th>GW pts</th><th>Transfer hit</th><th>Net pts</th><th>Bench</th><th>Weekly prize</th><th>Running total</th><th>Overall pts</th><th>Overall rank</th></tr></thead><tbody>{currentRows.map(row=>{const zone=row.rank<=4?"winner":row.rank>=12?"loser":"";return <tr key={row.id} className={zone}><td><span className="rank-pill">{row.rank}</span></td><td><strong>{row.name}</strong><small>{row.team}</small></td><td>{row.gross}</td><td className={row.hit?"hit":"muted"}>{row.hit?`−${row.hit}`:"—"}</td><td><strong className={row.net<0?"red":""}>{row.net}</strong></td><td>{row.bench}</td><td><span className={`money ${row.prize>0?"up":row.prize<0?"down":"flat"}`}>{row.prize?money(row.prize):"—"}</span></td><td><strong>{money(row.cumulative)}</strong></td><td>{row.overallPoints}</td><td>{rankLabel(row.overallRank)}</td></tr>})}</tbody></table></div>
      <div className="legend"><span><i className="win-dot"/>Top 4 paid</span><span><i className="loss-dot"/>Bottom 4 charged</span><span>{selectedGw===provisionalGw?"Scores and weekly prizes can change until FPL finalizes the gameweek.":"Net = GW points − transfer hit, including negative results"}</span><span>Updated {lastUpdated}</span></div></section>
    <section className="settlement-section"><div className="section-heading"><div><p className="eyebrow">IF THE SEASON ENDED TODAY</p><h2>Projected settlement</h2></div><p className="settlement-note">Add cup results when known; the projection updates instantly.</p></div><div className="settlement-layout"><div className="settlement-table table-wrap"><table><thead><tr><th>Pos</th><th>Manager</th><th>Weekly</th><th>Season</th><th>Cup</th><th>Projected</th></tr></thead><tbody>{projected.map((m,i)=><tr key={m.id}><td>{i+1}</td><td><strong>{m.name}</strong><small>{m.team}</small></td><td>{money(m.weeklyTotal)}</td><td>{money(m.season)}</td><td>{m.cup?money(m.cup):"—"}</td><td><strong className={m.projected>=0?"green":"red"}>{money(m.projected)}</strong></td></tr>)}</tbody></table></div><aside className="terms"><p className="eyebrow">TERMS OF REFERENCE</p><h3>Where every dollar goes</h3><div><span>Season podium</span><p>1st +$130 · 2nd +$80 · 3rd +$50 · 4th +$30</p></div><div><span>Season charges</span><p>5th–8th −$25 · 9th–12th −$30 · 13th–15th −$40</p></div><div><span>Weekly</span><p>1st +$10 · 2nd–4th +$5 · 12th–14th −$5 · 15th −$10</p></div><div><span>Cup awards</span><label className="cup-field">Winner<select value={cupWinner??""} onChange={e=>setCupWinner(e.target.value?Number(e.target.value):null)}><option value="">Not known</option>{overall.map(m=><option key={m.id} value={m.id} disabled={m.id===cupRunnerUp}>{m.name}</option>)}</select></label><label className="cup-field">Runner-up<select value={cupRunnerUp??""} onChange={e=>setCupRunnerUp(e.target.value?Number(e.target.value):null)}><option value="">Not known</option>{overall.map(m=><option key={m.id} value={m.id} disabled={m.id===cupWinner}>{m.name}</option>)}</select></label></div><footer><span>Settlement pool balance</span><strong>{money(pot)}</strong></footer></aside></div></section>
    <footer className="page-footer"><span>FPL SETTLEMENT ROOM</span><p>Unofficial league tracker. Data supplied by the public Fantasy Premier League API.</p><a href="#top">Back to top ↑</a></footer>
    {settingsOpen&&<div className="modal-backdrop"><button className="modal-dismiss" onClick={()=>setSettingsOpen(false)} aria-label="Close data settings"/><div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><button className="modal-close" onClick={()=>setSettingsOpen(false)} aria-label="Close settings">×</button><p className="eyebrow">CONNECTION</p><h2 id="settings-title">Data settings</h2><p>Leave this blank to use the included FPL relay. If your host blocks that relay, enter a trusted CORS proxy prefix. The encoded API URL will be appended automatically.</p><label className="proxy-field"><span>Custom proxy prefix</span><input value={proxy} onChange={e=>setProxy(e.target.value)} placeholder="https://your-proxy.example/?url="/></label><div className="modal-actions"><button className="secondary" onClick={()=>{setProxy("");window.localStorage.removeItem("fpl-proxy")}}>Use built-in relay</button><button className="primary" onClick={()=>{window.localStorage.setItem("fpl-proxy",proxy.trim());setSettingsOpen(false);void refresh(proxy.trim())}}>Save & retry</button></div></div></div>}
  </main>;
}
