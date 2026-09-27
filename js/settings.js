'use strict';
// 「設定」タブと「名簿」タブ(どちらも年に1回入れるもの)

//////////////////////// 設定 ////////////////////////
TABS.settings = { render(){
  const m = state.meta, d = dis();
  const gradeRows = m.grades.map((g,i)=>'<span class="chip">'+g.grade+'年 <input type="number" min="1" max="20" style="width:64px" data-path="meta.grades.'+i+'.classes" data-type="num" value="'+g.classes+'"'+d+'> クラス</span>').join(' ');
  const roomRows = m.rooms.map((r,i)=>'<div class="line"><input type="text" style="width:240px" data-path="meta.rooms.'+i+'.name" value="'+esc(r.name)+'" placeholder="例：相談室"'+d+'>'
    + ' <button class="edit-only small danger" data-act="delRoom" data-i="'+i+'">削除</button></div>').join('');
  const subjRows = state.subjects.map((s,i)=>'<tr><td><input type="text" style="width:150px" data-path="subjects.'+i+'.name" value="'+esc(s.name)+'"'+d+'></td>'
    + '<td class="c"><input type="checkbox" data-path="subjects.'+i+'.core5"'+(s.core5?' checked':'')+d+'></td>'
    + '<td class="edit-only"><button class="small" data-act="moveSubject" data-i="'+i+'" data-dir="-1">▲</button> <button class="small" data-act="moveSubject" data-i="'+i+'" data-dir="1">▼</button> '
    + '<button class="small danger" data-act="delSubject" data-i="'+i+'">削除</button></td></tr>').join('');
  const gOpts = sel => '<option value="0">なし</option>' + grades().map(g=>'<option value="'+g+'"'+(g===sel?' selected':'')+'>'+g+'年</option>').join('');
  const tRows = state.teachers.map((t,i)=>'<tr'+(t.kind==='サポーター'?' class="supporter"':'')+'>'
    + '<td><input type="text" style="width:140px" data-path="teachers.'+i+'.name" value="'+esc(t.name)+'"'+d+'></td>'
    + '<td><select data-path="teachers.'+i+'.kind"'+d+'>'+CONFIG.teacherKinds.map(k=>'<option'+(k===t.kind?' selected':'')+'>'+k+'</option>').join('')+'</select></td>'
    + '<td><select data-path="teachers.'+i+'.grade" data-type="num"'+d+'>'+gOpts(t.grade)+'</select></td>'
    + '<td><button class="small linkish edit-act" data-act="teacherSubjects" data-i="'+i+'">'+(t.subjects.map(subjectName).filter(Boolean).join('・') || '(なし)')+'</button></td>'
    + '<td class="c"><input type="checkbox" data-path="teachers.'+i+'.noProctor"'+(t.noProctor?' checked':'')+d+'></td>'
    + '<td class="edit-only"><button class="small danger" data-act="delTeacher" data-i="'+i+'">削除</button></td></tr>').join('');
  $('tab-settings').innerHTML = '<div class="settings">'
    + (editing ? '' : '<p class="hint">設定を変えるには、上の「✏ 編集する」を押してください。</p>')
    + '<section><h2>学校と年度</h2>'
    + '<div class="row"><span class="k">学校名</span><input type="text" style="width:260px" data-path="meta.schoolName" value="'+esc(m.schoolName)+'"'+d+'></div>'
    + '<div class="row"><span class="k">年度</span><input type="number" style="width:100px" data-path="meta.fiscalYear" data-type="num" value="'+m.fiscalYear+'"'+d+'> 年度</div></section>'
    + '<section><h2>学年とクラス</h2>'
    + '<div class="row"><span class="k">学年の数</span><input type="number" min="1" max="6" style="width:70px" id="setGradeCount" value="'+m.grades.length+'"'+d+'></div>'
    + '<div class="row"><span class="k">クラスの数</span><span>'+gradeRows+'</span></div></section>'
    + '<section><h2>別室(時間延長・別室で受ける生徒の部屋)</h2>'
    + roomRows + '<div class="edit-only line"><button data-act="addRoom">＋ 別室を追加</button></div>'
    + '<div class="row"><span class="k">延長の倍率(基本)</span><input type="number" step="0.05" min="1" max="3" style="width:80px" data-path="meta.extendRate" data-type="num" value="'+m.extendRate+'"'+d+'> 倍'
    + '<span class="hint">テスト時間 × この倍率(分は切り上げ)。生徒ごと・教科ごとに「配慮生徒」タブで変えられます。</span></div></section>'
    + '<section><h2>教科</h2><p class="hint">「5教科」に印を付けた教科の合計を「5教科の合計」として出します(点数の集計は次の段階で作ります)。</p>'
    + '<table class="grid"><thead><tr><th>教科</th><th>5教科</th><th class="edit-only"></th></tr></thead><tbody>'+subjRows+'</tbody></table>'
    + '<div class="edit-only line"><button data-act="addSubject">＋ 教科を追加</button></div></section>'
    + '<section><h2>先生・サポーター(試験監督の候補)</h2>'
    + '<p class="hint">「サポーター」は、主に別室の監督に割り当てます。担当教科は、その教科のテストの時間に監督から外すために使います。「監督なし」に印を付けた人(管理職など)は、監督の自動の割り当てに入れません。</p>'
    + '<table class="grid"><thead><tr><th>名前</th><th>種別</th><th>所属学年</th><th>担当教科</th><th>監督なし</th><th class="edit-only"></th></tr></thead><tbody>'
    + (tRows || '<tr><td colspan="6" class="hint">まだいません。下の「＋ 1人追加」か「まとめて貼り付け」で入れてください。</td></tr>') + '</tbody></table>'
    + '<div class="edit-only line"><button data-act="addTeacher">＋ 1人追加</button></div>'
    + '<details class="edit-only paste"><summary>Excel からまとめて貼り付け</summary>'
    + '<p class="hint">1行に1人。列の順は「名前、担当教科、所属学年、種別」(名前だけでもかまいません)。担当教科が2つ以上なら「国語・社会」のように「・」で区切ります。種別を空にすると「教員」になります。<br>今いる人のあとに追加します(同じ名前の人は、担当教科などを上書きします)。</p>'
    + '<textarea id="teacherPaste" rows="6" placeholder="山田 太郎&#9;国語&#9;1&#10;佐藤 花子&#9;数学・理科&#9;2&#10;鈴木 一郎&#9;&#9;&#9;サポーター"></textarea>'
    + '<div class="line"><button class="primary" data-act="pasteTeachers">取り込む</button></div></details></section>'
    + '<section><h2>編集パスワード</h2><p class="hint">設定すると、「編集する」を押したときにパスワードを聞かれます。空のまま「設定」を押すと、パスワードなしになります。</p>'
    + '<div class="row"><span class="k">今の状態</span><span>'+(m.editPasswordHash ? '設定してあります' : '設定していません')+'</span></div>'
    + '<div class="row edit-only"><span class="k">新しいパスワード</span><input type="password" id="newPw" style="width:200px"><button data-act="setPw">設定</button></div></section>'
    + '<section><h2>バックアップと復元</h2><p class="hint">データファイルの控えを、日付の入った名前でダウンロードします。ファイルが壊れたり消えたりしたときは、「データを読み込む(復元)」で元に戻せます。控えにも生徒の名前が入っているので、校内の共有サーバーに保存してください。</p>'
    + '<div class="line"><button data-act="exportBackup">データを書き出す(バックアップ)</button> <button class="edit-act" data-act="importBackup">データを読み込む(復元)</button></div></section>'
    + '</div>';
  document.querySelectorAll('#tab-settings .edit-only').forEach(el=> el.hidden = !editing);
}};
function refreshExams(){ state.exams.forEach(normalizeExam); }
document.addEventListener('change', e=>{
  if(e.target.id!=='setGradeCount' || !editing) return;
  const n = Math.max(1, Math.min(6, toNum(e.target.value)||1));
  const g = state.meta.grades;
  if(n < g.length && !confirm((n+1)+'年から上の学年を消します。その学年の生徒の名簿は残りますが、画面には出なくなります。よろしいですか？')){ renderAll(); return; }
  while(g.length < n) g.push({ grade:g.length+1, classes:4 });
  g.length = n;
  refreshExams(); markDirty(); renderAll();
});
ACTIONS.addRoom = ()=>{ state.meta.rooms.push({ id:newId('r'), name:'別室'+(state.meta.rooms.length+1) }); markDirty(); renderAll(); };
ACTIONS.delRoom = el=>{
  const r = state.meta.rooms[+el.dataset.i];
  const used = state.exams.some(x=>x.special.some(p=>p.room===r.id));
  if(!confirm('別室「'+r.name+'」を削除します。'+(used ? '\nこの部屋で受ける生徒がいます。その生徒は「自分の教室」で受けることになります。' : '')+'\nよろしいですか？')) return;
  state.meta.rooms.splice(+el.dataset.i, 1);
  state.exams.forEach(x=>{ x.special.forEach(p=>{ if(p.room===r.id) p.room=''; }); Object.keys(x.proctors).forEach(k=>{ if(k.endsWith('|r-'+r.id)) delete x.proctors[k]; }); });
  markDirty(); renderAll();
};
ACTIONS.addSubject = ()=>{
  let n = state.subjects.length+1; while(state.subjects.some(s=>s.id==='s'+n)) n++;
  state.subjects.push({ id:'s'+n, name:'', core5:false });
  refreshExams(); markDirty(); renderAll();
  const inp = document.querySelector('[data-path="subjects.'+(state.subjects.length-1)+'.name"]'); if(inp) inp.focus();
};
ACTIONS.moveSubject = el=>{
  const i = +el.dataset.i, j = i + (+el.dataset.dir), a = state.subjects;
  if(j<0 || j>=a.length) return;
  [a[i], a[j]] = [a[j], a[i]]; markDirty(); renderAll();
};
ACTIONS.delSubject = el=>{
  const s = state.subjects[+el.dataset.i];
  const used = state.exams.some(x=>Object.values(x.schedule).includes(s.id));
  if(!confirm('教科「'+s.name+'」を削除します。'+(used ? '\nテストの時間割に入っている分も消えます。' : '')+'\nよろしいですか？')) return;
  state.subjects.splice(+el.dataset.i, 1);
  state.teachers.forEach(t=> t.subjects = t.subjects.filter(x=>x!==s.id));
  state.exams.forEach(x=>{ Object.keys(x.schedule).forEach(k=>{ if(x.schedule[k]===s.id) delete x.schedule[k]; }); delete x.subjects[s.id]; });
  markDirty(); renderAll();
};
ACTIONS.addTeacher = ()=>{
  state.teachers.push({ id:newId('m'), name:'', kind:'教員', grade:0, subjects:[], noProctor:false });
  markDirty(); renderAll();
  const inp = document.querySelector('[data-path="teachers.'+(state.teachers.length-1)+'.name"]'); if(inp) inp.focus();
};
ACTIONS.delTeacher = el=>{
  const t = state.teachers[+el.dataset.i];
  if(!confirm('「'+(t.name||'(名前なし)')+'」を削除します。監督の割り当てと休暇の記録からも消えます。よろしいですか？')) return;
  state.teachers.splice(+el.dataset.i, 1);
  state.exams.forEach(x=>{
    Object.keys(x.proctors).forEach(k=>{ x.proctors[k] = x.proctors[k].filter(id=>id!==t.id); if(!x.proctors[k].length) delete x.proctors[k]; });
    Object.keys(x.leave).forEach(k=>{ if(k.startsWith(t.id+'|')) delete x.leave[k]; });
  });
  markDirty(); renderAll();
};
ACTIONS.teacherSubjects = el=>{
  const t = state.teachers[+el.dataset.i];
  openChoiceModal((t.name||'')+' の担当教科', state.subjects.map(s=>({ value:s.id, label:s.name, checked:t.subjects.includes(s.id) })), vals=>{
    t.subjects = vals; markDirty(); renderAll();
  });
};
ACTIONS.pasteTeachers = ()=>{
  const rows = parsePasted($('teacherPaste').value);
  if(!rows.length){ alert('貼り付ける欄が空です。Excel で名前の列を選んでコピーし、欄に貼り付けてください。'); return; }
  let added = 0, updated = 0; const unknown = new Set();
  rows.forEach(r=>{
    const name = r[0]; if(!name || /^(名前|氏名)$/.test(name)) return;   // 見出しの行は飛ばす
    const subs = (r[1]||'').split(/[・、,，\/／\s]+/).filter(Boolean).map(n=>{ const s = state.subjects.find(x=>x.name===n); if(!s) unknown.add(n); return s && s.id; }).filter(Boolean);
    const g = toNum(r[2]); const kind = /サポ/.test(r[3]||'') ? 'サポーター' : '教員';
    let t = state.teachers.find(x=>x.name===name);
    if(t){ updated++; } else { t = { id:newId('m'), name, kind, grade:0, subjects:[], noProctor:false }; state.teachers.push(t); added++; }
    if(subs.length) t.subjects = subs;
    if(g>=1 && g<=state.meta.grades.length) t.grade = g;
    if(r[3]) t.kind = kind;
  });
  $('teacherPaste').value = '';
  markDirty(); renderAll();
  alert(added+'人を追加、'+updated+'人を上書きしました。' + (unknown.size ? '\n\n次の教科は「教科」の一覧にないため、入れませんでした：'+[...unknown].join('、')+'\n(教科の名前を一覧と同じにしてください)' : ''));
};
ACTIONS.setPw = async ()=>{
  const pw = $('newPw').value;
  if(!pw){
    if(!confirm('パスワードをなくします。だれでも「編集する」を押せるようになります。よろしいですか？')) return;
    state.meta.editPasswordHash = '';
  } else {
    try{ state.meta.editPasswordHash = await sha256Hex(pw); }catch(e){ alert(e.message); return; }
    alert('パスワードを設定しました。忘れないように控えておいてください。');
  }
  markDirty(); renderAll();
};
ACTIONS.exportBackup = exportBackup;
ACTIONS.importBackup = importBackup;

//////////////////////// 名簿 ////////////////////////
TABS.roster = { render(){
  const gs = grades();
  if(!gs.includes(view.rosterGrade)) view.rosterGrade = gs[0];
  const g = view.rosterGrade, d = dis();
  const list = state.students.map((s,i)=>({ s, i })).filter(x=>x.s.grade===g).sort((a,b)=>sortStudents(a.s,b.s));
  const counts = gs.map(x=>x+'年 '+state.students.filter(s=>s.grade===x).length+'人').join('　');
  let rows = '', lastCls = null;
  list.forEach(({s,i})=>{
    rows += '<tr'+(lastCls!==null && lastCls!==s.cls ? ' class="sep"' : '')+'>'
      + '<td><input type="number" style="width:56px" data-path="students.'+i+'.cls" data-type="num" value="'+s.cls+'"'+d+'></td>'
      + '<td><input type="number" style="width:56px" data-path="students.'+i+'.no" data-type="num" value="'+s.no+'"'+d+'></td>'
      + '<td><input type="text" style="width:170px" data-path="students.'+i+'.name" value="'+esc(s.name)+'"'+d+'></td>'
      + '<td><input type="text" style="width:190px" data-path="students.'+i+'.kana" value="'+esc(s.kana)+'"'+d+'></td>'
      + '<td class="edit-only"><button class="small danger" data-act="delStudent" data-i="'+i+'">削除</button></td></tr>';
    lastCls = s.cls;
  });
  $('tab-roster').innerHTML = '<div class="toolbar"><span class="seg">'
    + gs.map(x=>'<button data-act="rosterGrade" data-g="'+x+'"'+(x===g?' class="active"':'')+'>'+x+'年</button>').join('') + '</span>'
    + '<span class="hint">'+counts+'</span></div>'
    + '<div class="cols"><div>'
    + '<table class="grid"><thead><tr><th>組</th><th>番号</th><th>氏名</th><th>ふりがな</th><th class="edit-only"></th></tr></thead><tbody>'
    + (rows || '<tr><td colspan="5" class="hint">'+g+'年の名簿はまだありません。右の欄に貼り付けてください。</td></tr>') + '</tbody></table>'
    + '<div class="edit-only line"><button data-act="addStudent">＋ 1人追加</button></div></div>'
    + '<div class="side edit-only"><h2>Excel・CSV から貼り付け</h2>'
    + '<p class="hint">校務支援システムなどから出した名簿を、Excel で選んでコピーし、下の欄に貼り付けて「取り込む」を押します。</p>'
    + '<p class="hint">列の順は「<b>学年、組、番号、氏名、ふりがな</b>」(ふりがなはなくてもよい)。「組、番号、氏名」の3列だけなら、いま選んでいる <b>'+g+'年</b> として取り込みます。1行目が「氏名」などの見出しなら、見出しの名前で列を見分けます。</p>'
    + '<p class="hint">貼り付けた学年の名簿を、<b>丸ごと入れ替えます</b>(同じ組・番号の生徒は、配慮の記録などを引き継ぎます)。</p>'
    + '<textarea id="rosterPaste" rows="12" placeholder="1&#9;1&#9;1&#9;青木 太郎&#9;あおき たろう"></textarea>'
    + '<div class="line"><button class="primary" data-act="pasteRoster">取り込む</button></div></div></div>';
  document.querySelectorAll('#tab-roster .edit-only').forEach(el=> el.hidden = !editing);
}};
ACTIONS.rosterGrade = el=>{ view.rosterGrade = +el.dataset.g; savePref(); renderAll(); };
ACTIONS.addStudent = ()=>{
  const g = view.rosterGrade, same = state.students.filter(s=>s.grade===g);
  const last = same.sort(sortStudents).pop();
  state.students.push({ id:newId('st'), grade:g, cls:last?last.cls:1, no:last?last.no+1:1, name:'', kana:'' });
  markDirty(); renderAll();
};
ACTIONS.delStudent = el=>{
  const s = state.students[+el.dataset.i];
  if(!confirm(studentLabel(s)+' を名簿から削除します。配慮の必要な生徒の一覧からも消えます。よろしいですか？')) return;
  state.students.splice(+el.dataset.i, 1);
  state.exams.forEach(x=>{ x.special = x.special.filter(p=>p.studentId!==s.id); });
  markDirty(); renderAll();
};
// 貼り付けた名簿を読む。見出しの行があれば、その名前で列を見分ける
function parseRoster(text, defaultGrade){
  const rows = parsePasted(text);
  if(!rows.length) return { list:[], errors:['貼り付ける欄が空です。'] };
  let col = null, start = 0;
  const h = rows[0].join(' ');
  if(/氏名|名前/.test(h)){
    const find = re => rows[0].findIndex(c=>re.test(c));
    col = { grade:find(/学年/), cls:find(/^組|クラス|学級/), no:find(/番/), name:find(/氏名|名前/), kana:find(/ふりがな|フリガナ|よみ|ヨミ|かな/) };
    start = 1;
  } else {
    const nums = rows[0].map(c=>!isNaN(toNum(c)) && /\d/.test(c));
    col = (nums[0] && nums[1] && nums[2]) ? { grade:0, cls:1, no:2, name:3, kana:4 } : { grade:-1, cls:0, no:1, name:2, kana:3 };
  }
  const list = [], errors = [];
  rows.slice(start).forEach((r, k)=>{
    const get = i => i>=0 ? (r[i]||'') : '';
    const grade = col.grade>=0 ? toNum(get(col.grade)) : defaultGrade;
    const cls = toNum(get(col.cls)), no = toNum(get(col.no)), name = get(col.name).trim();
    if(!name && isNaN(cls)) return;   // 空の行
    if(!(grade>=1 && grade<=state.meta.grades.length) || !(cls>=1) || !(no>=0) || !name){ errors.push((k+start+1)+'行目：「'+r.join(' ')+'」'); return; }
    list.push({ grade, cls, no, name, kana:get(col.kana).trim() });
  });
  return { list, errors };
}
ACTIONS.pasteRoster = ()=>{
  const { list, errors } = parseRoster($('rosterPaste').value, view.rosterGrade);
  if(!list.length){ alert('取り込める行がありませんでした。\n\n列の順(学年、組、番号、氏名)を確かめてください。' + (errors.length ? '\n\n読めなかった行：\n'+errors.slice(0,5).join('\n') : '')); return; }
  const gs = [...new Set(list.map(s=>s.grade))].sort();
  const old = state.students.filter(s=>gs.includes(s.grade));
  const key = s => s.grade+'-'+s.cls+'-'+s.no;
  const oldByKey = new Map(old.map(s=>[key(s), s]));
  const removed = old.filter(s=>!list.some(n=>key(n)===key(s)));
  let msg = gs.map(g=>g+'年').join('・')+'の名簿を入れ替えます。\n\n取り込む人数：'+list.length+'人\n今の人数：'+old.length+'人';
  if(errors.length) msg += '\n\n読めなかった行('+errors.length+'行)は取り込みません：\n'+errors.slice(0,5).join('\n')+(errors.length>5?'\n…':'');
  if(removed.length) msg += '\n\n新しい名簿にいない '+removed.length+'人は、名簿から消えます(配慮の必要な生徒の一覧からも消えます)。';
  if(!confirm(msg+'\n\nよろしいですか？')) return;
  const newList = list.map(n=>{ const o = oldByKey.get(key(n)); return { id: o ? o.id : newId('st'), ...n }; });
  const removedIds = new Set(removed.map(s=>s.id));
  state.students = state.students.filter(s=>!gs.includes(s.grade)).concat(newList);
  state.exams.forEach(x=>{ x.special = x.special.filter(p=>!removedIds.has(p.studentId)); });
  $('rosterPaste').value = '';
  view.rosterGrade = gs[0]; savePref();
  markDirty(); renderAll();
};
