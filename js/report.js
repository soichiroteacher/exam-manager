'use strict';
// 個票(生徒ごとの成績表)・成績一覧表の印刷と、成績一覧の Excel 書き出し(第6段階)
// 個票に載せるもの(2026-09-27 ユーザーと確認): 各教科の点数・合計、学年平均、前の回との比較、得点分布の中での位置。
// 順位と担任のひとことは載せない。

// 前の回: 1日目の日付がこの回より前で、いちばん近い回(日付がない回は、並びの1つ前)
function prevExamOf(ex){
  const d0 = x => (x.days[0] && x.days[0].date) || '';
  const me = d0(ex);
  if(me){
    const cands = state.exams.filter(x=>x!==ex && d0(x) && d0(x) < me).sort((a,b)=>d0(b).localeCompare(d0(a)));
    if(cands.length) return cands[0];
  }
  const i = state.exams.indexOf(ex);
  return i>0 ? state.exams[i-1] : null;
}
function compareExam(ex){
  const sel = optOf('report','compare','auto');
  if(sel==='none') return null;
  if(sel!=='auto'){ const x = state.exams.find(y=>y.id===sel); if(x && x!==ex) return x; }
  return prevExamOf(ex);
}
// 学年ごとの集計を1回だけ作って使い回す(生徒ごとに計算し直すと遅いため)
function gradeCache(ex, grade){
  const sum = gradeSummary(ex, grade);
  const keys = sum.subs.map(s=>s.id).concat(sum.core.length ? ['T5'] : []).concat(sum.hasAll ? ['TA'] : []);
  const info = {};
  keys.forEach(k=>{
    const vals = valuesFor(ex, sum, k), bs = bands(maxFor(ex, sum, k));
    info[k] = { st: stats(vals), bands: bs.slice().reverse(), counts: bs.slice().reverse().map(b=>vals.filter(v=>v>=b.lo && v<=b.hi).length), max: maxFor(ex, sum, k) };
  });
  return { sum, keys, info, byId: new Map(sum.rows.map(r=>[r.st.id, r])) };
}
// その生徒の、教科(または合計)の点数。合計は、そろっていなければ null
function valueOfRow(ex, row, k){
  if(k==='T5') return row.t5.complete ? row.t5.sum : null;
  if(k==='TA') return row.tA.complete ? row.tA.sum : null;
  const v = scoreOf(ex, row.st.id, k); return v===undefined ? null : v;
}
function prevValue(prev, stId, k, curSum){
  if(!prev) return null;
  if(k==='T5'){ const core = coreSubjects(prev); if(!core.length) return null; const t = totalOf(prev, stId, core); return t.complete ? t.sum : null; }
  if(k==='TA'){ const subs = examSubjects(prev); if(subs.length!==curSum.subs.length) return null; const t = totalOf(prev, stId, subs); return t.complete ? t.sum : null; }
  if(!examSubj(prev, k).on) return null;
  const v = scoreOf(prev, stId, k); return v===undefined ? null : v;
}
// 得点分布の小さな棒グラフ(その生徒の区切りを黒く塗り、上に▼を付ける)
function miniDist(inf, v){
  const top = Math.max(1, ...inf.counts);
  const mine = isNum(v) ? inf.bands.findIndex(b=>v>=b.lo && v<=b.hi) : -1;
  return '<div class="mini-dist">' + inf.bands.map((b, i)=>'<div class="col'+(i===mine?' me':'')+'"><div class="mark">'+(i===mine?'▼':'')+'</div>'
    + '<div class="barwrap"><div class="bar" style="height:'+Math.round(inf.counts[i]/top*100)+'%"></div></div><div class="lab">'+b.lo+'</div></div>').join('') + '</div>';
}

FORMS.report = { title:'個票(個人成績表)', paper:['A4P'], desc:'生徒1人に A4 1枚。各教科の点数と合計、学年平均、前の回との比較、学年の得点分布の中での位置を載せます(順位は載せません)。' };
FORMS.gradeList = { title:'成績一覧表(先生向け)', paper:['A3L','A4L'], desc:'学年の全員の点数・合計・順位の一覧です。人数が多いときは、何枚かに分けます。最後に学年とクラスの平均点を載せます。' };
BUILD_EMPTY.report = '名簿に生徒がいないか、「点数」タブで点数が入っていません。';
BUILD_EMPTY.gradeList = '名簿に生徒がいないか、実施する教科がありません。';

BUILD.report = (ex)=>{
  const target = optOf('report','target','all');
  const rooms = classRooms().filter(r=> target==='all' || target==='g'+r.grade || target===r.key);
  const prev = compareExam(ex);
  const caches = {};
  const pages = [];
  rooms.forEach(r=>{
    const c = caches[r.grade] = caches[r.grade] || gradeCache(ex, r.grade);
    if(!c.sum.subs.length) return;
    studentsOf(r.grade, r.cls).forEach(st=>{
      const row = c.byId.get(st.id);
      if(!c.sum.subs.some(s=>scoreOf(ex, st.id, s.id)!==undefined)) return;   // 点数が1つもない生徒は出さない
      const trs = c.keys.map(k=>{
        const v = valueOfRow(ex, row, k), inf = c.info[k], pv = prevValue(prev, st.id, k, c.sum);
        const diff = isNum(v) && isNum(pv) ? v - pv : null;
        const isT = k[0]==='T';
        const partial = isT && !isNum(v) && (k==='T5' ? row.t5 : row.tA).done;   // 欠席があって合計がそろわない
        return '<tr'+(isT?' class="total"':'')+'><th class="l">'+esc(keyName(c.sum, k))+'</th><td>'+inf.max+'</td>'
          + '<td class="score">'+(v===null ? (partial ? '―' : '') : esc(v))+'</td>'
          + '<td>'+(inf.st ? fmt1(inf.st.avg) : '')+'</td>'
          + (prev ? '<td>'+(pv===null ? '' : esc(pv))+'</td><td class="diff">'+(diff===null ? '' : (diff>0?'+':diff<0?'−':'±')+Math.abs(diff))+'</td>' : '')
          + '</tr>';
      }).join('');
      const dists = c.keys.map(k=>'<div class="dist-box"><div class="dt">'+esc(keyName(c.sum, k).replace('の合計',''))+'</div>'+miniDist(c.info[k], valueOfRow(ex, row, k))+'</div>').join('');
      pages.push({ grow:1.35, html: '<div class="report">'
        + '<div class="rp-head"><div class="rp-title">'+esc(ex.name)+'　個人成績表</div><div class="rp-sub">'+schoolSub()+'</div></div>'
        + '<div class="rp-name"><span>'+st.grade+'年 '+st.cls+'組 '+st.no+'番</span><b>'+esc(st.name)+'</b></div>'
        + '<table class="p-table rp-table"><thead><tr><th>教科</th><th>満点</th><th>得点</th><th>学年平均</th>'+(prev ? '<th>前回<div class="small">'+esc(prev.name)+'</div></th><th>前回との差</th>' : '')+'</tr></thead><tbody>'+trs+'</tbody></table>'
        + '<p class="small">「欠」は欠席です。合計の「―」は、欠席の教科があるため合計を出していないものです。</p>'
        + '<h2 class="p-h2">学年の得点分布(▼が自分のいるところ)</h2><div class="dist-grid">'+dists+'</div>'
        + '<p class="small">棒の高さは、その点数の人数です。棒の下の数字は、その区切りのいちばん低い点です(例：「80」は80〜89点)。</p>'
        + '</div>' });
    });
  });
  return pages;
};

// 成績一覧表: 学年ごと。人数が多いときは何枚かに分ける
BUILD.gradeList = (ex, paperKey)=>{
  const gsel = optOf('gradeList','grade','all'), order = optOf('gradeList','order','no');
  const perPage = paperKey==='A4L' ? 32 : 48;
  const pages = [];
  grades().forEach(g=>{
    if(gsel!=='all' && String(gsel)!==String(g)) return;
    const c = gradeCache(ex, g), sum = c.sum;
    if(!sum.subs.length || !sum.rows.length) return;
    const rows = sum.rows.slice();
    if(order==='r5') rows.sort((a,b)=>(a.rank5||9999)-(b.rank5||9999) || sortStudents(a.st,b.st));
    if(order==='rA') rows.sort((a,b)=>(a.rankA||9999)-(b.rankA||9999) || sortStudents(a.st,b.st));
    const head = '<tr><th>組</th><th>番号</th><th class="name">氏名</th>'+sum.subs.map(s=>'<th>'+esc(s.name)+'</th>').join('')
      + (sum.core.length ? '<th class="tot">5教科</th><th>順位</th>' : '') + (sum.hasAll ? '<th class="tot">全教科</th><th>順位</th>' : '') + '</tr>';
    const line = r=>'<tr><td>'+r.st.cls+'</td><td>'+r.st.no+'</td><td class="name">'+esc(r.st.name)+'</td>'
      + sum.subs.map(s=>{ const v = scoreOf(ex, r.st.id, s.id); return '<td>'+(v===undefined?'':esc(v))+'</td>'; }).join('')
      + (sum.core.length ? '<td class="tot">'+(r.t5.done ? r.t5.sum+(r.t5.complete?'':'*') : '')+'</td><td>'+(r.rank5||'―')+'</td>' : '')
      + (sum.hasAll ? '<td class="tot">'+(r.tA.done ? r.tA.sum+(r.tA.complete?'':'*') : '')+'</td><td>'+(r.rankA||'―')+'</td>' : '') + '</tr>';
    // 平均の行(学年・クラス)
    const cl = Array.from({length:sum.classes},(_,i)=>i+1);
    const avgRow = (label, cls) => '<tr class="avg"><th colspan="3">'+label+'</th>'
      + sum.subs.map(s=>{ const st = stats(valuesFor(ex, sum, s.id, cls)); return '<td>'+(st?fmt1(st.avg):'')+'</td>'; }).join('')
      + (sum.core.length ? '<td class="tot">'+((st=>st?fmt1(st.avg):'')(stats(valuesFor(ex, sum, 'T5', cls))))+'</td><td></td>' : '')
      + (sum.hasAll ? '<td class="tot">'+((st=>st?fmt1(st.avg):'')(stats(valuesFor(ex, sum, 'TA', cls))))+'</td><td></td>' : '') + '</tr>';
    const avgs = avgRow('学年平均', 0) + cl.map(k=>avgRow(k+'組の平均', k)).join('');
    const n = Math.max(1, Math.ceil(rows.length / perPage));
    for(let p=0; p<n; p++){
      const part = rows.slice(p*perPage, (p+1)*perPage);
      pages.push({ html: pTitle(esc(ex.name)+'　成績一覧表　'+g+'年'+(n>1?'('+(p+1)+'/'+n+')':''), schoolSub()+'　<b>個人情報のため取り扱いに注意</b>')
        + '<table class="p-table grade-list"><thead>'+head+'</thead><tbody>'+part.map(line).join('')+(p===n-1 ? avgs : '')+'</tbody></table>'
        + (p===n-1 ? '<p class="small">順位は同点を同じ順位にしています。「―」と、合計の「*」は、欠席・未入力の教科がある人です(順位に入れていません)。</p>' : '') });
    }
  });
  return pages;
};

// 成績一覧の Excel 書き出し(学年ごとに1枚のシート + 平均点のシート)
function exportScoresXlsx(){
  const ex = curExam(); if(!ex) return;
  const sheets = [], avgRows = [['学年','教科','人数','学年平均','最高','最低','標準偏差'].concat(Array.from({length:Math.max(...state.meta.grades.map(g=>g.classes))},(_,i)=>(i+1)+'組'))];
  grades().forEach(g=>{
    const sum = gradeSummary(ex, g);
    if(!sum.subs.length || !sum.rows.length) return;
    const head = ['学年','組','番号','氏名'].concat(sum.subs.map(s=>s.name)).concat(sum.core.length ? ['5教科の合計','5教科の順位'] : []).concat(sum.hasAll ? ['全教科の合計','全教科の順位'] : []);
    const rows = [head].concat(sum.rows.map(r=>[r.st.grade, r.st.cls, r.st.no, r.st.name]
      .concat(sum.subs.map(s=>{ const v = scoreOf(ex, r.st.id, s.id); return v===undefined ? null : v; }))
      .concat(sum.core.length ? [r.t5.complete ? r.t5.sum : null, r.rank5 || null] : [])
      .concat(sum.hasAll ? [r.tA.complete ? r.tA.sum : null, r.rankA || null] : [])));
    sheets.push({ name: g+'年', rows, headerRows:1, colWidths:[5,4,5,14].concat(sum.subs.map(()=>8)).concat(sum.core.length?[10,10]:[]).concat(sum.hasAll?[10,10]:[]) });
    const keys = sum.subs.map(s=>s.id).concat(sum.core.length ? ['T5'] : []).concat(sum.hasAll ? ['TA'] : []);
    keys.forEach(k=>{
      const st = stats(valuesFor(ex, sum, k)); const r1 = x => x==null ? null : Math.round(x*10)/10;
      avgRows.push([g+'年', keyName(sum, k), st?st.n:0, st?r1(st.avg):null, st?st.max:null, st?st.min:null, st?r1(st.sd):null]
        .concat(Array.from({length:sum.classes},(_,i)=>{ const s2 = stats(valuesFor(ex, sum, k, i+1)); return s2 ? r1(s2.avg) : null; })));
    });
  });
  if(!sheets.length){ alert('書き出す点数がありません。「名簿」と「点数」を確かめてください。'); return; }
  sheets.push({ name:'平均点', rows:avgRows, headerRows:1, colWidths:[6,16,6,9,6,6,9].concat(avgRows[0].slice(7).map(()=>7)) });
  if(!confirm('成績一覧を Excel に書き出します。\n生徒の名前と点数が入ったファイルです。校内の共有サーバーに保存し、インターネットやクラウドのフォルダには置かないでください。')) return;
  downloadXlsx('定期テスト_成績一覧_'+ex.name.replace(/[\\\/:*?"<>|]/g,'')+'_'+todayYmd()+'.xlsx', sheets);
}
ACTIONS.exportXlsx = exportScoresXlsx;
