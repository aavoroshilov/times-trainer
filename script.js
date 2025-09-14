// ----- Config (tweakable) -----
const DELAY_CORRECT_MS = 1200;   // how long to show "Correct"
const DELAY_WRONG_MS   = 1800;   // how long to show "Wrong / Time's up"

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

const modeTagEl = $('modeTag');
const recordsTable = $('recordsTable');
const recordsBody = $('recordsBody');
const noRecords = $('noRecords');

// ----- State -----
let totalTasks = 10;
let secsPerTask = 10;
let curIndex = 0;
let score = 0;

let a = 0, b = 0;
let tickId = null;
let remainingMs = 0;
let locked = false; // lock input after submit/timeout until next starts

let questionStartMs = 0;  // when the current question started
let totalElapsedSec = 0;  // accumulated total time in seconds for the whole game

// ----- Utils -----
function two(n){ return n < 10 ? '0'+n : ''+n; }
function fmt(ms){
  const s = Math.max(0, Math.ceil(ms/1000));
  return `00:${two(s)}`;
}
function rand(n){ return 1 + Math.floor(Math.random()*n); } // 1..n
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

function recordsKey(tasks, secs){
  return `${tasks}×${secs}s`;
}

function loadAllRecords(){
  try {
    return JSON.parse(localStorage.getItem('tt.records') || '{}');
  } catch {
    return {};
  }
}
function saveAllRecords(obj){
  localStorage.setItem('tt.records', JSON.stringify(obj));
}

// ----- Flow helpers -----
function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }

function toSettings(){
  clearTimer();
  hide(gameEl); hide(summaryEl); show(settingsEl);
}

function toGame(){
  hide(settingsEl); hide(summaryEl); show(gameEl);
}

function toSummary(){
  clearTimer();
  hide(settingsEl); hide(gameEl); show(summaryEl);
}

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
  nextQuestion();
};

restartBtn.onclick = () => startBtn.click();
changeBtn.onclick = () => toSettings();

// ----- Question lifecycle -----
function nextQuestion(){
  curIndex++;
  feedbackEl.textContent = '';
  locked = false;

  if (curIndex > totalTasks){
    endGame();
    return;
  }

  qIndexEl.textContent = curIndex;
  // Always 1..10 table
  a = rand(10);
  b = rand(10);
  questionEl.textContent = `${a} × ${b} = ?`;

  // reset input
  answerEl.value = '';
  answerEl.disabled = false;
  submitBtn.disabled = true; // enabled when input appears
  answerEl.focus();

  // start per-task timer
  questionStartMs = Date.now();
  startTimer(secsPerTask * 1000, () => {
    // timeout -> wrong, count full allotted time for this task
    totalElapsedSec += secsPerTask;
    giveFeedback(false, a*b, true);
    setTimeout(nextQuestion, DELAY_WRONG_MS);
  });
}

function endGame(){
  const key = recordsKey(totalTasks, secsPerTask);
  finalScoreEl.textContent = score;
  finalTotalEl.textContent = totalTasks;
  finalTimeEl.textContent = `${totalElapsedSec}s`;
  finalMsgEl.textContent = verdict(score, totalTasks);
  modeTagEl.textContent = key;

  // Update & show records
  const all = loadAllRecords();
  const list = all[key] || [];
  list.push({
    score,
    total: totalTasks,
    time: totalElapsedSec,
    ts: Date.now()
  });

  // Sort: score desc, then time asc (faster is better)
  list.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.time - b.time;
  });

  // Keep top 10 for this mode
  all[key] = list.slice(0, 10);
  saveAllRecords(all);

  // Best line
  const best = all[key][0];
  const bestLine = (best)
    ? `Best for ${key}: <strong>${best.score}/${best.total}</strong> with <strong>${best.time}s</strong>.`
    : `Be the first to set a record for ${key}!`;
  document.getElementById('bestLine').innerHTML = bestLine;

  // Table render
  renderRecords(all[key]);

  toSummary();
}

function renderRecords(records){
  if (!records || records.length === 0){
    recordsTable.classList.add('hidden');
    noRecords.classList.remove('hidden');
    return;
  }
  noRecords.classList.add('hidden');
  recordsTable.classList.remove('hidden');
  recordsBody.innerHTML = '';
  records.forEach((r, i) => {
    const tr = document.createElement('tr');
    const date = new Date(r.ts);
    const ds = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${r.score}/${r.total}</td>
      <td>${r.time}s</td>
      <td>${ds}</td>
    `;
    recordsBody.appendChild(tr);
  });
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
  remainingMs = ms;
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

function clearTimer(){
  if (tickId){ clearInterval(tickId); tickId = null; }
}

// ----- Input + Submit handling -----
submitBtn.addEventListener('click', () => submitAnswer());

answerEl.addEventListener('input', () => {
  submitBtn.disabled = locked || answerEl.value.trim() === '';
});

// Keep Enter support for hardware keyboards
answerEl.addEventListener('keydown', (e)=>{
  if (e.key === 'Enter') submitAnswer();
});

function submitAnswer(){
  if (locked) return;
  const val = parseInt(answerEl.value, 10);
  if (Number.isNaN(val)) return;

  locked = true;
  answerEl.disabled = true;
  submitBtn.disabled = true;
  clearTimer();

  // Time for this question (cap at secsPerTask)
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
  answerEl.disabled = true;
}

// ----- Init -----
loadSettings();
