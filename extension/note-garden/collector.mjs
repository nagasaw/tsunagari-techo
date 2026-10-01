// Every call is GET-only, bound to the note tab explicitly granted by activeTab.
export async function readNote(path, expectedAccount) {
 try {
  const account=location.pathname.split('/')[1];
  if(location.origin!=='https://note.com'||!/^\w+$/.test(account)||expectedAccount&&account!==expectedAccount)throw Error('自分のnoteプロフィールを開き直してください。');
  if(!/^(|\/(followings|followers)\?per=20&page=([1-9]|[1-4][0-9]|50))$/.test(path))throw Error('許可されていない読取です。');
  const r=await fetch('/api/v2/creators/'+account+path,{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('HTTP '+r.status+'。時間をおいて再取得してください。');
  return {ok:true,account,data:(await r.json()).data};
 } catch(e){return {ok:false,error:e.message}}
}
export async function collect(api,{progress=()=>{},cancelled=()=>false,wait=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
 const check=()=>{if(cancelled())throw Error('取得を中止しました。以前のデータを保持しています。')};
 const p=await api('');check();
 if(p?.isMyself!==true||!p.urlname||!Number.isInteger(p.followingCount)||!Number.isInteger(p.followerCount))throw Error('ログイン本人を確認できません（表示中: @'+(p?.urlname||'不明')+'）。Chromeで自分のnoteプロフィールを開き、右上の拡張アイコンから起動し直してください。');
 const s={version:2,account:p.urlname,name:p.nickname,followingCount:p.followingCount,followerCount:p.followerCount,startedAt:new Date().toISOString(),authenticated:true,lists:{}};
 for(const kind of ['followings','followers']){
  const rows=[],ids=new Set();let first=[];
  for(let page=1;page<=50;page++){
   check();await wait(650);check();const d=await api('/'+kind+'?per=20&page='+page,p.urlname);check();
   if(Array.isArray(d)&&!d.length)break;
   if(!Array.isArray(d?.follows))throw Error('noteの応答形式が変わりました。');
   for(const u of d.follows){
    if(!Number.isInteger(u.id)||!/^\w+$/.test(u.urlname))throw Error('不正なアカウント情報です。');
    if(kind==='followings'&&(u.isFollowing!==true||typeof u.isFollowed!=='boolean'))throw Error('ログイン状態またはフォロー関係を確認できません。');
    if(ids.has(u.id))throw Error('取得中に一覧が変わりました。少し待って再取得してください。');
    ids.add(u.id);rows.push(u);
   }
   if(page===1)first=d.follows.map(u=>u.id);
   progress(kind,page,rows.length);
   if(!d.follows.length||d.isLastPage)break;
  }
  check();await wait(650);check();const again=await api('/'+kind+'?per=20&page=1',p.urlname);
  const checkFirst=Array.isArray(again)?[]:again?.follows?.map(u=>u.id);
  if(JSON.stringify(first)!==JSON.stringify(checkFirst))throw Error('取得中に一覧の先頭が変わりました。再取得してください。');
  s.lists[kind]=rows;
 }
 check();const end=await api('',p.urlname);check();
 if(end.isMyself!==true||end.id!==p.id||end.urlname!==p.urlname)throw Error('ログイン状態が変わったため中止しました。');
 if(end.followingCount!==p.followingCount||end.followerCount!==p.followerCount)throw Error('取得中に人数が変わりました。再取得してください。');
 const followers=new Set(s.lists.followers.map(u=>u.id));
 if(s.lists.followings.some(u=>followers.has(u.id)&&u.isFollowed===false))throw Error('取得した関係に不一致があります。再取得してください。');
 s.followingComplete=s.lists.followings.length===p.followingCount;s.followerComplete=s.lists.followers.length===p.followerCount;
 s.capturedAt=new Date().toISOString();return s;
}
