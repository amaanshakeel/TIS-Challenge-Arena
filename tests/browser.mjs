import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve('.');
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const server = createServer(async (req,res) => {
  const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/arena\//,'');
  const target = resolve(root, pathname || 'index.html');
  if (!target.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { const body=await readFile(target); res.writeHead(200,{'Content-Type':types[extname(target)]??'text/plain'}).end(body); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const base = `http://127.0.0.1:${server.address().port}/arena/`;
let browser;
let checks = 0;
function checked(label) { console.log(`PASS ${label}`); checks++; }
try {
  browser = await chromium.launch({headless:true});
  const context = await browser.newContext();
  await context.route('**/js/config.js',route=>route.fulfill({contentType:'text/javascript',body:"export const config={supabaseUrl:'',supabaseKey:'',semesters:[1,2,3,4,5,6,7,8],departments:[],eventDescription:'',contactUrl:''};"}));
  const page = await context.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'index.html');
  await page.getByRole('heading',{name:'TIS Challenge Arena',exact:true}).waitFor();
  assert.equal(await page.getByText('Think. Solve. Rise.',{exact:true}).count(),1);
  checked('landing branding and repository subpath');
  await page.goto(base+'register.html');
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await page.locator('#full_name-error').filter({hasText:'Enter'}).waitFor();
  checked('inline required-field validation');
  await page.locator('#full_name').fill('Ayesha Khan');
  await page.locator('#email').fill('ayesha@example.test');
  await page.locator('#password').fill('Strong pass 123');
  await page.locator('#confirm_password').fill('Strong pass 123');
  await page.locator('#registration_number').fill('CS-001');
  await page.locator('#department').fill('Computing');
  await page.locator('#semester').selectOption('2');
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await page.locator('#notice').filter({hasText:'not configured'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Create account',exact:true}).isDisabled(),false);
  checked('missing configuration recovers without a stuck form');
  await page.goto(base+'login.html');
  await page.getByRole('button',{name:'Show password',exact:true}).click();
  assert.equal(await page.locator('#password').getAttribute('type'),'text');
  checked('password visibility control');
  await page.goto(base+'admin.html');
  await page.locator('#notice').filter({hasText:'not configured'}).waitFor();
  assert.equal(await page.locator('#protected-content').isVisible(),false);
  checked('dashboard fails closed when not configured');
  for (const width of [375,768,1440]) {
    await page.setViewportSize({width,height:900});
    for (const file of ['index.html','register.html','login.html','leaderboard.html','account.html']) {
      await page.goto(base+file);
      await page.locator('footer').waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),`${file} overflows at ${width}`);
    }
    if (width === 375) {
      await page.goto(base+'index.html');
      await page.getByRole('button',{name:'Open navigation'}).click();
      assert.equal(await page.locator('#main-navigation').isVisible(),true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#main-navigation').isVisible(),false);
    }
    checked(`responsive pages at ${width}px`);
  }
  await mkdir('test-results',{recursive:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(base+'index.html');
  await page.screenshot({path:'test-results/landing-desktop.png',fullPage:true});
  await page.setViewportSize({width:375,height:900});
  await page.goto(base+'register.html');
  await page.screenshot({path:'test-results/register-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  checked('no browser JavaScript errors');
  await context.close();

  // Fixtures replace the external Auth transport only; all application modules and UI are real.
  const fixture = await browser.newContext();
  await fixture.route('**/js/config.js',route=>route.fulfill({contentType:'text/javascript',body:"export const config={supabaseUrl:'https://fixture.supabase.co',supabaseKey:'sb_publishable_fixture',semesters:[1,2,3,4,5,6,7,8],departments:[],eventDescription:'',contactUrl:''};"}));
  await fixture.route('https://esm.sh/**',route=>route.fulfill({contentType:'text/javascript',body:`
    export function createClient(){
      const result=()=>JSON.parse(sessionStorage.getItem('fixture')||'{"session":false}');
      return {auth:{
        getSession:async()=>({data:{session:result().session?{}:null},error:null}),
        getUser:async()=>({data:{user:result().session?{id:'u'}:null},error:null}),
        signInWithPassword:async()=>{const v=result();v.session=true;sessionStorage.setItem('fixture',JSON.stringify(v));return {data:{session:{}},error:null};},
        signUp:async(args)=>{sessionStorage.setItem('signup',JSON.stringify(args));const v=result();if(v.signupError)return {data:null,error:v.signupError};return {data:{user:{id:'u',identities:v.obfuscated?[]:[{}]},session:null},error:null};},
        signOut:async()=>{const v=result();v.session=false;sessionStorage.setItem('fixture',JSON.stringify(v));return {error:null};},
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
      },from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:result().profile||null,error:null})})})})};
    }
  `}));
  const fp=await fixture.newPage();
  await fp.goto(base+'login.html');
  const student={id:'u',full_name:'Ayesha Khan',role:'student',status:'pending'};
  await fp.evaluate(p=>sessionStorage.setItem('fixture',JSON.stringify({session:true,profile:p})),student);
  await fp.goto(base+'admin.html');
  await fp.waitForURL('**/account.html');
  await fp.getByRole('heading',{name:'Verification pending'}).waitFor();
  await fp.getByText('Your registration has been received. Please visit the TIS stall for verification and further information.',{exact:true}).waitFor();
  checked('pending students routed away from admin with required message');
  for (const status of ['rejected','terminated']) {
    await fp.evaluate(p=>sessionStorage.setItem('fixture',JSON.stringify({session:true,profile:p})),{...student,status});
    await fp.goto(base+'student.html');
    await fp.waitForURL('**/account.html');
    await fp.getByRole('heading',{name:status==='rejected'?'Registration not approved':'Access restricted'}).waitFor();
  }
  checked('rejected and terminated sessions denied dashboard access');
  await fp.evaluate(p=>sessionStorage.setItem('fixture',JSON.stringify({session:true,profile:p})),{...student,status:'approved'});
  await fp.goto(base+'login.html');
  await fp.waitForURL('**/student.html');
  await fp.locator('#protected-content').waitFor({state:'visible'});
  checked('approved session restored and routed to student shell');
  await fp.evaluate(p=>sessionStorage.setItem('fixture',JSON.stringify({session:true,profile:p})),{...student,role:'admin',status:'approved'});
  await fp.goto(base+'student.html');
  await fp.waitForURL('**/admin.html');
  await fp.locator('#protected-content').waitFor({state:'visible'});
  checked('verified admin routed to admin shell');
  await fp.getByRole('button',{name:'Sign out',exact:true}).click();
  await fp.waitForURL('**/login.html');
  checked('sign-out returns to login under repository subpath');
  await fp.goto(base+'register.html');
  async function fillRegistration(){
    await fp.locator('#full_name').fill('Ayesha Khan');
    await fp.locator('#email').fill('AYESHA@example.test');
    await fp.locator('#password').fill('Strong pass 123');
    await fp.locator('#confirm_password').fill('Strong pass 123');
    await fp.locator('#registration_number').fill('CS-001');
    await fp.locator('#department').fill('Computing');
    await fp.locator('#semester').selectOption('2');
  }
  await fillRegistration();
  await fp.getByRole('button',{name:'Create account',exact:true}).click();
  await fp.locator('#registration-success').waitFor({state:'visible'});
  assert.equal(await fp.locator('#registration-message').textContent(),'Your registration has been received. Please visit the TIS stall for verification and further information.');
  const signup=await fp.evaluate(()=>JSON.parse(sessionStorage.getItem('signup')));
  assert.equal(signup.email,'ayesha@example.test');
  assert.equal(signup.options.emailRedirectTo,base+'account.html');
  assert.equal(signup.options.data.role,undefined);
  checked('registration success and email-confirmation redirect retain repository subpath');
  await fp.evaluate(()=>sessionStorage.setItem('fixture',JSON.stringify({session:false,obfuscated:true})));
  await fp.goto(base+'register.html');await fillRegistration();
  await fp.getByRole('button',{name:'Create account',exact:true}).click();
  await fp.locator('#notice').filter({hasText:'If this email is new'}).waitFor();
  assert.equal(await fp.locator('#registration-success').isVisible(),false);
  checked('obfuscated duplicate email does not falsely claim successful registration');
  await fp.evaluate(()=>sessionStorage.setItem('fixture',JSON.stringify({session:false,signupError:{message:'private SQL internal failure'}})));
  await fp.goto(base+'register.html');await fillRegistration();
  await fp.getByRole('button',{name:'Create account',exact:true}).click();
  await fp.locator('#notice').filter({hasText:'could not be completed'}).waitFor();
  assert.doesNotMatch(await fp.locator('#notice').textContent(),/private SQL/);
  assert.equal(await fp.getByRole('button',{name:'Create account',exact:true}).isDisabled(),false);
  checked('signup failures remain safe and allow retry');
  const unsafeName='<img src=x onerror="window.bad=true">';
  await fp.evaluate(p=>sessionStorage.setItem('fixture',JSON.stringify({session:true,profile:p})),{...student,status:'approved',full_name:unsafeName});
  await fp.goto(base+'student.html');
  await fp.locator('#protected-content').waitFor({state:'visible'});
  assert.equal(await fp.locator('#welcome-name').textContent(),unsafeName);
  assert.equal(await fp.locator('#welcome-name > *').count(),0);
  checked('user names render as text rather than executable HTML');
  await fp.evaluate(()=>sessionStorage.setItem('fixture',JSON.stringify({session:true,profile:null})));
  await fp.goto(base+'student.html');await fp.waitForURL('**/account.html');
  await fp.getByRole('heading',{name:'Account information unavailable'}).waitFor();
  assert.equal(await fp.getByRole('button',{name:'Sign out',exact:true}).isVisible(),true);
  checked('missing profile fails closed and retains sign-out');
  await fixture.close();
  console.log(`${checks} browser checks passed. Auth transport was a fixture, not live Supabase.`);
} finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
