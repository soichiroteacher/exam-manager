'use strict';
// 「休暇」タブ(監督に入れない時間の集約)と「監督」タブ(試験監督の割り当て)

// 監督の候補(教員とサポーター)。表の並び: 教員 → サポーター
function proctorPeople(){ return state.teachers.filter(t=>t.name).slice().sort((a,b)=> (a.kind===b.kind?0:a.kind==='教員'?-1:1)); }
function leaveOf(ex, tid, slotId){ return ex.leave[tid+'|'+slotId] || ''; }
// 表の見出し(日 → 時間)。休暇・監督・印刷で共通
function slotHeadHtml(ex, withSubjects){
  const ts = testSlots(ex);
  let h1 = '', h2 = '';
  ex.days.forEach((day, di)=>{
    const n = ts.filter(t=>t.di===di).length; if(!n) return;
    h1 += '<th colspan="'+n+'" class="dayh">'+esc(dayTitle(ex, di))+'</th>';
  });
  ts.forEach(t=>{
    const sid = subjAt(ex, t.slot.id), end = slotEnd(ex, t.slot);
    h2 += '<th class="dayl">'+esc(t.label)+(withSubjects ? '<div class="subjname">'+(sid ? esc(subjectName(sid)) : '(未定)')+'</div>' : '')
      + '<div class="hint">'+fmtT(tmin(t.slot.start))+'〜'+(withSubjects && end!=null ? fmtT(end) : '')+'</div></th>';
  });
  return { ts, h1, h2 };
}

//////////////////////// 休暇 ////////////////////////
TABS.leave = { render(){
  const ex = curExam();
  if(!ex){ $('tab-leave').innerHTML = needExamHtml(); return; }
  const { ts, h1, h2 } = slotHeadHtml(ex, false);
  const people = proctorPeople();
  let html = '<div class="toolbar"><button data-act="printForm" data-form="leave">🖨 休暇集約用紙を印刷</button>'
    + '<span class="hint">先生方に用紙で集めた休暇・出張を、ここに入れます。ます目を押すたびに「休暇 → 出張 → その他 → 空」と変わります。印を付けた時間は、監督の自動の割り当てから外します。</span></div>';
  if(!ts.length){ $('tab-leave').innerHTML = html + '<div class="banner">「時間割」タブで、テストの時間を入れてください。</div>'; return; }
  if(!people.length){ $('tab-leave').innerHTML = html + '<div class="banner">「設定」タブで、先生・サポーターを入れてください。</div>'; return; }
  html += '<div class="scroll-x"><table class="grid leave"><thead><tr><th rowspan="2">名前</th><th rowspan="2">種別</th>'+h1+'<th rowspan="2">日ごと</th></tr><tr>'+h2+'</tr></thead><tbody>';
  people.forEach(t=>{
    html += '<tr'+(t.kind==='サポーター'?' class="supporter"':'')+'><th class="l">'+esc(t.name)+'</th><td class="hint">'+esc(t.kind)+'</td>'
      + ts.map(x=>{ const v = leaveOf(ex, t.id, x.slot.id);
        return '<td class="mark'+(v?' on':'')+'"><button class="cellbtn edit-act" data-act="cycleLeave" data-t="'+esc(t.id)+'" data-s="'+esc(x.slot.id)+'">'+(v?esc(v):'　')+'</button></td>'; }).join('')
      + '<td class="nowrap">'+ex.days.map((day,di)=> ts.some(x=>x.di===di) ? '<button class="small edit-act" data-act="leaveDay" data-t="'+esc(t.id)+'" data-d="'+di+'" title="この日をまとめて休暇にする/消す">'+(di+1)+'日目</button>' : '').join(' ')+'</td></tr>';
  });
  html += '</tbody></table></div>';
  $('tab-leave').innerHTML = html;
}};
ACTIONS.cycleLeave = el=>{
  const ex = curExam(), key = el.dataset.t+'|'+el.dataset.s;
  const kinds = CONFIG.leaveKinds, cur = ex.leave[key] || '';
  const next = kinds[kinds.indexOf(cur)+1];
  if(next) ex.leave[key] = next; else delete ex.leave[key];
  markDirty(); renderAll();
};
ACTIONS.leaveDay = el=>{
  const ex = curExam(), tid = el.dataset.t, day = ex.days[+el.dataset.d];
  const ids = day.slots.filter(s=>s.kind==='test').map(s=>s.id);
  const allOn = ids.every(id=>ex.leave[tid+'|'+id]);
  ids.forEach(id=>{ if(allOn) delete ex.leave[tid+'|'+id]; else if(!ex.leave[tid+'|'+id]) ex.leave[tid+'|'+id] = '休暇'; });
  markDirty(); renderAll();
};

//////////////////////// 監督 ////////////////////////
// 監督の割り当ての決まり(2026-09-27 の構成案。ユーザーに見てもらって直す):
//  - 休暇・出張の時間、「監督なし」の人は入れない。同じ時間に2か所には入れない。
//  - その時間に自分の担当教科のテストがある先生は、なるべく外す(質問への対応や巡回のため)。
//  - サポーターは別室を優先。教室は教員を優先し、所属学年の教室を優先する。
//  - 監督の回数がなるべくそろうようにする。
//  - 別室は、その時間にその部屋で受ける生徒がいるときだけ割り当てる。別室の監督は延長の終わりまで続けて見る。
function roomsForProctor(){ return classRooms().concat(sepRooms()); }
function roomNeeded(ex, room, t){
  if(!room.sep) return !!subjAt(ex, t.slot.id);
  return roomStudentsAt(ex, room.roomId, t.day, t.slot).length > 0;
}
// その時間のテストの教科(全学年共通なので1つ。Set で返すのは担当教科との照らし合わせに使うため)
function subjectsInSlot(ex, slotId){ const s = subjAt(ex, slotId); return new Set(s ? [s] : []); }
// 年間(この年度のほかの回)の監督回数。自動の割り当てで、この回の回数がそろったうえで、年間の回数もそろえるために使う
// (2026-09-27 ユーザー:「テストごとに入る回数をできるだけ揃えるが、難しい場合でも年間で入る回数が同じになるように調整したい」)
function yearCounts(exceptEx){
  const c = new Map();
  state.exams.forEach(x=>{ if(x!==exceptEx) proctorCounts(x).forEach((n,id)=>c.set(id, (c.get(id)||0)+n)); });
  return c;
}
// その教室の、その時間の始まり(別室はずらした時刻)
function roomStart(ex, r, t){ return r.sep ? sepStartOf(ex, r.roomId, t.slot) : tmin(t.slot.start); }
// 同じ日の前の時間に別室で監督していて、延長の終わりが、この時間のその教室の始まりより遅いか
// (別室の監督は延長の終わりまで続けて見るため、次の時間の監督に間に合わない)
function busyFromPrev(ex, tid, t, r){
  const prev = testSlots(ex).filter(x=>x.di===t.di && (tmin(x.slot.start)??0) < (tmin(t.slot.start)??0)).pop();
  if(!prev) return null;
  const pr = roomOfTeacher(ex, tid, prev.slot.id);
  if(!pr || !pr.sep || (r && pr.key===r.key)) return null;
  const e = sepRoomEnd(ex, pr, prev), st = r ? roomStart(ex, r, t) : tmin(t.slot.start);
  return e!=null && st!=null && e > st ? { room:pr, end:e } : null;
}
function autoAssign(ex, onlyEmpty){
  const people = proctorPeople().filter(t=>!t.noProctor);
  const counts = new Map(people.map(t=>[t.id, 0]));
  const year = yearCounts(ex);
  const rooms = roomsForProctor(), ts = testSlots(ex);
  if(onlyEmpty){ Object.values(ex.proctors).forEach(a=>a.forEach(id=>{ if(counts.has(id)) counts.set(id, counts.get(id)+1); })); }
  else ex.proctors = {};
  let short = 0;
  ts.forEach((t, k)=>{
    const used = new Set();
    rooms.forEach(r=> proctorsAt(ex, t.slot.id, r.key).forEach(id=>used.add(id)));
    const subs = subjectsInSlot(ex, t.slot.id);
    // 別室を先に決める(サポーターを別室に回すため)
    const order = rooms.filter(r=>r.sep).concat(rooms.filter(r=>!r.sep));
    order.forEach(r=>{
      const key = t.slot.id+'|'+r.key;
      if(!roomNeeded(ex, r, t)){ if(!onlyEmpty) delete ex.proctors[key]; return; }
      if((ex.proctors[key]||[]).length) return;
      let best = null, bestScore = Infinity;
      people.forEach((p, pi)=>{
        if(used.has(p.id) || leaveOf(ex, p.id, t.slot.id)) return;
        if(busyFromPrev(ex, p.id, t, r)) return;                          // 前の時間の別室の延長が終わっていない
        let score = counts.get(p.id) * 10;                                 // この回の回数をそろえる(いちばん強い)
        score += (year.get(p.id)||0) * 5;                                  // 年間の回数もそろえる(この回の1回分=10より小さくして、この回をそろえるほうを先にする)
        if(p.subjects.some(s=>subs.has(s))) score += 100;                  // 自分の教科の時間
        if(r.sep){ if(p.kind!=='サポーター') score += 30; }                 // 別室はサポーター優先
        else {
          if(p.kind==='サポーター') score += 60;                            // 教室は教員優先
          if(p.grade && p.grade!==r.grade) score += 2;                     // 所属学年の教室を優先(年間の回数よりは弱く)
        }
        score += ((pi + k*7) % people.length) / (people.length*10);       // 同点のときに毎回同じ人にならないように少しずらす
        if(score < bestScore){ bestScore = score; best = p; }
      });
      if(!best){ short++; return; }
      ex.proctors[key] = [best.id]; used.add(best.id); counts.set(best.id, counts.get(best.id)+1);
    });
  });
  return short;
}
// 割り当ての気になるところ。cell['先生id|時間id'] = 'warn'|'err'、list = 文の一覧
function proctorCheck(ex){
  const cell = {}, list = [];
  const rooms = roomsForProctor();
  testSlots(ex).forEach(t=>{
    const subs = subjectsInSlot(ex, t.slot.id), where = dayTitle(ex, t.di)+' '+t.label+'('+(subjectName(subjAt(ex, t.slot.id))||'教科未定')+')';
    const where1 = new Map();   // 先生 → 入っている教室
    rooms.forEach(r=>{
      const ids = proctorsAt(ex, t.slot.id, r.key);
      if(roomNeeded(ex, r, t) && !ids.length) list.push(where+'：'+r.name+'の監督が決まっていません。');
      if(!r.sep && ids.length>1) list.push(where+'：'+r.name+'に'+ids.length+'人入っています。');
      ids.forEach(id=>{ if(!where1.has(id)) where1.set(id, []); where1.get(id).push(r); });
    });
    where1.forEach((rs, id)=>{
      const p = teacherById(id); if(!p) return;
      const key = id+'|'+t.slot.id;
      if(rs.length>1){ cell[key] = 'err'; list.push(where+'：'+p.name+'が'+rs.length+'か所('+rs.map(r=>r.name).join('・')+')に入っています。'); }
      const lv = leaveOf(ex, id, t.slot.id);
      if(lv){ cell[key] = 'err'; list.push(where+'：'+p.name+'は'+lv+'です。'); }
      else if(p.subjects.some(s=>subs.has(s))){ cell[key] = cell[key]||'warn'; list.push(where+'：'+p.name+'は、担当教科のテストの時間です。'); }
      if(p.noProctor){ cell[key] = cell[key]||'warn'; list.push(where+'：'+p.name+'は「監督なし」にしている人です。'); }
      const busy = busyFromPrev(ex, id, t, rs[0]);
      if(busy){ cell[key] = 'err'; list.push(where+'：'+p.name+'は、前の時間の'+busy.room.name+'(時間延长)が'+fmtT(busy.end)+'まであり、'+rs[0].name+'の始まりに間に合いません。'); }
    });
  });
  return { cell, list };
}
function proctorCounts(ex){
  const c = new Map();
  Object.values(ex.proctors).forEach(a=>a.forEach(id=>c.set(id, (c.get(id)||0)+1)));
  return c;
}
// その時間に、その先生が入っている教室(なければ null)
function roomOfTeacher(ex, tid, slotId){
  return roomsForProctor().find(r=>proctorsAt(ex, slotId, r.key).includes(tid)) || null;
}
// 別室の、その時間の終わりの時刻(延長の生徒のうち一番遅い時刻)
// 別室の、その時間の始まり(生徒ごとに始まりが違うときは、いちばん早い時刻)
function sepRoomStart(ex, r, t){
  const sts = roomStudentsAt(ex, r.roomId, t.day, t.slot).map(sp=>specialStart(ex, sp, t.slot)).filter(x=>x!=null);
  return sts.length ? Math.min(...sts) : sepStartOf(ex, r.roomId, t.slot);
}
function sepRoomEnd(ex, r, t){
  const ends = roomStudentsAt(ex, r.roomId, t.day, t.slot).map(sp=>specialEnd(ex, sp, t.slot)).filter(e=>e!=null);
  return ends.length ? Math.max(...ends) : null;
}

//////////////////////// 監督タブ(縦に先生、横にテストの時間。ます目に入る教室) ////////////////////////
TABS.proctor = { render(){
  const ex = curExam();
  if(!ex){ $('tab-proctor').innerHTML = needExamHtml(); return; }
  const { ts, h1, h2 } = slotHeadHtml(ex, true);
  const d = dis();
  let html = '<div class="toolbar"><button class="primary edit-act" data-act="autoProctor" data-mode="empty">自動で案を作る(空いている所だけ)</button>'
    + '<button class="edit-act" data-act="autoProctor" data-mode="all">全部作り直す</button>'
    + '<button class="danger edit-act" data-act="clearProctor">全部消す</button>'
    + '<button data-act="printForm" data-form="proctor">🖨 監督表を印刷</button></div>'
    + '<p class="hint">ます目で、その時間に入る教室を選びます。自動の案は、休暇・出張の人を外し、担当教科のテストの時間をなるべく避け、サポーターを別室に、教員を教室(所属学年を優先)に、回数がそろうように入れます。案を作ったあと、手で直せます。</p>';
  if(!ts.length){ $('tab-proctor').innerHTML = html + '<div class="banner">「時間割」タブで、テストの時間を入れてください。</div>'; return; }
  const people = proctorPeople();
  if(!people.length){ $('tab-proctor').innerHTML = html + '<div class="banner">「設定」タブで、先生・サポーターを入れてください。</div>'; return; }
  const chk = proctorCheck(ex), counts = proctorCounts(ex), year = yearCounts(ex);
  html += warningsHtml(chk.list);
  const rooms = roomsForProctor();
  html += '<div class="scroll-x"><table class="grid proctor"><thead><tr><th rowspan="2">名前</th>'+h1+'<th rowspan="2">この回</th><th rowspan="2">年間</th></tr><tr>'+h2+'</tr></thead><tbody>';
  let lastKind = null;
  people.forEach(p=>{
    html += '<tr class="'+(p.kind==='サポーター'?'supporter':'')+(lastKind && lastKind!==p.kind?' sep':'')+'"><th class="l">'+esc(p.name)+(p.noProctor?' <span class="hint">(監督なし)</span>':'')+'</th>';
    lastKind = p.kind;
    ts.forEach(t=>{
      const cur = roomOfTeacher(ex, p.id, t.slot.id), lv = leaveOf(ex, p.id, t.slot.id);
      const opts = '<option value="">'+(lv ? lv : '')+'</option>' + rooms.map(r=>{
        const need = roomNeeded(ex, r, t);
        if(!need && (!cur || cur.key!==r.key)) return '';
        return '<option value="'+esc(r.key)+'"'+(cur && cur.key===r.key?' selected':'')+'>'+esc(r.name)+'</option>';
      }).join('');
      const cls = (chk.cell[p.id+'|'+t.slot.id]||'') + (lv && !cur ? ' leave' : '') + (cur ? ' has' : '');
      html += '<td class="'+cls+'"><select data-pt="'+esc(p.id+'|'+t.slot.id)+'"'+d+'>'+opts+'</select></td>';
    });
    html += '<td class="c"><b>'+(counts.get(p.id)||0)+'</b></td><td class="c">'+((counts.get(p.id)||0)+(year.get(p.id)||0))+'</td></tr>';
  });
  // 監督が決まっていない教室
  html += '<tr class="sep"><th class="l">決まっていない教室</th>' + ts.map(t=>{
    const empty = rooms.filter(r=>roomNeeded(ex, r, t) && !proctorsAt(ex, t.slot.id, r.key).length).map(r=>r.name);
    return '<td class="'+(empty.length?'warn':'ok-cell')+' small-cell">'+(empty.length ? esc(empty.join(' ')) : '✓')+'</td>';
  }).join('') + '<td></td><td></td></tr>';
  // 別室の時刻(ずらした始まり〜延長の終わり)
  sepRooms().forEach(r=>{
    html += '<tr><th class="l">'+esc(r.name)+'の時刻</th>' + ts.map(t=>{ const e = sepRoomEnd(ex, r, t), n = roomStudentsAt(ex, r.roomId, t.day, t.slot).length;
      return e!=null ? '<td class="small-cell">'+fmtT(sepRoomStart(ex, r, t))+'〜'+fmtT(e)+'('+n+'人)</td>' : '<td class="off">使わない</td>'; }).join('') + '<td></td><td></td></tr>';
  });
  html += '</tbody></table></div>';
  // 年間の監督回数(回ごと)
  const per = state.exams.map(x=>proctorCounts(x));
  html += '<section><h2>年間の監督回数</h2><p class="hint">この年度のテストの回ごとの回数と合計です。自動の案は、この回の回数をそろえたうえで、年間の回数の少ない人を優先します。</p>'
    + '<div class="scroll-x"><table class="grid year"><thead><tr><th>名前</th>'+state.exams.map(x=>'<th'+(x===ex?' class="cur"':'')+'>'+esc(x.name)+'</th>').join('')+'<th>合計</th></tr></thead><tbody>'
    + people.map(p=>{ const vals = per.map(c=>c.get(p.id)||0), tot = vals.reduce((a,b)=>a+b,0);
      return '<tr'+(p.kind==='サポーター'?' class="supporter"':'')+'><th class="l">'+esc(p.name)+'</th>'+vals.map((v,i)=>'<td class="c'+(state.exams[i]===ex?' cur':'')+'">'+(v||'')+'</td>').join('')+'<td class="c"><b>'+tot+'</b></td></tr>'; }).join('')
    + '</tbody></table></div></section>';
  $('tab-proctor').innerHTML = html;
}};
// ます目で教室を選んだとき: その時間にその先生が入っていた教室から外し、選んだ教室に入れる
document.addEventListener('change', e=>{
  const el = e.target.closest('[data-pt]');
  if(!el || !editing) return;
  const ex = curExam(), [tid, slotId] = el.dataset.pt.split('|');
  roomsForProctor().forEach(r=>{
    const key = slotId+'|'+r.key, a = (ex.proctors[key]||[]).filter(id=>id!==tid);
    if(a.length) ex.proctors[key] = a; else delete ex.proctors[key];
  });
  if(el.value){ const key = slotId+'|'+el.value; ex.proctors[key] = (ex.proctors[key]||[]).concat(tid); }
  markDirty(); setTimeout(renderAll, 0);
});
ACTIONS.autoProctor = el=>{
  const ex = curExam();
  if(!proctorPeople().length){ alert('「設定」タブで、先生・サポーターを入れてください。'); return; }
  if(el.dataset.mode==='all' && Object.keys(ex.proctors).length && !confirm('今の割り当てを消して、全部作り直します。手で直したところも消えます。よろしいですか？')) return;
  const short = autoAssign(ex, el.dataset.mode!=='all');
  markDirty(); renderAll();
  if(short) alert('人が足りず、'+short+'か所が空いたままです。休暇の入力や「監督なし」の設定を確かめるか、手で入れてください。');
};
ACTIONS.clearProctor = ()=>{
  if(!confirm('この回の監督の割り当てを、すべて消します。よろしいですか？')) return;
  curExam().proctors = {}; markDirty(); renderAll();
};
