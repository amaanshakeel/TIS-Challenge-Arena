import { getAuth,go } from './auth.js';
import { destination } from './access.js';
import { notice,busy,fieldErrors } from './common.js';
import { authErrorMessage } from './validation.js';

const form=document.getElementById('login-form');
let submitting=false;
form.addEventListener('submit',async event=>{
  event.preventDefault();if(submitting)return;notice('');
  const data=Object.fromEntries(new FormData(form));const errors={};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) errors.email='Enter a valid email address.';
  if(!data.password) errors.password='Enter your password.';
  fieldErrors(errors);if(Object.keys(errors).length)return;
  const button=form.querySelector('[type=submit]');submitting=true;busy(button,true,'Signing in…');
  try {const auth=await getAuth();await auth.login(data.email,data.password);go(destination(await auth.currentProfile()));}
  catch(error){notice(authErrorMessage(error));}
  finally{submitting=false;busy(button,false);}
});

try {const auth=await getAuth();if(await auth.hasSession())go(destination(await auth.currentProfile()));}
catch(error){notice(authErrorMessage(error));}
