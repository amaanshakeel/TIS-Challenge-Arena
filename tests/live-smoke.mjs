import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import assert from 'node:assert/strict';

// Optional read-only probe of the real pinned client and configured project. No signup or writes.
const root=resolve('.'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const server=createServer(async(req,res)=>{const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/arena\//,'');const target=resolve(root,path||'index.html');if(!target.startsWith(root+sep)){res.writeHead(403).end();return;}try{const body=await readFile(target);res.writeHead(200,{'Content-Type':types[extname(target)]??'text/plain'}).end(body);}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage();page.setDefaultTimeout(30000);
  await page.goto(`http://127.0.0.1:${server.address().port}/arena/login.html`);
  const result=await page.evaluate(async()=>{
    const {getClient}=await import(new URL('js/supabase-client.js',document.baseURI).href);const client=await getClient();
    const profile=await client.from('profiles').select('id').limit(1),admin=await client.rpc('admin_overview');
    const {data:session,error}=await client.auth.getSession();
    return {clientLoaded:Boolean(client.auth),profileError:profile.error?.code,adminError:admin.error?.code,sessionPresent:Boolean(session.session),sessionError:Boolean(error)};
  });
  assert.equal(result.clientLoaded,true);assert.equal(result.profileError,'42501');assert.equal(result.adminError,'42501');assert.equal(result.sessionPresent,false);assert.equal(result.sessionError,false);
  console.log('PASS real pinned Supabase browser client loads under repository subpath; unauthenticated profile/admin reads are denied; no session is fabricated.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
