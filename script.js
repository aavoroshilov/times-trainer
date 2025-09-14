// ----- Config -----
const DELAY_CORRECT_MS = 1200;
const DELAY_WRONG_MS   = 2400;
const EXCLUDE_LAST_N   = 5;     // don’t repeat any of the last 5 tasks
const STATS_KEY        = 'tt.stats.v1'; // per-task stats (shared across modes)
const BEST_KEY         = 'tt.bestRecords'; // best result per mode

// ----- Elements -----
const $ = id => document.getElementById(id);
const settingsEl = $('settings'), gameEl = $('game'), summaryEl = $('summary');
const taskCountEl = $('taskCount'), secondsPerTaskEl = $('secondsPerTask'), startBtn = $('startBtn');
const qIndexEl = $('qIndex'), qTotalEl = $('qTotal'), scoreEl = $('score');
const timerEl = $('timer'), questionEl = $('question'), answerEl = $('answer'), submitBtn = $('submitBtn');
const feedbackEl = $('feedback'), restartBtn = $('restartBtn'), changeBtn = $('changeBtn');
const finalScoreEl = $('finalScore'), finalTotalEl = $('finalTotal'), finalMsgEl = $('finalMsg'), finalTimeEl = $('finalTime');
const bestLineEl = $('bestLine');

// ----- State -----
let totalTasks = 10, secsPerTask = 10, curIndex = 0, score = 0;
let a = 0, b = 0, tickId = null, locked = false;
let questionStartMs = 0, totalElapsedSec = 0;

// keep a rolling history of last asked canonical ids
const lastIds = [];

// ----- Utils -----
function two(n){ return n<10 ? '0'+n : ''+n; }
function fmt(ms){ const s = Math.max(0, Math.ceil(ms/1000)); return `00:${two(s)}`; }
function rand(n){ return 1 + Math.floor(Math.random()*n); }
function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
function canonId(x,y){ const a = Math.min(x,y), b = Math.max(x,y); return `${a}×${b}`; }

// ----- Stats store (local, shared across modes) -----
function loadStats(){
  try { return JSON.parse(localStorage.getItem(STATS_KEY) || '{}'); }
  catch { return {}; }
}
function saveStats(stats){
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}
// update after each task
function updateStats(id, correct){
  const stats = loadStats();
  const s = stats[id] || { attempts: 0, wrongs: 0 };
  s.attempts += 1;
  if (!correct) s.wrongs += 1;
  stats[id] = s;
  saveStats(stats);
}
// weight: higher when user fails more (Laplace-smoothed)
function weightFor(stats, id){
  const s = stats[id] || { attempts: 0, wrongs: 0 };
  const failureRate = (s.wrongs + 1) / (s.attempts + 2); // 0..1
  // Base min weight so easy facts still show up sometimes
  return 0.05 + failureRate; // 0.05..1.05
}
// pick next (exclude recent)
function pickNext(){
  const stats = loadStats();
  // build all canonical ids 1..10
  const all = [];
  for (let i=1;i<=10;i++){
    for (let j=i;j<=10;j++){ // canonical (i<=j)
      all.push(`${i}×${j}`);
    }
  }
  // progressively relax exclusion if needed (edge case)
  let excludeN = EXCLUDE_LAST_N;
  while (excludeN >= 0){
    const excluded = new Set(lastIds.slice(-excludeN));
    const candidates = all.filter(id => !excluded.has(id));
    if (candidates.length){
      // weighted random by failure rate
      const weights = candidates.map(id => weightFor(stats, id));
      const totalW = weights.reduce((a,b)=>a+b,0);
      let r = Math.random() * totalW;
      for (let idx=0; idx<candidates.length; idx++){
        r -= weights[idx];
        if (r <= 0){
          const id = candidates[idx];
          const [x,y] = id.split('×').map(Number);
          // randomly flip order so child sees both orientations
          return Math.random() < 0.5 ? [x,y] : [y,x];
        }
      }
      // fallback
      const id = candidates[candidates.length-1];
      const [x,y] = id.split('×').map(Number);
      return Math.random() < 0.5 ? [x,y] : [y,x];
    }
    excludeN--; // relax and retry
  }
  // ultimate fallback: fully random
  return [rand(10), rand(10)];
}

// ----- Best-per-mode (unchanged) -----
function loadBestMap(){ try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch { return {}; } }
function saveBestMap(obj){ localStorage.setItem(BEST_KEY, JSON.stringify(obj)); }
function modeKey(tasks, secs){ return `${tasks}×${secs}s`; }
function isBetter(a, b){ if (!b) return true; if (a.score !== b.score) return a.score > b.score; return a.time < b.time; }

// ----- View helpers -----
function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }
function toSettings(){ clearTimer(); hide(gameEl); hide(summaryEl); show(settingsEl); }
function toGame(){ hide(settingsEl); hide(summaryEl); show(gameEl); }
function toSummary(){ clearTimer(); hide(settingsEl); hide(gameEl); show(summaryEl); }
function focusAnswer(){
  requestAnimationFrame(() => {
    answerEl.focus({ preventScroll: true });
    requestAnimationFrame(() => answerEl.focus({ preventScroll: true }));
  });
}
function wireSubmitHandlers(){
  submitBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); submitAnswer(); }, { passive:false });
  submitBtn.addEventListener('mousedown', (e)=> e.preventDefault());
  submitBtn.addEventListener('click', ()=> submitAnswer());
}

// ----- Settings persist -----
function saveSettings(){ localStorage.setItem('tt.tasks', taskCountEl.value); localStorage.setItem('tt.secs', secondsPerTaskEl.value); }
function loadSettings(){
  const t = localStorage.getItem('tt.tasks'), s = localStorage.getItem('tt.secs');
  if (t) taskCountEl.value = t;
  if (s) secondsPerTaskEl.value = s;
}

// ----- Start / Restart -----
startBtn.onclick = () => {
  totalTasks = parseInt(taskCountEl.value, 10) || 10;
  secsPerTask  = clamp(parseInt(secondsPerTaskEl.value, 10) || 10, 3, 120);
  saveSettings();

  curIndex = 0; score = 0; totalElapsedSec = 0;
  qTotalEl.textContent = totalTasks; scoreEl.textContent = score;

  toGame(); wireSubmitHandlers(); nextQuestion();
};
restartBtn.onclick = () => startBtn.click();
changeBtn.onclick = () => toSettings();

// ----- Question cycle -----
function nextQuestion(){
  curIndex++; feedbackEl.textContent = ''; locked = false;
  if (curIndex > totalTasks){ endGame(); return; }

  qIndexEl.textContent = curIndex;

  // PICK based on stats (weighted), excluding last few
  [a, b] = pickNext();
  questionEl.textContent = `${a} × ${b} = ?`;

  // track this id for exclusion next time
  const id = canonId(a,b);
  lastIds.push(id);
  if (lastIds.length > 20) lastIds.shift(); // keep small history

  // prepare input without closing keyboard
  answerEl.readOnly = false; answerEl.value = ''; submitBtn.disabled = true;

  questionStartMs = Date.now();
  startTimer(secsPerTask * 1000, () => {
    totalElapsedSec += secsPerTask;
    // timeout counts as wrong
    updateStats(id, /*correct*/ false);
    giveFeedback(false, a*b, true);
    setTimeout(nextQuestion, DELAY_WRONG_MS);
  });

  focusAnswer();
}

function endGame(){
  finalScoreEl.textContent = score;
  finalTotalEl.textContent = totalTasks;
  finalTimeEl.textContent = `${totalElapsedSec}s`;
  finalMsgEl.textContent = verdict(score, totalTasks);

  const key = modeKey(totalTasks, secsPerTask);
  const bestMap = loadBestMap();
  const current = { score, total: totalTasks, time: totalElapsedSec, ts: Date.now() };
  const oldBest = bestMap[key];

  if (isBetter(current, oldBest)) {
    bestMap[key] = current;
    saveBestMap(bestMap);
    if (oldBest) {
      bestLineEl.innerHTML = `🎉 You beat the best result (old best: <strong>${oldBest.score}/${oldBest.total}</strong> in <strong>${oldBest.time}s</strong>). New record saved!`;
    } else {
      bestLineEl.innerHTML = `🎉 You set the very first record for ${key}!`;
    }
  } else {
    bestLineEl.innerHTML = oldBest
      ? `Best for ${key}: <strong>${oldBest.score}/${oldBest.total}</strong> with <strong>${oldBest.time}s</strong>.`
      : `No best yet for ${key}.`;
  }

  toSummary();
}

function verdict(ok, total){
  const pct = (ok/total)*100;
  if (pct >= 95) return "🌟 Phenomenal! Multiplication master!";
  if (pct >= 85) return "🎉 Fantastic work! Keep it up!";
  if (pct >= 70) return "✅ Great job! You're getting very strong.";
  if (pct >= 50) return "👍 Good effort — practice makes perfect!";
  return "💪 Keep practicing — you’ll crush it next time!";
}

// ----- Timer -----
function startTimer(ms, onExpire){
  clearTimer(); let remainingMs = ms; timerEl.textContent = fmt(remainingMs);
  tickId = setInterval(() => {
    remainingMs -= 100;
    if (remainingMs <= 0){ clearTimer(); timerEl.textContent = fmt(0); onExpire?.(); }
    else { timerEl.textContent = fmt(remainingMs); }
  }, 100);
}
function clearTimer(){ if (tickId){ clearInterval(tickId); tickId = null; } }

// ----- Input (digits only) -----
answerEl.addEventListener('input', () => {
  const digits = answerEl.value.replace(/\D+/g, '').slice(0, 3);
  if (digits !== answerEl.value) answerEl.value = digits;
  submitBtn.disabled = locked || digits.length === 0;
});
answerEl.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') submitAnswer(); });

function submitAnswer(){
  if (locked) return;
  const val = parseInt(answerEl.value, 10);
  if (Number.isNaN(val)) return;

  locked = true;
  answerEl.readOnly = true; // keep keyboard up
  submitBtn.disabled = true;
  clearTimer();

  const elapsed = Math.min(secsPerTask, Math.max(0, Math.round((Date.now() - questionStartMs)/1000)));
  totalElapsedSec += elapsed;

  const correct = (val === a*b);
  if (correct) score++;
  scoreEl.textContent = score;

  // update stats for this exact canonical pair
  updateStats(canonId(a,b), correct);

  giveFeedback(correct, a*b, false);
  setTimeout(nextQuestion, correct ? DELAY_CORRECT_MS : DELAY_WRONG_MS);
}

function giveFeedback(ok, correct, dueToTimeout){
  const msg = ok ? `✅ Correct!`
    : (dueToTimeout ? `⏰ Time's up. Correct answer: ${correct}` : `❌ Wrong. Correct answer: ${correct}`);
  feedbackEl.innerHTML = ok ? `<span class="ok">${msg}</span>` : `<span class="no">${msg}</span>`;
}

// ----- Init -----
(function init(){
  loadSettings();
  // ensure stats object exists
  if (!localStorage.getItem(STATS_KEY)) saveStats({});
})();
