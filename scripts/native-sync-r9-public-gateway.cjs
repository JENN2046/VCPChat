'use strict';
function allowed(method,raw){
 if(!['GET','POST'].includes(method)||/[\\\x00-\x20]/.test(raw))return false;
 let url;try{url=new URL(raw,'http://local');}catch{return false;}
 if(url.origin!=='http://local'||/%/.test(url.pathname))return false;
 const p=url.pathname;
 if(method==='GET')return /^\/mobile\/(?:index\.html|icon\.svg|icon-(?:192|512)\.png|manifest\.webmanifest|sw\.js)?$/.test(p)||/^\/mobile\/assets\/[A-Za-z0-9._-]+\.(?:js|css)$/.test(p)||/^\/mobile\/api\/(?:session|conversations(?:\/(?:test-topic|second-topic))?)$/.test(p);
 return p==='/mobile/api/pair'||/^\/mobile\/api\/conversations\/(?:test-topic|second-topic)\/messages$/.test(p)||/^\/mobile\/api\/executions\/[A-Za-z0-9_-]+\/cancel$/.test(p);
}
module.exports={allowed};
