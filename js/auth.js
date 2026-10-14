import { getClient } from './supabase-client.js';
import { createAuthService } from './auth-service.js';
import { destination } from './access.js';
import { authErrorMessage } from './validation.js';
import { notice, busy } from './common.js';

export async function getAuth() { return createAuthService(await getClient()); }
export function go(page) { location.replace(new URL(page,location.href).href); }
export function pageUrl(page) { return new URL(page,location.href).href; }

export function attachSignOut(auth) {
  for(const button of document.querySelectorAll('[data-sign-out]')) {
    button.addEventListener('click',async()=>{
      busy(button,true,'Signing out…');
      try {await (auth ?? await getAuth()).signOut();go('login.html');}
      catch(error) {notice(authErrorMessage(error));busy(button,false);}
    });
  }
}

export async function guard(expectedPage, render) {
  const content=document.getElementById('protected-content');
  const loading=document.getElementById('loading-state');
  attachSignOut();
  let checking=false;
  async function check() {
    if(checking) return;
    checking=true;document.dispatchEvent(new Event('access:checking'));content.hidden=true;loading.hidden=false;notice('');
    try {
      const auth=await getAuth();
      if(!await auth.hasSession()) {go('login.html');return;}
      const profile=await auth.currentProfile();
      if (!profile) {go('account.html');return;}
      const target=destination(profile);
      if(target!==expectedPage) {go(target);return;}
      render(profile);content.hidden=false;
    } catch(error) {document.dispatchEvent(new Event('access:blocked'));notice(authErrorMessage(error));}
    finally {checking=false;loading.hidden=true;}
  }
  await check();
  try {
    const client=await getClient();
    client.auth.onAuthStateChange(event=>{
      if(['SIGNED_OUT','TOKEN_REFRESHED','USER_UPDATED'].includes(event)) setTimeout(check,0);
    });
  } catch { /* check already displayed the initialization error. */ }
  document.getElementById('retry-access')?.addEventListener('click',check);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible') check();});
  window.addEventListener('pageshow',event=>{if(event.persisted) check();});
}
