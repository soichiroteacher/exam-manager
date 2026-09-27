'use strict';
// 「休暇」タブ(監督に入れない時間の集約)と「監督」タブ(試験監督の割り当て)

// 監督の候補(教員とサポーター)。表の並び: 教員 → サポーター
function proctorPeople(){ return state.teachers.filter(t=>t.name).slice().sort((a,b)=> (a.kind===b.kind?0:a.kind==='教員'?-1:1)); }
function leaveOf(ex, tid, slotId){ return ex.leave[tid+'|'+slotId] || ''; }
// 表の見出し(日 → 時間)。休暇・監督・印刷で共通
function slotHeadHtml(ex, withSubjects){
  const ts = testSlots(ex);
  let h1 = '', h2 = '', h3 = '';
  ex.days.forEach((day, di)=>{
    const n = ts.filter(t=>t.di===di).length; if(!n) return;
    h1 += '<th colspan="'+n+'" class="dayh">'+esc(dayTitle(ex, di))+'</th>';
  });
  ts.forEach(t=>{
    h2 += '<th class="dayl">'+esc(t.label)+'<div class="hint">'+fmtT(tmin(t.slot.start))+'〜</div></th>';
    if(withSubjects) h3 += '<th class="subjh dayl">'+grades().map(g=>{ const s = subjAt(ex, t.slot.id, g); return s ? '<div>'+g+'年 '+esc(subjectName(s))+'</div>' : ''; }).join('')+'</th>';
  });
  return { ts, h1, h2, h3 };
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
  if(!room.sep) return !!subjAt(ex, t.slot.id, room.grade);
  return roomStudentsAt(ex, room.roomId, t.day, t.slot).length > 0;
}
function subjectsInSlot(ex, slotId){ return new Set(grades().map(g=>subjAt(ex, slotId, g)).filter(Boolean)); }
function autoAssign(ex, onlyEmpty){
  const people = proctorPeople().filter(t=>!t.noProctor);
  const counts = new Map(people.map(t=>[t.id, 0]));
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
        let score = counts.get(p.id) * 10;
        if(p.subjects.some(s=>subs.has(s))) score += 100;                  // 自分の教科の時間
        if(r.sep){ if(p.kind!=='サポーター') score += 30; }                 // 別室はサポーター優先
        else {
          if(p.kind==='サポーター') score += 60;                            // 教室は教員優先
          if(p.grade && p.grade!==r.grade) score += 4;                     // 所属学年の教室を優先
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
// 割り当ての気になるところ。cell[key] = 'warn'|'err'、list = 文の一覧
function proctorCheck(ex){
  const cell = {}, list = [];
  const rooms = roomsForProctor();
  testSlots(ex).forEach(t=>{
    const seen = new Map(), subs = subjectsInSlot(ex, t.slot.id), where = dayTitle(ex, t.di)+' '+t.label;
    rooms.forEach(r=>{
      const key = t.slot.id+'|'+r.key, ids = proctorsAt(ex, t.slot.id, r.key);
      if(roomNeeded(ex, r, t) && !ids.length){ cell[key] = 'warn'; list.push(where+'：'+r.name+'の監督が決まっていません。'); }
      ids.forEach(id=>{
        const p = teacherById(id); if(!p) return;
        if(seen.has(id)){ cell[key] = cell[seen.get(id)] = 'err'; list.push(where+'：'+p.name+'が2か所('+rooms.find(x=>x.key===seen.get(id).split('|')[1]).name+'・'+r.name+')に入っています。'); }
        seen.set(id, key);
        const lv = leaveOf(ex, id, t.slot.id);
        if(lv){ cell[key] = 'err'; list.push(where+'：'+p.name+'は'+lv+'です。'); }
        else if(p.subjects.some(s=>subs.has(s))){ cell[key] = cell[key]||'warn'; list.push(where+'：'+p.name+'は、この時間に担当教科('+p.subjects.filter(s=>subs.has(s)).map(subjectName).join('・')+')のテストがあります。'); }
        if(p.noProctor){ cell[key] = cell[key]||'warn'; list.push(where+'：'+p.name+'は「監督なし」にしている人です。'); }
      });
    });
  });
  return { cell, list };
}
function proctorCounts(ex){
  const c = new Map();
  Object.values(ex.proctors).forEach(a=>a.forEach(id=>c.set(id, (c.get(id)||0)+1)));
  return c;
}
TABS.proctor = { render(){
  const ex = curExam();
  if(!ex){ $('tab-proctor').innerHTML = needExamHtml(); return; }
  const { ts, h1, h2, h3 } = slotHeadHtml(ex, true);
  const d = dis();
  let html = '<div class="toolbar"><button class="primary edit-act" data-act="autoProctor" data-mode="empty">自動で案を作る(空いている所だけ)</button>'
    + '<button class="edit-act" data-act="autoProctor" data-mode="all">全部作り直す</button>'
    + '<button class="danger edit-act" data-act="clearProctor">全部消す</button>'
    + '<button data-act="printForm" data-form="proctor">🖨 監督表を印刷</button></div>'
    + '<p class="hint">自動の案は、休暇・出張の人を外し、担当教科のテストの時間をなるべく避け、サポーターを別室に、教員を教室(所属学年を優先)に、回数がそろうように入れます。案を作ったあと、手で直せます。別室の「補助」の欄は2人目を入れたいときに使います。</p>';
  if(!ts.length){ $('tab-proctor').innerHTML = html + '<div class="banner">「時間割」タブで、テストの時間を入れてください。</div>'; return; }
  const chk = proctorCheck(ex), counts = proctorCounts(ex);
  html += warningsHtml(chk.list);
  const people = proctorPeople();
  const opts = (sel, t) => '<option value="">―</option>' + people.map(p=>{
    const lv = leaveOf(ex, p.id, t.slot.id), own = p.subjects.some(s=>subjectsInSlot(ex, t.slot.id).has(s));
    return '<option value="'+esc(p.id)+'"'+(p.id===sel?' selected':'')+'>'+esc(p.name)+(p.kind==='サポーター'?'(サ)':'')+(lv?'【'+lv+'】':own?'(教科)':'')+'</option>';
  }).join('');
  html += '<div class="scroll-x"><table class="grid proctor"><thead><tr><th rowspan="3">教室</th>'+h1+'</tr><tr>'+h2+'</tr><tr>'+h3+'</tr></thead><tbody>';
  let lastGrade = null;
  roomsForProctor().forEach(r=>{
    const sepRow = r.sep && lastGrade!=='sep';
    html += '<tr class="'+(r.sep?'sep-room':'')+((r.sep?sepRow:lastGrade!==r.grade && lastGrade!==null)?' sep':'')+'"><th class="l">'+esc(r.sep ? r.name : r.grade+'年'+r.cls+'組')+'</th>';
    lastGrade = r.sep ? 'sep' : r.grade;
    ts.forEach(t=>{
      const key = t.slot.id+'|'+r.key, ids = proctorsAt(ex, t.slot.id, r.key);
      if(!roomNeeded(ex, r, t) && !ids.length){ html += '<td class="off">'+(r.sep?'使わない':'')+'</td>'; return; }
      let inner = '<select data-act-proctor="'+esc(key)+'" data-idx="0"'+d+'>'+opts(ids[0], t)+'</select>';
      if(r.sep){
        inner += '<select data-act-proctor="'+esc(key)+'" data-idx="1"'+d+' title="2人目(補助)">'+opts(ids[1], t).replace('>―<','>補助なし<')+'</select>';
        const ends = roomStudentsAt(ex, r.roomId, t.day, t.slot).map(sp=>specialEnd(ex, sp, t.slot)).filter(e=>e!=null);
        if(ends.length) inner += '<div class="hint">〜'+fmtT(Math.max(...ends))+'まで('+ends.length+'人)</div>';
      }
      html += '<td class="'+(chk.cell[key]||'')+'">'+inner+'</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  // 回数
  html += '<section><h2>監督の回数</h2><div class="count-list">' + people.map(p=>'<span class="chip'+(p.kind==='サポーター'?' supporter':'')+'">'+esc(p.name)+' <b>'+(counts.get(p.id)||0)+'</b>'+(p.noProctor?'(監督なし)':'')+'</span>').join('') + '</div></section>';
  $('tab-proctor').innerHTML = html;
}};
document.addEventListener('change', e=>{
  const el = e.target.closest('[data-act-proctor]');
  if(!el || !editing) return;
  const ex = curExam(), key = el.dataset.actProctor, idx = +el.dataset.idx;
  const a = (ex.proctors[key]||[]).slice();
  a[idx] = el.value;
  const clean = a.filter(Boolean);
  if(clean.length) ex.proctors[key] = clean; else delete ex.proctors[key];
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
