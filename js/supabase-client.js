import { config } from './config.js';

let clientPromise;
export function getClient() {
  if (!clientPromise) clientPromise = initialize().catch(error => { clientPromise = undefined; throw error; });
  return clientPromise;
}

async function initialize() {
  let url;
  try { url = new URL(config.supabaseUrl); } catch { throw { code:'configuration' }; }
  if (url.protocol !== 'https:' || !config.supabaseKey || config.supabaseKey.startsWith('sb_secret_')) throw { code:'configuration' };
  if (config.supabaseKey.startsWith('eyJ')) {
    try {
      const payload = config.supabaseKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      if (JSON.parse(atob(payload)).role !== 'anon') throw new Error('Not a public key');
    } catch { throw { code:'configuration' }; }
  } else if (!config.supabaseKey.startsWith('sb_publishable_')) throw { code:'configuration' };
  let createClient;
  try {
    ({ createClient } = await import('https://esm.sh/@supabase/supabase-js@2.57.4?bundle'));
  } catch { throw { code:'client_load' }; }
  return createClient(url.href, config.supabaseKey, {
    auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:'implicit' },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15000) }) },
  });
}
