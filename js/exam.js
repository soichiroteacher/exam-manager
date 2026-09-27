'use strict';
// 「テストの回」タブ(回の追加・日程・教科ごとのテスト時間・注意事項の文)と「時間割」タブ

//////////////////////// テストの回 ////////////////////////
TABS.exam = { render(){
  const ex = curExam(), d = dis();
  const list = state.exams.map(x=>'<button class="exam-item'+(x===ex?' active':'')+'" data-act="pickExam" data-id="'+esc(x.id)+'">'+esc(x.name)
    + '<span class="hint">'+(x.days.length ? x.days.map(dd=>fmtMD(dd.date)||'日付なし').join('・') : '日程なし')+'</span></button>').join('');
  let html = '<div class="cols"><div class="exam-list"><h2>テストの回</h2>'+(list || '<p class="hint">まだありません。</p>')
    + '<div class="edit-only add-exam"><input type="text" id="newExamName" placeholder="例：2学期中間" style="width:100%">'
    + '<button class="primary" data-act="addExam">＋ 新しい回を追加</button>'
    + (ex ? '<button data-act="copyExam">今の回をもとに作る</button><p class="hint">「もとに作る」は、日程の時刻・教科とテスト時間・注意事項・配慮の必要な生徒を写します(日付・時間割・監督・休暇は写しません)。</p>' : '')
    + '</div>' + (editing ? '' : '<p class="hint">追加・変更するには、上の「✏ 編集する」を押してください。</p>') + '</div>';
  if(!ex){ $('tab-exam').innerHTML = html + '<div></div></div>'; return; }
  // --- 日程 ---
  const days = ex.days.map((day,i)=>'<div class="line">'+(i+1)+'日目 <input type="date" data-path="ex.days.'+i+'.date" value="'+esc(day.date)+'"'+d+'> '
    + (day.date ? '<b>'+fmtJDate(day.date)+'</b>' : '<span class="warn">日付を入れてください</span>')
    + ' <button class="small edit-only" data-act="moveDay" data-i="'+i+'" data-dir="-1">▲</button><button class="small edit-only" data-act="moveDay" data-i="'+i+'" data-dir="1">▼</button>'
    + ' <button class="small danger edit-only" data-act="delDay" data-i="'+i+'">この日を削除</button></div>').join('');
  // --- 教科とテスト時間(全学年共通) ---
  const subjRows = state.subjects.map(s=>{ const v = examSubj(ex, s.id), p = 'ex.subjects.'+s.id;
    return '<tr class="'+(v.on?'':'off-row')+'"><th class="l">'+esc(s.name)+(s.core5?' <span class="tag">5教科</span>':'')+'</th>'
      + '<td class="c"><input type="checkbox" data-path="'+p+'.on"'+(v.on?' checked':'')+d+'></td>'
      + '<td><input type="number" min="1" max="300" style="width:70px" data-path="'+p+'.minutes" data-type="num" value="'+v.minutes+'"'+d+'> 分</td>'
      + '<td><input type="number" min="1" max="1000" style="width:70px" data-path="'+p+'.max" data-type="num" value="'+v.max+'"'+d+'> 点</td></tr>'; }).join('');
  html += '<div class="exam-detail">'
    + '<section><h2>回の名前</h2><input type="text" style="width:300px" data-path="ex.name" value="'+esc(ex.name)+'"'+d+'>'
    + ' <button class="danger edit-only" data-act="delExam">この回を削除</button></section>'
    + '<section><h2>日程</h2>'+(days || '<p class="hint">まだ日がありません。</p>')
    + '<div class="edit-only line"><button data-act="addDay">＋ テストの日を追加</button> <span class="hint">1日の時程(何時から何時間目など)は「時間割」タブで決めます。</span></div></section>'
    + '<section><h2>教科とテスト時間(全学年共通)</h2><p class="hint">その回に行う教科に「実施」の印を付け、テスト時間(分)と満点を入れます。時間延長の生徒は、このテスト時間 × 倍率になります。</p>'
    + '<table class="grid subj"><thead><tr><th>教科</th><th>実施</th><th>テスト時間</th><th>満点</th></tr></thead><tbody>'+subjRows+'</tbody></table></section>'
    + '<section><h2>注意事項(教室に掲示する A3 の用紙)</h2><p class="hint">1行が1項目になります。印刷は「印刷」タブから。</p>'
    + '<div class="line">見出し <input type="text" style="width:360px" data-path="ex.notice.title" value="'+esc(ex.notice.title)+'"'+d+'></div>'
    + '<textarea rows="11" style="width:100%" data-path="ex.notice.body"'+d+'>'+esc(ex.notice.body)+'</textarea></section>'
    + '</div></div>';
  $('tab-exam').innerHTML = html;
  document.querySelectorAll('#tab-exam .edit-only').forEach(el=> el.hidden = !editing);
}};
ACTIONS.pickExam = el=>{ view.examId = el.dataset.id; savePref(); renderAll(); };
ACTIONS.addExam = ()=>{
  if(!editing) return;
  const name = $('newExamName').value.trim();
  if(!name){ alert('回の名前(例：2学期中間)を入れてから押してください。'); $('newExamName').focus(); return; }
  const ex = newExam(name);
  state.exams.push(ex); view.examId = ex.id; savePref();
  markDirty(); renderAll();
};
ACTIONS.copyExam = ()=>{
  if(!editing) return;
  const src = curExam();
  const name = $('newExamName').value.trim() || src.name+'(写し)';
  const ex = newExam(name);
  ex.days = src.days.map(dd=>({ id:newId('d'), date:'', slots: dd.slots.map(s=>({ ...clone(s), id:newId('t') })) }));
  ex.subjects = clone(src.subjects);
  ex.notice = clone(src.notice);
  ex.special = src.special.map(p=>({ ...clone(p), id:newId('p'), absentDays:[], starts:{} }));   // 生徒ごとの始まりの時刻は、時間が変わるので写さない
  state.exams.push(ex); view.examId = ex.id; savePref();
  markDirty(); renderAll();
  alert('「'+name+'」を作りました。日付を入れ、「時間割」タブで教科を並べてください。');
};
ACTIONS.delExam = ()=>{
  const ex = curExam();
  if(!confirm('「'+ex.name+'」を削除します。この回の時間割・監督・配慮の必要な生徒・点数もすべて消えます。\n元に戻せません。よろしいですか？')) return;
  state.exams = state.exams.filter(x=>x!==ex); view.examId = ''; savePref();
  markDirty(); renderAll();
};
ACTIONS.addDay = ()=>{
  const ex = curExam();
  // 前の日と同じ時程で追加する(日付は前の日の次の平日)
  const prev = ex.days[ex.days.length-1];
  let date = '';
  if(prev && prev.date){
    const t = new Date(prev.date+'T00:00:00'); do{ t.setDate(t.getDate()+1); }while(t.getDay()===0 || t.getDay()===6);
    date = t.getFullYear()+'-'+pad2(t.getMonth()+1)+'-'+pad2(t.getDate());
  }
  const day = newDay(date);
  if(prev) day.slots = prev.slots.map(s=>({ ...clone(s), id:newId('t') }));
  ex.days.push(day);
  markDirty(); renderAll();
};
ACTIONS.moveDay = el=>{
  const a = curExam().days, i = +el.dataset.i, j = i + (+el.dataset.dir);
  if(j<0 || j>=a.length) return;
  [a[i], a[j]] = [a[j], a[i]]; markDirty(); renderAll();
};
ACTIONS.delDay = el=>{
  const ex = curExam(), day = ex.days[+el.dataset.i];
  if(!confirm((+el.dataset.i+1)+'日目('+(fmtMDW(day.date)||'日付なし')+')を削除します。この日の時間割・監督・休暇の記録も消えます。よろしいですか？')) return;
  removeSlotsData(ex, day.slots.map(s=>s.id));
  ex.days.splice(+el.dataset.i, 1);
  markDirty(); renderAll();
};
// 時間を消したとき、その時間に結びついた記録(時間割・監督・休暇・受験状態)も消す
function removeSlotsData(ex, slotIds){
  const ids = new Set(slotIds);
  ['schedule','proctors','status','sepStart'].forEach(k=> Object.keys(ex[k]).forEach(key=>{ if(ids.has(key.split('|')[0]) || ids.has(key.split('|')[1])) delete ex[k][key]; }));
  Object.keys(ex.leave).forEach(key=>{ if(ids.has(key.split('|')[1])) delete ex.leave[key]; });
}

//////////////////////// 時間割 ////////////////////////
TABS.timetable = { render(){
  const ex = curExam();
  if(!ex){ $('tab-timetable').innerHTML = needExamHtml(); return; }
  const d = dis();
  let html = '<p class="hint">テストの時間ごとに教科を選びます(全学年共通)。終わりの時刻は「テストの回」タブのテスト時間から自動で出します。学活・休憩などの行も入れておくと、教室に掲示する時程表に載ります。</p>';
  html += warningsHtml(timetableWarnings(ex));
  if(!ex.days.length) html += '<div class="banner">「テストの回」タブで、テストの日を追加してください。</div>';
  ex.days.forEach((day, di)=>{
    html += '<section class="day-card"><h2>'+esc(dayTitle(ex, di))+'</h2><div class="scroll-x"><table class="grid tt"><thead><tr><th>種類</th><th>名前</th><th>教科</th><th>始まり</th><th>終わり</th><th class="edit-only"></th></tr></thead><tbody>';
    sortedSlots(day).forEach(({s, i})=>{
      const p = 'ex.days.'+di+'.slots.'+i;
      const del = '<td class="edit-only"><button class="small danger" data-act="delSlot" data-d="'+di+'" data-i="'+i+'">削除</button></td>';
      if(s.kind==='other'){
        html += '<tr class="other"><td>学活など</td><td><input type="text" style="width:120px" data-path="'+p+'.label" value="'+esc(s.label)+'" placeholder="例：朝の学活" list="otherLabels"'+d+'></td><td class="hint">―</td>'
          + '<td><input type="time" data-path="'+p+'.start" value="'+esc(s.start)+'"'+d+'></td><td><input type="time" data-path="'+p+'.end" value="'+esc(s.end)+'"'+d+'></td>' + del + '</tr>';
        return;
      }
      const cur = subjAt(ex, s.id), end = slotEnd(ex, s);
      const opts = '<option value="">(未定)</option>' + state.subjects.filter(x=>examSubj(ex,x.id).on || x.id===cur).map(x=>'<option value="'+esc(x.id)+'"'+(x.id===cur?' selected':'')+'>'+esc(x.name)+'</option>').join('');
      html += '<tr><td><b>テスト</b></td><td><input type="text" style="width:120px" data-path="'+p+'.label" value="'+esc(s.label)+'" placeholder="'+esc(slotLabel(day, s))+'"'+d+'></td>'
        + '<td><select data-path="ex.schedule.'+s.id+'" data-type="str-or-delete"'+d+'>'+opts+'</select></td>'
        + '<td><input type="time" data-path="'+p+'.start" value="'+esc(s.start)+'"'+d+'></td>'
        + '<td>'+(end!=null ? fmtT(end)+' <span class="hint">('+testMinutes(ex,cur)+'分)</span>' : '<span class="hint">教科を選ぶと出ます</span>')+'</td>' + del + '</tr>';
    });
    html += '</tbody></table></div><div class="edit-only line"><button data-act="addSlot" data-d="'+di+'" data-kind="test">＋ テストの時間を追加</button> <button data-act="addSlot" data-d="'+di+'" data-kind="other">＋ 学活・給食などを追加</button>'
      + ' <span class="hint">テストの間やあとの学活・給食・帰りの学活なども、時刻を入れれば、その順に並びます。</span></div>';
    // 別室の時程(別室だけ始まりをずらすとき)
    const rooms = sepRooms(), tss = sortedSlots(day).map(x=>x.s).filter(s=>s.kind==='test');
    if(rooms.length && tss.length){
      html += '<h3>別室の時程</h3><p class="hint">別室だけ始まりをずらすときは、時刻を入れます(空のままなら教室と同じ時刻)。終わりの時刻は、生徒ごとの延長から出します。</p>'
        + '<div class="scroll-x"><table class="grid tt sep"><thead><tr><th>テストの時間</th><th>教室の時刻</th>'+rooms.map(r=>'<th>'+esc(r.name)+'</th>').join('')+'</tr></thead><tbody>'
        + tss.map(s=>{
          const sid = subjAt(ex, s.id), end = slotEnd(ex, s);
          return '<tr><th class="l">'+esc(slotLabel(day, s))+' '+esc(subjectName(sid))+'</th><td class="nowrap">'+fmtT(tmin(s.start))+'〜'+fmtT(end)+'</td>'
            + rooms.map(r=>{
              const sts = roomStudentsAt(ex, r.roomId, day, s);
              const ends = sts.map(sp=>specialEnd(ex, sp, s)).filter(e=>e!=null);
              const own = ex.sepStart[s.id+'|'+r.roomId] || '';
              return '<td class="'+(sts.length?'':'off')+'"><input type="time" data-path="ex.sepStart.'+s.id+'|'+r.roomId+'" data-type="str-or-delete" value="'+esc(own)+'"'+d+'>'
                + '<div class="hint">'+(sts.length ? fmtT(sepStartOf(ex, r.roomId, s))+'〜'+[...new Set(ends)].sort((a,b)=>a-b).map(fmtT).join('/')+'('+sts.length+'人)' : 'この時間は使わない')+'</div></td>';
            }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>';
    }
    html += '</section>';
  });
  $('tab-timetable').innerHTML = html;
  document.querySelectorAll('#tab-timetable .edit-only').forEach(el=> el.hidden = !editing);
}};
function warningsHtml(list){
  if(!list.length) return '<div class="ok-box">✓ 気になるところはありません。</div>';
  return '<div class="warn-box"><b>確かめてください('+list.length+'件)</b><ul>'+list.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul></div>';
}
function timetableWarnings(ex){
  const out = [], ts = testSlots(ex);
  ex.days.forEach((day, di)=>{ if(!day.date) out.push((di+1)+'日目の日付が入っていません。'); });
  state.subjects.forEach(s=>{
    if(!examSubj(ex,s.id).on) return;
    const n = ts.filter(t=>subjAt(ex, t.slot.id)===s.id).length;
    if(n===0 && ts.length) out.push(s.name+'が、時間割に入っていません。');
    if(n>1) out.push(s.name+'が、'+n+'回入っています。');
  });
  if(ts.some(t=>!subjAt(ex, t.slot.id))) out.push('教科が決まっていないテストの時間があります。');
  // 時間の重なり(テストの終わり・延長の終わりが、次の行の始まりより遅い)
  ex.days.forEach((day, di)=>{
    const sl = sortedSlots(day).map(x=>x.s);
    sl.forEach((s, k)=>{
      const next = sl.slice(k+1).find(n=>tmin(n.start)!=null);
      if(tmin(s.start)==null){ out.push(dayTitle(ex,di)+'：始まりの時刻が入っていない行があります。'); return; }
      if(!next) return;
      const nst = tmin(next.start), nm = next.kind==='test' ? slotLabel(day,next) : (next.label||'次の行');
      if(s.kind==='other'){
        if(tmin(s.end)!=null && tmin(s.end) > nst) out.push(dayTitle(ex,di)+'：'+(s.label||'学活など')+'の終わり('+fmtT(tmin(s.end))+')が、'+nm+'の始まり('+fmtT(nst)+')より遅くなっています。');
        return;
      }
      const e = slotEnd(ex, s);
      if(e!=null && e > nst) out.push(dayTitle(ex,di)+'：'+slotLabel(day,s)+'('+subjectName(subjAt(ex,s.id))+')の終わり('+fmtT(e)+')が、'+nm+'の始まり('+fmtT(nst)+')より遅くなっています。');
      // 別室・時間延長の生徒: その生徒の終わりが、その生徒の次の行の始まり(別室をずらしていればその時刻)より遅い
      const nstFor = sp => next.kind==='test' ? specialStart(ex, sp, next) : nst;
      const late = ex.special.filter(sp=>(sp.extend || sp.room) && !isAbsentDay(sp, day)).map(sp=>({ sp, e:specialEnd(ex, sp, s), n:nstFor(sp) })).filter(x=>x.e!=null && x.n!=null && x.e > x.n);
      const byPlace = {};
      late.forEach(x=>{ const k = x.sp.room ? roomName(x.sp.room) : '教室'; (byPlace[k] = byPlace[k] || []).push(x); });
      Object.entries(byPlace).forEach(([place, xs])=> out.push(dayTitle(ex,di)+'：'+place+'で受ける生徒の'+slotLabel(day,s)+'(時間延長など'+xs.length+'人、〜'+fmtT(Math.max(...xs.map(x=>x.e)))+')が、次の'+nm+'の始まり('+fmtT(Math.min(...xs.map(x=>x.n)))+')にかかります。別室の始まりをずらすか、時程を確かめてください。'));
    });
  });
  return out;
}
ACTIONS.addSlot = el=>{
  const ex = curExam(), day = ex.days[+el.dataset.d];
  const sl = sortedSlots(day).map(x=>x.s);
  // 最後の行の終わりの10分後に入れる
  let lastEnd = 0;
  sl.forEach(s=>{ const e = s.kind==='other' ? tmin(s.end) : (slotEnd(ex,s) || tmin(s.start)); if(e!=null) lastEnd = Math.max(lastEnd, e); });
  const start = lastEnd ? hhmm(lastEnd+10) : '08:50';
  if(el.dataset.kind==='test') day.slots.push({ id:newId('t'), kind:'test', label:'', start, end:'' });
  else day.slots.push({ id:newId('t'), kind:'other', label:'', start, end:hhmm((tmin(start)||0)+10) });
  markDirty(); renderAll();
};
ACTIONS.delSlot = el=>{
  const ex = curExam(), day = ex.days[+el.dataset.d], s = day.slots[+el.dataset.i];
  if(!confirm((s.kind==='test' ? slotLabel(day,s)+'(テストの時間)' : (s.label||'この行'))+'を削除します。'+(s.kind==='test'?'この時間の教科・監督・休暇の記録も消えます。':'')+'よろしいですか？')) return;
  removeSlotsData(ex, [s.id]);
  day.slots.splice(+el.dataset.i, 1);
  markDirty(); renderAll();
};
