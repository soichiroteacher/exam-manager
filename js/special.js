'use strict';
// 「配慮生徒」タブ(欠席・別室受験・時間延長などの配慮が必要な生徒と、当日の受験状態)

function sortedSpecial(ex){
  return ex.special.map((p,i)=>({ p, i, st:studentById(p.studentId) })).filter(x=>x.st).sort((a,b)=>sortStudents(a.st,b.st));
}
// 配慮の内容を短い文にする(一覧・印刷で共通)
function specialSummary(ex, p){
  const out = [];
  if(p.room) out.push('別室('+roomName(p.room)+')');
  if(p.extend) out.push('時間延長 '+(Number(p.rate)||state.meta.extendRate)+'倍' + (Object.keys(p.minutes).length ? '(教科で変更あり)' : ''));
  if(p.absentDays.length) out.push('欠席：'+ex.days.map((d,di)=>p.absentDays.includes(d.id) ? (d.date?fmtMD(d.date):(di+1)+'日目') : '').filter(Boolean).join('・'));
  return out.join('、');
}
TABS.special = { render(){
  const ex = curExam();
  if(!ex){ $('tab-special').innerHTML = needExamHtml(); return; }
  const d = dis(), gs = grades();
  const list = sortedSpecial(ex);
  // --- 追加する欄 ---
  const pickG = Number(view.addGrade) || gs[0], pickC = Number(view.addCls) || 1;
  const gInfo = state.meta.grades.find(g=>g.grade===pickG) || state.meta.grades[0];
  const cands = state.students.filter(s=>s.grade===pickG && s.cls===pickC && !ex.special.some(p=>p.studentId===s.id)).sort(sortStudents);
  let html = '<div class="toolbar edit-only add-special">生徒を追加：'
    + '<select id="spGrade">'+gs.map(g=>'<option value="'+g+'"'+(g===pickG?' selected':'')+'>'+g+'年</option>').join('')+'</select>'
    + '<select id="spCls">'+Array.from({length:gInfo.classes},(_,i)=>i+1).map(c=>'<option value="'+c+'"'+(c===pickC?' selected':'')+'>'+c+'組</option>').join('')+'</select>'
    + '<select id="spStudent">'+(cands.length ? cands.map(s=>'<option value="'+esc(s.id)+'">'+s.no+' '+esc(s.name)+'</option>').join('') : '<option value="">(名簿にいません)</option>')+'</select>'
    + '<button class="primary" data-act="addSpecial">追加</button></div>';
  html += '<div class="toolbar"><button data-act="printForm" data-form="special">🖨 配慮生徒一覧を印刷(職員室掲示用)</button>'
    + '<span class="hint">欠席の予定・別室で受ける・時間延長など、配慮の必要な生徒をこの回ごとに入れます。「受ける場所」で別室を選ぶと、別室の監督と時程表に反映します。</span></div>';
  if(!list.length){
    html += '<div class="banner">この回の配慮の必要な生徒は、まだいません。'+(editing ? '上の「生徒を追加」から入れてください。' : '入れるには「✏ 編集する」を押してください。')+'</div>';
    $('tab-special').innerHTML = html; document.querySelectorAll('#tab-special .edit-only').forEach(el=> el.hidden = !editing); return;
  }
  const roomOpts = sel => '<option value="">自分の教室</option>' + state.meta.rooms.map(r=>'<option value="'+esc(r.id)+'"'+(r.id===sel?' selected':'')+'>'+esc(r.name)+'</option>').join('');
  html += '<div class="scroll-x"><table class="grid special"><thead><tr><th>学年・組・番号</th><th>氏名</th><th>受ける場所</th><th>時間延長</th><th>欠席の日</th><th>配慮の内容・メモ</th><th class="edit-only"></th></tr></thead><tbody>';
  list.forEach(({p, i, st})=>{
    const P = 'ex.special.'+i;
    html += '<tr><td class="nowrap">'+st.grade+'年'+st.cls+'組'+st.no+'番</td><td class="nowrap"><b>'+esc(st.name)+'</b></td>'
      + '<td><select data-path="'+P+'.room"'+d+'>'+roomOpts(p.room)+'</select></td>'
      + '<td class="nowrap"><label><input type="checkbox" data-path="'+P+'.extend"'+(p.extend?' checked':'')+d+'> 延長</label>'
      + (p.extend ? ' <input type="number" step="0.05" min="1" max="3" style="width:68px" data-path="'+P+'.rate" data-type="num" value="'+(p.rate==null?'':p.rate)+'" placeholder="'+state.meta.extendRate+'"'+d+'>倍'
        + ' <button class="small" data-act="specialMinutes" data-i="'+i+'">教科ごとの時間'+(Object.keys(p.minutes).length?'(変更あり)':'')+'</button>' : '') + '</td>'
      + '<td class="nowrap">'+ex.days.map((day,di)=>'<label><input type="checkbox" data-act-absent="'+i+'" data-day="'+esc(day.id)+'"'+(p.absentDays.includes(day.id)?' checked':'')+d+'>'+(day.date?fmtMD(day.date):(di+1)+'日目')+'</label>').join(' ')+'</td>'
      + '<td><input type="text" style="width:260px" data-path="'+P+'.note" value="'+esc(p.note)+'" placeholder="例：保健室で受ける、拡大した問題用紙"'+d+'></td>'
      + '<td class="edit-only"><button class="small danger" data-act="delSpecial" data-i="'+i+'">削除</button></td></tr>';
  });
  html += '</tbody></table></div>';
  // --- 当日の受験状態 ---
  const ts = testSlots(ex);
  if(ts.length){
    const { h1, h2 } = slotHeadHtml(ex, false);
    html += '<section><h2>当日の受験状態</h2><p class="hint">掲示した一覧に書き込まれた受験状態を、あとでここに入れて残せます(追試の確認などに使います)。</p>'
      + '<div class="scroll-x"><table class="grid status"><thead><tr><th rowspan="2">生徒</th>'+h1+'</tr><tr>'+h2+'</tr></thead><tbody>';
    list.forEach(({p, st})=>{
      html += '<tr><th class="l nowrap">'+st.grade+'-'+st.cls+'-'+st.no+' '+esc(st.name)+'</th>' + ts.map(t=>{
        const sid = subjAt(ex, t.slot.id, st.grade);
        if(!sid) return '<td class="off">―</td>';
        const key = p.studentId+'|'+t.slot.id, v = ex.status[key] || '';
        const plan = isAbsentDay(p, t.day) ? '欠席予定' : '';
        return '<td'+(plan?' class="planned-absent"':'')+'><div class="hint">'+esc(subjectName(sid))+(p.extend?' 〜'+fmtT(specialEnd(ex,p,t.slot)):'')+(plan?' '+plan:'')+'</div>'
          + '<select data-path="ex.status.'+esc(key)+'" data-type="str-or-delete"'+d+'><option value=""></option>'+CONFIG.statusKinds.map(k=>'<option'+(k===v?' selected':'')+'>'+k+'</option>').join('')+'</select></td>';
      }).join('') + '</tr>';
    });
    html += '</tbody></table></div></section>';
  }
  $('tab-special').innerHTML = html;
  document.querySelectorAll('#tab-special .edit-only').forEach(el=> el.hidden = !editing);
}};
document.addEventListener('change', e=>{
  if(e.target.id==='spGrade'){ view.addGrade = +e.target.value; view.addCls = 1; savePref(); renderAll(); return; }
  if(e.target.id==='spCls'){ view.addCls = +e.target.value; savePref(); renderAll(); return; }
  const el = e.target.closest('[data-act-absent]');
  if(!el || !editing) return;
  const p = curExam().special[+el.dataset.actAbsent], id = el.dataset.day;
  p.absentDays = p.absentDays.filter(x=>x!==id);
  if(el.checked) p.absentDays.push(id);
  markDirty(); setTimeout(renderAll, 0);
});
ACTIONS.addSpecial = ()=>{
  const id = $('spStudent').value;
  if(!id){ alert('生徒を選んでください。名簿にいないときは、「名簿」タブで入れてください。'); return; }
  curExam().special.push({ id:newId('p'), studentId:id, room:'', extend:false, rate:null, minutes:{}, absentDays:[], note:'' });
  markDirty(); renderAll();
};
ACTIONS.delSpecial = el=>{
  const ex = curExam(), p = ex.special[+el.dataset.i];
  if(!confirm(studentLabel(studentById(p.studentId))+' を、この回の配慮の必要な生徒から外します。当日の受験状態の記録も消えます。よろしいですか？')) return;
  ex.special.splice(+el.dataset.i, 1);
  Object.keys(ex.status).forEach(k=>{ if(k.startsWith(p.studentId+'|')) delete ex.status[k]; });
  markDirty(); renderAll();
};
// 教科ごとの延長の時間(分)を決める画面
ACTIONS.specialMinutes = el=>{
  const ex = curExam(), p = ex.special[+el.dataset.i], st = studentById(p.studentId);
  const subs = state.subjects.filter(s=>examSubj(ex, st.grade, s.id).on);
  $('fmTitle').textContent = studentLabel(st)+'　教科ごとの時間';
  $('fmBody').innerHTML = '<p class="hint">空のままなら「テスト時間 × 倍率」になります。教科や本人の希望で変えるときだけ、分を入れてください。</p><table class="grid"><thead><tr><th>教科</th><th>テスト時間</th><th>延長(自動)</th><th>この生徒の時間</th></tr></thead><tbody>'
    + subs.map(s=>{ const base = testMinutes(ex, st.grade, s.id), auto = Math.ceil(base*(Number(p.rate)||state.meta.extendRate)-1e-9);
      return '<tr><th class="l">'+esc(s.name)+'</th><td>'+base+'分</td><td>'+auto+'分</td><td><input type="number" min="1" max="300" style="width:80px" data-sid="'+esc(s.id)+'" value="'+(p.minutes[s.id]||'')+'"'+dis()+'> 分</td></tr>'; }).join('')
    + '</tbody></table>';
  formCallback = ()=>{
    if(!editing) return;
    const m = {};
    $('fmBody').querySelectorAll('input[data-sid]').forEach(i=>{ const v = toNum(i.value); if(v>0) m[i.dataset.sid] = v; });
    p.minutes = m; markDirty(); renderAll();
  };
  openOverlay('formOverlay');
};
let formCallback = null;
$('fmCancel').addEventListener('click', ()=>closeOverlay('formOverlay'));
$('fmOk').addEventListener('click', ()=>{ closeOverlay('formOverlay'); if(formCallback) formCallback(); });
