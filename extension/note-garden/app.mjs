import {validateBackup} from './backup.mjs';
import {collect,readNote} from './collector.mjs';
import {relation,mergeHistory,eligible} from './core.mjs';
const $=id=>document.getElementById(id), nf=n=>Number(n).toLocaleString('ja-JP');
let snapshot,history={},view='all',page=1,query='',sort='original',grace=0,only=false,skipRecent=20,busy=false,stopRequested=false,lastError='';
const names={followers:'フォロワー',follower:'フォロワー',all:'すべてのフォロー',oneway:'片思い',unknown:'要確認',mutual:'相互フォロー',protected:'残す人',hold:'保留',reviewed:'確認済み',changes:'前回からの変化',missing:'今回は未確認'};
function toast(t){$('toast').textContent=t;$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',2600)}
function save(){if(snapshot.account==='未接続')return;try{localStorage.setItem('note-garden:'+snapshot.account,JSON.stringify({snapshot,history,settings:{view,sort,grace,only,skipRecent,page}}));localStorage.setItem('note-garden:last',snapshot.account);return true}catch{toast('保存容量が不足しています。データを書き出してください。');return false}}
function activate(s){lastError='';let saved;try{saved=JSON.parse(localStorage.getItem('note-garden:'+s.account)||'null')}catch{} snapshot=s;history=mergeHistory(s,saved?.snapshot,saved?.history||{});render();return save()}
function element(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el}
function date(s){return new Date(s).toLocaleDateString('ja-JP')}
function items(){const current=snapshot.lists.followings.map((u,index)=>({u,m:history[String(u.id)]||{},status:relation(u,snapshot),index}));return [...current,...Object.values(history).filter(m=>m.missing&&m.user).map(m=>({u:m.user,m,status:'missing',index:Infinity}))]}
function followerItems(){const followed=new Set(snapshot.lists.followings.map(u=>String(u.id)));return snapshot.lists.followers.map((u,index)=>({u,m:history[String(u.id)]||{},status:followed.has(String(u.id))?'mutual':'follower',index}))}
function switchView(next){view=next;page=1;query='';only=false;$('search').value='';$('candidates').checked=false;if(view==='followers'&&['old','new'].includes(sort)){sort='original';$('sort').value=sort}render()}
function matches(x,v){return (v==='all'&&!x.m.missing)||v===x.status||(['protected','hold','reviewed'].includes(v)&&x.m[v])||(v==='changes'&&x.m.change)}
function emptySnapshot(){return {account:'未接続',name:'自分のnoteから開いてください',capturedAt:new Date().toISOString(),followingCount:0,followerCount:0,lists:{followings:[],followers:[]},authenticated:false}}
function render(){
 const rows=items(),current=rows.filter(x=>!x.m.missing);
 if(!globalThis.chrome?.scripting)$('refresh').textContent='↻ 保存データを再読込';$('accountName').textContent=snapshot.name||snapshot.account;$('handle').textContent='@'+snapshot.account;
 $('updated').textContent='最終取得 '+new Date(snapshot.capturedAt).toLocaleString('ja-JP');
 $('followingCount').textContent=nf(snapshot.followingCount);$('followerCount').textContent=nf(snapshot.followerCount);
 $('followingCoverage').textContent=nf(current.length)+'人を取得 / '+nf(Math.max(0,snapshot.followingCount-current.length))+'人が未取得';
 $('followerCoverage').textContent=nf(snapshot.lists.followers.length)+'人を取得';
 $('onewayCount').textContent=snapshot.authenticated||snapshot.followerComplete?nf(rows.filter(x=>x.status==='oneway').length):'未確定';
 $('protectedCount').textContent=nf(rows.filter(x=>x.m.protected).length);
 $('notice').textContent=snapshot.authenticated?`ログイン本人を確認して取得しました。フォロー ${nf(current.length)} / ${nf(snapshot.followingCount)}人を表示。未取得の人は判定対象外です。解除前に相手のnoteで現在の関係を確認してください。`:`公開データの試作プレビュー · フォロー ${nf(current.length)} / ${nf(snapshot.followingCount)}人を取得。フォロワー一覧が一部のため、照合できない人は「要確認」です。「片思い」とは断定しません。片思いの確定にはログイン本人の情報が必要です。拡張版で再取得すると本人の関係情報で判定します（β版）。`;
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.querySelector('b').textContent=b.dataset.view==='oneway'&&!snapshot.authenticated&&!snapshot.followerComplete?'未判定':nf(b.dataset.view==='followers'?snapshot.lists.followers.length:rows.filter(x=>matches(x,b.dataset.view)).length)});
 document.querySelectorAll('[data-card]').forEach(b=>{b.classList.toggle('selected',b.dataset.card===view);b.setAttribute('aria-pressed',b.dataset.card===view)});
 $('candidates').disabled=view==='followers';$('grace').disabled=view==='followers';$('recent').disabled=view==='followers';
 document.querySelectorAll('#sort option[value=old],#sort option[value=new]').forEach(o=>o.disabled=view==='followers');
 $('viewTitle').textContent=names[view];
 let filtered=(view==='followers'?followerItems():rows).filter(x=>(view==='followers'||matches(x,view))&&(view==='followers'||!only||(x.status==='oneway'&&eligible(x.m,grace)&&x.index>=skipRecent))&&(!query||[x.u.nickname,x.u.urlname,x.u.profile,x.m.memo].join(' ').toLowerCase().includes(query.toLowerCase())));
 if(sort==='reverse')filtered.reverse();
 if(sort==='name')filtered.sort((a,b)=>a.u.nickname.localeCompare(b.u.nickname,'ja'));
 if(sort==='followers')filtered.sort((a,b)=>b.u.followerCount-a.u.followerCount);
 if(sort==='old'||sort==='new')filtered.sort((a,b)=>(Date.parse(a.m.firstSeen)-Date.parse(b.m.firstSeen))*(sort==='old'?1:-1));
 const pages=Math.max(1,Math.ceil(filtered.length/15));page=Math.max(1,Math.min(page,pages));$('resultCount').textContent=(view==='oneway'&&!snapshot.authenticated&&!snapshot.followerComplete?'判定できません（0人という意味ではありません）':nf(filtered.length)+'人')+(view==='followers'?' / '+nf(snapshot.followerCount)+'人中の取得分':'')+(only&&view!=='followers'?' · 保護・保留・確認済み・待機中・先頭の指定人数を除外':'');
 $('list').replaceChildren();
 for(const {u,m,status} of filtered.slice((page-1)*15,page*15)){
  const row=element('article','row'), avatar=element('div','avatar');avatar.textContent=Array.from(u.nickname||u.urlname)[0];avatar.style.cssText='display:grid;place-items:center;color:#65815f;font-size:16px';
  const person=element('div','person'),h=element('h3','',u.nickname||u.urlname);h.append(element('span','badge '+status,names[status]));person.append(h,element('span','id','@'+u.urlname),element('p','profile',u.profile||'プロフィールなし'),element('div','meta',view==='followers'?`フォロワー ${nf(u.followerCount)}人 · 今回の取得一覧に含まれています`:`フォロワー ${nf(u.followerCount)}人 · 初回確認 ${date(m.firstSeen)}${m.baseline?'（初回取込・フォロー日は不明）':''}${m.change?' · '+m.change:''}${m.missing?' · 最終確認 '+date(m.lastSeen)+'（解除済みとは限りません）':''}`));
  const actions=element('div','actions'),open=element('a','open','noteで確認 ↗');open.href='https://note.com/'+encodeURIComponent(u.urlname);open.target='_blank';open.rel='noopener noreferrer';
  const toggles=element('div','toggles');for(const [key,label] of [['protected','♡ 残す'],['hold','◷ 保留'],['reviewed','✓ 確認済']]){const b=element('button',m[key]?'on':'',label);b.setAttribute('aria-pressed',!!m[key]);b.setAttribute('aria-label',u.urlname+'を'+label);b.onclick=()=>{m[key]=!m[key];save();render();toast(m[key]?label+'にしました':'設定を解除しました')};toggles.append(b)}
  const memo=element('input','memo');memo.placeholder='自分用のメモ…';memo.value=m.memo||'';memo.maxLength=1000;memo.setAttribute('aria-label',u.urlname+'のメモ');memo.oninput=()=>{m.memo=memo.value;save()};if(view==='followers')actions.append(open);else actions.append(open,toggles,memo);row.append(avatar,person,actions);$('list').append(row);
 }
 if(!filtered.length)$('list').append(element('div','empty',view==='oneway'&&!snapshot.authenticated&&!snapshot.followerComplete?'片思いが0人という意味ではありません。未取得のフォロワーがいるため、確定できない状態です。「要確認」で照合できなかった人を確認できます。ログイン本人としての判定は拡張版で再取得してください。':'この条件に当てはまる人はいません。'));
 if(snapshot.account==='未接続'){
  $('followingCount').textContent='未取得';$('followerCount').textContent='未取得';$('onewayCount').textContent='未判定';
  $('followingCoverage').textContent='まだ人数を取得できていません';$('followerCoverage').textContent='0人という意味ではありません';
  $('updated').textContent='取得はまだ完了していません';$('handle').textContent='noteアカウント未接続';
  $('resultCount').textContent='データ未取得';
  document.querySelectorAll('[data-view]').forEach(b=>b.querySelector('b').textContent='—');
  $('list').replaceChildren(element('div','empty','自分のnoteプロフィールからこの拡張を開き、右上の「情報を更新」を押してください。取得が完了すると一覧が表示されます。'));
  $('notice').textContent='まだnoteから取得できていません。フォロー・フォロワーが0人になったわけではありません。';
 }
 if(lastError)$('notice').textContent=lastError;
 save();
 $('pageLabel').textContent=page+' / '+pages;$('first').disabled=$('prev').disabled=page<=1;$('last').disabled=$('next').disabled=page>=pages;$('pageInput').max=pages;$('pageInput').value=page;
}
$('first').onclick=()=>{page=1;render()};
$('last').onclick=()=>{page=Number($('pageInput').max);render()};
$('pageJump').onsubmit=e=>{e.preventDefault();const target=Number($('pageInput').value);if(Number.isInteger(target)&&target>=1&&target<=Number($('pageInput').max)){page=target;render()}};
$('cancel').onclick=()=>{stopRequested=true;$('cancel').textContent='中止しています…'};
$('recent').onchange=e=>{skipRecent=Number(e.target.value);page=1;render()};
$('nav').onclick=e=>{const b=e.target.closest('[data-view]');if(b)switchView(b.dataset.view)};
$('stats').onclick=e=>{const b=e.target.closest('[data-card]');if(b)switchView(b.dataset.card)};
$('search').oninput=e=>{query=e.target.value;page=1;render()};$('sort').onchange=e=>{sort=e.target.value;render()};$('grace').onchange=e=>{grace=Number(e.target.value);render();if(!only)toast('待機期間は「整理候補だけ表示」で適用します')};$('candidates').onchange=e=>{only=e.target.checked;page=1;render()};$('prev').onclick=()=>{page--;render()};$('next').onclick=()=>{page++;render()};
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({snapshot,history},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=element('a');a.href=url;a.download='つながり手帖-'+snapshot.account+'-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('import').onclick=()=>$('importFile').click();
$('importFile').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>15000000)throw Error('15MB以下のファイルを選んでください。');const backup=validateBackup(JSON.parse(await f.text()));if(!confirm('@'+backup.snapshot.account+' の保存データをバックアップで置き換えます。よろしいですか？'))return;snapshot=backup.snapshot;history=mergeHistory(snapshot,null,backup.history);view='all';page=1;save();render();toast('復元しました。片思いの確定にはnoteから再取得してください。')}catch(err){toast('復元できませんでした。'+err.message)}finally{e.target.value=''}};
$('reset').onclick=()=>{if(snapshot.account==='未接続')return;if(!confirm('@'+snapshot.account+' の履歴・メモ・保護設定をこのブラウザから削除します。必要なら先に書き出してください。'))return;localStorage.removeItem('note-garden:'+snapshot.account);if(localStorage.getItem('note-garden:last')===snapshot.account)localStorage.removeItem('note-garden:last');localStorage.setItem('note-garden:hide-sample','true');snapshot=emptySnapshot();history={};view='all';page=1;render();toast('保存データを削除しました。noteのフォローは変更していません。')};
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue=''}});
$('refresh').onclick=async()=>{

 if(!globalThis.chrome?.scripting){try{const r=await fetch('snapshot.json',{cache:'no-store'});if(!r.ok)throw new Error();const fresh=await r.json();if(fresh.account!==snapshot.account)throw new Error();if(Date.parse(fresh.capturedAt)>Date.parse(snapshot.capturedAt)){activate(fresh);toast('新しい保存データを読み込みました')}else{toast('最新の保存データです。noteへの再取得は拡張版で行います。')}}catch{toast('保存データを読み込めませんでした。')}return}
 if(busy)return;
 const source=Number(new URLSearchParams(location.search).get('source'));if(!source){lastError='接続元のnoteタブがありません。自分のnoteプロフィールで、右上のパズル形アイコンから「つながり手帖」を押して開き直してください。';$('notice').textContent=lastError;return}
 lastError='';busy=true;stopRequested=false;$('refresh').textContent='ログイン本人を確認中…';$('notice').textContent='noteへの接続とログイン本人を確認しています。元のnoteタブは閉じずにお待ちください。';$('import').disabled=true;$('reset').disabled=true;$('refresh').disabled=true;$('cancel').hidden=false;$('cancel').textContent='取得を中止';
 try{
  const api=async(path,account)=>{const r=await chrome.scripting.executeScript({target:{tabId:source},func:readNote,args:[path,account||null]});const v=r[0]?.result;if(!v?.ok)throw Error(v?.error||'noteタブに接続できません。拡張アイコンから開き直してください。');return v.data};
  const fresh=await collect(api,{cancelled:()=>stopRequested,progress:(kind,p,n)=>{$('refresh').textContent=(kind==='followings'?'フォロー':'フォロワー')+' '+p+'/50ページ · '+n+'人'}});
  if(activate(fresh))toast('取得した情報を保存しました');
 }catch(e){lastError=(snapshot.account==='未接続'?'取得できませんでした（人数は未取得です）。 ':'更新できませんでした。以前のデータを保持しています。 ')+e.message;$('notice').textContent=lastError}
 finally{busy=false;$('import').disabled=false;$('reset').disabled=false;$('refresh').disabled=false;$('refresh').textContent='↻ 情報を更新';$('cancel').hidden=true}

};
try{
 let saved;try{const account=localStorage.getItem('note-garden:last');saved=JSON.parse(localStorage.getItem('note-garden:'+account)||'null')}catch{}
 if(saved?.snapshot){snapshot=saved.snapshot;history=saved.history;if(saved.settings){({view='all',sort='original',grace=0,only=false,skipRecent=20,page=1}=saved.settings)}$('sort').value=sort;$('grace').value=grace;$('recent').value=skipRecent;$('candidates').checked=only;render()}
 else{if(localStorage.getItem('note-garden:hide-sample'))throw Error();const r=await fetch('snapshot.json',{cache:'no-store'});if(!r.ok)throw new Error();activate(await r.json())}
 if(!globalThis.chrome?.scripting){const r=await fetch('snapshot.json',{cache:'no-store'});if(r.ok){const fresh=await r.json();if(fresh.account===snapshot.account&&Date.parse(fresh.capturedAt)>Date.parse(snapshot.capturedAt))activate(fresh)}}
}catch{
 snapshot=emptySnapshot();render();
}
