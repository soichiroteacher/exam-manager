'use strict';
// 見本(架空の学校・先生・生徒)。動作確認と、はじめての人のお試し用。保存はされない。
// ★ 実在の人の名前は使わないこと。
function makeSample(){
  const fy = currentFiscalYear();
  const s = emptyState(fy);
  s.meta.schoolName = '見本中学校';
  s.meta.grades = [ { grade:1, classes:3 }, { grade:2, classes:3 }, { grade:3, classes:3 } ];
  s.meta.rooms = [ { id:'r1', name:'相談室' }, { id:'r2', name:'会議室' } ];
  // 生徒(名字と名前を組み合わせた架空の名前)
  const sei = ['青木','石川','上田','遠藤','大野','加藤','木村','工藤','小林','斉藤','坂本','清水','杉山','関口','田中','千葉','土屋','中川','西村','野口','橋本','平野','福田','本田','松本','宮崎','村上','森','山口','吉田'];
  const mei = ['あおい','さくら','はると','ゆい','そうた','ひなた','りく','めい','ゆうと','こはる','いつき','みお','かいと','ことね','れん','ゆな','たくみ','あかり','しょう','まな','だいち','ひより','けんた','りこ','ゆうき'];
  let seed = 7; const rnd = n => { seed = (seed*9301+49297) % 233280; return Math.floor(seed/233280*n); };
  s.meta.grades.forEach(g=>{ for(let c=1;c<=g.classes;c++){ for(let no=1;no<=28;no++){
    s.students.push({ id:'st'+g.grade+'_'+c+'_'+no, grade:g.grade, cls:c, no, name:sei[rnd(sei.length)]+' '+mei[rnd(mei.length)], kana:'' });
  } } });
  // 先生(架空)。[名前, 担当教科, 所属学年, 種別, 監督なし]
  const T = [
    ['校長 太郎','',0,'教員',true], ['教頭 花子','',0,'教員',true],
    ['国語 一','s1',1], ['国語 二葉','s1',2], ['国語 三郎','s1',3],
    ['社会 健','s2',1], ['社会 真理','s2',3], ['数学 一樹','s3',1], ['数学 春香','s3',2], ['数学 翔','s3',3],
    ['理科 実','s4',1], ['理科 光','s4',2], ['理科 学','s4',3], ['英語 英子','s5',1], ['英語 次郎','s5',2], ['英語 恵','s5',3],
    ['音楽 奏','s6',2], ['美術 彩','s7',1], ['体育 力','s8',3], ['体育 走','s8',0], ['技術 匠','s9',2], ['家庭 和子','s9',0],
    ['支援 あゆみ','',0,'サポーター'], ['支援 ひろし','',0,'サポーター'], ['支援 みどり','',0,'サポーター'],
  ];
  s.teachers = T.map(([name, sub, grade, kind, np], i)=>({ id:'m'+i, name, kind:kind||'教員', grade, subjects: sub ? [sub] : [], noProctor:!!np }));
  // テストの回(2日間。1日目は3時間、2日目は2時間)
  state = s;   // newExam が学年・教科を使うため
  const ex = newExam('2学期中間テスト');
  const base = new Date(); base.setDate(base.getDate()+14); while(base.getDay()!==3) base.setDate(base.getDate()+1); // 2週間後の水曜
  const ymd = d => d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
  const d1 = newDay(ymd(base)); base.setDate(base.getDate()+1); const d2 = newDay(ymd(base));
  d2.slots = d2.slots.filter((x,i)=>i!==3);   // 2日目は2時間
  d2.slots[d2.slots.length-1].start = '10:55'; d2.slots[d2.slots.length-1].end = '11:05';
  ex.days = [d1, d2];
  // 中間は5教科だけ。英語は60分・社会は45分(教科ごとにテスト時間を変える例)。教科は全学年共通
  state.subjects.forEach(sb=>{ const m = ex.subjects[sb.id]; m.on = ['s1','s2','s3','s4','s5'].includes(sb.id); if(sb.id==='s5') m.minutes = 60; if(sb.id==='s2') m.minutes = 45; });
  const t1 = d1.slots.filter(x=>x.kind==='test'), t2 = d2.slots.filter(x=>x.kind==='test');
  ['s1','s3','s2'].forEach((sid,i)=> ex.schedule[t1[i].id] = sid);
  ['s4','s5'].forEach((sid,i)=> ex.schedule[t2[i].id] = sid);
  // 時間延長(1.3倍)の生徒が次の時間にかからないよう、テストの間を長めにあけた時程
  t1[1].start = '10:10'; t1[2].start = '11:25';
  // 1日目: テストのあとに給食と帰りの学活。2日目: 1時間目のあとに学活(学活などの行はどこにでも入れられる例)
  const back1 = d1.slots.find(x=>x.label==="帰りの学活"); back1.start = "13:20"; back1.end = "13:30";
  d1.slots.push({ id:newId('t'), kind:'other', label:'給食', start:'12:40', end:'13:15' });
  d2.slots.push({ id:newId('t'), kind:'other', label:'学活', start:'10:15', end:'10:25' });
  t2[1].start = '10:35';
  const back2 = d2.slots.find(x=>x.label==="帰りの学活"); back2.start = "12:15"; back2.end = "12:25";
  // 配慮の必要な生徒(延長は「倍率」と「分を足す」の両方の例)
  ex.special = [
    { id:'p1', studentId:'st1_1_5', room:'r1', extend:true, extType:'rate', rate:null, minutes:{}, absentDays:[], note:'問題用紙を拡大(A3)' },
    { id:'p2', studentId:'st1_2_12', room:'r1', extend:false, minutes:{}, absentDays:[], note:'別室で受ける' },
    { id:'p3', studentId:'st2_3_8', room:'r1', extend:true, extType:'rate', rate:1.5, minutes:{ s5:80 }, absentDays:[], note:'英語は本人の希望で80分' },
    { id:'p4', studentId:'st3_1_20', room:'r2', extend:true, extType:'plus', plus:10, minutes:{}, absentDays:[], note:'' },
    { id:'p5', studentId:'st2_1_3', room:'', extend:false, minutes:{}, absentDays:[d2.id], note:'2日目は通院のため欠席(追試)' },
  ];
  // 2日目の2時間目(英語)は、相談室だけ10分遅く始める(別室の始まりをずらす例)
  ex.sepStart = { [t2[1].id+'|r1']:'10:45' };
  ex.leave = { ['m8|'+t1[0].id]:'出張', ['m8|'+t1[1].id]:'出張', ['m8|'+t1[2].id]:'出張', ['m12|'+t2[0].id]:'休暇', ['m12|'+t2[1].id]:'休暇', ['m23|'+t1[0].id]:'その他' };
  // 年間の回数の例: 前の回(1学期期末)を、同じ時程で作って監督を割り当てておく
  const prev = newExam('1学期期末テスト');
  const pd = new Date(); pd.setMonth(pd.getMonth()-3);
  prev.days = [d1, d2].map((dd, i)=>{ const x = new Date(pd); x.setDate(x.getDate()+i); return { id:newId('d'), date:ymd(x), slots: dd.slots.map(sl=>({ ...clone(sl), id:newId('t') })) }; });
  state.subjects.forEach(sb=>{ prev.subjects[sb.id].on = ['s1','s2','s3','s4','s5'].includes(sb.id); });
  const pt = testSlots(prev); ['s1','s3','s2','s4','s5'].forEach((sid,i)=>{ if(pt[i]) prev.schedule[pt[i].slot.id] = sid; });
  prev.special = clone(ex.special).map(p=>({ ...p, absentDays:[] }));
  s.exams = [prev, ex];
  autoAssign(prev, false);
  autoAssign(ex, false);
  return s;
}
