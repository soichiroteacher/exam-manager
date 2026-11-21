'use strict';
// タブの切り替え・見本・起動(ほかの js をすべて読み込んだあとに動かす)

document.querySelectorAll('nav.tabs button').forEach(b=> b.addEventListener('click', ()=>{
  if(!state) return;
  view.tab = b.dataset.tab; savePref(); renderAll();
}));
document.addEventListener('keydown', e=>{
  if(e.key==='Escape') document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show'));
  if((e.ctrlKey||e.metaKey) && e.key==='s'){ e.preventDefault(); doSave(); }
});
$('bnSample').addEventListener('click', ()=>{
  state = makeSample(); fileHandle = null; isSample = true; editing = false; dirty = false; viewOnly = false; fileNotice = ''; currentName = '';
  view.examId = state.exams[state.exams.length-1].id;   // いちばん新しい回を開く
  renderAll();
  setStatus('見本を表示しています(「編集する」で入力も試せます。保存はされません)', 'saved');
});

$('otherLabels').innerHTML = CONFIG.otherLabels.map(l=>'<option value="'+esc(l)+'">').join('');

// 起動: データのフォルダから今の年度のファイルを開く(files.js)。はじめて開いたときは、画面の案内を出す(tour.js)
bootFiles().then(maybeAutoTour);
