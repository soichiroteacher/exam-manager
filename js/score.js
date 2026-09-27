'use strict';
// 「点数」タブ(点数の入力)と「集計」タブ(平均点・得点分布・合計と順位)
// 点数は ex.scores[生徒id][教科id] = 数 または '欠'(欠席)。入っていなければ未入力。

//////////////////////// 点数の読み書きと計算 ////////////////////////
function scoreOf(ex, stId, sid){ const m = ex.scores[stId]; return m ? m[sid] : undefined; }
function isNum(v){ return typeof v==='number' && isFinite(v); }
// その回に実施する教科(教科の並び順)と、そのうちの5教科
function examSubjects(ex){ return state.subjects.filter(s=>examSubj(ex, s.id).on); }
function coreSubjects(ex){ return examSubjects(ex).filter(s=>s.core5); }
// 入力された文字を点数に直す。空 → undefined、欠席 → '欠'、数でない・範囲外 → { error }
function parseScore(text, max){
  const t = String(text==null?'':text).trim();
  if(t==='') return undefined;
  if(/^(欠|けっ?|×|x|X|-|ー)$/.test(t)) return '欠';
  const n = toNum(t);
  if(!isFinite(n) || !/[0-9０-９]/.test(t)) return { error:'数か「欠」を入れてください' };
  if(n<0 || n>max) return { error:'0〜'+max+'点で入れてください' };
  return n;
}
function studentsOf(grade, cls){ return state.students.filter(s=>s.grade===grade && (!cls || s.cls===cls)).sort(sortStudents); }
// 合計: 教科のうち1つでも欠席・未入力があれば、合計は出すが「そろっていない」印を付け、順位には入れない
function totalOf(ex, stId, subs){
  let sum = 0, done = 0, absent = 0;
  subs.forEach(s=>{ const v = scoreOf(ex, stId, s.id); if(isNum(v)){ sum += v; done++; } else if(v==='欠') absent++; });
  return { sum, complete: done===subs.length && subs.length>0, absent, done };
}
// 同点は同じ順位(1,2,2,4位)。complete の人だけで順位を付ける
function rankMap(items){   // items: [{ id, value }]
  const vals = items.map(x=>x.value);
  const m = new Map();
  items.forEach(x=> m.set(x.id, 1 + vals.filter(v=>v > x.value).length));
  return m;
}
function stats(values){
  if(!values.length) return null;
  const n = values.length, avg = values.reduce((a,b)=>a+b,0)/n;
  const sd = Math.sqrt(values.reduce((a,b)=>a+(b-avg)*(b-avg),0)/n);
  return { n, avg, max:Math.max(...values), min:Math.min(...values), sd };
}
const fmt1 = v => v==null ? '' : (Math.round(v*10)/10).toFixed(1);
// 得点の区切り(満点を10に分ける。満点100なら 0〜9、10〜19、…、90〜100)
function bands(max){
  const w = Math.max(1, Math.round(max/10));
  const out = [];
  for(let lo=0; lo<max; lo+=w){ const hi = lo+w-1; out.push({ lo, hi: (lo+w>=max) ? max : hi }); if(lo+w>=max) break; }
  return out.reverse();   // 高い点から
}
// 学年のまとめ(集計タブ・印刷で共通)
function gradeSummary(ex, grade){
  const subs = examSubjects(ex), core = coreSubjects(ex);
  const sts = studentsOf(grade);
  const hasAll = subs.length > core.length;   // 5教科と全教科が違うときだけ「全教科」を出す
  const rows = sts.map(st=>({ st, t5: totalOf(ex, st.id, core), tA: totalOf(ex, st.id, subs) }));
  const r5 = rankMap(rows.filter(r=>r.t5.complete).map(r=>({ id:r.st.id, value:r.t5.sum })));
  const rA = rankMap(rows.filter(r=>r.tA.complete).map(r=>({ id:r.st.id, value:r.tA.sum })));
  rows.forEach(r=>{ r.rank5 = r5.get(r.st.id); r.rankA = rA.get(r.st.id); });
  return { subs, core, hasAll, rows, classes: (state.meta.grades.find(g=>g.grade===grade)||{classes:0}).classes };
}
// 教科(または合計)の点数の一覧。key: 教科id / 'T5' / 'TA'
function valuesFor(ex, sum, key, cls){
  return sum.rows.filter(r=>!cls || r.st.cls===cls).map(r=>{
    if(key==='T5') return r.t5.complete ? r.t5.sum : null;
    if(key==='TA') return r.tA.complete ? r.tA.sum : null;
    const v = scoreOf(ex, r.st.id, key); return isNum(v) ? v : null;
  }).filter(v=>v!=null);
}
function maxFor(ex, sum, key){
  if(key==='T5') return sum.core.reduce((a,s)=>a+Number(examSubj(ex,s.id).max||0),0);
  if(key==='TA') return sum.subs.reduce((a,s)=>a+Number(examSubj(ex,s.id).max||0),0);
  return Number(examSubj(ex, key).max) || 100;
}
function keyName(sum, key){ return key==='T5' ? '5教科の合計' : key==='TA' ? '全教科('+sum.subs.length+'教科)の合計' : subjectName(key); }

//////////////////////// 点数タブ ////////////////////////
TABS.score = { render(){
  const ex = curExam();
  if(!ex){ $('tab-score').innerHTML = needExamHtml(); return; }
  const subs = examSubjects(ex), gs = grades();
  if(!subs.length){ $('tab-score').innerHTML = '<div class="banner">「テストの回」タブで、実施する教科に印を付けてください。</div>'; return; }
  if(!subs.some(s=>s.id===view.scoreSubj)) view.scoreSubj = subs[0].id;
  if(!gs.includes(view.scoreGrade)) view.scoreGrade = gs[0];
  const g = view.scoreGrade, gi = state.meta.grades.find(x=>x.grade===g);
  if(view.scoreCls && view.scoreCls > gi.classes) view.scoreCls = 0;
  const cls = view.scoreCls || 0, sid = view.scoreSubj, max = Number(examSubj(ex, sid).max) || 100;
  const sts = studentsOf(g, cls), d = dis();
  let html = '<div class="toolbar score-pick">'
    + '<label>教科 <select id="scSubj">'+subs.map(s=>'<option value="'+esc(s.id)+'"'+(s.id===sid?' selected':'')+'>'+esc(s.name)+'</option>').join('')+'</select></label>'
    + '<span class="seg">'+gs.map(x=>'<button data-act="scoreGrade" data-g="'+x+'"'+(x===g?' class="active"':'')+'>'+x+'年</button>').join('')+'</span>'
    + '<span class="seg"><button data-act="scoreCls" data-c="0"'+(!cls?' class="active"':'')+'>全クラス</button>'
    + Array.from({length:gi.classes},(_,i)=>i+1).map(c=>'<button data-act="scoreCls" data-c="'+c+'"'+(c===cls?' class="active"':'')+'>'+c+'組</button>').join('')+'</span>'
    + '<span class="hint">満点 '+max+'点</span></div>'
    + '<p class="hint">点数を入れて Enter で下へ進みます。欠席は「欠」。<b>Excel から貼り付けるとき</b>は、Excel で点数の列(この表と同じ番号順)を選んでコピーし、いちばん上の生徒の欄に貼り付けると、下へ順に入ります。「番号・点数」の2列をコピーしたときは、番号で合わせて入れます(1クラスを選んでいるとき)。</p>';
  if(!editing) html += '<p class="hint warn-text">点数を入れるには、上の「✏ 編集する」を押してください。</p>';
  if(!sts.length){ $('tab-score').innerHTML = html + '<div class="banner">この学年の名簿がありません。「名簿」タブで入れてください。</div>'; return; }
  // 入力の進み具合(この教科・学年)
  const done = studentsOf(g).filter(s=>scoreOf(ex, s.id, sid)!==undefined).length, all = studentsOf(g).length;
  html += '<div class="cols"><div><table class="grid score-table"><thead><tr><th>組</th><th>番号</th><th>氏名</th><th>'+esc(subjectName(sid))+'</th></tr></thead><tbody>';
  let lastCls = null;
  sts.forEach((s, k)=>{
    const v = scoreOf(ex, s.id, sid);
    html += '<tr'+(lastCls!==null && lastCls!==s.cls?' class="sep"':'')+'><td class="c">'+s.cls+'</td><td class="c">'+s.no+'</td><td class="nowrap">'+esc(s.name)+'</td>'
      + '<td class="'+(v==='欠'?'absent':'')+'"><input type="text" inputmode="numeric" class="score-in" data-score="'+esc(s.id)+'" data-k="'+k+'" data-focus="sc-'+esc(s.id)+'" value="'+(v===undefined?'':esc(v))+'" autocomplete="off"'+d+'></td></tr>';
    lastCls = s.cls;
  });
  html += '</tbody></table></div><div class="side"><h2>入力の進み具合</h2><p>'+esc(subjectName(sid))+'　'+g+'年：<b id="scDone">'+done+'</b> / '+all+'人</p>'
    + progressTableHtml(ex, g) + '</div></div>';
  $('tab-score').innerHTML = html;
}};
// 教科 × クラスの入力済みの人数
function progressTableHtml(ex, g){
  const subs = examSubjects(ex), gi = state.meta.grades.find(x=>x.grade===g);
  const cl = Array.from({length:gi.classes},(_,i)=>i+1);
  return '<table class="grid progress"><thead><tr><th>教科</th>'+cl.map(c=>'<th>'+c+'組</th>').join('')+'</tr></thead><tbody>'
    + subs.map(s=>'<tr><th class="l">'+esc(s.name)+'</th>'+cl.map(c=>{
      const sts = studentsOf(g, c), n = sts.filter(st=>scoreOf(ex, st.id, s.id)!==undefined).length;
      return '<td class="c '+(n===sts.length&&n?'ok-cell':n?'':'warn')+'">'+(n===sts.length&&n?'✓':n+'/'+sts.length)+'</td>';
    }).join('')+'</tr>').join('') + '</tbody></table>';
}
document.addEventListener('change', e=>{
  if(e.target.id==='scSubj'){ view.scoreSubj = e.target.value; savePref(); renderAll(); }
});
ACTIONS.scoreGrade = el=>{ view.scoreGrade = +el.dataset.g; view.scoreCls = 0; savePref(); renderAll(); };
ACTIONS.scoreCls = el=>{ view.scoreCls = +el.dataset.c; savePref(); renderAll(); };
// 1人分の点数を書き込む(画面は描き直さず、その欄だけ直す。入力を速くするため)
function setScore(input, text){
  const ex = curExam(), sid = view.scoreSubj, stId = input.dataset.score;
  const max = Number(examSubj(ex, sid).max) || 100;
  const v = parseScore(text, max);
  const td = input.parentElement;
  if(v && typeof v==='object'){ td.classList.add('bad'); input.title = v.error; return false; }
  td.classList.remove('bad'); input.title = '';
  if(!ex.scores[stId]) ex.scores[stId] = {};
  if(v===undefined) delete ex.scores[stId][sid]; else ex.scores[stId][sid] = v;
  if(!Object.keys(ex.scores[stId]).length) delete ex.scores[stId];
  input.value = v===undefined ? '' : v;
  td.classList.toggle('absent', v==='欠');
  markDirty();
  return true;
}
document.addEventListener('change', e=>{
  const el = e.target.closest('.score-in');
  if(!el || !editing) return;
  if(!setScore(el, el.value)) alert('点数を入れられませんでした：'+el.title);
  const n = $('scDone'); if(n){ const ex = curExam(); n.textContent = studentsOf(view.scoreGrade).filter(s=>scoreOf(ex, s.id, view.scoreSubj)!==undefined).length; }
});
document.addEventListener('keydown', e=>{
  const el = e.target.closest && e.target.closest('.score-in');
  if(!el || (e.key!=='Enter' && e.key!=='ArrowDown' && e.key!=='ArrowUp')) return;
  e.preventDefault();
  const all = [...document.querySelectorAll('.score-in')], k = all.indexOf(el);
  const next = all[k + (e.key==='ArrowUp' ? -1 : 1)];
  if(next){ next.focus(); next.select(); } else el.blur();
});
// Excel からの貼り付け: 複数行なら下へ順に入れる。2列以上なら「番号 … 点数」とみなして番号で合わせる
document.addEventListener('paste', e=>{
  const el = e.target.closest && e.target.closest('.score-in');
  if(!el || !editing) return;
  const text = (e.clipboardData || window.clipboardData).getData('text');
  // 空の行も1人分として数える(Excel の空欄=未入力の人がいても、あとの人がずれないように)。最後の改行だけは捨てる
  const lines = String(text||'').replace(/\r/g,'').split('\n');
  if(lines.length && lines[lines.length-1]==='') lines.pop();
  const rows = lines.map(l=>(l.includes('\t') ? l.split('\t') : l.split(',')).map(c=>c.trim()));
  if(rows.length<=1 && !(rows[0] && rows[0].length>1)) return;   // 1つだけなら、ふつうの貼り付け
  e.preventDefault();
  const all = [...document.querySelectorAll('.score-in')];
  let ok = 0; const bad = [];
  if(rows.every(r=>r.length>=2) && view.scoreCls){
    const byNo = new Map(studentsOf(view.scoreGrade, view.scoreCls).map(s=>[s.no, s.id]));
    rows.forEach(r=>{
      const no = toNum(r[0]), id = byNo.get(no);
      const inp = id && all.find(i=>i.dataset.score===id);
      if(!inp){ if(!isNaN(no)) bad.push(r.join(' ')+'(番号 '+r[0]+' の生徒がいません)'); return; }
      if(setScore(inp, r[r.length-1])) ok++; else bad.push(r.join(' ')+'('+inp.title+')');
    });
  } else {
    const start = all.indexOf(el);
    rows.forEach((r, j)=>{
      const inp = all[start + j];
      if(!inp){ bad.push(r.join(' ')+'(表の下まで入れました。行が多すぎます)'); return; }
      if(setScore(inp, r[r.length-1])) ok++; else bad.push((j+1)+'行目「'+r.join(' ')+'」('+inp.title+')');
    });
  }
  renderAll();
  alert(ok+'人分を入れました。' + (bad.length ? '\n\n入れられなかった行：\n'+bad.slice(0,8).join('\n')+(bad.length>8?'\n…':'') : ''));
});

//////////////////////// 集計タブ ////////////////////////
TABS.stats = { render(){
  const ex = curExam();
  if(!ex){ $('tab-stats').innerHTML = needExamHtml(); return; }
  const gs = grades();
  if(!gs.includes(view.statsGrade)) view.statsGrade = gs[0];
  const g = view.statsGrade, sum = gradeSummary(ex, g);
  if(!sum.subs.length){ $('tab-stats').innerHTML = '<div class="banner">「テストの回」タブで、実施する教科に印を付けてください。</div>'; return; }
  const cl = Array.from({length:sum.classes},(_,i)=>i+1);
  const keys = sum.subs.map(s=>s.id).concat(sum.core.length ? ['T5'] : []).concat(sum.hasAll ? ['TA'] : []);
  let html = '<div class="toolbar"><span class="seg">'+gs.map(x=>'<button data-act="statsGrade" data-g="'+x+'"'+(x===g?' class="active"':'')+'>'+x+'年</button>').join('')+'</span>'
    + '<span class="hint">欠席(欠)と未入力は、平均点に入れません。合計と順位は、その教科がすべてそろった人だけで出します(同点は同じ順位)。</span></div>';
  // --- 平均点 ---
  html += '<section><h2>平均点</h2><div class="scroll-x"><table class="grid stats"><thead><tr><th>教科</th><th>満点</th><th>人数</th><th>学年平均</th><th>最高</th><th>最低</th><th>標準偏差</th>'
    + cl.map(c=>'<th>'+c+'組</th>').join('')+'</tr></thead><tbody>';
  keys.forEach(k=>{
    const st = stats(valuesFor(ex, sum, k));
    html += '<tr'+(k[0]==='T'?' class="total"':'')+'><th class="l">'+esc(keyName(sum, k))+'</th><td class="c">'+maxFor(ex, sum, k)+'</td>'
      + (st ? '<td class="c">'+st.n+'</td><td class="c"><b>'+fmt1(st.avg)+'</b></td><td class="c">'+st.max+'</td><td class="c">'+st.min+'</td><td class="c">'+fmt1(st.sd)+'</td>' : '<td colspan="5" class="hint">まだ点数がありません</td>')
      + cl.map(c=>{ const s2 = stats(valuesFor(ex, sum, k, c)); return '<td class="c">'+(s2 ? fmt1(s2.avg) : '')+'</td>'; }).join('') + '</tr>';
  });
  html += '</tbody></table></div></section>';
  // --- 得点分布 ---
  if(!keys.includes(view.distKey)) view.distKey = keys[0];
  const dk = view.distKey, bs = bands(maxFor(ex, sum, dk));
  const all = valuesFor(ex, sum, dk), per = cl.map(c=>valuesFor(ex, sum, dk, c));
  const cnt = (vals, b) => vals.filter(v=>v>=b.lo && v<=b.hi).length;
  const top = Math.max(1, ...bs.map(b=>cnt(all, b)));
  html += '<section><h2>得点分布</h2><div class="toolbar"><select id="distKey">'+keys.map(k=>'<option value="'+k+'"'+(k===dk?' selected':'')+'>'+esc(keyName(sum, k))+'</option>').join('')+'</select></div>'
    + '<div class="scroll-x"><table class="grid dist"><thead><tr><th>点数</th><th>学年</th><th class="barh"></th>'+cl.map(c=>'<th>'+c+'組</th>').join('')+'</tr></thead><tbody>'
    + bs.map(b=>{ const n = cnt(all, b);
      return '<tr><th class="l nowrap">'+b.lo+'〜'+b.hi+'</th><td class="c"><b>'+(n||'')+'</b></td><td class="bar"><span style="width:'+Math.round(n/top*100)+'%"></span></td>'
        + per.map(v=>'<td class="c">'+(cnt(v, b)||'')+'</td>').join('')+'</tr>'; }).join('')
    + '<tr class="total"><th class="l">人数</th><td class="c">'+all.length+'</td><td></td>'+per.map(v=>'<td class="c">'+v.length+'</td>').join('')+'</tr>'
    + '</tbody></table></div></section>';
  // --- 合計と順位 ---
  const order = view.rankOrder || 'no';
  const rows = sum.rows.slice();
  if(order==='r5') rows.sort((a,b)=>(a.rank5||9999)-(b.rank5||9999) || sortStudents(a.st,b.st));
  if(order==='rA') rows.sort((a,b)=>(a.rankA||9999)-(b.rankA||9999) || sortStudents(a.st,b.st));
  html += '<section><h2>合計と順位(先生向け)</h2><div class="toolbar">並べ方 <span class="seg">'
    + [['no','組・番号の順'],['r5','5教科の順位']].concat(sum.hasAll ? [['rA','全教科の順位']] : []).map(([k,l])=>'<button data-act="rankOrder" data-o="'+k+'"'+(k===order?' class="active"':'')+'>'+l+'</button>').join('')+'</span>'
    + '<span class="hint">順位の欄が「―」の人は、欠席か未入力の教科がある人です。</span></div>'
    + '<div class="scroll-x"><table class="grid ranking"><thead><tr><th>組</th><th>番号</th><th>氏名</th>'+sum.subs.map(s=>'<th>'+esc(s.name)+'</th>').join('')
    + (sum.core.length ? '<th class="tot">5教科</th><th>順位</th>' : '') + (sum.hasAll ? '<th class="tot">全教科</th><th>順位</th>' : '') + '</tr></thead><tbody>'
    + rows.map(r=>'<tr><td class="c">'+r.st.cls+'</td><td class="c">'+r.st.no+'</td><td class="nowrap">'+esc(r.st.name)+'</td>'
      + sum.subs.map(s=>{ const v = scoreOf(ex, r.st.id, s.id); return '<td class="c'+(v==='欠'?' absent':'')+'">'+(v===undefined?'':esc(v))+'</td>'; }).join('')
      + (sum.core.length ? '<td class="c tot">'+(r.t5.done ? r.t5.sum : '')+'</td><td class="c">'+(r.rank5||'―')+'</td>' : '')
      + (sum.hasAll ? '<td class="c tot">'+(r.tA.done ? r.tA.sum : '')+'</td><td class="c">'+(r.rankA||'―')+'</td>' : '') + '</tr>').join('')
    + '</tbody></table></div></section>';
  $('tab-stats').innerHTML = html;
}};
ACTIONS.statsGrade = el=>{ view.statsGrade = +el.dataset.g; savePref(); renderAll(); };
ACTIONS.rankOrder = el=>{ view.rankOrder = el.dataset.o; savePref(); renderAll(); };
document.addEventListener('change', e=>{ if(e.target.id==='distKey'){ view.distKey = e.target.value; savePref(); renderAll(); } });
