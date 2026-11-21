'use strict';
// データのファイル・データのフォルダ・自動バックアップ・見るだけで開いたファイル
// (全アプリ共通のルール「データとバックアップ」「データファイルの置き方と自動バックアップ」。2026-11-21 ユーザーと決めた。../CLAUDE.md)
// - 本体は、index.html と同じフォルダの「定期テスト運営_YYYY年度.js」(中身は JSON に一言を付けた形。toDataText)。
// - 見るだけの先生はフォルダを選ばない。起動したら <script src> で 来年度・今年度・前年度 の本体を順に試し、一番新しい年度を開く。
//   (ブラウザは、ファイルとして開いたページから、そばの .json を自動では読めないが、<script src> の .js なら読めるため)
// - 編集する先生だけ、最初に一度「データのフォルダを選ぶ」でフォルダを選んでもらい、IndexedDB に覚える(書き込みに許可が要るため)。
//   許可がある起動では、フォルダから本体を開く(名前の年度が一番新しいもの。更新日時は使わない)。
// - 今の年度の本体がまだなければ、前の年度のものを開き「○年度のファイルを作る」と案内する(ボタンのときだけ作る)。
// - 編集を始めるとき、その日のバックアップがまだなければ「バックアップ」フォルダに1つ取る(core.js の startEditing)。
//   復元の前(core.js の importBackup・この内容に戻す)・新しい年度を作る前にも取る。アプリではバックアップを消さない。
// - 「開く」で手で選んだファイル(バックアップ・古い年度・ほかの名前)は見るだけ。「この内容に戻す」で同じ年度の本体へ書き込む。

let dataDir = null;     // データのフォルダ(= アプリのフォルダ。編集する先生だけ選ぶ)
let bodyYear = 0;       // 開いている本体の年度(ファイル名の年度)。バックアップの名前に使う
let currentName = '';   // 開いているファイルの名前(<script src> で読んだときは fileHandle がないので、名前だけ持つ)
let viewOnly = false;   // 手で開いたファイルを、見るだけで開いているか
let fileNotice = '';    // 上に出す案内: '' | 'newYear'(今の年度の本体がまだない) | 'migrate'(決まった名前の本体がなく、古い名前のファイルを開いた)

function bodyName(fy){ return CONFIG.appName+'_'+fy+'年度.js'; }
function reEsc(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function stampNow(d){ d = d || new Date(); return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())+'_'+pad2(d.getHours())+pad2(d.getMinutes()); }
function backupName(fy, d){ return CONFIG.appName+'_'+fy+'年度_バックアップ_'+stampNow(d)+'.js'; }
function isBackupName(n){ return /バックアップ|backup/i.test(n); }
const supportsDir = 'showDirectoryPicker' in window;

//////////////////////// .js の中身の形(全アプリ共通) ////////////////////////
// window.KOMU_DATA = window.KOMU_DATA || {};
// window.KOMU_DATA["定期テスト運営_2026年度"] =
// { …JSON… };
// キーはファイル名(拡張子なし)。何年度分・何アプリ分を読み込んでもぶつからないようにするため。
function toDataText(obj, fileName){
  const key = String(fileName).replace(/\.(js|json)$/i, '');
  return 'window.KOMU_DATA = window.KOMU_DATA || {};\nwindow.KOMU_DATA['+JSON.stringify(key)+'] =\n'+JSON.stringify(obj, null, 2)+';\n';
}
// ファイルの文字からデータを取り出す。プログラムとしては動かさず、「=」の後ろから最後の「}」までを JSON として読む。
// キーの名前には頼らない(バックアップを本体の名前にコピーし直しても読めるように)。以前の .json(中身が JSON だけ)も読む。
function parseDataText(text){
  const t = String(text).replace(/^﻿/, '').trim();
  if(t[0]==='{') return JSON.parse(t);
  const m = t.match(/window\.KOMU_DATA\s*\[[^\]]*\]\s*=/);
  if(!m) throw new Error('データのファイルの形が読めません。');
  const s = t.slice(m.index + m[0].length);
  return JSON.parse(s.slice(0, s.lastIndexOf('}')+1));
}
// <script src> で .js を読み、データを返す(読めなければ null)。
// 読む前になかったキーを探す(キーの名前に頼らない)。読んだあとはキーを消しておく(読み直したときに見分けるため)。
// ?t=時刻 を付けて、ブラウザに前の中身が残らないようにする。
function loadScriptData(path){
  return new Promise(res=>{
    window.KOMU_DATA = window.KOMU_DATA || {};
    const before = new Set(Object.keys(window.KOMU_DATA));
    const sc = document.createElement('script');
    sc.src = path.split('/').map(encodeURIComponent).join('/').replace(/%2E%2E/g, '..') + '?t=' + Date.now();
    sc.onload = ()=>{
      const all = window.KOMU_DATA || {};
      const k = Object.keys(all).find(x=>!before.has(x));
      sc.remove();
      if(!k) return res(null);
      const o = all[k]; delete all[k];
      res(o && typeof o==='object' ? o : null);
    };
    sc.onerror = ()=>{ sc.remove(); res(null); };
    document.head.appendChild(sc);
  });
}

// フォルダの中のファイル(フォルダは除く)
async function listFiles(dir){ const out = []; for await (const h of dir.values()){ if(h.kind==='file') out.push(h); } return out; }
// 「アプリ名_YYYY年度.js」の名前のファイルを、年度の新しい順に返す(名簿を読むときも使う。exts で拡張子を足せる)
async function findYearFiles(dir, appName, exts){
  const re = new RegExp('^'+reEsc(appName)+'_(\\d{4})年度\\.('+(exts || ['js']).join('|')+')$', 'i');
  return (await listFiles(dir)).map(h=>{ const m = h.name.match(re); return m ? { h, fy:Number(m[1]), js:/\.js$/i.test(h.name) } : null; })
    .filter(Boolean).sort((a,b)=> b.fy-a.fy || (b.js?1:0)-(a.js?1:0));
}
async function hasPerm(h, mode, ask){
  try{
    if(await h.queryPermission({ mode }) === 'granted') return true;
    return ask ? (await h.requestPermission({ mode })) === 'granted' : false;
  }catch(e){ return false; }
}
async function fileExists(dir, name){ try{ await dir.getFileHandle(name); return true; }catch(e){ return false; } }
async function writeText(fh, text){ const w = await fh.createWritable(); await w.write(text); await w.close(); }

//////////////////////// 自動バックアップ ////////////////////////
// 本体の今の中身を、データのフォルダの「バックアップ」フォルダに写す(中身は同じ。キーだけバックアップのファイル名にする)。
// daily=true のときは、その本体のその日のバックアップがすでにあれば何もしない(フォルダの中を見て決めるので、何人が編集しても1日1つ)。
async function takeBackup(handle, fy, daily){
  if(!dataDir || !handle || isSample || viewOnly) return false;
  const bd = await dataDir.getDirectoryHandle(CONFIG.backupFolder, { create:true });
  if(daily){
    const pre = CONFIG.appName+'_'+fy+'年度_バックアップ_'+todayYmd()+'_';
    for await (const name of bd.keys()) if(name.startsWith(pre)) return false;
  }
  const raw = await (await handle.getFile()).text();
  let name = backupName(fy), i = 2;
  while(await fileExists(bd, name)) name = backupName(fy).replace(/\.js$/, '_'+(i++)+'.js');   // 同じ分に2回取ったとき
  let text; try{ text = toDataText(parseDataText(raw), name); }catch(e){ text = raw; }   // 読めない中身でも、そのまま控える
  await writeText(await bd.getFileHandle(name, { create:true }), text);
  backupCountCache = null;
  return true;
}
// バックアップの数(このアプリの名前のもの)。設定タブに出す。数えられないときは null
async function countBackups(){
  if(!dataDir) return null;
  try{
    const bd = await dataDir.getDirectoryHandle(CONFIG.backupFolder);
    let n = 0; for await (const name of bd.keys()) if(name.startsWith(CONFIG.appName+'_') && /\.(js|json)$/i.test(name)) n++;
    return n;
  }catch(e){ return e.name==='NotFoundError' ? 0 : null; }
}

//////////////////////// 本体を開く ////////////////////////
// 本体を開いたあと: 年度と「新しい年度のファイルを作る」の案内を決める
function afterBodyOpen(fy){
  bodyYear = fy;
  fileNotice = fy < currentFiscalYear() ? 'newYear' : '';
  renderAll();
}
// 見るだけの先生の起動: <script src> で 来年度・今年度・前年度 の本体を順に試す(フォルダの一覧はブラウザから見られないため)
async function openByScript(){
  const cur = currentFiscalYear();
  for(const fy of [cur+1, cur, cur-1]){
    const o = await loadScriptData(bodyName(fy));
    if(!o) continue;
    let s; try{ s = normalizeState(o); }catch(e){ continue; }
    state = s; fileHandle = null; isSample = false; editing = false; dirty = false; viewOnly = false;
    currentName = bodyName(fy); lastKnownModified = 0;
    setStatus('');
    afterBodyOpen(fy);
    return true;
  }
  return false;
}
// 編集する先生: データのフォルダから本体を開く。戻り値: true=開いた / false=本体も移し替えるファイルもない
async function openFromDataDir(){
  const bodies = await findYearFiles(dataDir, CONFIG.appName);
  if(bodies.length){
    await openHandle(bodies[0].h, false);
    afterBodyOpen(bodies[0].fy);
    return true;
  }
  // 今までのファイル(例:「定期テスト_2026年度.json」)からの移し替え: フォルダの中で一番新しい .json・.dat(バックアップは除く)を
  // 見るだけで開き、「定期テスト運営_YYYY年度.js の名前で保存し直してください」と案内する
  const cands = [];
  for(const h of await listFiles(dataDir)){
    if(!/\.(json|dat)$/i.test(h.name) || isBackupName(h.name)) continue;
    try{ cands.push({ h, t:(await h.getFile()).lastModified }); }catch(e){}
  }
  cands.sort((a,b)=>b.t-a.t);
  for(const c of cands){
    try{ await openHandle(c.h, true); fileNotice = 'migrate'; renderAll(); return true; }
    catch(e){ /* このアプリのデータファイルではない(ほかのアプリのファイルなど)ので、次を見る */ }
  }
  return false;
}
// フォルダを選んだあと・許可のボタンのあと
async function tryOpenDataDir(){
  try{
    if(await openFromDataDir()) return;
    state = null; renderStart('empty');
  }catch(e){ state = null; renderStart('missing', e); }
}
// データのフォルダを選んでもらう。アプリと同じフォルダ(index.html がある)かを確かめる。選べたらフォルダを返す
async function pickDataDir(){
  if(!supportsDir){ alert('このブラウザでは、データのフォルダを選べません。Chrome か Edge で開いてください。'); return null; }
  let startIn; try{ startIn = dataDir || await idbGet('lastFile'); }catch(e){}   // lastFile: 以前の版で開いていたファイル(そのフォルダから選び始める)
  let dir;
  try{ dir = await window.showDirectoryPicker({ id:'em-data', mode:'readwrite', ...(startIn ? { startIn } : {}) }); }
  catch(e){ if(e.name!=='AbortError') alert('フォルダを選べませんでした。\n'+e.message); return null; }
  if(!(await fileExists(dir, 'index.html'))){
    alert('選んだフォルダ「'+dir.name+'」には、このアプリ(index.html)がありません。\n\n'+CONFIG.appName+'のアプリと同じフォルダ(index.html とデータのファイルがあるフォルダ)を選んでください。');
    return null;
  }
  dataDir = dir;
  try{ await idbSet('dataDir', dir); }catch(e){}
  return dir;
}
async function chooseDataDir(){
  if(!(await confirmDiscard())) return;
  const dir = await pickDataDir();
  if(!dir) return;
  if(editing && fileHandle && !isSample) await stopEditing();
  await tryOpenDataDir();
}
// 編集を始める前に、本体のファイルに書き込めるようにする(<script src> で開いたときは、フォルダから同じ名前のファイルを探す)。
// 「編集を始める」のボタンから呼ぶ(ブラウザの決まりで、フォルダ選び・許可の画面はボタンを押したときしか出せない)。
async function ensureBodyHandle(){
  if(fileHandle || isSample) return true;
  if(!supportsFSA || !supportsDir){ alert('このブラウザでは編集できません(見ることはできます)。編集するときは Chrome か Edge で開いてください。'); return false; }
  if(!dataDir){ if(!(await pickDataDir())) return false; }
  else if(!(await hasPerm(dataDir, 'readwrite', true))) return false;
  try{ fileHandle = await dataDir.getFileHandle(currentName); }
  catch(e){ alert('データのフォルダ「'+dataDir.name+'」に「'+currentName+'」が見つかりませんでした。\nアプリと同じフォルダを選び直してください(「設定」タブの「データのフォルダを選び直す」)。'); return false; }
  return true;
}
// 今のファイルを読み直す(上の「↻ 最新にする」)
async function reloadCurrent(){
  if(fileHandle){
    const fy = bodyYear, keepNotice = fileNotice, asView = viewOnly;
    await openHandle(fileHandle, asView);
    if(asView) fileNotice = keepNotice; else afterBodyOpen(fy);
    renderAll();
  } else if(!(await openByScript())) throw new Error('データのファイルを読めませんでした。');
}

//////////////////////// はじめの画面 ////////////////////////
// mode: 'none'(本体が見つからず、フォルダも選んでいない) | 'perm'(許可のボタンが要る) | 'empty'(フォルダに本体がない) | 'missing'(フォルダを開けない)
async function renderStart(mode, err){
  renderAll();
  const show = (id, on, primary) => { $(id).hidden = !on; $(id).classList.toggle('primary', !!primary); };
  const name = dataDir ? '「'+esc(dataDir.name)+'」' : '';
  let msg = '';
  if(mode==='perm'){
    msg = '<p><b>データのフォルダ'+name+'を開きます。</b>下の「データのフォルダを開く」を押してください。</p>'
      + '<p class="hint">ブラウザの決まりで、起動するたびに1回、ボタンを押して許可する必要があります(「このサイトにいつも許可する」を選ぶと、次からは要らなくなることがあります)。</p>';
  } else if(mode==='empty'){
    msg = '<p><b>データのフォルダ'+name+'には、まだ'+esc(CONFIG.appName)+'のデータファイルがありません。</b></p>'
      + '<p class="hint">年度のはじめに1回だけ「新しく作る」でデータファイル(1年分・全学年で1つ)を作ります。ほかのフォルダだったときは「データのフォルダを選ぶ」で選び直してください。</p>';
  } else if(mode==='missing'){
    msg = '<p><b>データのフォルダ'+name+'を開けませんでした。</b></p>'
      + '<p class="hint">共有サーバーにつながっているか確かめてください。フォルダを移した・名前を変えたときは、「データのフォルダを選ぶ」で選び直してください。'+(err && err.message ? '<br>('+esc(err.message)+')' : '')+'</p>';
  } else {
    let last = null; try{ last = await idbGet('lastFile'); }catch(e){}
    msg = '<p><b>このアプリのフォルダに、データファイル(「'+esc(bodyName(currentFiscalYear()))+'」など)が見つかりませんでした。</b></p>'
      + '<p class="hint">データファイルは、共有サーバーのこのアプリ(index.html)と同じフォルダに置きます。見るだけの先生は、そこにファイルがあれば、開くだけで表示されます。'
      + '<br><b>はじめて使うとき・今までのファイル(.json)から移すとき</b>は、編集する先生が「データのフォルダを選ぶ」で、このアプリと同じフォルダを選んでください(パソコン・ブラウザごとに一度)。'
      + (last ? '<br>前回は「'+esc(last.name)+'」を開いていました。' : '')
      + '<br>どんなアプリか試すだけなら「見本を表示する」を押してください(見本は保存されません)。</p>';
  }
  $('bnMsg').innerHTML = msg;
  show('bnPerm', mode==='perm', true);
  show('bnFolder', supportsDir, mode==='none' || mode==='missing');
  show('bnNew', mode==='empty', true);
  show('bnOpen', supportsFSA);
}

//////////////////////// 上に出す案内(見るだけ・移し替え・新しい年度) ////////////////////////
function renderFileNotice(){
  const el = $('fileNotice');
  let h = '';
  if(state && !isSample && currentName){
    const saved = state.meta.savedAt ? new Date(state.meta.savedAt).toLocaleString('ja-JP') + (state.meta.savedBy ? '・'+esc(sensei(state.meta.savedBy)) : '') : '';
    if(fileNotice==='migrate'){
      const nb = bodyName(state.meta.fiscalYear);
      h = '<p><b>📖 今までのファイル「'+esc(currentName)+'」を、見るだけで開いています。</b></p>'
        + '<p>これからは、データのフォルダの「<b>'+esc(nb)+'</b>」を毎回開きます。下のボタンで、この名前で保存し直してください(古いファイルはそのまま残ります。確かめてから、エクスプローラーで消してかまいません)。</p>'
        + '<div class="line"><button class="primary" data-act="saveAsBody">「'+esc(nb)+'」の名前で保存し直す</button></div>';
    } else if(viewOnly){
      h = '<p><b>📖 見るだけで開いています：「'+esc(currentName)+'」</b>'+(saved ? '('+saved+'に保存した内容)' : '')+'</p>'
        + '<p class="hint">このファイルは編集できません。この内容に戻したいときは「この内容に戻す」を押してください('+esc(state.meta.fiscalYear)+'年度のいつものファイルに書き込みます)。次に起動したときは、いつものファイルが開きます。</p>'
        + '<div class="line"><button data-act="restoreViewed">この内容に戻す</button><button class="primary" data-act="backToBody">いつものファイルに戻る</button></div>';
    } else if(fileNotice==='newYear'){
      const cur = currentFiscalYear();
      h = '<p><b>今は'+cur+'年度です。'+cur+'年度のデータファイルはまだありません。</b>('+bodyYear+'年度のファイルを開いています)</p>'
        + '<p class="hint">新しい年度のテストを作るときは、下のボタンで'+cur+'年度のファイルを作ってください。'+bodyYear+'年度のファイルはそのまま残ります。</p>'
        + '<div class="line"><button class="primary" data-act="createNewYear">'+cur+'年度のファイルを作る</button></div>';
    }
  }
  el.innerHTML = h;
  el.hidden = !h;
}
ACTIONS.backToBody = async ()=>{
  if(dataDir && await hasPerm(dataDir, 'readwrite', true)){ await tryOpenDataDir(); return; }
  if(!(await openByScript())) renderStart(dataDir ? 'perm' : 'none');
};

// 今までのファイルを、決まった名前の本体として保存し直す(移し替え)
ACTIONS.saveAsBody = async ()=>{
  if(!dataDir || !(await hasPerm(dataDir, 'readwrite', true))){ alert('データのフォルダに書き込む許可がありません。「データのフォルダを選ぶ」で選び直してください。'); return; }
  const fy = state.meta.fiscalYear, nb = bodyName(fy);
  if(await fileExists(dataDir, nb)){ alert('「'+nb+'」はもうあります。上の「いつものファイルに戻る」を押してください。'); return; }
  if(!confirm('今開いている「'+currentName+'」の内容を、「'+nb+'」の名前で保存し直します。\nよろしいですか？')) return;
  try{
    const oldName = currentName;
    const o = clone(state);
    o.editLock = { active:false, since:null, by:'', session:'' };
    await writeText(await dataDir.getFileHandle(nb, { create:true }), toDataText(o, nb));
    await tryOpenDataDir();
    alert('「'+nb+'」の名前で保存し直しました。次からは、このファイルが開きます。\n\n古いファイル「'+oldName+'」は、そのまま残っています。内容を確かめてから、エクスプローラーで消してかまいません。');
  }catch(e){ alert('保存し直せませんでした。\n'+e.message+'\n\n共有サーバーのフォルダに書き込む権限があるか確かめてください。'); }
};

// 見るだけで開いた内容を、同じ年度の本体に書き込む(先に本体のバックアップを取る)。
// 「今の年度の本体」ではなく「同じ年度の本体」にするのは、前の年度のバックアップで新しい年度のファイルを上書きしないため。
ACTIONS.restoreViewed = async ()=>{
  if(!viewOnly || !state) return;
  if(!dataDir || !(await hasPerm(dataDir, 'readwrite', true))){ alert('データのフォルダが選ばれていないか、書き込む許可がありません。「データのフォルダを選ぶ」で選んでから、もう一度開いてください。'); return; }
  const fy = state.meta.fiscalYear;
  const bodies = await findYearFiles(dataDir, CONFIG.appName);
  const target = bodies.find(b=>b.fy===fy);
  if(!target){ alert(fy+'年度のいつものファイル「'+bodyName(fy)+'」が、データのフォルダにありません。'); return; }
  if(await target.h.isSameEntry(fileHandle)){ alert('このファイルは、'+fy+'年度のいつものファイルそのものです。'+(target!==bodies[0] ? '前の年度のファイルは見るだけです。' : '')); return; }
  let cur;
  try{ cur = (await readHandle(target.h)).obj; }catch(e){ alert('いつものファイルを読めませんでした。\n'+e.message); return; }
  if(isLockFresh(cur.editLock) && !confirm('⚠ いま '+sensei(cur.editLock.by)+'が編集中です。戻すと、その先生の入力が消えることがあります。\nふつうは、相手が「編集を終える」まで待ってください。\n\nそれでも戻しますか？')) return;
  const name = (prompt('戻す人のお名前を入れてください(「編集の記録」に残ります)', editorName()) || '').trim();
  if(!name) return;
  if(!confirm('いつものファイル「'+target.h.name+'」を、今見ている「'+currentName+'」の内容に戻します。\n\n戻す前のいつものファイルの内容は、「'+CONFIG.backupFolder+'」フォルダに控えを取ります。よろしいですか？')) return;
  const keepView = viewOnly; viewOnly = false;   // takeBackup は見るだけのときは動かないので、いったん外す
  try{ await takeBackup(target.h, fy, false); }
  catch(e){ viewOnly = keepView; alert('いつものファイルの控え(バックアップ)を取れなかったので、戻すのをやめました。\n'+e.message); return; }
  const now = new Date().toISOString();
  const o = clone(state);
  o.editLock = { active:false, since:null, by:'', session:'' };
  o.editLog = (cur.editLog || []).concat([{ by:name, start:now, end:now }]).slice(-EDIT_LOG_MAX);   // 記録はいつものファイルのものを引き継ぐ
  o.meta.savedAt = now; o.meta.savedBy = name;
  try{ localStorage.setItem('em.editorName', name); }catch(e){}
  try{ await writeText(target.h, toDataText(o, target.h.name)); }
  catch(e){ viewOnly = keepView; alert('書き込めませんでした。\n'+e.message); return; }
  if(target===bodies[0]){ await openHandle(target.h, false); afterBodyOpen(fy); }
  else await openHandle(target.h, true);
  alert('戻しました。');
};

//////////////////////// 「開く」(手でファイルを選ぶ。見るだけ) ////////////////////////
async function doOpen(){
  if(!supportsFSA){ alert('このブラウザでは、ファイルを選んで開くことができません。Chrome か Edge で開いてください。'); return; }
  if(!(await confirmDiscard())) return;
  let h;
  try{ [h] = await window.showOpenFilePicker({ id:'em-open', types:[{ description:CONFIG.appName+'のデータ', accept:{'text/javascript':['.js'], 'application/json':['.json']} }], ...(dataDir ? { startIn:dataDir } : {}) }); }
  catch(e){ if(e.name!=='AbortError') alert('開けませんでした。\n'+e.message); return; }
  await openPicked(h);
}
async function openPicked(h){
  if(editing && fileHandle && !isSample) await stopEditing();
  // いつもの本体(一番新しい年度)を選んだときは、ふつうに開く
  let body = null;
  if(dataDir && await hasPerm(dataDir, 'readwrite', false)){ try{ body = (await findYearFiles(dataDir, CONFIG.appName))[0] || null; }catch(e){} }
  const isBody = !!body && await body.h.isSameEntry(h);
  try{
    await openHandle(isBody ? body.h : h, !isBody);
    if(isBody) afterBodyOpen(body.fy);
  }catch(e){ alert('開けませんでした。\n'+e.message+'\n\n'+CONFIG.appName+'のデータファイル(.js。以前のものは .json)を選んでいるか確かめてください。'); }
}

//////////////////////// 新しく作る ////////////////////////
async function openNewDialog(){
  if(!dataDir){ if(!(await pickDataDir())) return; }
  $('nYear').value = currentFiscalYear(); $('nSchool').value = ''; $('nErr').textContent = '';
  $('nFolder').textContent = dataDir.name;
  openOverlay('newOverlay');
  setTimeout(()=>$('nSchool').focus(), 30);
}
// 本体を作って開く(編集はまだ始めない。名前を入れて「編集する」から始めてもらう)
async function createBody(s){
  const fy = s.meta.fiscalYear, nb = bodyName(fy);
  if(await fileExists(dataDir, nb)) throw new Error('「'+nb+'」はもうあります。');
  await writeText(await dataDir.getFileHandle(nb, { create:true }), toDataText(s, nb));
  await tryOpenDataDir();
}
$('nOk').addEventListener('click', async ()=>{
  const y = Number($('nYear').value);
  if(!(y>=2000 && y<=2100)){ $('nErr').textContent = '年度は西暦の数字(例：2026)で入れてください。'; return; }
  if(!(await hasPerm(dataDir, 'readwrite', true))){ $('nErr').textContent = 'データのフォルダに書き込む許可がありません。'; return; }
  if(await fileExists(dataDir, bodyName(y))){ $('nErr').textContent = '「'+bodyName(y)+'」はもうあります。'; return; }
  if(editing && fileHandle && !isSample) await stopEditing();
  const s = emptyState(y);
  s.meta.schoolName = $('nSchool').value.trim();
  try{ await createBody(s); }catch(e){ $('nErr').textContent = '作れませんでした。'+e.message; return; }
  closeOverlay('newOverlay');
  view.tab = 'settings'; savePref(); renderAll();
  alert('「'+bodyName(y)+'」を作りました。\n\n「✏ 編集する」を押してから、はじめに「設定」で学年・クラス数と先生を入れ、「名簿」で'+CONFIG.rosterAppName+'アプリの名簿を読み込んでください。');
});
$('nCancel').addEventListener('click', ()=>closeOverlay('newOverlay'));
$('btnNew').addEventListener('click', async ()=>{ if(!(await confirmDiscard())) return; openNewDialog(); });
$('bnNew').addEventListener('click', openNewDialog);

// 新しい年度のファイルを作る。
// 引き継ぐ: 学校名・学年とクラスの数・別室・延長の基本・教科・先生とサポーター(担当教科・所属学年・監督なし)
// 引き継がない: 生徒の名簿(新しい年度の名簿を読み込み直す。進級で学年・組が変わるため)・テストの回・点数・配慮の必要な生徒・編集の記録
ACTIONS.createNewYear = async ()=>{
  const fy = currentFiscalYear();
  if(!state || viewOnly) return;
  if(editing){ alert('先に「編集を終える」を押してください。'); return; }
  if(!(await ensureBodyHandle())) return;   // <script src> で開いたときは、ここでフォルダを選ぶ・許可する
  if(await fileExists(dataDir, bodyName(fy))){ await tryOpenDataDir(); return; }
  if(!confirm(fy+'年度のデータファイル「'+bodyName(fy)+'」を作ります。\n\n引き継ぐもの：学校名・学年とクラスの数・別室・延長の基本・教科・先生とサポーター\n引き継がないもの：生徒の名簿・テストの回・点数・配慮の必要な生徒・編集の記録\n\n'+bodyYear+'年度のファイルはそのまま残ります。作りますか？')) return;
  try{ await takeBackup(fileHandle, bodyYear, false); }   // 作る前に、今の本体のバックアップを取る
  catch(e){ alert('今のファイルの控え(バックアップ)を取れなかったので、作るのをやめました。\n'+e.message); return; }
  const s = emptyState(fy), m = state.meta;
  ['schoolName','grades','rooms','extendRate','extendPlus'].forEach(k=> s.meta[k] = clone(m[k]));
  s.subjects = clone(state.subjects);
  s.teachers = clone(state.teachers);
  try{ await createBody(s); }catch(e){ alert('作れませんでした。\n'+e.message); return; }
  view.tab = 'settings'; savePref(); renderAll();
  alert(fy+'年度のファイルを作りました。\n\n「✏ 編集する」を押してから、\n・「設定」で先生の所属学年・担当教科を新しい年度に合わせて直す(転入・転出した先生も)\n・「名簿」で'+CONFIG.rosterAppName+'アプリの'+fy+'年度の名簿を読み込む\nをしてください。');
};

//////////////////////// 設定タブの「データのフォルダとバックアップ」 ////////////////////////
function fileInfoHtml(){
  if(isSample) return '<div class="row"><span class="k">バックアップ</span><span id="backupCount">見本では取りません(見本は保存されません)</span></div>'
    + '<p class="hint">本番では、編集を始めるとき、その日のバックアップがまだなければ、データのフォルダの「'+esc(CONFIG.backupFolder)+'」フォルダに1つ取ります。</p>';
  return '<div class="row"><span class="k">開いているファイル</span><span>'+esc(currentName)+(viewOnly ? '(見るだけ)' : '')+'</span></div>'
    + '<div class="row"><span class="k">データのフォルダ</span><span>'+(dataDir ? esc(dataDir.name) : '(このパソコンではまだ選んでいません。編集するときに選びます)')+' <button data-act="chooseDataDir">データのフォルダを選び'+(dataDir?'直す':'')+'</button></span></div>'
    + '<div class="row"><span class="k">バックアップ</span><span id="backupCount">'+(dataDir ? '数えています…' : '(データのフォルダを選ぶと数えます)')+'</span></div>'
    + '<p class="hint">編集を始めるとき、その日のバックアップがまだなければ、データのフォルダの「'+esc(CONFIG.backupFolder)+'」フォルダに1つ取ります(何人が編集しても1日1つ)。復元の前・新しい年度を作る前にも取ります。'
    + '<br>バックアップはアプリでは消しません。増えてきたら、エクスプローラーで古いものから消してください。戻したいときは、上の「開く」でバックアップのファイルを選び、「この内容に戻す」を押します。'
    + '<br>データのファイル(.js)は、ダブルクリックせず、このアプリから開いてください(Windows がプログラムとして動かそうとして、エラーの画面が出ます。中身は壊れません)。</p>';
}
// 設定タブは入力のたびに描き直すので、共有サーバーのフォルダを毎回数えないよう、30秒は前の数を使う
let backupCountCache = null;
async function fillBackupCount(){
  const el = $('backupCount'); if(!el || isSample || !dataDir) return;
  if(!(await hasPerm(dataDir, 'readwrite', false))){ el.textContent = '(フォルダの許可がないため数えられません)'; return; }
  if(!backupCountCache || Date.now()-backupCountCache.t > 30000) backupCountCache = { t:Date.now(), n: await countBackups() };
  const n = backupCountCache.n;
  if($('backupCount')) $('backupCount').textContent = n==null ? '(数えられませんでした)' : n+'個(「'+CONFIG.backupFolder+'」フォルダ)';
}
ACTIONS.chooseDataDir = ()=> chooseDataDir();

$('btnOpen').addEventListener('click', doOpen);
$('bnOpen').addEventListener('click', doOpen);
$('bnFolder').addEventListener('click', chooseDataDir);
$('bnPerm').addEventListener('click', async ()=>{
  if(!dataDir) return;
  if(await hasPerm(dataDir, 'readwrite', true)) await tryOpenDataDir();
});

// 起動: フォルダの許可がある(編集する先生)ならフォルダから、なければ <script src> で本体を開く
async function bootFiles(){
  renderAll();
  try{ dataDir = supportsDir ? ((await idbGet('dataDir')) || null) : null; }catch(e){}
  if(dataDir && await hasPerm(dataDir, 'readwrite', false)){ await tryOpenDataDir(); return; }
  if(await openByScript()) return;
  renderStart(dataDir ? 'perm' : 'none');   // 本体が見つからない(はじめて・今までの .json から移すとき)
}
