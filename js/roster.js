'use strict';
// 「名簿」タブ: 生徒名簿は、アカウント管理アプリ(../account-manager)の名簿(アカウント名簿.json)から読み込む。
// このアプリでは名簿を直さない(2026-10-26 ユーザー:「アカウント管理アプリからもってきてください」。
// ../アプリ候補.md の「全体に効く案: 生徒名簿の元を1つにする」)。
// 生徒は学籍番号(studentNo)で見分ける。転入出・進級・クラス替えで組・番号が変わっても、点数・配慮の記録は同じ生徒に付いたまま。
// 転出・卒業した生徒は消さずに status を変え、記録を残す。

// 在籍している生徒か(status がない古いデータは在籍とみなす)
function isEnrolled(s){ return !s.status || s.status==='在籍'; }
// アカウント管理アプリのクラス名(「1年2組」「１年２組」「1-2」など)から学年と組を取り出す
function parseClassName(text){
  const t = String(text||'').replace(/[０-９]/g, c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0));
  let m = t.match(/(\d+)\s*年\s*(\d+)\s*組?/) || t.match(/^\s*(\d+)\s*[-ー－の]\s*(\d+)\s*$/);
  return m ? { grade:Number(m[1]), cls:Number(m[2]) } : null;
}
// アカウント管理アプリのデータファイルの中身から、名簿の行を取り出す
function readAccountManagerRoster(obj){
  if(!obj || obj.format!=='account-manager-data') throw new Error('アカウント管理アプリのデータファイル(アカウント名簿.json)ではないようです。');
  if(!Array.isArray(obj.students)){
    if(obj.data || obj.iv) throw new Error('このファイルは以前の形式(パスコードで暗号化したもの)です。アカウント管理アプリで一度開いて「編集する」を押して保存すると、読み込める形になります。');
    throw new Error('生徒の名簿が見つかりません。');
  }
  const list = [], skipped = [];
  obj.students.forEach(s=>{
    const name = String(s.name||'').trim(), no = String(s.studentNo||'').trim();
    const status = ['在籍','転出','卒業'].includes(s.status) ? s.status : '在籍';
    const label = (s.className||'')+' '+(s.number||'')+'番 '+name;
    if(!no){ if(status==='在籍') skipped.push(label+'(学籍番号がない)'); return; }
    const gc = parseClassName(s.className), num = toNum(s.number);
    if(status==='在籍' && (!gc || !(num>=0))){ skipped.push(label+'(クラスか出席番号が読めない)'); return; }
    list.push({ studentNo:no, name, grade: gc ? gc.grade : 0, cls: gc ? gc.cls : 0, no: num>=0 ? num : 0, status, statusDate:String(s.statusDate||'') });
  });
  return { list, skipped };
}
// 今の名簿と比べて、何が変わるかを調べる(まだ書き換えない)
function planRosterImport(incoming){
  const plan = { add:[], update:[], gradeChange:[], toLeft:[], missing:[], linked:[], same:0, newClasses:[] };
  const byNo = new Map(state.students.filter(s=>s.studentNo).map(s=>[s.studentNo, s]));
  const used = new Set();
  incoming.forEach(n=>{
    let s = byNo.get(n.studentNo);
    // 学籍番号のない生徒(以前に貼り付けた名簿)は、学年・組・番号・氏名がすべて同じときだけ同じ生徒とみなしてつなぐ
    if(!s && n.status==='在籍'){
      s = state.students.find(x=>!x.studentNo && !used.has(x.id) && x.grade===n.grade && x.cls===n.cls && x.no===n.no && x.name.replace(/\s/g,'')===n.name.replace(/\s/g,''));
      if(s) plan.linked.push({ s, n });
    }
    if(!s){ if(n.status==='在籍') plan.add.push(n); return; }
    used.add(s.id);
    const was = isEnrolled(s);
    if(was && n.status!=='在籍'){ plan.toLeft.push({ s, n }); return; }
    if(n.status!=='在籍'){ if(s.status!==n.status) plan.update.push({ s, n }); else plan.same++; return; }
    if(s.grade!==n.grade) plan.gradeChange.push({ s, n });
    if(s.grade!==n.grade || s.cls!==n.cls || s.no!==n.no || s.name!==n.name || !was) plan.update.push({ s, n }); else plan.same++;
  });
  // 名簿の元にいない、在籍のままの生徒(消さずに印を付ける)
  state.students.forEach(s=>{ if(!used.has(s.id) && isEnrolled(s)) plan.missing.push(s); });
  // 設定のクラスの数より大きい組がある
  incoming.filter(n=>n.status==='在籍').forEach(n=>{
    const g = state.meta.grades.find(x=>x.grade===n.grade);
    if(!g || n.cls > g.classes) plan.newClasses.push(n.grade+'年'+n.cls+'組');
  });
  plan.newClasses = [...new Set(plan.newClasses)];
  return plan;
}
function applyRosterImport(plan, fileName){
  plan.linked.forEach(({ s, n })=>{ s.studentNo = n.studentNo; });
  plan.add.forEach(n=> state.students.push({ id:newId('st'), studentNo:n.studentNo, grade:n.grade, cls:n.cls, no:n.no, name:n.name, kana:'', status:'在籍', statusDate:'' }));
  plan.update.concat(plan.toLeft).forEach(({ s, n })=>{
    s.studentNo = n.studentNo; s.name = n.name; s.status = n.status; s.statusDate = n.statusDate;
    if(n.status==='在籍'){ s.grade = n.grade; s.cls = n.cls; s.no = n.no; }   // 転出・卒業の生徒は、いたときの学年・組・番号のまま残す
  });
  plan.missing.forEach(s=>{ s.status = '名簿の元にいない'; });
  // クラスの数を、名簿に合わせて増やす(減らすことはしない)
  plan.newClasses.forEach(t=>{
    const gc = parseClassName(t); if(!gc) return;
    while(state.meta.grades.length < gc.grade) state.meta.grades.push({ grade:state.meta.grades.length+1, classes:1 });
    const g = state.meta.grades.find(x=>x.grade===gc.grade); g.classes = Math.max(g.classes, gc.cls);
  });
  if(plan.newClasses.length) refreshExams();
  state.meta.rosterSource = { fileName, importedAt:new Date().toISOString() };
}
function rosterPlanHtml(plan, skipped){
  const sl = s => esc(s.grade+'年'+s.cls+'組'+s.no+'番 '+s.name);
  const nl = n => esc(n.grade+'年'+n.cls+'組'+n.no+'番 '+n.name);
  const box = (title, items, cls) => items.length ? '<div class="plan-box '+(cls||'')+'"><b>'+title+'('+items.length+'人)</b><ul>'+items.slice(0,12).map(x=>'<li>'+x+'</li>').join('')+(items.length>12?'<li>ほか '+(items.length-12)+'人</li>':'')+'</ul></div>' : '';
  let h = '<p>アカウント管理アプリの名簿と比べた結果です。よければ「決定」を押してください。</p>';
  if(plan.gradeChange.length) h += '<div class="plan-box warn"><b>⚠ 学年が変わる生徒が '+plan.gradeChange.length+'人います。</b><p>アカウント管理アプリで年度更新(進級)をしたあとの名簿かもしれません。このデータファイルは '+state.meta.fiscalYear+'年度のものです。新しい年度の名簿は、新しい年度のデータファイルを作ってから読み込んでください。</p></div>';
  h += box('新しく加わる生徒(転入など)', plan.add.map(nl))
    + box('組・番号・氏名などが変わる生徒', plan.update.map(({s,n})=>sl(s)+' → '+(n.status==='在籍' ? nl(n) : esc(n.status))))
    + box('転出・卒業になる生徒(記録は残し、点数の入力などからは外します)', plan.toLeft.map(({s,n})=>sl(s)+' → '+esc(n.status)+(n.statusDate?'('+esc(n.statusDate)+')':'')))
    + box('名簿の元にいない生徒(消さずに印を付けます。アカウント管理アプリで確かめてください)', plan.missing.map(sl), 'warn')
    + box('学籍番号をつないだ生徒(以前に貼り付けた名簿と、学年・組・番号・氏名が同じ)', plan.linked.map(({n})=>nl(n)))
    + box('読み込めなかった生徒', skipped.map(esc), 'warn')
    + (plan.newClasses.length ? '<div class="plan-box"><b>クラスの数を増やします：</b>'+esc(plan.newClasses.join('、'))+'</div>' : '')
    + '<p class="hint">変わらない生徒：'+plan.same+'人</p>';
  return h;
}
async function importRosterFrom(handle, file){
  let obj;
  try{ obj = JSON.parse(await file.text()); }catch(e){ alert('ファイルを読めませんでした。アカウント管理アプリのデータファイル(アカウント名簿.json)を選んでください。\n'+e.message); return; }
  let res;
  try{ res = readAccountManagerRoster(obj); }catch(e){ alert(e.message); return; }
  if(!res.list.some(n=>n.status==='在籍')){ alert('在籍している生徒が見つかりませんでした。\n'+(res.skipped.length ? '学籍番号やクラスが入っているか、アカウント管理アプリで確かめてください。' : '')); return; }
  const plan = planRosterImport(res.list);
  $('fmTitle').textContent = 'アカウント管理アプリの名簿を読み込む';
  $('fmBody').innerHTML = rosterPlanHtml(plan, res.skipped);
  formCallback = ()=>{
    if(!editing) return;
    applyRosterImport(plan, file.name);
    if(handle){ idbSet('rosterFile', handle).catch(()=>{}); }
    markDirty(); renderAll();
  };
  openOverlay('formOverlay');
}
ACTIONS.importRoster = async ()=>{
  if(!editing) return;
  try{
    if(supportsFSA){
      const startIn = await idbGet('rosterFile').catch(()=>undefined);
      const [h] = await window.showOpenFilePicker({ types:[{ description:'アカウント管理アプリの名簿', accept:{'application/json':['.json','.dat']} }], ...(startIn?{startIn}:{}) });
      await importRosterFrom(h, await h.getFile());
    } else {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,.dat';
      inp.onchange = ()=>{ if(inp.files[0]) importRosterFrom(null, inp.files[0]); };
      inp.click();
    }
  }catch(e){ if(e.name!=='AbortError') alert('開けませんでした。\n'+e.message); }
};
// 前回と同じファイルから読み直す(ファイルを選び直さなくてよい)
ACTIONS.reloadRoster = async ()=>{
  if(!editing) return;
  let h; try{ h = await idbGet('rosterFile'); }catch(e){}
  if(!h){ ACTIONS.importRoster(); return; }
  try{
    if(await h.queryPermission({mode:'read'})!=='granted' && await h.requestPermission({mode:'read'})!=='granted') return;
    await importRosterFrom(h, await h.getFile());
  }catch(e){ alert('前回のファイルを開けませんでした。移動・削除されていないか確かめるか、「名簿を読み込む」から選び直してください。\n'+e.message); }
};

TABS.roster = { render(){
  const gs = grades();
  if(!gs.includes(view.rosterGrade)) view.rosterGrade = gs[0];
  const g = view.rosterGrade, src = state.meta.rosterSource;
  const list = state.students.filter(s=>s.grade===g).sort((a,b)=> (isEnrolled(a)?0:1)-(isEnrolled(b)?0:1) || sortStudents(a,b));
  const counts = gs.map(x=>x+'年 '+state.students.filter(s=>s.grade===x && isEnrolled(s)).length+'人').join('　');
  const noLink = state.students.filter(s=>!s.studentNo).length;
  let rows = '', lastCls = null;
  list.forEach(s=>{
    const on = isEnrolled(s);
    rows += '<tr class="'+(on?'':'left')+(on && lastCls!==null && lastCls!==s.cls ? ' sep' : '')+'"><td class="c">'+esc(s.studentNo||'')+'</td><td class="c">'+s.cls+'</td><td class="c">'+s.no+'</td><td class="nowrap">'+esc(s.name)+'</td>'
      + '<td class="nowrap">'+(on ? '在籍' : '<b>'+esc(s.status)+'</b>'+(s.statusDate?' '+esc(s.statusDate):''))+'</td></tr>';
    if(on) lastCls = s.cls;
  });
  $('tab-roster').innerHTML = '<section class="roster-src"><h2>名簿の元(アカウント管理アプリ)</h2>'
    + '<p>生徒の名簿は、<b>アカウント管理アプリの名簿</b>(共有サーバーの「アカウント名簿.json」)から読み込みます。転入・転出・クラス替えなど名簿を直すときは、<b>アカウント管理アプリで直してから</b>、ここで「名簿を読み直す」を押してください。生徒は学籍番号で見分けるので、組や番号が変わっても点数や配慮の記録はずれません。</p>'
    + '<p class="hint">最後に読み込んだ名簿：'+(src ? esc(src.fileName)+'('+new Date(src.importedAt).toLocaleString('ja-JP')+')' : 'まだ読み込んでいません')+'</p>'
    + (editing ? '<div class="line"><button class="primary" data-act="reloadRoster">名簿を読み直す</button><button data-act="importRoster">名簿のファイルを選んで読み込む</button></div>'
      : '<p class="hint warn-text">名簿を読み込むには、上の「✏ 編集する」を押してください。</p>')
    + (noLink ? '<p class="warn-text">学籍番号がまだ付いていない生徒が '+noLink+'人います(以前に貼り付けた名簿)。名簿を読み込むと、学年・組・番号・氏名が同じ生徒に学籍番号を付けてつなぎます。</p>' : '')
    + '</section>'
    + '<div class="toolbar"><span class="seg">'+gs.map(x=>'<button data-act="rosterGrade" data-g="'+x+'"'+(x===g?' class="active"':'')+'>'+x+'年</button>').join('')+'</span>'
    + '<span class="hint">在籍：'+counts+'</span></div>'
    + '<table class="grid roster"><thead><tr><th>学籍番号</th><th>組</th><th>番号</th><th>氏名</th><th>在籍状況</th></tr></thead><tbody>'
    + (rows || '<tr><td colspan="5" class="hint">'+g+'年の名簿はまだありません。上の「名簿のファイルを選んで読み込む」で読み込んでください。</td></tr>') + '</tbody></table>'
    + '<p class="hint">転出・卒業などの生徒は、点数などの記録を残すため、名簿の下に灰色で残します。点数の入力・出欠記録用紙・個票の対象からは外します。</p>';
}};
ACTIONS.rosterGrade = el=>{ view.rosterGrade = +el.dataset.g; savePref(); renderAll(); };
