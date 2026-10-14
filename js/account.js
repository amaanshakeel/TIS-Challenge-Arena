import { getAuth,go,attachSignOut } from './auth.js';
import { destination, accountState } from './access.js';
import { PENDING_MESSAGE,authErrorMessage } from './validation.js';
import { notice,busy } from './common.js';

const title=document.getElementById('account-title'), message=document.getElementById('account-message');
const pending=document.getElementById('pending-message');
const refresh=document.getElementById('refresh-status');
let checking=false;
const hash=new URLSearchParams(location.hash.slice(1));
const callbackError=hash.has('error') || hash.has('error_code') || new URLSearchParams(location.search).has('error');
if(callbackError) history.replaceState(null,'',location.pathname);

async function check() {
  if(checking)return;checking=true;busy(refresh,true,'Checking status…');
  pending.hidden=true;
  try {
    const auth=await getAuth();
    if(!await auth.hasSession()) {
      document.getElementById('account-actions').hidden=true;
      title.textContent=callbackError?'Confirmation link unavailable':'Confirm your email or sign in';
      message.textContent=callbackError?'This confirmation link could not be used. It may have expired or already been used. Try signing in, or visit the TIS stall for help.':'If email confirmation is enabled, use the link in your inbox, then sign in to check your verification status. Approval by TIS is still required before you can participate.';
      document.getElementById('sign-in-link').hidden=false;return;
    }
    document.getElementById('account-actions').hidden=false;
    const profile=await auth.currentProfile();
    const target=destination(profile);
    if(profile && target!=='account.html'){go(target);return;}
    const state=accountState(profile);title.textContent=state.title;message.textContent=state.message;
    if(profile?.status==='pending'){pending.textContent=PENDING_MESSAGE;pending.hidden=false;}
    document.getElementById('account-actions').hidden=false;
    document.getElementById('sign-in-link').hidden=true;
    notice('');
  }catch(error){title.textContent='Unable to check your account';message.textContent='Please try again when your connection is available.';notice(authErrorMessage(error));}
  finally{checking=false;busy(refresh,false);}
}
attachSignOut();
refresh.addEventListener('click',check);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check();});
await check();
