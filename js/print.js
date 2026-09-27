'use strict';
// 「印刷」タブと、印刷する用紙の組み立て
// しくみ: 用紙ごとに1ページ分の HTML を作り、#printPages に並べる。はみ出すページは zoom で縮めて1枚に収める
// (掲示用の時程表・注意事項は、用紙いっぱいになるよう拡大もする)。画面で確かめてから「印刷する」で window.print()。

// 用紙の大きさ(ピクセル。ブラウザの印刷は 1インチ＝96ピクセル。余白 8mm を引いた、中身を置ける広さ)
const PAPER = {
  A4P:{ w:733,  h:1058, css:'A4 portrait',  name:'A4縦' },
  A4L:{ w:1062, h:729,  css:'A4 landscape', name:'A4横' },
  A3P:{ w:1062, h:1523, css:'A3 portrait',  name:'A3縦' },
  A3L:{ w:1527, h:1058, css:'A3 landscape', name:'A3横' },
};
// 用紙の種類。paper = 選べる用紙(最初が初期値)
const FORMS = {
  leave:     { title:'休暇集約用紙',            paper:['A4P','A4L'], desc:'監督表を作る前に、先生方に休暇・出張で監督に入れない時間を書いてもらう用紙です。名前は「設定」の先生・サポーターから入ります。' },
  proctor:   { title:'監督表',                  paper:['A4P','A4L','A3P'], desc:'縦に先生、横にテストの時間(教科と時刻)を並べ、ます目に監督に入る教室(1-1 など)を書きます。別室の延長の終わりの時刻と、別室・延長の生徒の表も付けて1枚にまとめます。' },
  roomTime:  { title:'時程表(通常の教室)',      paper:['A3L','A3P'], desc:'各教室に掲示する時程表です。1日1枚(クラス名を入れて、クラスごとに出すこともできます)。遠くから見えるよう、用紙いっぱいの大きな文字にします。' },
  sepTime:   { title:'時程表(別室)',            paper:['A3L','A3P'], desc:'別室に掲示する時程表です。1日1枚・部屋ごと。時間延長の終わりの時刻も載せます(生徒の名前は載せません)。' },
  special:   { title:'配慮生徒一覧',            paper:['A3L','A4L'], desc:'欠席・別室受験・時間延長などの生徒の一覧です。当日、職員室に掲示し、受験状態を書き込みます。生徒の名前が入るので、掲示する場所に気をつけてください。' },
  notice:    { title:'注意事項',                paper:['A3P','A3L'], desc:'教室に掲示するテストの注意事項です。文は「テストの回」タブで直せます。' },
  attend:    { title:'出欠記録用紙',            paper:['A3L','A4P'], desc:'当日、学級の在籍・出欠を手書きで記録する用紙です。A3横は全部の日を1枚に、A4縦は1日1枚です。1クラス分ずつ印刷します。' },
};
const printOpt = loadPrintOpt();
function loadPrintOpt(){ try{ return Object.assign({}, JSON.parse(localStorage.getItem('em.print'))||{}); }catch(e){ return {}; } }
function savePrintOpt(){ try{ localStorage.setItem('em.print', JSON.stringify(printOpt)); }catch(e){} }
function optOf(form, key, def){ const o = printOpt[form] || {}; return o[key]===undefined ? def : o[key]; }

//////////////////////// 印刷タブ ////////////////////////
TABS.print = { render(){
  const ex = curExam();
  if(!ex){ $('tab-print').innerHTML = needExamHtml(); return; }
  const gs = grades();
  const targetOpts = cur => '<option value="all"'+(cur==='all'?' selected':'')+'>全クラス</option>'
    + gs.map(g=>'<option value="g'+g+'"'+(cur==='g'+g?' selected':'')+'>'+g+'年の全クラス</option>').join('')
    + classRooms().map(r=>'<option value="'+r.key+'"'+(cur===r.key?' selected':'')+'>'+r.grade+'年'+r.cls+'組</option>').join('');
  const dayOpts = cur => '<option value="all">全部の日</option>' + ex.days.map((d,di)=>'<option value="'+di+'"'+(String(cur)===String(di)?' selected':'')+'>'+esc(dayTitle(ex,di))+'</option>').join('');
  let html = '<p class="hint">用紙を選んで「画面で確かめる」を押すと、印刷する形が出ます。よければ「印刷する」を押してください。PDF にするときは、印刷の画面の送り先で「PDF に保存」を選びます。A3 はプリンタが A3 に対応している必要があります。</p><div class="print-cards">';
  Object.entries(FORMS).forEach(([k, f])=>{
    const paper = optOf(k, 'paper', f.paper[0]);
    let extra = '';
    if(k==='leave') extra = '<label><input type="checkbox" data-popt="leave.fill"'+(optOf('leave','fill',false)?' checked':'')+'> 入力済みの休暇を書き入れる</label>'
      + '<label>提出日 <input type="text" style="width:140px" data-popt="leave.due" value="'+esc(optOf('leave','due',''))+'" placeholder="例：10月3日(金)"></label>';
    if(k==='proctor') extra = '<label><input type="checkbox" data-popt="proctor.students"'+(optOf('proctor','students',true)?' checked':'')+'> 別室・時間延長の生徒の表を付ける</label>';
    if(k==='roomTime') extra = '<label>日 <select data-popt="roomTime.day">'+dayOpts(optOf('roomTime','day','all'))+'</select></label>'
      + '<label><input type="checkbox" data-popt="roomTime.perClass"'+(optOf('roomTime','perClass',false)?' checked':'')+'> クラスごとに1枚ずつ(クラス名を入れる)</label>';
    if(k==='sepTime') extra = '<label>日 <select data-popt="sepTime.day">'+dayOpts(optOf('sepTime','day','all'))+'</select></label>';
    if(k==='special') extra = '<label><input type="checkbox" data-popt="special.fill"'+(optOf('special','fill',false)?' checked':'')+'> 入力済みの受験状態を書き入れる</label>';
    if(k==='attend') extra = '<label>クラス <select data-popt="attend.target">'+targetOpts(optOf('attend','target','all'))+'</select></label>';
    html += '<section class="print-card"><h2>'+esc(f.title)+'</h2><p class="hint">'+esc(f.desc)+'</p><div class="line">'
      + '<label>用紙 <select data-popt="'+k+'.paper">'+f.paper.map(p=>'<option value="'+p+'"'+(p===paper?' selected':'')+'>'+PAPER[p].name+'</option>').join('')+'</select></label> '
      + extra + '</div><div class="line"><button class="primary" data-act="printForm" data-form="'+k+'">画面で確かめる・印刷</button></div></section>';
  });
  html += '</div>';
  $('tab-print').innerHTML = html;
}};
document.addEventListener('change', e=>{
  const el = e.target.closest('[data-popt]');
  if(!el) return;
  const [f, key] = el.dataset.popt.split('.');
  printOpt[f] = printOpt[f] || {};
  printOpt[f][key] = el.type==='checkbox' ? el.checked : el.value;
  savePrintOpt();
});
document.addEventListener('input', e=>{ const el = e.target.closest('input[type=text][data-popt]'); if(el){ const [f,key] = el.dataset.popt.split('.'); printOpt[f] = printOpt[f]||{}; printOpt[f][key] = el.value; savePrintOpt(); } });

//////////////////////// 画面で確かめる → 印刷 ////////////////////////
ACTIONS.printForm = el=>{
  const ex = curExam(); if(!ex) return;
  const form = el.dataset.form, f = FORMS[form];
  const paperKey = optOf(form, 'paper', f.paper[0]);
  let pages;
  try{ pages = BUILD[form](ex, paperKey); }
  catch(err){ console.error(err); alert('用紙を作れませんでした。\n'+err.message); return; }
  if(!pages.length){ alert('印刷するものがありません。\n'+(BUILD_EMPTY[form]||'')); return; }
  showPreview(f.title, paperKey, pages);
};
const BUILD_EMPTY = {
  leave:'「設定」で先生・サポーターを、「時間割」でテストの時間を入れてください。',
  proctor:'「時間割」タブで、テストの時間を入れてください。',
  roomTime:'「テストの回」タブで日を追加し、「時間割」タブで時程を入れてください。',
  sepTime:'選んだ日に、別室で受ける生徒がいません。「配慮生徒」タブで「受ける場所」を別室にしてください。',
  special:'「配慮生徒」タブで、配慮の必要な生徒を入れてください。',
  attend:'名簿に生徒がいません。「名簿」タブで入れてください。',
};
function showPreview(title, paperKey, pages){
  const P = PAPER[paperKey];
  $('pageStyle').textContent = '@page{ size:'+P.css+'; margin:8mm; }';
  $('ppTitle').textContent = title+'('+P.name+'・'+pages.length+'枚)';
  const box = $('printPages');
  box.style.zoom = 1;
  box.innerHTML = pages.map(p=>'<div class="p-page '+(p.cls||'')+'" style="width:'+P.w+'px;height:'+P.h+'px"><div class="p-inner" style="width:'+P.w+'px">'+p.html+'</div></div>').join('');
  document.body.classList.add('previewing');
  // 1枚に収める(ポスターは用紙いっぱいに広げる)
  [...box.querySelectorAll('.p-page')].forEach((pg, i)=> fitPage(pg.firstChild, P, pages[i].grow));
  // 画面の幅に合わせて小さく見せる(印刷のときは元の大きさ。CSS の @media print で zoom を 1 に戻す)
  const avail = Math.max(300, window.innerWidth - 60);
  box.style.zoom = Math.min(1, avail / P.w);
  $('printArea').scrollTop = 0;
}
function fitPage(inner, P, grow){
  // 幅は「用紙の幅 ÷ zoom」にするので、縮めても広げても用紙の幅いっぱいに出る。
  // 倍率を変えると文の折り返しが変わり高さが素直に比例しないため、収まる一番大きな倍率を二分探索で探す。
  const maxZ = grow===true ? 3 : Number(grow) || 1;   // grow: true(3倍まで)か、広げる上限の倍率
  const fits = z => {
    inner.style.zoom = z; inner.style.width = (P.w / z) + 'px';
    return inner.getBoundingClientRect().height <= P.h - 3 && inner.scrollWidth <= inner.clientWidth + 1;
  };
  let lo, hi;
  if(fits(1)){ if(maxZ<=1 || fits(maxZ)){ fits(Math.max(1, maxZ)); return; } lo = 1; hi = maxZ; }
  else { lo = 0.15; hi = 1; }
  for(let k=0;k<12;k++){ const mid = (lo+hi)/2; if(fits(mid)) lo = mid; else hi = mid; }
  fits(lo);
}
$('ppClose').addEventListener('click', ()=>{ document.body.classList.remove('previewing'); $('printPages').innerHTML = ''; });
$('ppPrint').addEventListener('click', ()=> window.print());
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && document.body.classList.contains('previewing')) $('ppClose').click(); });

//////////////////////// 用紙の中身 ////////////////////////
const BUILD = {};
function pTitle(main, sub){ return '<div class="p-title"><h1>'+main+'</h1><div class="sub">'+(sub||'')+'</div></div>'; }
function schoolSub(){ return esc((state.meta.schoolName||'')+'　'+state.meta.fiscalYear+'年度'); }
function otherSlotsText(day){ return sortedSlots(day).map(x=>x.s).filter(s=>s.kind==='other').map(s=>esc(s.label||'')+' '+fmtT(tmin(s.start))+'〜'+fmtT(tmin(s.end))).join('　'); }
// 時刻の範囲の文字
function range(a, b){ return fmtT(a)+'〜'+fmtT(b); }

// ---- 休暇集約用紙 ----
BUILD.leave = (ex)=>{
  const ts = testSlots(ex), people = proctorPeople();
  if(!ts.length || !people.length) return [];
  const fill = optOf('leave','fill',false), due = optOf('leave','due','');
  let h1 = '', h2 = '';
  ex.days.forEach((day, di)=>{ const n = ts.filter(t=>t.di===di).length; if(n) h1 += '<th colspan="'+n+'">'+esc(dayTitle(ex, di))+'</th>'; });
  ts.forEach(t=>{ h2 += '<th class="slot">'+esc(t.label)+'<br><span class="small">'+fmtT(tmin(t.slot.start))+'〜</span></th>'; });
  const rows = people.map(p=>'<tr><th class="l">'+esc(p.name)+(p.kind==='サポーター'?'<span class="small">(サ)</span>':'')+'</th>'
    + ts.map(t=>'<td class="c">'+(fill ? esc((leaveOf(ex, p.id, t.slot.id)||'').slice(0,2)) : '')+'</td>').join('') + '<td></td></tr>').join('');
  const html = pTitle(esc(ex.name)+'　試験監督のための 休暇・出張の調べ', schoolSub())
    + '<p class="p-lead">テストの期間に、休暇・出張・そのほかの用事で<b>監督に入れない時間</b>のます目に「休」「出」などを書いてください。'
    + (due ? '<br><b>'+esc(due)+'</b>までに、教務へ出してください。' : '<br>＿＿月＿＿日(　)までに、教務へ出してください。') + '</p>'
    + '<table class="p-table leave-form"><thead><tr><th rowspan="2" class="name">名前</th>'+h1+'<th rowspan="2" class="note">備考(時刻など)</th></tr><tr>'+h2+'</tr></thead><tbody>'+rows+'</tbody></table>'
    + '<p class="small">休＝休暇　出＝出張　他＝そのほか。1時間の一部だけ入れないときは、備考に時刻を書いてください。</p>';
  return [{ html }];
};

// ---- 監督表(縦に先生、横に教科(テストの時間)。ます目に入る教室) ----
BUILD.proctor = (ex)=>{
  const ts = testSlots(ex), people = proctorPeople();
  if(!ts.length || !people.length) return [];
  const counts = proctorCounts(ex), year = yearCounts(ex);
  let h1 = '', h2 = '';
  ex.days.forEach((day, di)=>{
    const n = ts.filter(t=>t.di===di).length; if(!n) return;
    const other = otherSlotsText(day);
    h1 += '<th colspan="'+n+'" class="dayh">'+esc(dayTitle(ex, di))+(other ? '<div class="small">'+other+'</div>' : '')+'</th>';
  });
  ts.forEach(t=>{
    const sid = subjAt(ex, t.slot.id);
    h2 += '<th class="slot"><span class="small">'+esc(t.label)+'</span><div class="subjname">'+(sid ? esc(subjectName(sid)) : '(未定)')+'</div><span class="small">'+(sid ? range(tmin(t.slot.start), slotEnd(ex, t.slot)) : fmtT(tmin(t.slot.start))+'〜')+'</span></th>';
  });
  let body = '', lastKind = null;
  people.forEach(p=>{
    body += '<tr'+(lastKind && lastKind!==p.kind ? ' class="kind-sep"' : '')+'><th class="l">'+esc(p.name)+(p.kind==='サポーター'?'<span class="small">(サ)</span>':'')+'</th>'
      + ts.map(t=>{
        const r = roomOfTeacher(ex, p.id, t.slot.id), lv = leaveOf(ex, p.id, t.slot.id);
        if(r) return '<td class="room'+(r.sep?' sep':'')+'">'+esc(r.name)+'</td>';
        return lv ? '<td class="leave">'+esc(lv)+'</td>' : '<td></td>';
      }).join('') + '<td class="c">'+(counts.get(p.id)||'')+'</td><td class="c">'+(((counts.get(p.id)||0)+(year.get(p.id)||0))||'')+'</td></tr>';
    lastKind = p.kind;
  });
  // 別室の時刻(ずらした始まり〜延長の終わり)
  sepRooms().forEach((r, k)=>{
    body += '<tr class="sep-end'+(k===0?' first':'')+'"><th class="l">'+esc(r.name)+'の時刻</th>' + ts.map(t=>{
      const e = sepRoomEnd(ex, r, t);
      return e!=null ? '<td>'+fmtT(sepStartOf(ex, r.roomId, t.slot))+'〜'+fmtT(e)+'<span class="small">('+roomStudentsAt(ex, r.roomId, t.day, t.slot).length+'人)</span></td>' : '<td class="off">―</td>';
    }).join('') + '<td></td><td></td></tr>';
  });
  let html = pTitle(esc(ex.name)+'　試験監督表', schoolSub()+'　'+fmtJDate(todayYmd())+'作成')
    + '<table class="p-table proctor-sheet"><thead><tr><th rowspan="2" class="name">名前</th>'+h1+'<th rowspan="2" class="cnt">この回</th><th rowspan="2" class="cnt">年間</th></tr><tr>'+h2+'</tr></thead><tbody>'+body+'</tbody></table>'
    + '<p class="small">※ ます目の「1-1」などは、その時間に監督に入る教室です。別室の監督は、時間延長の終わりの時刻まで続けて見てください。</p>';
  // 別室・時間延長の生徒の表
  const sps = sortedSpecial(ex).filter(x=>x.p.room || x.p.extend || x.p.absentDays.length);
  if(optOf('proctor','students',true) && sps.length){
    html += '<h2 class="p-h2">別室・時間延長・欠席予定の生徒</h2><table class="p-table sp-sheet"><thead><tr><th>生徒</th><th>場所</th><th>延長</th>'
      + ts.map(t=>'<th class="slot">'+(t.day.date?fmtMD(t.day.date):(t.di+1)+'日目')+'<br>'+esc(subjectName(subjAt(ex, t.slot.id))||t.label)+'</th>').join('')+'<th>配慮の内容</th></tr></thead><tbody>'
      + sps.map(({p, st})=>'<tr><th class="l">'+st.grade+'-'+st.cls+'-'+st.no+' '+esc(st.name)+'</th><td>'+esc(p.room?roomName(p.room):'教室')+'</td><td>'+esc(extLabel(p))+'</td>'
        + ts.map(t=>{ if(isAbsentDay(p, t.day)) return '<td class="c">欠</td>'; if(!subjAt(ex, t.slot.id)) return '<td class="off"></td>';
          return '<td class="c">'+specialRange(ex, p, t.slot)+'</td>'; }).join('')
        + '<td>'+esc(p.note)+'</td></tr>').join('') + '</tbody></table>';
  }
  return [{ html }];
};

// ---- 時程表(通常の教室)。教科は全学年共通なので、1日1枚(クラスごとにも出せる) ----
BUILD.roomTime = (ex)=>{
  const dsel = optOf('roomTime','day','all'), perClass = optOf('roomTime','perClass',false);
  const pages = [];
  ex.days.forEach((day, di)=>{
    if(dsel!=='all' && String(dsel)!==String(di)) return;
    if(!day.slots.length) return;
    const rows = sortedSlots(day).map(({s})=>{
      if(s.kind==='other') return '<tr class="other"><td colspan="2">'+esc(s.label)+'</td><td class="time">'+fmtT(tmin(s.start))+' 〜 '+fmtT(tmin(s.end))+'</td></tr>';
      const sid = subjAt(ex, s.id);
      return '<tr><td class="lab">'+esc(slotLabel(day, s))+'</td><td class="subj">'+(sid ? esc(subjectName(sid)) : '')+'</td><td class="time">'+fmtT(tmin(s.start))+' 〜 '+(sid ? fmtT(slotEnd(ex, s)) : '')+'</td></tr>';
    }).join('');
    const targets = perClass ? classRooms().map(r=>r.grade+'年'+r.cls+'組') : [(di+1)+'日目'];
    targets.forEach(name=>{
      pages.push({ grow:true, cls:'poster', html:'<div class="poster-head"><div class="date">'+(day.date?fmtJDate(day.date):'日付未定')+'</div><div class="who">'+esc(name)+'</div></div>'
        + '<div class="poster-sub">'+esc(ex.name)+(perClass ? '　'+(di+1)+'日目' : '')+'</div>'
        + '<table class="poster-table">'+rows+'</table>' });
    });
  });
  return pages;
};

// ---- 時程表(別室)。延長の終わりの時刻も載せる(生徒の名前は載せない) ----
BUILD.sepTime = (ex)=>{
  const dsel = optOf('sepTime','day','all');
  const pages = [];
  ex.days.forEach((day, di)=>{
    if(dsel!=='all' && String(dsel)!==String(di)) return;
    sepRooms().forEach(r=>{
      const sl = sortedSlots(day).map(x=>x.s);
      if(!sl.some(s=>s.kind==='test' && roomStudentsAt(ex, r.roomId, day, s).length)) return;   // この日この部屋を使わない
      const rows = sl.map(s=>{
        if(s.kind==='other') return '<tr class="other"><td colspan="2">'+esc(s.label)+'</td><td class="time">'+fmtT(tmin(s.start))+' 〜 '+fmtT(tmin(s.end))+'</td></tr>';
        const sts = roomStudentsAt(ex, r.roomId, day, s), sid = subjAt(ex, s.id);
        if(!sts.length) return '<tr class="none"><td class="lab">'+esc(slotLabel(day, s))+'</td><td class="subj">'+esc(subjectName(sid))+'</td><td class="time">(この部屋では受けません)</td></tr>';
        const st0 = sepStartOf(ex, r.roomId, s), base = st0 + testMinutes(ex, sid);   // 別室だけ始まりをずらしていれば、その時刻から
        const ext = [...new Set(sts.filter(sp=>sp.extend).map(sp=>specialEnd(ex, sp, s)))].sort((a,b)=>a-b);
        const plain = sts.some(sp=>!sp.extend);
        // 延長の人だけ →「8:55 〜 10:05(時間延長)」、延長なしの人もいる →「8:55 〜 9:45」と「延長の人 〜10:05」
        const time = !ext.length ? fmtT(st0)+' 〜 '+fmtT(base)
          : plain ? fmtT(st0)+' 〜 '+fmtT(base)+'<div class="extline">延長の人 〜'+ext.map(fmtT).join(' / ')+'</div>'
          : fmtT(st0)+' 〜 <span class="ext">'+ext.map(fmtT).join(' / ')+'</span><div class="extline">(時間延長)</div>';
        return '<tr><td class="lab">'+esc(slotLabel(day, s))+'</td><td class="subj">'+esc(subjectName(sid))+'</td><td class="time">'+time+'</td></tr>';
      }).join('');
      pages.push({ grow:true, cls:'poster sep', html:'<div class="poster-head"><div class="date">'+(day.date?fmtJDate(day.date):'日付未定')+'</div><div class="who">'+esc(r.name)+'</div></div>'
        + '<div class="poster-sub">'+esc(ex.name)+'　'+(di+1)+'日目　別室の時程</div><table class="poster-table">'+rows+'</table>' });
    });
  });
  return pages;
};

// ---- 配慮生徒一覧 ----
BUILD.special = (ex)=>{
  const list = sortedSpecial(ex), ts = testSlots(ex), fill = optOf('special','fill',false);
  if(!list.length) return [];
  let h1 = '', h2 = '';
  ex.days.forEach((day, di)=>{ const n = ts.filter(t=>t.di===di).length; if(n) h1 += '<th colspan="'+n+'">'+esc(dayTitle(ex, di))+'</th>'; });
  ts.forEach(t=>{ h2 += '<th class="slot">'+esc(t.label)+'<br><span class="small">'+fmtT(tmin(t.slot.start))+'〜</span></th>'; });
  const rows = list.map(({p, st})=>'<tr><th class="l nowrap">'+st.grade+'年'+st.cls+'組'+st.no+'番</th><th class="l name">'+esc(st.name)+'</th>'
    + '<td>'+esc(p.room?roomName(p.room):'教室')+'</td><td class="c">'+esc(extLabel(p))+'</td><td class="note">'+esc(p.note)+'</td>'
    + ts.map(t=>{
      if(isAbsentDay(p, t.day)) return '<td class="absent"><span class="pre">欠席予定</span>'+(fill?'<div class="st">'+esc(ex.status[p.studentId+'|'+t.slot.id]||'')+'</div>':'')+'</td>';
      const sid = subjAt(ex, t.slot.id);
      if(!sid) return '<td class="off"></td>';
      return '<td><span class="pre">'+esc(subjectName(sid))+((p.extend||p.room)?' '+specialRange(ex, p, t.slot):'')+'</span>'+(fill?'<div class="st">'+esc(ex.status[p.studentId+'|'+t.slot.id]||'')+'</div>':'')+'</td>';
    }).join('') + '</tr>').join('');
  // 当日増えた生徒を書き足す空の行
  const blank = Array.from({length:3}).map(()=>'<tr class="blank"><th class="l nowrap">　</th><th class="l name"></th><td></td><td></td><td class="note"></td>'+ts.map(()=>'<td></td>').join('')+'</tr>').join('');
  const html = pTitle(esc(ex.name)+'　配慮の必要な生徒(職員室掲示用)', schoolSub()+'　<b>個人情報のため取り扱いに注意</b>')
    + '<table class="p-table special-sheet"><thead><tr><th rowspan="2">学年・組・番号</th><th rowspan="2">氏名</th><th rowspan="2">場所</th><th rowspan="2">延長</th><th rowspan="2">配慮の内容</th>'+h1+'</tr><tr>'+h2+'</tr></thead><tbody>'+rows+blank+'</tbody></table>'
    + '<p class="small">当日の記入：受験した → ○　欠席 → 欠　遅刻 → 遅(時刻)　保健室 → 保　早退 → 早。ます目の上の小さな文字は、教科と終わりの時刻(延長を含む)です。欠席などの生徒が増えたら、下の空いた行に書き足してください。</p>';
  // 掲示用なので、人数が少ないときは用紙に合わせて大きくする(大きくしすぎないよう 1.8倍まで)
  return [{ html, grow:1.8 }];
};

// ---- 注意事項 ----
BUILD.notice = (ex)=>{
  const lines = String(ex.notice.body||'').split('\n').map(l=>l.trim()).filter(Boolean);
  if(!lines.length) return [];
  const html = '<div class="notice"><h1>'+esc(ex.notice.title||'')+'</h1><ol>'+lines.map(l=>'<li>'+esc(l.replace(/^[0-9０-９]+[.．、)）]\s*|^[・●○]\s*/, ''))+'</li>').join('')+'</ol>'
    + '<div class="notice-foot">'+esc(ex.name)+'</div></div>';
  return [{ html, grow:true, cls:'poster' }];
};

// ---- 出欠記録用紙 ----
BUILD.attend = (ex, paperKey)=>{
  const target = optOf('attend','target','all');
  const rooms = classRooms().filter(r=> target==='all' || target==='g'+r.grade || target===r.key);
  const perDay = paperKey==='A4P';
  const pages = [];
  rooms.forEach(r=>{
    const sts = state.students.filter(s=>s.grade===r.grade && s.cls===r.cls).sort(sortStudents);
    if(!sts.length) return;
    const dayGroups = perDay ? ex.days.map((d,di)=>[di]) : [ex.days.map((d,di)=>di)];
    dayGroups.forEach(dayIdxs=>{
      const ts = testSlots(ex).filter(t=>dayIdxs.includes(t.di) && subjAt(ex, t.slot.id));
      if(!ts.length) return;
      let h1 = '', h2 = '', h3 = '';
      dayIdxs.forEach(di=>{ const n = ts.filter(t=>t.di===di).length; if(n) h1 += '<th colspan="'+n+'">'+esc(dayTitle(ex, di))+'</th>'; });
      ts.forEach(t=>{
        const sid = subjAt(ex, t.slot.id);
        h2 += '<th class="slot">'+esc(t.label)+'<br><b>'+esc(subjectName(sid))+'</b></th>';
        h3 += '<th class="small">'+esc(proctorsAt(ex, t.slot.id, r.key).map(teacherName).join('・'))+'</th>';
      });
      const rows = sts.map(s=>{
        const sp = ex.special.find(p=>p.studentId===s.id);
        return '<tr><td class="c">'+s.no+'</td><td class="name">'+esc(s.name)+'</td>' + ts.map(t=>{
          if(sp && isAbsentDay(sp, t.day)) return '<td class="pre-cell">欠席予定</td>';
          if(sp && sp.room) return '<td class="pre-cell">別室</td>';
          return '<td></td>';
        }).join('') + '</tr>';
      }).join('');
      const foot = '<tr class="foot"><th colspan="2">欠席の人数</th>'+ts.map(()=>'<td class="r">人</td>').join('')+'</tr>'
        + '<tr class="foot"><th colspan="2">出席 ／ 在籍</th>'+ts.map(()=>'<td class="r">／'+sts.length+'</td>').join('')+'</tr>'
        + '<tr class="foot"><th colspan="2">記入した監督</th>'+ts.map(()=>'<td></td>').join('')+'</tr>';
      pages.push({ html: pTitle(esc(ex.name)+'　出欠記録　<span class="big">'+r.grade+'年'+r.cls+'組</span>', '在籍 '+sts.length+'名　'+schoolSub())
        + '<table class="p-table attend-sheet"><thead><tr><th rowspan="3" class="no">番号</th><th rowspan="3" class="name">氏名</th>'+h1+'</tr><tr>'+h2+'</tr><tr>'+h3+'</tr></thead><tbody>'+rows+foot+'</tbody></table>'
        + '<p class="small">記入：欠席 → 欠　遅刻 → 遅(時刻)　別室で受けた → 別　保健室 → 保　早退 → 早。見出しの下の名前は、その時間の監督です。</p>' });
    });
  });
  return pages;
};
