// Optional Cloudflare Worker CORS proxy. Deploy, then set PROXY in index.html to "https://YOUR-WORKER.workers.dev/?u="
export default{async fetch(r){const u=new URL(r.url).searchParams.get('u');if(!u)return new Response('missing u',{status:400});
const x=await fetch(u,{headers:{'user-agent':'Mozilla/5.0'}});const h=new Headers(x.headers);h.set('access-control-allow-origin','*');return new Response(x.body,{status:x.status,headers:h})}}
