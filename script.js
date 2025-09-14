// --- Elements ---
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

// --- State ---
let totalTasks = 10;
let secsPerTask = 10;
let curIndex = 0;
let score = 0;

let a = 0, b = 0;
let tickId = null;
let remainingMs = 0;
let locked = false; // lock input after submit/timeout until next starts

// --- Utils ---
function two(n){ return n < 10 ? '0'+n : ''+n; }
function fmt(ms){
  const s = Math.max(0, Math.ceil(ms/1000));
  return `00:${two(s)}`;
}
function rand(n){ return 1 + Math.floor(Math.random()*n); } // 1..n

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

// --- Flow ---
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

// Start game
startBtn.onclick = () => {
  totalTasks = parseInt(taskCountEl.value, 10) || 10;
  secsPerTask = Math.min(120, Math.max(3, parseInt(secondsPerTaskEl.value, 10) || 10));
  saveSettings();

  curIndex = 0;
  score = 0;
  qTotalEl.textContent = totalTasks;
  scoreEl.textContent = score;

  toGame();
  nextQuestion();
};

restartBtn.onclick = () => {
  // restart with current settings
  startBtn.click();
};

changeBtn.onclick = () => {
  toSettings();
};

// Question lifecycle
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
  startTimer(secsPerTask * 1000, () => {
    // timeout -> wrong
    giveFeedback(false, a*b, true);
    // short pause, then next
    setTimeout(nextQuestion, 600);
  });
}

function endGame(){
  finalScoreEl.textContent = score;
  finalTotalEl.textContent = totalTasks;
  finalMsgEl.textContent = verdict(score, totalTasks);
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

// Timer
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

// Input + Submit handling
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

  const ok = (val === a*b);
  if (ok) score++;
  scoreEl.textContent = score;

  giveFeedback(ok, a*b, false);
  setTimeout(nextQuestion, 500);
}

function giveFeedback(ok, correct, dueToTimeout){
  const msg = ok
    ? `✅ Correct!`
    : (dueToTimeout ? `⏰ Time's up. ${correct}` : `❌ Wrong. ${correct}`);
  feedbackEl.innerHTML = ok ? `<span class="ok">${msg}</span>` : `<span class="no">${msg}</span>`;
  answerEl.disabled = true;
}

// Init
loadSettings();

// PWA service worker
if ('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js'); }
