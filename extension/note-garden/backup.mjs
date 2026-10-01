export function validateBackup(input){
 const s=input?.snapshot;if(!s||!/^\w+$/.test(s.account)||!Number.isFinite(Date.parse(s.capturedAt)))throw Error('対応するバックアップではありません。');
 const str=(x,n)=>typeof x==='string'?x.slice(0,n):'';
 const user=u=>{if(!Number.isSafeInteger(u?.id)||u.id<=0||!/^\w+$/.test(u.urlname))throw Error('アカウント情報が不正です。');return {id:u.id,urlname:u.urlname,nickname:str(u.nickname,200),profile:str(u.profile,5000),followerCount:Number.isSafeInteger(u.followerCount)&&u.followerCount>=0?u.followerCount:0}};
 const snapshot={version:2,account:s.account,name:str(s.name,200),capturedAt:s.capturedAt,authenticated:false,followingComplete:false,followerComplete:false,imported:true,lists:{}};
 for(const k of ['followingCount','followerCount']){if(!Number.isSafeInteger(s[k])||s[k]<0)throw Error('人数が不正です。');snapshot[k]=s[k]}
 for(const k of ['followings','followers']){const list=s.lists?.[k];if(!Array.isArray(list)||list.length>10000)throw Error('一覧が不正です。');snapshot.lists[k]=list.map(user);if(new Set(snapshot.lists[k].map(u=>u.id)).size!==list.length)throw Error('重複データがあります。')}
 if(snapshot.lists.followings.length>snapshot.followingCount||snapshot.lists.followers.length>snapshot.followerCount)throw Error('総数と一覧が一致しません。');
 const history={};const entries=Object.entries(input.history||{});if(entries.length>20000)throw Error('履歴が大きすぎます。');
 for(const [id,m] of entries){if(!/^[1-9]\d*$/.test(id)||!m||typeof m!=='object')throw Error('履歴が不正です。');const clean={};for(const k of ['protected','hold','reviewed','baseline','missing'])clean[k]=m[k]===true;clean.memo=str(m.memo,1000);for(const k of ['firstSeen','lastSeen'])clean[k]=Number.isFinite(Date.parse(m[k]))?m[k]:s.capturedAt;clean.user=m.user?user(m.user):undefined;if(clean.user&&String(clean.user.id)!==id)throw Error('履歴IDが不一致です。');history[id]=clean}
 return {snapshot,history};
}
