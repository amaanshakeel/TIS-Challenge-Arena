import { config } from './config.js';

export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function link(text, href, className) {
  const node = element('a',text,className); node.href=href; return node;
}

function brand() {
  const node=link('', 'index.html','brand');
  node.setAttribute('aria-label','TIS Challenge Arena home');
  const mark=element('span','TIS','brand-mark');
  const img=element('img'); img.src='assets/puzzles/tis-logo.jpeg'; img.alt=''; img.hidden=true;
  img.addEventListener('load',()=>{img.hidden=false;mark.replaceChildren(img);mark.classList.add('brand-mark-logo');});
  img.addEventListener('error',()=>img.remove(),{once:true});
  mark.append(img);
  const name=element('span',undefined,'brand-name');
  name.append(element('strong','TIS'),element('span','Challenge Arena'));
  node.append(mark,name); return node;
}

function initializeShell() {
  const header=document.querySelector('[data-site-header]');
  if (header) {
    const inner=element('div',undefined,'container nav-shell');
    const button=element('button','☰','nav-toggle'); button.type='button'; button.setAttribute('aria-label','Open navigation'); button.setAttribute('aria-controls','main-navigation'); button.setAttribute('aria-expanded','false');
    const nav=element('nav'); nav.id='main-navigation'; nav.setAttribute('aria-label','Main navigation');
    const entries=[['Home','index.html'],['How it works','index.html#how-it-works'],['Leaderboard','leaderboard.html'],['Login','login.html'],['Join challenge','register.html']];
    for (const [title,href] of entries) {
      const item=link(title,href,title==='Join challenge'?'button button-small':undefined);
      if (location.pathname.endsWith('/'+href)) item.setAttribute('aria-current','page');
      nav.append(item);
    }
    function close() { nav.classList.remove('is-open'); button.setAttribute('aria-expanded','false'); button.setAttribute('aria-label','Open navigation'); }
    button.addEventListener('click',()=>{ const open=nav.classList.toggle('is-open');button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Close navigation':'Open navigation'); });
    nav.addEventListener('click',close);
    document.addEventListener('keydown',event=>{if(event.key==='Escape' && nav.classList.contains('is-open')) {close();button.focus();}});
    inner.append(brand(),button,nav);header.append(inner);
  }
  const footer=document.querySelector('[data-site-footer]');
  if (footer) {
    const inner=element('div',undefined,'container footer-grid');
    const identity=element('div');identity.append(element('strong','Tech and Innovative Society (TIS)'),element('p','TIS Challenge Arena · Think. Solve. Rise.','muted'));
    const nav=element('nav',undefined,'footer-links');nav.setAttribute('aria-label','Footer navigation');
    nav.append(link('Home','index.html'),link('Leaderboard','leaderboard.html'),link('Register','register.html'));
    if (config.contactUrl) {
      try {const url=new URL(config.contactUrl);if(['https:','mailto:'].includes(url.protocol)) nav.append(link('Contact TIS',url.href));} catch { /* Optional configuration is omitted if invalid. */ }
    }
    inner.append(identity,nav,element('small',`© ${new Date().getFullYear()} Tech and Innovative Society (TIS).`,'copyright muted'));footer.append(inner);
  }
  for (const button of document.querySelectorAll('[data-password-toggle]')) {
    button.addEventListener('click',()=>{
      const input=document.getElementById(button.dataset.passwordToggle);
      const shown=input.type==='password';input.type=shown?'text':'password';button.textContent=shown?'Hide':'Show';button.setAttribute('aria-label',`${shown?'Hide':'Show'} password`);button.setAttribute('aria-pressed',String(shown));
    });
  }
  const event=document.querySelector('[data-event-description]');
  if (event && config.eventDescription) {event.textContent=config.eventDescription;event.hidden=false;}
}

export function notice(message,tone='error') {
  const node=document.getElementById('notice');
  if (!node) return;
  node.textContent=message;node.className=`notice ${tone}`;node.hidden=!message;
}

export function fieldErrors(errors) {
  document.querySelectorAll('[data-field-error]').forEach(node=>{node.textContent='';});
  document.querySelectorAll('[aria-invalid]').forEach(node=>node.removeAttribute('aria-invalid'));
  for (const [field,message] of Object.entries(errors)) {
    const input=document.getElementById(field), error=document.getElementById(`${field}-error`);
    if(input) input.setAttribute('aria-invalid','true');
    if(error) error.textContent=message;
  }
  const first=Object.keys(errors)[0]; if(first) document.getElementById(first)?.focus();
}

export function busy(button,loading,label) {
  if (!button.dataset.idleLabel) button.dataset.idleLabel=button.textContent;
  button.disabled=loading;button.textContent=loading?label:button.dataset.idleLabel;
}

initializeShell();
