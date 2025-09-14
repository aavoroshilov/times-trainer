const maxTableEl = document.getElementById('maxTable');
const singleNEl  = document.getElementById('singleN');
const modeEl     = document.getElementById('mode');
for (let i=5;i<=12;i++){ [maxTableEl,singleNEl].forEach(sel=>{ const o=document.createElement('option'); o.value=i;o.text=i; sel.appendChild(o); }); }
maxTableEl.value = localStorage.getItem('maxTable') || 10;
modeEl.value     = localStorage.getItem('mode') || 'mixed';
singleNEl.value  = localStorage.getItem('singleN') || 7;
singleNEl.style.display = modeEl.value==='single' ? '' : 'none';
[maxTableEl,modeEl,singleNEl].forEach(el=>el.addEventListener('change',()=>{
  localStorage.setItem('maxTable',maxTableEl.value);
  localStorage.setItem('mode',modeEl.value);
  localStorage.setItem('singleN',singleNEl.value);
  singleNEl.style.display = modeEl.value==='single' ? '' : 'none';
  newQuestion();
}));

const qEl = document.getElementById('q');
const mcEl = document.getElementById('mc');
const ansEl = document.getElementById('answer');
const feedbackEl = document.getElementById('feedback');
const scoreEl = document.getElementById('score');
const totalEl = document.getElementById('total');
const streakEl = document.getElementById('streak');

let a=0,b=0,correct=0,total=0,streak=0,answered=false;

function rand(n){ return 1+Math.floor(Math.random()*n); }

function pickAB(){
  const max = parseInt(maxTableEl.value,10);
  if (modeEl.value==='single'){
    const n = parseInt(singleNEl.value,10);
    return [n, rand(max)];
  }
  return [rand(max), rand(max)];
}

function options(correct){
  const set = new Set([correct]);
  while(set.size<4){
    const noise = correct + Math.floor((Math.random()-0.5)*6);
    set.add(Math.max(1, noise===correct?correct+1:noise));
  }
  return Array.from(set).sort(()=>Math.random()-0.5);
}

function renderMC(){
  mcEl.innerHTML='';
  options(a*b).forEach(val=>{
    const div=document.createElement('div');
    div.className='option';
    div.textContent=val;
    div.addEventListener('click',()=>{ ansEl.value=val; check(); });
    mcEl.appendChild(div);
  });
}

function newQuestion(){
  [a,b]=pickAB();
  qEl.textContent = `${a} × ${b} = ?`;
  ansEl.value=''; answered=false;
  feedbackEl.innerHTML='';
  renderMC();
  ansEl.focus();
}

function check(){
  if(answered) return;
  total++; totalEl.textContent=total;
  const val = parseInt(ansEl.value,10);
  if(val === a*b){
    correct++; streak++;
    feedbackEl.innerHTML = `<span class="ok">✅ Great! ${a}×${b}=${a*b}</span>`;
  }else{
    streak=0;
    feedbackEl.innerHTML = `<span class="no">❌ Oops. ${a}×${b}=${a*b}</span>`;
  }
  scoreEl.textContent=correct;
  streakEl.textContent=streak;
  answered=true;
}

document.getElementById('checkBtn').onclick = check;
document.getElementById('nextBtn').onclick  = newQuestion;
document.getElementById('resetBtn').onclick = ()=>{
  correct=0; total=0; streak=0;
  scoreEl.textContent=0; totalEl.textContent=0; streakEl.textContent=0;
  newQuestion();
};
ansEl.addEventListener('keydown', e=>{ if(e.key==='Enter') check(); });

newQuestion();

// PWA service worker
if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js'); }
