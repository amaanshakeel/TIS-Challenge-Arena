import { config } from './config.js';
import { getAuth, pageUrl, go } from './auth.js';
import { validateRegistration, authErrorMessage, PENDING_MESSAGE } from './validation.js';
import { fieldErrors, notice, busy, element } from './common.js';

const form=document.getElementById('registration-form');
const semester=document.getElementById('semester');
for(const value of config.semesters) {const option=element('option',`Semester ${value}`);option.value=String(value);semester.append(option);}
if(config.departments.length) {
  const input=document.getElementById('department');
  const select=element('select');select.id=input.id;select.name=input.name;select.required=true;select.setAttribute('aria-describedby','department-error');
  const blank=element('option','Choose your department');blank.value='';select.append(blank);
  for(const dept of config.departments) {const option=element('option',dept);option.value=dept;select.append(option);}
  input.replaceWith(select);
}
let submitting=false;
form.addEventListener('submit',async event=>{
  event.preventDefault();if(submitting)return;
  notice('');
  const {values,errors}=validateRegistration(Object.fromEntries(new FormData(form)),config.semesters);
  if(config.departments.length && !config.departments.includes(values.department)) errors.department='Choose a valid department.';
  fieldErrors(errors);if(Object.keys(errors).length)return;
  const button=form.querySelector('[type=submit]');submitting=true;busy(button,true,'Creating account…');
  try {
    const auth=await getAuth();
    const data=await auth.register(values,pageUrl('account.html'));
    if(!data.user) throw new Error('No signup result');
    // Supabase can deliberately obfuscate existing emails. Do not assert a new account was created.
    if(Array.isArray(data.user.identities) && data.user.identities.length===0) {
      notice('If this email is new, check your inbox for a confirmation link. If you already have an account, please sign in.','neutral');return;
    }
    form.reset();
    if(data.session) {go('account.html?registered=1');return;}
    const success=document.getElementById('registration-success');
    document.getElementById('registration-message').textContent=PENDING_MESSAGE;
    success.hidden=false;form.hidden=true;success.focus();
  } catch(error) {notice(authErrorMessage(error,'register'));}
  finally {submitting=false;busy(button,false);}
});
