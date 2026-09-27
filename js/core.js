'use strict';
// 土台: 小さな道具・データの形・画面の描き直し・入力欄との結びつけ・ファイルの読み書き・編集する/編集を終える
// (保存と編集の仕組みは ../work-planner とほぼ同じ。直すときは両方を見比べるとよい)

//////////////////////// 状態 ////////////////////////
let state = null;          // 今開いているデータ(データファイルの中身そのもの)
let fileHandle = null;     // データファイル(保存先)
let editing = false;       // 編集中か
let dirty = false;         // 保存していない変更があるか
let isSample = false;      // 見本を表示中か(見本は保存しない)
let lastKnownModified = 0; // 最後に読み書きしたときのファイルの更新時刻(ほかの人の保存に気づくため)
let lastLockStamp = 0;     // 最後に「編集中」の印を保存した時刻
const supportsFSA = 'showOpenFilePicker' in window;

// 画面の見方の好み(人ごと。ブラウザに覚えておくだけで、データファイルには入れない)
const view = loadPref('em.view', { tab:'exam', examId:'', rosterGrade:1, specialDay:'' });
function loadPref(key, def){
  try{ const v = JSON.parse(localStorage.getItem(key)); return (v && typeof v==='object') ? Object.assign({}, def, v) : def; }catch(e){ return def; }
}
function savePref(){ try{ localStorage.setItem('em.view', JSON.stringify(view)); }catch(e){} }

//////////////////////// 小さな道具 ////////////////////////
const $ = id => document.getElementById(id);
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function pad2(n){ return String(n).padStart(2,'0'); }
function newId(prefix){ return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function todayYmd(){ const d = new Date(); return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
function isYmd(s){ return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
function weekdayOfYmd(s){ const [y,m,d] = s.split('-').map(Number); return new Date(Date.UTC(y,m-1,d)).getUTCDay(); }
function fmtMD(s){ if(!isYmd(s)) return ''; const [,m,d] = s.split('-').map(Number); return m+'/'+d; }
function fmtMDW(s){ if(!isYmd(s)) return ''; return fmtMD(s)+'('+CONFIG.weekdays[weekdayOfYmd(s)]+')'; }
function fmtJDate(s){ if(!isYmd(s)) return ''; const [,m,d] = s.split('-').map(Number); return m+'月'+d+'日('+CONFIG.weekdays[weekdayOfYmd(s)]+')'; }
function currentFiscalYear(){ const d = new Date(); return d.getMonth()>=3 ? d.getFullYear() : d.getFullYear()-1; }
// 時刻は 'HH:MM' の文字列で持つ。計算は「0時からの分」に直して行う。
function tmin(s){ if(!/^\d{1,2}:\d{2}$/.test(s||'')) return null; const [h,m] = s.split(':').map(Number); return h*60+m; }
function fmtT(n){ if(n==null) return ''; return Math.floor(n/60)+':'+pad2(n%60); }
function hhmm(n){ return pad2(Math.floor(n/60))+':'+pad2(n%60); }
// 名前に「先生」を付けて表示する(入力した名前にすでに付いているときはそのまま)
function sensei(name){ if(!name) return 'ほかの先生'; return /(先生|さん)$/.test(name) ? name : name+'先生'; }
const dis = () => editing ? '' : ' disabled';

//////////////////////// データの形 ////////////////////////
// 形の説明は HANDOFF.md の「6. 作りの概要」にもある。
function emptyState(fy){
  return {
    formatVersion: FORMAT_VERSION,
    app: 'exam-manager',
    meta: {
      schoolName: '', fiscalYear: fy,
      grades: clone(CONFIG.defaultGrades),          // [{ grade:1, classes:4 }]
      rooms: [ { id:'r1', name:'別室1' } ],          // 別室(時間延長・別室受験の部屋)
      extendRate: CONFIG.defaultExtendRate,         // 時間延長の倍率の基本
      extendPlus: CONFIG.defaultExtendPlus,         // 「+〇分」で延長するときの分の基本
      editPasswordHash: '',
      savedAt: null, savedBy: '',
    },
    subjects: CONFIG.defaultSubjects.map(([name, core5], i)=>({ id:'s'+(i+1), name, core5 })),
    teachers: [],   // [{ id, name, kind:'教員'|'サポーター', grade:0(所属なし)|1.., subjects:[subjectId], noProctor:false }]
    students: [],   // [{ id, grade, cls, no, name, kana }]
    exams: [],      // テストの回(newExam を見る)
    editLock: { active:false, since:null, by:'' },
  };
}
// テストの回を1つ作る
function newExam(name){
  const ex = { id:newId('x'), name, days:[], subjects:{}, schedule:{}, leave:{}, proctors:{}, special:[], status:{}, sepStart:{},
    notice:{ title:CONFIG.defaultNoticeTitle, body:CONFIG.defaultNotice }, scores:{} };
  normalizeExam(ex);
  return ex;
}
function newDay(date){
  return { id:newId('d'), date: date||'', slots: CONFIG.defaultDaySlots.map(s=>Object.assign({ id:newId('t'), label:'', end:'' }, clone(s))) };
}
// 読み込んだデータに足りない項目を補う(古い形式のファイルや、手で直したファイルも開けるように)。
// ★ 新しい項目を増やしたら、emptyState・newExam とここに必ず書き足すこと。
function normalizeState(o){
  if(!o || typeof o!=='object' || !o.meta) throw new Error('定期テストのデータファイルではないようです。');
  if(o.app && o.app!=='exam-manager') throw new Error('ほかのアプリ('+o.app+')のデータファイルです。');
  const base = emptyState(currentFiscalYear());
  o.formatVersion = o.formatVersion || FORMAT_VERSION;
  o.app = 'exam-manager';
  o.meta = Object.assign(base.meta, o.meta);
  o.meta.fiscalYear = Number(o.meta.fiscalYear) || currentFiscalYear();
  if(!Array.isArray(o.meta.grades) || !o.meta.grades.length) o.meta.grades = base.meta.grades;
  o.meta.grades = o.meta.grades.map((g,i)=>({ grade:i+1, classes:Math.max(1, Number(g.classes)||1) }));
  if(!Array.isArray(o.meta.rooms)) o.meta.rooms = [];
  o.meta.rooms = o.meta.rooms.filter(r=>r && r.id).map(r=>({ id:String(r.id), name:String(r.name||'') }));
  o.meta.extendRate = Number(o.meta.extendRate) || CONFIG.defaultExtendRate;
  o.meta.extendPlus = Number(o.meta.extendPlus) >= 0 && o.meta.extendPlus!==null ? Number(o.meta.extendPlus) : CONFIG.defaultExtendPlus;
  if(!Array.isArray(o.subjects) || !o.subjects.length) o.subjects = base.subjects;
  o.subjects = o.subjects.filter(s=>s && s.id).map(s=>({ id:String(s.id), name:String(s.name||''), core5:!!s.core5 }));
  o.teachers = (Array.isArray(o.teachers)?o.teachers:[]).filter(t=>t && t.id).map(t=>Object.assign({ name:'', kind:'教員', grade:0, subjects:[], noProctor:false }, t));
  o.teachers.forEach(t=>{ if(!CONFIG.teacherKinds.includes(t.kind)) t.kind = '教員'; t.grade = Number(t.grade)||0; if(!Array.isArray(t.subjects)) t.subjects = []; });
  o.students = (Array.isArray(o.students)?o.students:[]).filter(s=>s && s.id).map(s=>Object.assign({ grade:1, cls:1, no:1, name:'', kana:'' }, s));
  o.students.forEach(s=>{ s.grade = Number(s.grade)||1; s.cls = Number(s.cls)||1; s.no = Number(s.no)||0; });
  o.exams = (Array.isArray(o.exams)?o.exams:[]).filter(x=>x && x.id);
  const saved = state; state = o;   // normalizeExam は state の学年・教科を使うため、一時的に差し替える
  try{ o.exams.forEach(normalizeExam); } finally { state = saved; }
  if(!o.editLock || typeof o.editLock!=='object') o.editLock = { active:false, since:null, by:'' };
  return o;
}
function normalizeExam(ex){
  ex.name = ex.name || '(名前なし)';
  ['subjects','schedule','leave','proctors','status','scores'].forEach(k=>{ if(!ex[k] || typeof ex[k]!=='object' || Array.isArray(ex[k])) ex[k] = {}; });
  if(!Array.isArray(ex.days)) ex.days = [];
  ex.days.forEach(d=>{
    if(!d.id) d.id = newId('d');
    if(!isYmd(d.date)) d.date = '';
    if(!Array.isArray(d.slots)) d.slots = [];
    d.slots.forEach(s=>{ if(!s.id) s.id = newId('t'); if(s.kind!=='other') s.kind = 'test'; s.label = s.label||''; s.start = s.start||''; s.end = s.end||''; });
  });
  // 教科ごとの「その回に実施するか・テスト時間・満点」。教科と時間割は全学年共通(2026-09-27 ユーザーと確認)。
  // 試作の途中の形(学年ごと: subjects['1'][教科] / schedule['時間id|学年'])で保存したファイルは、1年のものを使って直す。
  const gradeKeys = Object.keys(ex.subjects).filter(k=>/^\d+$/.test(k)).sort();
  if(gradeKeys.length) ex.subjects = Object.assign({}, ex.subjects[gradeKeys[0]]);
  state.subjects.forEach(s=>{ ex.subjects[s.id] = Object.assign({ on:true, minutes:CONFIG.defaultMinutes, max:CONFIG.defaultMax }, ex.subjects[s.id]); });
  Object.keys(ex.schedule).sort().forEach(k=>{
    if(!k.includes('|')) return;
    const slotId = k.split('|')[0];
    if(!ex.schedule[slotId]) ex.schedule[slotId] = ex.schedule[k];
    delete ex.schedule[k];
  });
  if(!Array.isArray(ex.special)) ex.special = [];
  ex.special = ex.special.filter(p=>p && p.studentId).map(p=>Object.assign({ id:newId('p'), room:'', extend:false, extType:'rate', rate:null, plus:null, minutes:{}, starts:{}, absentDays:[], note:'' }, p));
  ex.special.forEach(p=>{ if(!p.minutes || typeof p.minutes!=='object') p.minutes = {}; if(!p.starts || typeof p.starts!=='object') p.starts = {}; if(!Array.isArray(p.absentDays)) p.absentDays = []; if(p.extType!=='plus') p.extType = 'rate'; });
  if(!ex.sepStart || typeof ex.sepStart!=='object') ex.sepStart = {};   // 別室だけ始まりをずらす時刻 { '時間id|別室id': 'HH:MM' }
  if(!ex.notice || typeof ex.notice!=='object') ex.notice = { title:CONFIG.defaultNoticeTitle, body:CONFIG.defaultNotice };
  return ex;
}

//////////////////////// データから求めるもの ////////////////////////
function curExam(){
  if(!state || !state.exams.length) return null;
  return state.exams.find(x=>x.id===view.examId) || state.exams[state.exams.length-1];
}
function grades(){ return state.meta.grades.map(g=>g.grade); }
function subjectById(id){ return state.subjects.find(s=>s.id===id); }
function subjectName(id){ const s = subjectById(id); return s ? s.name : ''; }
function teacherById(id){ return state.teachers.find(t=>t.id===id); }
function teacherName(id){ const t = teacherById(id); return t ? t.name : ''; }
function studentById(id){ return state.students.find(s=>s.id===id); }
function roomName(id){ const r = state.meta.rooms.find(x=>x.id===id); return r ? r.name : ''; }
function sortStudents(a,b){ return a.grade-b.grade || a.cls-b.cls || a.no-b.no; }
function studentLabel(s){ return s ? s.grade+'年'+s.cls+'組'+s.no+'番 '+s.name : '(名簿にない生徒)'; }
// 教室の一覧。key は監督の割り当てに使う('c1-2' = 1年2組 / 'r-別室のid')
function classRooms(){
  const out = [];
  state.meta.grades.forEach(g=>{ for(let c=1;c<=g.classes;c++) out.push({ key:'c'+g.grade+'-'+c, grade:g.grade, cls:c, name:g.grade+'-'+c, sep:false }); });
  return out;
}
function sepRooms(){ return state.meta.rooms.map(r=>({ key:'r-'+r.id, roomId:r.id, name:r.name||'(名前なし)', sep:true })); }
// 1日の時程を時刻の順に並べる(データの順番は変えない。i は元の位置 = 入力欄のパスに使う)
function sortedSlots(day){
  return day.slots.map((s,i)=>({ s, i })).sort((a,b)=> (tmin(a.s.start)??9999) - (tmin(b.s.start)??9999) || a.i-b.i);
}
// テストの時間に「1時間目」などの名前を付ける(名前を入れていればそれを使う)
function slotLabel(day, slot){
  if(slot.label) return slot.label;
  if(slot.kind!=='test') return '';
  const n = sortedSlots(day).filter(x=>x.s.kind==='test').findIndex(x=>x.s.id===slot.id) + 1;
  return n+'時間目';
}
// その回のテストの時間をすべて(日の順・時刻の順)
function testSlots(ex){
  const out = [];
  ex.days.forEach((day, di)=> sortedSlots(day).forEach(({s})=>{ if(s.kind==='test') out.push({ day, di, slot:s, label:slotLabel(day, s) }); }));
  return out;
}
function dayTitle(ex, di){ const d = ex.days[di]; return (di+1)+'日目' + (d && d.date ? ' '+fmtMDW(d.date) : ''); }
// 教科と時間割は全学年共通(同じ時間に全学年が同じ教科のテストを受ける)
function examSubj(ex, sid){ return ex.subjects[sid] || { on:false, minutes:CONFIG.defaultMinutes, max:CONFIG.defaultMax }; }
function subjAt(ex, slotId){ return ex.schedule[slotId] || ''; }
function testMinutes(ex, sid){ return Number(examSubj(ex, sid).minutes) || CONFIG.defaultMinutes; }
function slotEnd(ex, slot){
  const sid = subjAt(ex, slot.id), st = tmin(slot.start);
  if(!sid || st==null) return null;
  return st + testMinutes(ex, sid);
}
// 時間延長したときのテスト時間(分)。延長の決め方は2通り(2026-09-27 ユーザー:「〇倍だけでなく、+〇分の場合もある」)
//   extType 'rate' … テスト時間 × 倍率(分は切り上げ) / 'plus' … テスト時間 + 〇分
// 生徒・教科ごとに分を指定していれば、それを優先する。
function extMinutes(ex, sp, sid){
  const own = sp.minutes && Number(sp.minutes[sid]);
  if(own) return own;
  const base = testMinutes(ex, sid);
  if(sp.extType==='plus') return base + (Number(sp.plus)>=0 && sp.plus!=null && sp.plus!=='' ? Number(sp.plus) : state.meta.extendPlus);
  const rate = Number(sp.rate) || state.meta.extendRate;
  return Math.ceil(base * rate - 1e-9);
}
// 延長の決め方を短い文にする(「1.3倍」「+10分」)
function extLabel(sp){
  if(!sp.extend) return '';
  const s = sp.extType==='plus' ? '+'+(sp.plus!=null && sp.plus!=='' ? Number(sp.plus) : state.meta.extendPlus)+'分' : (Number(sp.rate)||state.meta.extendRate)+'倍';
  return s + (Object.keys(sp.minutes||{}).length ? '※' : '');
}
// 別室の、その時間の始まりの時刻(別室だけずらしたときはその時刻。2026-09-27 ユーザー:「始まりや終わりが変わる可能性は高い」)
function sepStartOf(ex, roomId, slot){
  const own = roomId ? tmin(ex.sepStart[slot.id+'|'+roomId]) : null;
  return own!=null ? own : tmin(slot.start);
}
// 配慮の必要な生徒の、その時間の始まり・終わりの時刻(別室の始まり・延長を含む)
// 生徒ごとに始まりを変えていればその時刻、なければ別室の時刻(別室をずらしていれば、その時刻)、なければ教室と同じ
// (2026-09-27 ユーザー: 同じ別室に時間延長の生徒とそうでない生徒がいて、始まりが違う可能性がある)
function specialStart(ex, sp, slot){
  const own = tmin((sp.starts||{})[slot.id]);
  if(own!=null) return own;
  return sp.room ? sepStartOf(ex, sp.room, slot) : tmin(slot.start);
}
function specialEnd(ex, sp, slot){
  const sid = subjAt(ex, slot.id), s0 = specialStart(ex, sp, slot);
  if(!sid || s0==null) return null;
  return s0 + (sp.extend ? extMinutes(ex, sp, sid) : testMinutes(ex, sid));
}
// 「10:20〜11:25」の形(別室・延長の生徒の時刻を見せるとき)
function specialRange(ex, sp, slot){ const e = specialEnd(ex, sp, slot); return e==null ? '' : fmtT(specialStart(ex, sp, slot))+'〜'+fmtT(e); }
function isAbsentDay(sp, day){ return sp.absentDays.includes(day.id); }
// その時間に別室で受ける生徒(テストがあって、欠席の日でない人)
function roomStudentsAt(ex, roomId, day, slot){
  if(!subjAt(ex, slot.id)) return [];
  return ex.special.filter(sp=> sp.room===roomId && !isAbsentDay(sp, day) && studentById(sp.studentId));
}
function proctorsAt(ex, slotId, roomKey){ return ex.proctors[slotId+'|'+roomKey] || []; }

//////////////////////// 入力欄とデータを結びつける ////////////////////////
// 入力欄に data-path="meta.schoolName" のように書いておくと、変えたときにデータへ書き込む。
// 'ex.' で始まるパスは、今選んでいるテストの回。data-type="num" で数に、チェックボックスは true/false に。
function setPath(path, value){
  const parts = path.split('.');
  let o = state;
  if(parts[0]==='ex'){ o = curExam(); parts.shift(); }
  for(let i=0;i<parts.length-1;i++){
    if(o[parts[i]]==null || typeof o[parts[i]]!=='object') o[parts[i]] = {};
    o = o[parts[i]];
  }
  const last = parts[parts.length-1];
  if(value===undefined || value==='' && o[last] && typeof o[last]==='object') delete o[last];
  else o[last] = value;
}
document.addEventListener('change', e=>{
  const el = e.target.closest('[data-path]');
  if(!el || !state) return;
  if(!editing){ renderAll(); return; }
  let v = el.type==='checkbox' ? el.checked : el.value;
  if(el.dataset.type==='num') v = el.value==='' ? null : Number(el.value);
  if(el.dataset.type==='str-or-delete' && v==='') v = undefined; // 空にしたら項目ごと消す(監督・時間割など)
  setPath(el.dataset.path, v);
  markDirty();
  // 次の入力欄に移ってから描き直す(描き直しで、いま入力しようとしている欄が消えないように、下の renderAll で元に戻す)
  setTimeout(renderAll, 0);
});

//////////////////////// 画面全体 ////////////////////////
const TABS = {};   // 各タブの描き方。TABS.exam = { render(){…} } のように各ファイルで登録する
function renderAll(){
  // 描き直しの前に、いま入力中の欄を覚えておき、描き直したあとに戻す
  const f = document.activeElement;
  const focusKey = f && f !== document.body ? (f.dataset && (f.dataset.path || f.dataset.focus)) || (f.id ? '#'+f.id : '') : '';
  const has = !!state;
  $('startBanner').hidden = has;
  document.querySelectorAll('main > section').forEach(s=> s.hidden = !has || s.id !== 'tab-'+view.tab);
  document.querySelectorAll('nav.tabs button').forEach(b=> b.classList.toggle('active', b.dataset.tab===view.tab));
  renderTop();
  if(has && TABS[view.tab]) TABS[view.tab].render();
  if(focusKey){
    const el = focusKey[0]==='#' ? $(focusKey.slice(1)) : document.querySelector('[data-path="'+CSS.escape(focusKey)+'"],[data-focus="'+CSS.escape(focusKey)+'"]');
    if(el && el !== f && !el.disabled){ try{ el.focus({ preventScroll:true }); }catch(e){} }
  }
}
function renderTop(){
  const has = !!state;
  $('schoolTitle').textContent = has ? state.meta.fiscalYear + '年度' + (state.meta.schoolName ? '　' + state.meta.schoolName : '') + (isSample ? '　【見本・保存されません】' : '') : '';
  $('editBadge').textContent = editing ? '✏ 編集中' : '閲覧のみ';
  $('editBadge').classList.toggle('on', editing);
  $('btnEdit').textContent = editing ? '編集を終える' : '✏ 編集する';
  $('btnEdit').disabled = !has;
  $('btnReload').hidden = !fileHandle || editing;
  $('btnSave').disabled = !editing || isSample;
  $('fileName').textContent = fileHandle ? 'ファイル：' + fileHandle.name : '';
  document.querySelectorAll('.edit-only').forEach(el=> el.hidden = !editing);
  const w = $('lockWarning');
  if(has && !editing && isLockFresh(state.editLock)){
    const since = new Date(state.editLock.since);
    w.textContent = '⚠ ' + sensei(state.editLock.by) + 'が編集中(' + since.getHours() + ':' + pad2(since.getMinutes()) + '〜)';
    w.hidden = false;
  } else w.hidden = true;
  // テストの回を選ぶ欄
  const sel = $('examSelect');
  if(has && state.exams.length){
    const ex = curExam();
    sel.innerHTML = state.exams.map(x=>'<option value="'+esc(x.id)+'"'+(x===ex?' selected':'')+'>'+esc(x.name)+'</option>').join('');
    $('examPick').hidden = false;
  } else $('examPick').hidden = true;
}
function setStatus(text, cls){ const el = $('status'); el.textContent = text; el.className = cls||''; }
$('examSelect').addEventListener('change', e=>{ view.examId = e.target.value; savePref(); renderAll(); });
// テストの回が必要なタブで、まだ回がないときの案内
function needExamHtml(){
  return '<div class="banner"><p><b>テストの回がまだありません。</b></p><p>「テストの回」タブで、回(例：1学期中間)を追加してください。</p></div>';
}
function closeOverlay(id){ $(id).classList.remove('show'); }
function openOverlay(id){ $(id).classList.add('show'); }

// ボタンに data-act="名前" と書いておくと、押したときに ACTIONS.名前(ボタン) を呼ぶ。
// edit-act は編集中のときだけ動く(閲覧中に押しても何もしない)。
const ACTIONS = {};
document.addEventListener('click', e=>{
  const el = e.target.closest('[data-act]');
  if(!el || el.disabled || !state) return;
  const fn = ACTIONS[el.dataset.act];
  if(!fn) return;
  if(el.classList.contains('edit-act') && !editing){ alert('直すときは、上の「✏ 編集する」を押してください。'); return; }
  fn(el, e);
});
// 数字(全角も)を半角の数に直す。数字がなければ NaN
function toNum(s){
  const t = String(s==null?'':s).replace(/[０-９]/g, c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/[^0-9.]/g, '');
  return t==='' ? NaN : Number(t);
}
// Excel・CSV から貼り付けた文字を、行と列に分ける(タブ区切りを優先。なければカンマ)
function parsePasted(text){
  return String(text||'').replace(/\r/g,'').split('\n').map(l=>l.trim() ? (l.includes('\t') ? l.split('\t') : l.split(',')).map(c=>c.trim().replace(/^"|"$/g,'')) : null).filter(Boolean);
}

// 選択肢にチェックを付けて選ぶ小さな画面(担当教科の選択など)
let choiceCallback = null;
function openChoiceModal(title, items, onOk){
  $('chTitle').textContent = title;
  $('chList').innerHTML = items.map((it,i)=>'<label><input type="checkbox" value="'+esc(it.value)+'"'+(it.checked?' checked':'')+'> '+esc(it.label)+'</label>').join('');
  choiceCallback = onOk;
  openOverlay('choiceOverlay');
}
$('chCancel').addEventListener('click', ()=>closeOverlay('choiceOverlay'));
$('chOk').addEventListener('click', ()=>{
  const vals = [...$('chList').querySelectorAll('input:checked')].map(i=>i.value);
  closeOverlay('choiceOverlay');
  if(choiceCallback) choiceCallback(vals);
});

//////////////////////// 編集パスワード ////////////////////////
async function sha256Hex(text){
  if(!(window.crypto && crypto.subtle)) throw new Error('このブラウザではパスワードを使えません。Chrome か Edge で開いてください。');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

//////////////////////// バックアップと復元 ////////////////////////
function stateToText(o){ return JSON.stringify(o, null, 2); }
function downloadBlob(blob, name){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
function downloadText(text, name){ downloadBlob(new Blob([text], {type:'application/json'}), name); }
function exportBackup(){
  if(!state || isSample) return;
  downloadText(stateToText(state), '定期テスト_バックアップ_'+state.meta.fiscalYear+'年度_'+todayYmd()+'.json');
}
function importBackup(){
  if(!editing || isSample) return;
  pickFileText(async (text, name)=>{
    let o;
    try{ o = normalizeState(JSON.parse(text)); }catch(e){ alert('読み込めませんでした。\n'+e.message+'\n\n「データを書き出す(バックアップ)」で作ったファイルを選んでください。'); return; }
    if(!confirm('「'+name+'」の内容で、今のデータを置き換えます。今のデータは消えます。よろしいですか？\n(不安なときは、先に「データを書き出す(バックアップ)」で今の状態を控えてください)')) return;
    o.editLock = state.editLock; // 編集中の印は今のものを引き継ぐ
    state = o;
    markDirty(); renderAll();
    alert('復元しました。');
  });
}
// Chrome/Edge 以外でも読み込みだけはできるように、input type=file で読む
function pickFileText(cb){
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = async ()=>{ const f = inp.files[0]; if(f) cb(await f.text(), f.name); };
  inp.click();
}

//////////////////////// ファイルの読み書き ////////////////////////
// 前回開いたファイルを覚えておき、次に起動したときすぐ開けるようにする(IndexedDB にファイルの場所だけを保存する)。
function idb(){ return new Promise((res,rej)=>{ const r = indexedDB.open('exam-manager', 1); r.onupgradeneeded = ()=>r.result.createObjectStore('kv'); r.onsuccess = ()=>res(r.result); r.onerror = ()=>rej(r.error); }); }
async function idbSet(k,v){ const db = await idb(); return new Promise((res,rej)=>{ const tx = db.transaction('kv','readwrite'); tx.objectStore('kv').put(v,k); tx.oncomplete = res; tx.onerror = ()=>rej(tx.error); }); }
async function idbGet(k){ const db = await idb(); return new Promise((res,rej)=>{ const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = ()=>res(r.result); r.onerror = ()=>rej(r.error); }); }

const lockStaleMs = () => CONFIG.lockStaleMinutes*60*1000;
function isLockFresh(lock){
  if(!lock || !lock.active || !lock.since) return false;
  const t = new Date(lock.since).getTime();
  return Number.isFinite(t) && Date.now()-t < lockStaleMs();
}
async function readHandle(handle){
  const f = await handle.getFile();
  return { obj: normalizeState(JSON.parse(await f.text())), modified: f.lastModified };
}
async function openHandle(handle){
  const { obj, modified } = await readHandle(handle);
  state = obj; fileHandle = handle; isSample = false; editing = false; dirty = false;
  lastKnownModified = modified;
  try{ await idbSet('lastFile', handle); }catch(e){}
  setStatus('');
  renderAll();
}
async function doOpen(){
  if(!(await confirmDiscard())) return;
  if(editing) await stopEditing();
  if(!supportsFSA){ alert('このブラウザでは、データファイルを開いて保存することができません。Chrome か Edge で開いてください。'); return; }
  try{
    const startIn = await idbGet('lastFile').catch(()=>undefined);
    const [h] = await window.showOpenFilePicker({ types:[{ description:'定期テストのデータ', accept:{'application/json':['.json']} }], ...(startIn?{startIn}:{}) });
    await openHandle(h);
  }catch(e){ if(e.name!=='AbortError') alert('開けませんでした。\n'+e.message+'\n\n定期テストのデータファイル(.json)を選んでいるか確かめてください。'); }
}
// ほかの人が保存したかもしれない内容を、書き込む前に確かめる
async function writeFile(opts){
  if(!fileHandle || isSample) return;
  const f = await fileHandle.getFile();
  if(lastKnownModified && f.lastModified !== lastKnownModified && !(opts && opts.force)){
    let other = null;
    try{ other = JSON.parse(await f.text()); }catch(e){}
    const by = other && other.meta && other.meta.savedBy;
    if(!confirm('このファイルは、あなたが開いたあとに'+(by ? sensei(by)+'が' : 'ほかの場所で')+'保存しています。\nこのまま保存すると、そちらの変更は消えてしまいます。\n\n保存しますか？(「キャンセル」を押すと保存しません。その場合は、入力した内容を紙などに控えてから、ページを開き直して入力し直してください)')){
      clearTimeout(autosaveTimer);
      setStatus('保存を中止しました(ほかの人の変更があるため)', 'dirty');
      return false;
    }
  }
  state.meta.savedAt = new Date().toISOString();
  state.meta.savedBy = editorName();
  const w = await fileHandle.createWritable();
  await w.write(stateToText(state));
  await w.close();
  lastKnownModified = (await fileHandle.getFile()).lastModified;
  dirty = false;
  const t = new Date();
  setStatus('保存しました('+t.getHours()+':'+pad2(t.getMinutes())+')', 'saved');
  return true;
}
function suggestedFileName(){ return '定期テスト_'+state.meta.fiscalYear+'年度.json'; }
async function doSaveAs(){
  if(!supportsFSA){ downloadText(stateToText(state), suggestedFileName()); dirty = false; return true; }
  try{
    const startIn = await idbGet('lastFile').catch(()=>undefined);
    const h = await window.showSaveFilePicker({ suggestedName: suggestedFileName(), types:[{ description:'定期テストのデータ', accept:{'application/json':['.json']} }], ...(startIn?{startIn}:{}) });
    fileHandle = h; lastKnownModified = 0;
    try{ await idbSet('lastFile', h); }catch(e){}
    await writeFile({force:true});
    renderTop();
    return true;
  }catch(e){ if(e.name!=='AbortError') alert('保存できませんでした。\n'+e.message); return false; }
}
async function doSave(){
  if(!editing || isSample) return;
  clearTimeout(autosaveTimer);
  try{ if(fileHandle) await writeFile(); else await doSaveAs(); }
  catch(e){ setStatus('保存できませんでした', 'dirty'); alert('保存できませんでした。\n'+e.message+'\n\n共有サーバーにつながっているか確かめてから、もう一度「保存」を押してください。'); }
}
let autosaveTimer = null;
function markDirty(){
  if(!editing) return;
  dirty = true;
  if(isSample){ setStatus('見本のため保存されません', 'dirty'); return; }
  setStatus(fileHandle ? '保存待ち…' : '未保存(「保存」を押して保存先を決めてください)', 'dirty');
  // 生徒の名前が入るので、ブラウザ(localStorage)には控えを残さない(共有のパソコンで他人に見られないように)
  if(!fileHandle) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(async ()=>{
    try{ await writeFile(); lastLockStamp = Date.now(); }
    catch(e){ setStatus('自動保存できませんでした。共有サーバーにつながっているか確かめて「保存」を押してください', 'dirty'); }
  }, CONFIG.autosaveDelayMs);
}
async function confirmDiscard(){
  if(!dirty || !editing) return true;
  if(isSample) return confirm('見本で入力した内容は消えます。よろしいですか？');
  return confirm('まだ保存していない変更があります。保存せずに進むと、変更は消えます。よろしいですか？');
}
function editorName(){ try{ return localStorage.getItem('em.editorName') || ''; }catch(e){ return ''; } }

//////////////////////// 編集する / 編集を終える ////////////////////////
function openEditDialog(){
  $('eName').value = editorName();
  $('ePw').value = '';
  $('ePwRow').hidden = !state.meta.editPasswordHash;
  $('eErr').textContent = '';
  $('teacherNames').innerHTML = state.teachers.map(t=>'<option value="'+esc(t.name)+'">').join('');
  openOverlay('editOverlay');
  setTimeout(()=> ($('eName').value ? (state.meta.editPasswordHash ? $('ePw') : $('eOk')) : $('eName')).focus(), 30);
}
async function startEditing(){
  const name = $('eName').value.trim();
  if(!name){ $('eErr').textContent = 'お名前を入れてください。'; return; }
  try{ localStorage.setItem('em.editorName', name); }catch(e){}
  // ほかの先生が保存した最新の内容から編集を始める(古い画面のまま編集して、相手の変更を消してしまわないように)
  if(fileHandle && !isSample){
    try{
      const { obj, modified } = await readHandle(fileHandle);
      state = obj; lastKnownModified = modified;
    }catch(e){ $('eErr').textContent = 'データファイルを読み直せませんでした。共有サーバーにつながっているか確かめてください。('+e.message+')'; return; }
  }
  if(state.meta.editPasswordHash){
    let h; try{ h = await sha256Hex($('ePw').value); }catch(e){ $('eErr').textContent = e.message; return; }
    if(h !== state.meta.editPasswordHash){ $('eErr').textContent = 'パスワードが違います。'; renderAll(); return; }
  }
  if(isLockFresh(state.editLock) && state.editLock.by !== name){
    if(!confirm('⚠ いま '+sensei(state.editLock.by)+'が編集中です。\n\n同時に編集すると、どちらかの入力が消えてしまいます。\nふつうは、相手が「編集を終える」まで待ってください。\n\nそれでも編集を始めますか？(相手がブラウザを閉じ忘れている場合など)')){ closeOverlay('editOverlay'); renderAll(); return; }
  }
  editing = true;
  state.editLock = { active:true, since:new Date().toISOString(), by:name };
  closeOverlay('editOverlay');
  renderAll();
  if(fileHandle && !isSample){
    try{ await writeFile({force:true}); lastLockStamp = Date.now(); }
    catch(e){ setStatus('保存できませんでした', 'dirty'); alert('データファイルに書き込めませんでした。\n'+e.message+'\n\n共有サーバーのフォルダに書き込む権限があるか確かめてください。'); }
  } else if(!isSample){
    setStatus('まだ保存していません。「保存」を押して保存先を決めてください', 'dirty');
  }
}
async function stopEditing(){
  clearTimeout(autosaveTimer);
  state.editLock = { active:false, since:null, by:'' };
  if(fileHandle && !isSample){
    try{ const ok = await writeFile(); if(ok===false) return; }
    catch(e){ alert('保存できませんでした。\n'+e.message+'\n\n共有サーバーにつながっているか確かめてから、もう一度「編集を終える」を押してください。'); state.editLock = { active:true, since:new Date().toISOString(), by:editorName() }; return; }
  } else if(!isSample && dirty){
    if(!confirm('まだ保存していません。保存せずに編集を終えると、入力した内容は消えます。\n(「キャンセル」を押してから「保存」を押してください)\n\n保存せずに終えますか？')) { state.editLock.active = true; return; }
  }
  editing = false; dirty = false;
  renderAll();
}
$('btnEdit').addEventListener('click', ()=>{ if(!state) return; editing ? stopEditing() : openEditDialog(); });
$('eOk').addEventListener('click', startEditing);
$('eCancel').addEventListener('click', ()=>closeOverlay('editOverlay'));
['eName','ePw'].forEach(id=> $(id).addEventListener('keydown', e=>{ if(e.key==='Enter') startEditing(); }));
$('btnSave').addEventListener('click', doSave);
$('btnOpen').addEventListener('click', doOpen);
$('bnOpen').addEventListener('click', doOpen);
$('btnReload').addEventListener('click', async ()=>{
  if(!fileHandle || editing) return;
  try{ await openHandle(fileHandle); setStatus('最新の内容を読み込みました', 'saved'); }
  catch(e){ alert('読み直せませんでした。\n'+e.message); }
});
// 編集中は、入力がなくても定期的に「編集中」の印を保存し直す(ほかの先生に編集中だと伝わり続けるように)
setInterval(async ()=>{
  if(!editing || !fileHandle || isSample) return;
  if(Date.now() - lastLockStamp < CONFIG.heartbeatMinutes*60*1000) return;
  state.editLock.since = new Date().toISOString();
  try{ if(await writeFile() !== false) lastLockStamp = Date.now(); }catch(e){ setStatus('共有サーバーに書き込めません', 'dirty'); }
}, 60*1000);
// 閲覧中は、ほかの先生の「編集中」の表示が古くなったら消えるように、ときどき上の帯を描き直す
setInterval(()=>{ if(state && !editing) renderTop(); }, 60*1000);
window.addEventListener('beforeunload', e=>{
  if(editing && (dirty || !isSample)){ e.preventDefault(); e.returnValue = ''; }
});

//////////////////////// 新規作成 ////////////////////////
function openNewDialog(){
  $('nYear').value = currentFiscalYear(); $('nSchool').value = ''; $('nErr').textContent = '';
  openOverlay('newOverlay');
  setTimeout(()=>$('nSchool').focus(), 30);
}
$('btnNew').addEventListener('click', async ()=>{ if(!(await confirmDiscard())) return; openNewDialog(); });
$('bnNew').addEventListener('click', openNewDialog);
$('nCancel').addEventListener('click', ()=>closeOverlay('newOverlay'));
$('nOk').addEventListener('click', async ()=>{
  const y = Number($('nYear').value);
  if(!(y>=2000 && y<=2100)){ $('nErr').textContent = '年度は西暦の数字(例：2026)で入れてください。'; return; }
  if(editing && fileHandle && !isSample) await stopEditing();
  const prev = { state, fileHandle, isSample, editing, dirty };
  state = emptyState(y);
  state.meta.schoolName = $('nSchool').value.trim();
  fileHandle = null; isSample = false; editing = true; dirty = false;
  state.editLock = { active:true, since:new Date().toISOString(), by:editorName() };
  closeOverlay('newOverlay');
  const ok = await doSaveAs();
  if(!ok){ ({ state, fileHandle, isSample, editing, dirty } = prev); renderAll(); return; } // 保存先を選ばなかったときは元に戻す
  lastLockStamp = Date.now();
  view.tab = 'settings'; savePref();
  renderAll();
  alert('作りました。はじめに「設定」で学年・クラス数と先生を入れ、「名簿」に生徒の名簿を貼り付けてください。');
});
