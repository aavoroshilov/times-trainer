// ----- Config -----
const DELAY_CORRECT_MS = 1200;
const DELAY_WRONG_MS   = 2400;

// ----- Elements -----
const $ = id => document.getElementById(id);
const settingsEl = $('settings');
const gameEl = $('game');
const summaryEl = $('summary');

const taskCountEl = $('taskCount');
const secondsPerTaskEl = $('secondsPerTask');
const startBtn = $('startBtn');

const qIndexEl = $('qIndex');
const qTotalEl = $('qTotal');
const scoreEl = $('score');
const timerEl = $('timer');
const questionEl = $('question');
const answerEl = $('answer');
const submitBtn = $('submitBtn');
const feedbackEl = $('feedback');

const restartBtn = $('restartBtn');
const changeBtn = $('changeBtn');
const finalScoreEl = $('finalScore');
const finalTotalEl = $('finalTotal');
const finalMsgEl = $('finalMsg');
const finalTimeEl = $('finalTime');
const bestLineEl = $('bestLine');

// ----- State -----
let totalTasks = 10;
let secsPerTask = 10;
let curIndex = 0;
let score = 0;

let a = 0, b = 0;
let tickId = null;
let locked = false;

let questionStartMs = 0;
let totalElapsedSec = 0;

// ----- Utils -----
function two(n){ return n < 10 ? '0'+n : ''+n; }
function fmt(ms){ const s = Math.max(0, Math.ceil(ms/1000)); return `00:${two(s)}`; }
function rand(n){ return 1 + Math.floor(Math.random()*n); }
function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

function saveSettings(){
  localStorage.setItem('tt.tasks', taskCountEl.value);
  localStorage.setItem('tt.secs', secondsPerTaskEl.value);
}
function loadSettings(){
  const t = localStorage.getItem('tt.tasks');
  const s = localStorage.getItem('tt.secs');
  if (t) taskCountEl.value = t;
  if (s) secondsPerTaskEl.value = s;
}

const BEST_KEY = 'tt.bestRecords';
function loadBestMap(){ try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch { return {}; } }
function saveBestMap(obj){ localStorage.setItem(BEST_KEY, JSON.stringify(obj)); }
function modeKey(tasks, secs){ return `${tasks}×${secs}s`; }
function isBetter(a, b){ if (!b) return true; if (a.score !== b.score) return a.score > b.score; return a.time < b.time; }

// ----- Focus helpers (keep keyboard open on iOS) -----
function keepFocusOnSubmit(){
  // Prevent the button press from stealing focus (which would close the keyboard)
  submitBtn.addEventListener('mousedown', e => e.preventDefault());
  submitBtn.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
}
function focusAnswer(){
  // Try to (re)focus over a couple of frames without scrolling
  requestAnimationFrame(() => {
    answerEl.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      answerEl.focus({ preventScroll: true });
    });
  });
}

// ----- View switches -----
function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }
function toSettings(){ clearTimer(); hide(gameEl); hide(summaryEl); show(settingsEl); }
function toGame(){ hide(settingsEl); hide(summaryEl); show(gameEl); }
function toSummary(){ clearTimer(); hide(settingsEl); hide(gameEl); show(summaryEl); }

// ----- Start / Restart -----
startBtn.onclick = () => {
  totalTasks = parseInt(taskCountEl.value, 10) || 10;
  secsPerTask = clamp(parseInt(secondsPerTaskEl.value, 10) || 10, 3, 120);
  saveSettings();

  curIndex = 0;
  score = 0;
  totalElapsedSec = 0;
  qTotalEl.textContent = totalTasks;
  scoreEl.textContent = score;

  toGame();
  keepFocusOnSubmit();
  nextQuestion();
};
restartBtn.onclick = () => startBtn.click();
changeBtn.onclick = () => toSettings();

// ----- Question cycle -----
function nextQuestion(){
  curIndex++;
  feedbackEl.textContent = '';
  locked = false;

  if (curIndex > totalTasks){ endGame(); return; }

  qIndexEl.textContent = curIndex;
  a = rand(10); b = rand(10);
  questionEl.textContent = `${a} × ${b} = ?`;

  // Prepare input but DON'T disable/blur (keeps keyboard up)
  answerEl.readOnly = false;
  answerEl.value = '';
  submitBtn.disabled = true;

  questionStartMs = Date.now();
  startTimer(secsPerTask * 1000, () => {
    totalElapsedSec += secsPerTask;
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
  clearTimer();
  let remainingMs = ms;
  timerEl.textContent = fmt(remainingMs);
  tickId = setInterval(() => {
    remainingMs -= 100;
    if (remainingMs <= 0){
      clearTimer();
      timerEl.textContent = fmt(0);
      onExpire?.();
    } else {
      timerEl.textContent = fmt(remainingMs);
    }
  }, 100);
}
function clearTimer(){ if (tickId){ clearInterval(tickId); tickId = null; } }

// ----- Input (digits only) -----
submitBtn.addEventListener('click', () => submitAnswer());
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
  // Keep the input focused so the keyboard stays open, just make it read-only
  answerEl.readOnly = true;
  submitBtn.disabled = true;
  clearTimer();

  const elapsed = Math.min(secsPerTask, Math.max(0, Math.round((Date.now() - questionStartMs)/1000)));
  totalElapsedSec += elapsed;

  const ok = (val === a*b);
  if (ok) score++;
  scoreEl.textContent = score;

  giveFeedback(ok, a*b, false);
  setTimeout(nextQuestion, ok ? DELAY_CORRECT_MS : DELAY_WRONG_MS);
}

function giveFeedback(ok, correct, dueToTimeout){
  const msg = ok
    ? `✅ Correct!`
    : (dueToTimeout ? `⏰ Time's up. Correct answer: ${correct}` : `❌ Wrong. Correct answer: ${correct}`);
  feedbackEl.innerHTML = ok ? `<span class="ok">${msg}</span>` : `<span class="no">${msg}</span>`;
}

// ----- Init -----
loadSettings();
