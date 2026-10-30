'use strict';
// 画面ガイド「はじめての方へ」: 画面の一部を明るくして、使う順番に説明する(共通ルール「使い方の案内を必ず入れる」)。
// 作りは ../marksheet-grader の画面ガイド(TOUR)と同じ。
// tab: 表示するタブ、sel: 明るくする部品(見つからない・見えないときは、その説明を飛ばす)、up: その部品を含む枠まで広げるとき。
// ★ 画面の部品(ボタンの名前・位置・id)を変えたら、ここの sel と説明も直すこと。README の「使い方」ともそろえる。

const TOUR_KEY = 'em.tourSeen';
const TOUR = [
  { title:'ようこそ', text:'定期テストの仕事(時間割・試験監督・時程表・配慮の必要な生徒・点数の集計・個票)をまとめて行うアプリです。<br>これから、使う順番に画面を案内します(約3分)。データファイルを開いていないときは、<b>見本(架空の学校)</b>を開いて案内します。見本は保存されないので、自由に触って大丈夫です。' },
  { sel:'#btnEdit', title:'編集する・編集を終える', text:'データファイルは共有サーバーに1つだけ置き、複数の先生で使います。入力するときは「✏ 編集する」を押します。編集できるのは1度に1人で、ほかの先生には「◯◯先生が編集中」と出ます。終わったら<b>「編集を終える」</b>を押してください。入力は自動で保存されます。<br>「編集する」を押すと<b>お名前</b>を聞かれます(次からは最初から入っています)。' },
  { sel:'#btnLog', title:'編集の記録', text:'<b>誰が・いつ編集したか</b>が残ります(何を変えたかは残りません)。「編集の記録」を押すと、新しい順に「名前・日付・始めた時刻〜最後に保存した時刻」が見られます。' },
  { sel:'#examPick', title:'テストの回', text:'1年分(3〜5回)のテストを1つのファイルで扱います。ここで選んだ回(例：2学期中間)が、時間割・監督・点数などの対象になります。' },
  { tab:'settings', sel:'#setGradeCount', up:'section', title:'設定(年に1回)', text:'学年・クラスの数、別室、時間延長の基本(倍率・分)、教科、先生とサポーターを入れます。先生の「担当教科」は、その教科のテストの時間に監督から外すために使います。' },
  { tab:'roster', sel:'.roster-src', title:'名簿', text:'生徒の名簿は、<b>アカウント管理アプリの名簿</b>から読み込みます。転入・転出・クラス替えは、アカウント管理アプリで直してから「名簿を読み直す」を押します。生徒は学籍番号で見分けるので、組や番号が変わっても点数はずれません。' },
  { tab:'exam', sel:'.exam-list', title:'テストの回を作る', text:'「新しい回を追加」で回を作ります。前の回をもとに作ると、時程や教科、配慮の必要な生徒を写せます。' },
  { tab:'exam', sel:'table.subj', up:'section', title:'教科とテスト時間', text:'その回に行う教科に印を付け、テスト時間(分)と満点を入れます。教科は全学年共通です。テストの日もこの画面で追加します。' },
  { tab:'timetable', sel:'.day-card', title:'時間割', text:'日ごとに、テストの時間の始まりの時刻と教科を選びます。朝の学活・給食・帰りの学活なども入れておくと、時程表に載ります。下の「別室の時程」で、別室だけ始まりをずらせます。時間が重なると、上に注意が出ます。' },
  { tab:'leave', sel:'table.leave', up:'.scroll-x', title:'休暇の集約', text:'「休暇集約用紙を印刷」で先生方に配り、集まったら、ます目を押して休暇・出張を入れます。入れた時間は、監督の自動の割り当てから外します。' },
  { tab:'special', sel:'table.special', up:'.scroll-x', title:'配慮の必要な生徒', text:'欠席の予定、別室で受ける、時間延長(倍率か「分を足す」)の生徒を入れます。同じ別室でも生徒によって始まりを変えられます。職員室に掲示する一覧も、ここから印刷します。' },
  { tab:'proctor', sel:'button[data-act=autoProctor]', up:'.toolbar', title:'試験監督', text:'「自動で案を作る」を押すと、休暇の人や担当教科の時間を避け、回数がそろうように(年間の回数も見て)割り当てます。' },
  { tab:'proctor', sel:'table.proctor', up:'.scroll-x', title:'監督の表', text:'縦に先生、横にテストの時間です。ます目で、その時間に入る教室(1-1・相談室など)を選んで直せます。気になるところは上に出ます。「監督表を印刷」で A4 1枚にまとめて印刷できます。' },
  { tab:'score', sel:'.score-table', title:'点数の入力', text:'教科・学年・組を選んで、点数を入れて Enter で下へ進みます。欠席は「欠」。Excel の点数の列をコピーして、いちばん上の欄に貼り付けると、下へ順に入ります。右に入力の進み具合が出ます。' },
  { tab:'stats', sel:'#tab-stats section', title:'集計', text:'平均点(学年・クラス)、得点分布、5教科・全教科の合計と順位を見られます。上のボタンから、成績一覧表・個票の印刷と、Excel への書き出しができます。' },
  { tab:'print', sel:'.print-cards', title:'印刷', text:'監督表・時程表(教室・別室)・配慮生徒一覧・注意事項・出欠記録用紙・個票・成績一覧表を印刷します。「画面で確かめる・印刷」で形を確かめてから印刷します。PDF にするときは、印刷の画面で「PDF に保存」を選びます。' },
  { tab:'settings', sel:'button[data-act=exportBackup]', up:'section', title:'バックアップを忘れずに', text:'テストの前後など、ときどき「データを書き出す(バックアップ)」で控えを作り、共有サーバーに置いてください。ファイルが壊れたときは「データを読み込む(復元)」で戻せます。' },
  { title:'案内はここまでです', text:()=> isSample
      ? 'このまま見本で、「✏ 編集する」を押して入力したり、印刷の形を確かめたりしてみてください(見本は保存されません)。<br>本番で使うときは、上の「開く」で共有サーバーのデータファイルを開くか、年度のはじめに「新規作成」で作ります。くわしくは README を見てください。'
      : 'くわしい説明は、アプリのフォルダにある README にあります。案内は、上の「はじめての方へ」でいつでも見直せます。' },
];
let tourIndex = -1, tourEls = null;
function tourTarget(t){
  if(!t.sel) return null;
  let el = document.querySelector(t.sel);
  if(el && t.up) el = el.closest(t.up) || el;
  if(!el) return null;
  const r = el.getBoundingClientRect();
  return r.width && r.height ? el : null;   // 見えない部品は対象にしない
}
function startTour(from){
  try{ localStorage.setItem(TOUR_KEY, '1'); }catch(e){}
  if(!tourEls){
    tourEls = { block:document.createElement('div'), hole:document.createElement('div'), card:document.createElement('div') };
    tourEls.block.className = 'tour-block'; tourEls.hole.className = 'tour-hole'; tourEls.card.className = 'tour-card';
    tourEls.card.setAttribute('role', 'dialog'); tourEls.card.tabIndex = -1;
    tourEls.block.onclick = e=> e.stopPropagation();
  }
  Object.values(tourEls).forEach(el=> document.body.appendChild(el));
  document.addEventListener('keydown', tourKey, true);
  window.addEventListener('resize', placeTour);
  showTourStep(from||0, 1);
}
function endTour(){
  if(!tourEls) return;
  Object.values(tourEls).forEach(el=> el.remove());
  document.removeEventListener('keydown', tourKey, true);
  window.removeEventListener('resize', placeTour);
  tourIndex = -1;
}
function tourKey(e){
  if(e.key==='Escape'){ e.stopPropagation(); endTour(); }
  else if(e.key==='ArrowRight') showTourStep(tourIndex+1, 1);
  else if(e.key==='ArrowLeft') showTourStep(tourIndex-1, -1);
}
function showTourStep(i, dir){
  if(i < 0) i = 0;
  if(i >= TOUR.length){ endTour(); return; }
  const t = TOUR[i];
  if(i > 0 && !state){ openSampleForTour(); }   // データファイルを開いていなければ、見本で案内する
  if(t.tab && state && view.tab!==t.tab){ view.tab = t.tab; savePref(); renderAll(); }
  if(t.sel && !tourTarget(t)){ showTourStep(i + (dir||1), dir||1); return; }   // 部品がない説明は飛ばす
  tourIndex = i;
  const val = v => typeof v==='function' ? v() : v;
  const first = i===0, last = i===TOUR.length-1;
  tourEls.card.innerHTML = '<h3>'+val(t.title)+'</h3><p>'+val(t.text)+'</p><div class="tour-foot"><span class="note">'+(i+1)+' / '+TOUR.length+'</span>'
    + (first ? '<button data-t="close">あとで見る</button><button class="primary" data-t="next">'+(state ? '始める' : '見本を開いて始める')+'</button>'
             : '<button data-t="prev">戻る</button><button class="primary" data-t="next">'+(last ? '閉じる' : '次へ')+'</button>')
    + '</div><button data-t="close" class="tour-x" title="案内を閉じる">×</button>';
  tourEls.card.querySelectorAll('[data-t]').forEach(b=> b.onclick = ()=>{
    const a = b.dataset.t;
    if(a==='next') showTourStep(i+1, 1);
    else if(a==='prev') showTourStep(i-1, -1);
    else endTour();
  });
  const el = tourTarget(t);
  if(el) el.scrollIntoView({ block:'center' });
  placeTour();
  tourEls.card.focus({ preventScroll:true });
}
function openSampleForTour(){
  state = makeSample(); fileHandle = null; isSample = true; editing = false; dirty = false;
  view.examId = state.exams[state.exams.length-1].id;
  renderAll();
  setStatus('見本を表示しています(「編集する」で入力も試せます。保存はされません)', 'saved');
}
// 明るくする枠と説明のカードの位置を決める。カードは部品の下、入らなければ上、どちらも無理なら画面の下
function placeTour(){
  if(tourIndex < 0) return;
  const el = tourTarget(TOUR[tourIndex]), hole = tourEls.hole, card = tourEls.card;
  const cw = card.offsetWidth, ch = card.offsetHeight, vw = innerWidth, vh = innerHeight, m = 16;
  if(!el){
    hole.style.cssText = 'top:50%;left:50%;width:0;height:0';
    card.style.left = Math.max(m, (vw-cw)/2)+'px'; card.style.top = Math.max(m, (vh-ch)/2)+'px';
    return;
  }
  const r = el.getBoundingClientRect(), pad = 6;
  const top = Math.max(4, r.top-pad), bottom = Math.min(vh-4, r.bottom+pad);
  hole.style.cssText = 'top:'+top+'px;left:'+Math.max(4, r.left-pad)+'px;width:'+Math.min(vw-8, r.width+pad*2)+'px;height:'+Math.max(0, bottom-top)+'px';
  let y = bottom + 12;
  if(y + ch > vh - m) y = top - 12 - ch;
  if(y < m) y = vh - ch - m;
  card.style.top = y+'px';
  card.style.left = Math.min(vw-cw-m, Math.max(m, r.left))+'px';
}
$('btnTour').addEventListener('click', ()=> startTour(0));
$('bnTour').addEventListener('click', ()=> startTour(0));
// はじめて開いたとき(このブラウザで案内を見たことがなく、データファイルも開いていないとき)は、案内の最初の画面を出す
function maybeAutoTour(){
  let seen = true; try{ seen = !!localStorage.getItem(TOUR_KEY); }catch(e){}
  if(!seen && !state) startTour(0);
}
