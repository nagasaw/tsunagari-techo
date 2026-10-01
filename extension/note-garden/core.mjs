export function relation(user,snapshot) {
 if(snapshot.authenticated===true && typeof user.isFollowed==='boolean') return user.isFollowed?'mutual':'oneway';
 if(snapshot.lists.followers.some(x=>String(x.id)===String(user.id))) return 'mutual';
 return snapshot.followerComplete?'oneway':'unknown';
}
export function mergeHistory(snapshot,previous,history={}) {
 const out=structuredClone(history), before=new Map((previous?.lists.followings||[]).map(u=>[String(u.id),u]));
 // Migrate old history entries before the current list replaces them.
 for(const [id,u] of before){out[id]={...out[id],user:u,lastSeen:out[id]?.lastSeen||previous.capturedAt,firstSeen:out[id]?.firstSeen||previous.capturedAt}}
 const present=new Set(snapshot.lists.followings.map(u=>String(u.id)));
 for(const [id,m] of Object.entries(out))if(!present.has(id)){
  m.missing=true;m.change='今回は未確認';m.missingSince=m.missingSince||snapshot.capturedAt;
 }
 for(const u of snapshot.lists.followings){
  const id=String(u.id),old=out[id]||{},status=relation(u,snapshot),prev=before.has(id)?relation(before.get(id),previous):null;
  out[id]={...old,user:u,missing:false,missingSince:null,firstSeen:old.firstSeen||snapshot.capturedAt,baseline:old.baseline??!previous?.followingComplete,lastSeen:snapshot.capturedAt,
   change:old.missing?'再び確認':prev&&prev!=='unknown'&&status!=='unknown'&&prev!==status?(status==='mutual'?'相互になった':'片思いになった'):(!before.has(id)&&previous?.followingComplete?'新しく確認':'')};
 }
 return out;
}
export function eligible(meta,days,now=Date.now()) {
 return !meta.missing&&!meta.protected&&!meta.hold&&!meta.reviewed&&!(days&&!meta.baseline&&now-Date.parse(meta.firstSeen)<days*86400000);
}
