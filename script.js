// ======== Config ========
const DELAY_CORRECT_MS = 1200;
const DELAY_WRONG_MS   = 2400;
const EXCLUDE_LAST_N   = 5;

const STATS_MATH_KEY      = 'tt.stats.math.v1';
const STATS_PL_KEY        = 'tt.stats.pl.v1';        // per-item stats
const STATS_PL_RULE_KEY   = 'tt.stats.pl.rule.v1';   // per-rule stats
const BEST_KEY            = 'tt.bestRecords';

const ORTH_TXT_URL  = 'orth_items.txt';
const ORTH_JSON_URL = 'orth_items.json'; // optional fallback

// ======== Elements ========
const $ = id => document.getElementById(id);
const settingsEl = $('settings'), gameEl = $('game'), summaryEl = $('summary');
const modeEl = $('mode'), taskCountEl = $('taskCount'), secondsPerTaskEl = $('secondsPerTask'), startBtn = $('startBtn');

const qIndexEl = $('qIndex'), qTotalEl = $('qTotal'), scoreEl = $('score');
const timerEl = $('timer'), questionEl = $('question');

const mathBlock = $('mathBlock'), plBlock = $('plBlock');
const answerEl = $('answer'), submitBtn = $('submitBtn');
const choicesEl = $('choices');

const feedbackEl = $('feedback'), restartBtn = $('restartBtn'), changeBtn = $('changeBtn');
const finalScoreEl = $('finalScore'), finalTotalEl = $('finalTotal'), finalMsgEl = $('finalMsg'), finalTimeEl = $('finalTime');
const bestLineEl = $('bestLine');

// ======== State ========
let domain = 'math';
let totalTasks = 10, secsPerTask = 10, curIndex = 0, score = 0;
let tickId = null, locked = false;
let questionStartMs = 0, totalElapsedSec = 0;
let lastIds = [];
let usedIds = new Set(); // no duplicates within one game

let ORTH_ITEMS = []; 
let curMath = { a:0, b:0 };
let curPL   = { id:'', masked:'', options:[], correctIndex:0 };

// ======== Utils ========
function two(n){ return n<10 ? '0'+n : ''+n; }
function fmt(ms){ const s = Math.max(0, Math.ceil(ms/1000)); return `00:${two(s)}`; }
function rand(n){ return 1 + Math.floor(Math.random()*n); }
function clamp(v, mi, ma){ return Math.max(mi, Math.min(ma, v)); }
function canonMulId(x,y){ const a = Math.min(x,y), b = Math.max(x,y); return `${a}×${b}`; }
function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }
function loadJSON(key, fallback){ try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } }
function saveJSON(key, obj){ localStorage.setItem(key, JSON.stringify(obj)); }

// ======== Stable IDs ========
function hashId(str){
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  const b36 = (h >>> 0).toString(36);
  return b36.padStart(6, '0').slice(-6);
}
function prefixForRule(rk){ return rk === 'OTHER' ? 'ot' : rk.toLowerCase(); }

// ======== Best-per-mode ========
function loadBestMap(){ return loadJSON(BEST_KEY, {}); }
function saveBestMap(m){ saveJSON(BEST_KEY, m); }
function modeKey(){ return `${domain}:${totalTasks}×${secsPerTask}s`; }
function isBetter(a,b){ if (!b) return true; if (a.score !== b.score) return a.score > b.score; return a.time < b.time; }

// ======== Weights ========
function weightFromStats(s){
  const attempts = s?.attempts || 0, wrongs = s?.wrongs || 0;
  const failureRate = (wrongs + 1) / (attempts + 2); // smoothed
  return 0.05 + failureRate; // 0.05..1.05
}
function weightedPick(candidates, weights){
  const sum = weights.reduce((a,b)=>a+b,0);
  let r = Math.random()*sum;
  for (let i=0;i<candidates.length;i++){ r -= weights[i]; if (r<=0) return candidates[i]; }
  return candidates[candidates.length-1];
}

// ======== Rule helpers (with your latest logic) ========
function ruleKey(it){
  const set = new Set(it.options.map(o => o.toLowerCase()));
  if (set.has('ó') && set.has('u')) return 'OU';
  if (set.has('rz') && set.has('ż')) return 'RZ';
  if (set.has('ch') && set.has('h')) return 'CH';
  if (set.has('ą') || set.has('ę')) return 'AE';
  if (set.has('i') || set.has('j')) return 'JI';
  return 'OTHER';
}
function loadRuleStats(){
  const base = { OU:{attempts:0,wrongs:0}, RZ:{attempts:0,wrongs:0}, CH:{attempts:0,wrongs:0}, AE:{attempts:0,wrongs:0}, JI:{attempts:0,wrongs:0}, OTHER:{attempts:0,wrongs:0} };
  const data = loadJSON(STATS_PL_RULE_KEY, {});
  return Object.assign(base, data);
}
function saveRuleStats(rs){ saveJSON(STATS_PL_RULE_KEY, rs); }
function updateRuleStats(it, ok){
  const key = ruleKey(it);
  const rs = loadRuleStats();
  rs[key].attempts += 1;
  if (!ok) rs[key].wrongs += 1;
  saveRuleStats(rs);
}
function ruleMultiplier(it){
  const key = ruleKey(it);
  const rs = loadRuleStats()[key] || { attempts:0, wrongs:0 };
  const fail = (rs.wrongs + 1) / (rs.attempts + 2);
  return 0.5 + fail; // rules with more failures are shown more often
}

// ======== MATH mode (unchanged) ========
function mathLoadStats(){ return loadJSON(STATS_MATH_KEY, {}); }
function mathSaveStats(s){ saveJSON(STATS_MATH_KEY, s); }
function mathUpdateStats(id, ok){
  const s = mathLoadStats();
  const rec = s[id] || { attempts:0, wrongs:0 };
  rec.attempts++; if (!ok) rec.wrongs++;
  s[id] = rec; mathSaveStats(s);
}
function mathPickNext(){
  const stats = mathLoadStats();
  const all = [];
  for (let i=1;i<=10;i++) for (let j=i;j<=10;j++) all.push(`${i}×${j}`);
  let exN = EXCLUDE_LAST_N;
  while (exN>=0){
    const ex = new Set(lastIds.slice(-exN));
    const cand = all.filter(id => !ex.has(id));
    if (cand.length){
      const weights = cand.map(id => weightFromStats(stats[id]));
      const id = weightedPick(cand, weights);
      const [x,y] = id.split('×').map(Number);
      const a = Math.random()<0.5 ? x : y;
      const b = (a===x) ? y : x;
      return { a,b,id };
    }
    exN--;
  }
  const a = rand(10), b = rand(10); return { a,b,id:canonMulId(a,b) };
}
function renderMathQuestion(a,b){
  questionEl.textContent = `${a} × ${b} = ?`;
  answerEl.readOnly = false; answerEl.value = ''; submitBtn.disabled = true;
  requestAnimationFrame(()=> answerEl.focus({ preventScroll:true }));
}
function handleMathSubmit(){
  if (domain!=='math' || locked) return;
  const val = parseInt(answerEl.value,10); if (Number.isNaN(val)) return;
  locked = true; answerEl.readOnly = true; submitBtn.disabled = true; clearTimer();

  const elapsed = Math.min(secsPerTask, Math.max(0, Math.round((Date.now()-questionStartMs)/1000)));
  totalElapsedSec += elapsed;

  const ok = (val === curMath.a * curMath.b);
  if (ok) score++; scoreEl.textContent = score;
  mathUpdateStats(canonMulId(curMath.a,curMath.b), ok);

  giveFeedback(ok, curMath.a*curMath.b, false);
  setTimeout(nextQuestion, ok ? DELAY_CORRECT_MS : DELAY_WRONG_MS);
}

// ======== POLISH mode ========
function plLoadStats(){ return loadJSON(STATS_PL_KEY, {}); }
function plSaveStats(s){ saveJSON(STATS_PL_KEY, s); }
function plUpdateStats(id, ok){
  const s = plLoadStats();
  const rec = s[id] || { attempts:0, wrongs:0 };
  rec.attempts++; if (!ok) rec.wrongs++;
  s[id] = rec; plSaveStats(s);
}
function shufflePLItem(item){
  const copy = { ...item, options:[...item.options], correctIndex:item.correctIndex };
  if (copy.options.length >= 2){
    // Fisher–Yates with correctIndex tracking
    for (let i = copy.options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy.options[i], copy.options[j]] = [copy.options[j], copy.options[i]];
      if (copy.correctIndex === i) copy.correctIndex = j;
      else if (copy.correctIndex === j) copy.correctIndex = i;
    }
  }
  return copy;
}
function renderPLQuestion(item){
  questionEl.textContent = item.masked;
  choicesEl.innerHTML = '';
  item.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'choice'; btn.textContent = opt;
    btn.addEventListener('touchstart', e=>{ e.preventDefault(); handlePLChoice(idx); }, { passive:false });
    btn.addEventListener('click', ()=> handlePLChoice(idx));
    choicesEl.appendChild(btn);
  });
}
function handlePLChoice(index){
  if (domain!=='pl' || locked) return;
  locked = true; clearTimer();

  const ok = (index === curPL.correctIndex);
  if (ok) score++;
  scoreEl.textContent = score;

  plUpdateStats(curPL.id, ok);
  updateRuleStats(curPL, ok);

  const full = curPL.masked.replace('__', curPL.options[curPL.correctIndex]);
  giveFeedback(ok, full, false);
  setTimeout(nextQuestion, ok ? DELAY_CORRECT_MS : DELAY_WRONG_MS);
}

// Weighted picking, avoiding repeats AND duplicates-in-game
function plPickNext(){
  const itemStats = plLoadStats();
  let exN = EXCLUDE_LAST_N;
  while (exN>=0){
    const ex = new Set([...lastIds.slice(-exN), ...usedIds]);
    const cand = ORTH_ITEMS.filter(it => !ex.has(it.id));
    if (cand.length){
      const weights = cand.map(it => weightFromStats(itemStats[it.id]) * ruleMultiplier(it));
      return weightedPick(cand, weights);
    }
    exN--;
  }
  return ORTH_ITEMS[Math.floor(Math.random()*ORTH_ITEMS.length)];
}

// ======== Views & flow ========
function toSettings(){ clearTimer(); hide(gameEl); hide(summaryEl); show(settingsEl); }
function toGame(){ hide(settingsEl); hide(summaryEl); show(gameEl); }
function toSummary(){ clearTimer(); hide(settingsEl); hide(gameEl); show(summaryEl); }
function startTimer(ms, onExpire){
  clearTimer(); let t=ms; timerEl.textContent = fmt(t);
  tickId = setInterval(()=>{ t-=100; if (t<=0){ clearTimer(); timerEl.textContent = fmt(0); onExpire?.(); } else { timerEl.textContent = fmt(t); } }, 100);
}
function clearTimer(){ if (tickId){ clearInterval(tickId); tickId=null; } }
function giveFeedback(ok, correct, dueToTimeout){
  const msg = ok ? `✅ Correct!` : (dueToTimeout ? `⏰ Time's up. Correct answer: ${correct}` : `❌ Wrong. Correct answer: ${correct}`);
  feedbackEl.innerHTML = ok ? `<span class="ok">${msg}</span>` : `<span class="no">${msg}</span>`;
}
function verdict(ok,total){
  const pct = (ok/total)*100;
  if (pct>=95) return "🌟 Phenomenal! Master!";
  if (pct>=85) return "🎉 Fantastic work!";
  if (pct>=70) return "✅ Great job!";
  if (pct>=50) return "👍 Good effort — keep going!";
  return "💪 Keep practicing — you’ll crush it next time!";
}

// persist settings
function saveSettings(){
  localStorage.setItem('tt.mode', modeEl.value);
  localStorage.setItem('tt.tasks', taskCountEl.value);
  localStorage.setItem('tt.secs', secondsPerTaskEl.value);
}
function loadSettings(){
  const m = localStorage.getItem('tt.mode'); if (m) modeEl.value = m;
  const t = localStorage.getItem('tt.tasks'); if (t) taskCountEl.value = t;
  const s = localStorage.getItem('tt.secs'); if (s) secondsPerTaskEl.value = s;
}

// Start / Restart
startBtn.onclick = () => {
  domain = modeEl.value;
  totalTasks = parseInt(taskCountEl.value,10) || 10;
  secsPerTask = clamp(parseInt(secondsPerTaskEl.value,10) || 10, 3, 120);

  curIndex = 0; score = 0; totalElapsedSec = 0; lastIds = [];
  usedIds = new Set(); // reset per-game used IDs
  qTotalEl.textContent = totalTasks; scoreEl.textContent = score;

  if (domain==='math'){ show(mathBlock); hide(plBlock); } else { hide(mathBlock); show(plBlock); }
  toGame(); nextQuestion();
};
restartBtn.onclick = () => startBtn.click();
changeBtn.onclick = () => toSettings();

function nextQuestion(){
  curIndex++; feedbackEl.textContent = ''; locked = false;
  if (curIndex > totalTasks){ endGame(); return; }
  qIndexEl.textContent = curIndex;

  if (domain==='math'){
    const pick = mathPickNext();
    curMath = { a: pick.a, b: pick.b };
    lastIds.push(pick.id); if (lastIds.length>30) lastIds.shift();
    renderMathQuestion(curMath.a, curMath.b);
    questionStartMs = Date.now();
    startTimer(secsPerTask*1000, () => {
      totalElapsedSec += secsPerTask;
      mathUpdateStats(canonMulId(curMath.a,curMath.b), false);
      giveFeedback(false, curMath.a*curMath.b, true);
      setTimeout(nextQuestion, DELAY_WRONG_MS);
    });
  } else {
    const base = plPickNext();
    const item = shufflePLItem(base);
    curPL = item;
    lastIds.push(item.id); if (lastIds.length>30) lastIds.shift();
    usedIds.add(item.id); // prevent duplicates in this game
    renderPLQuestion(item);
    questionStartMs = Date.now();
    startTimer(secsPerTask*1000, () => {
      totalElapsedSec += secsPerTask;
      plUpdateStats(item.id, false);
      updateRuleStats(item, false);
      const full = item.masked.replace('__', item.options[item.correctIndex]);
      giveFeedback(false, full, true);
      setTimeout(nextQuestion, DELAY_WRONG_MS);
    });
  }
}
function endGame(){
  finalScoreEl.textContent = score;
  finalTotalEl.textContent = totalTasks;
  finalTimeEl.textContent  = `${totalElapsedSec}s`;
  finalMsgEl.textContent   = verdict(score, totalTasks);

  const key = modeKey();
  const bestMap = loadBestMap();
  const current = { score, total: totalTasks, time: totalElapsedSec, ts: Date.now() };
  const oldBest = bestMap[key];

  if (isBetter(current, oldBest)){
    bestMap[key] = current; saveBestMap(bestMap);
    bestLineEl.innerHTML = oldBest
      ? `🎉 You beat the best result (old best: <strong>${oldBest.score}/${oldBest.total}</strong> in <strong>${oldBest.time}s</strong>). New record saved!`
      : `🎉 You set the very first record for ${key}!`;
  } else {
    bestLineEl.innerHTML = oldBest
      ? `Best for ${key}: <strong>${oldBest.score}/${oldBest.total}</strong> with <strong>${oldBest.time}s</strong>.`
      : `No best yet for ${key}.`;
  }
  toSummary();
}

// ======== TXT parser ========
// Format per line:
//   zwie[rz]ęta, [rz, ż]
//   [ż]yrafa, [rz, ż]
//   ale[i]ja, [ji, ii, i]
function parseOrthTXT(text){
  const items = [];
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(l => l && !l.startsWith('#'));
  for (const line of lines){
    const m = line.match(/^(.+?)\s*,\s*\[(.+?)\]\s*$/);
    if (!m) continue;
    const wordWithBr = m[1];
    const opts = m[2].split(',').map(s=>s.trim());
    const corr = (wordWithBr.match(/\[(.+?)\]/) || [,''])[1];
    if (!corr) continue;
    const full = wordWithBr.replace(/\[|\]/g, '');
    const masked = wordWithBr.replace('['+corr+']','__');
    let options = [...opts];
    let correctIndex = options.findIndex(o => o === corr);
    if (correctIndex === -1){ options.unshift(corr); correctIndex = 0; }
    const tmp = { id:'', masked, options, correctIndex, full };
    const rk = ruleKey(tmp);
    const prefix = prefixForRule(rk);
    const sig = masked + '|' + options.join('|') + '|' + full;
    tmp.id = `${prefix}-${hashId(sig)}`;
    items.push(tmp);
  }
  return items;
}

// ======== Load Polish tasks ========
(async function loadOrth(){
  try {
    // Prefer TXT format
    const res = await fetch(ORTH_TXT_URL, { cache:'no-store' });
    if (res.ok){
      const text = await res.text();
      ORTH_ITEMS = parseOrthTXT(text);
    } else {
      // Fallback to JSON / JSONL if provided
      const res2 = await fetch(ORTH_JSON_URL, { cache:'no-store' });
      const txt = await res2.text();
      let raw;
      try { raw = JSON.parse(txt); }
      catch { raw = txt.split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l)); }
      ORTH_ITEMS = raw.map(it => {
        if (!it || !it.masked || !it.full || !Array.isArray(it.options) || it.options.length < 2) return null;
        if (!it.masked.includes('__')) return null;
        let goodIdx = -1;
        for (let i=0;i<it.options.length;i++){
          if (it.masked.replace('__', it.options[i]) === it.full){ if (goodIdx === -1) goodIdx = i; else return null; }
        }
        if (goodIdx >= 0) return { ...it, correctIndex: goodIdx };
        if (it.correctIndex != null && it.masked.replace('__', it.options[it.correctIndex]) === it.full) return it;
        return null;
      }).filter(Boolean);
    }

    if (!ORTH_ITEMS.length) throw new Error('No orth items parsed');

    console.log('[orth] loaded items:', ORTH_ITEMS.length);
  } catch (e) {
    console.error('Failed to load orth items:', e);
    ORTH_ITEMS = [
      { id:'ou-fallback', masked:'kr__l', options:['ó','u'], correctIndex:0, full:'król' },
      { id:'ij-fallback', masked:'o__ciec', options:['j','i'], correctIndex:0, full:'ojciec' }
    ];
  }
})();

// boot
(function loadSettingsOnBoot(){ const m=localStorage.getItem('tt.mode'); if(m) modeEl.value=m;
  const t=localStorage.getItem('tt.tasks'); if(t) taskCountEl.value=t;
  const s=localStorage.getItem('tt.secs'); if(s) secondsPerTaskEl.value=s; })();

// Enable math submit from button/touch
submitBtn.addEventListener('touchstart', e=>{ e.preventDefault(); handleMathSubmit(); }, { passive:false });
submitBtn.addEventListener('mousedown', e=> e.preventDefault());
submitBtn.addEventListener('click', ()=> handleMathSubmit());
