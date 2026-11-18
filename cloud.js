/* UIDrop accounts, cloud projects and sharing.
   Runs as an ES module after the editor script, and talks to the app through window.UICloudBridge.
   Everything degrades to local-only when no Supabase project is configured. */
const CFG = window.UICLOUD_CONFIG || {};
const ON = !!(CFG.url && CFG.anonKey);
const B = () => window.UICloudBridge || {};
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

let sb = null;
let user = null;
let mode = 'signup';
let shareId = null;
let members = [];
const queue = new Map();
let flushTimer = 0;
let sharedRole = {};

function toast(m) { try { B().toast ? B().toast(m) : console.log(m) } catch (_) { } }

/* ---------------- auth UI ---------------- */
function setMode(next) {
  mode = next;
  const signup = mode === 'signup';
  $('#atitle').textContent = signup ? 'Create a UIDrop account' : 'Log in to UIDrop';
  $('#asub').textContent = signup
    ? 'Save your designs to your account and invite other people to edit them.'
    : 'Welcome back. Your projects and shared designs are waiting.';
  $('#aname').parentElement && ($('#anamelab').hidden = !signup);
  $('#aname').hidden = !signup;
  $('#authgo').textContent = signup ? 'Create account' : 'Log in';
  $('#authswitch').innerHTML = signup
    ? 'Already have an account? <button class="link" id="authflip" type="button">Log in</button>'
    : 'New here? <button class="link" id="authflip" type="button">Create an account</button>';
  $('#apass').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
  authError('');
  wireFlip();
}

function authError(m) {
  const el = $('#autherr');
  if (!el) return;
  el.textContent = m || '';
  el.hidden = !m;
}

function wireFlip() {
  const f = $('#authflip');
  if (f) f.onclick = () => setMode(mode === 'signup' ? 'login' : 'signup');
}

function openAuth(which) {
  setMode(which === 'login' ? 'login' : 'signup');
  $('#authform').hidden = true;
  $('#authmodal').classList.add('on');
  if (!ON) authError('Accounts are not connected yet. Add your Supabase project URL and anon key to enable them.');
  else setTimeout(() => ($('#aemail').focus()), 80);
}

function closeAuth() { $('#authmodal').classList.remove('on'); }

async function submitAuth(e) {
  e.preventDefault();
  if (!ON) { authError('Accounts are not connected yet. Add your Supabase project URL and anon key.'); return; }
  const email = $('#aemail').value.trim();
  const pass = $('#apass').value;
  const name = ($('#aname').value || '').trim();
  if (!email || !pass) { authError('Enter your email and password.'); return; }
  if (mode === 'signup' && pass.length < 6) { authError('Use at least 6 characters for the password.'); return; }
  const btn = $('#authgo');
  btn.disabled = true;
  btn.textContent = mode === 'signup' ? 'Creating account…' : 'Logging in…';
  authError('');
  try {
    if (mode === 'signup') {
      const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { full_name: name || email.split('@')[0] } } });
      if (error) throw error;
      if (!data.session) {
        authError('Check your inbox to confirm this email, then log in.');
        btn.disabled = false;
        btn.textContent = 'Create account';
        return;
      }
      toast('Account created');
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
    }
    $('#authform').hidden = true;
    closeAuth();
  } catch (err) {
    const m = String(err && err.message || err);
    authError(/invalid login/i.test(m) ? 'That email and password do not match an account.'
      : /already registered|already exists/i.test(m) ? 'That email already has an account. Log in instead.'
        : /rate limit/i.test(m) ? 'Too many attempts. Wait a minute and try again.'
          : m);
  } finally {
    btn.disabled = false;
    btn.textContent = mode === 'signup' ? 'Create account' : 'Log in';
  }
}

async function googleAuth() {
  if (!ON) { authError('Accounts are not connected yet. Add your Supabase project URL and anon key.'); return; }
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  if (error) authError(/provider is not enabled/i.test(error.message) ? 'Google sign-in is not switched on for this project yet. Use email instead.' : error.message);
}

function initials(name, email) {
  const src = (name || email || 'U').trim();
  const bits = src.split(/[\s@._-]+/).filter(Boolean);
  return ((bits[0] || 'U')[0] + (bits[1] ? bits[1][0] : '')).toUpperCase();
}

function renderAccount() {
  const signed = !!user;
  const acct = $('#acct'), actions = $('#authActions');
  if (!acct || !actions) return;
  acct.hidden = !signed;
  actions.hidden = signed;
  if (!signed) return;
  const name = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || (user.email || '').split('@')[0];
  profileName = name;
  $('#acctav').textContent = initials(name, user.email);
  $('#acctname').textContent = name;
  $('#acctmail').textContent = user.email || '';
  if (!ON) return;
}

function wireHeader() {
  $('#loginb') && ($('#loginb').onclick = () => openAuth('login'));
  $('#signupb') && ($('#signupb').onclick = () => openAuth('signup'));
  const btn = $('#acctbtn'), menu = $('#acctmenu');
  if (btn && menu) btn.onclick = () => {
    const open = menu.hidden;
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };
  $('#logoutb') && ($('#logoutb').onclick = async () => {
    $('#acctmenu').hidden = true;
    await sb.auth.signOut();
  });
  $('#authx') && ($('#authx').onclick = closeAuth);
  $('#authemail') && ($('#authemail').onclick = () => { $('#authform').hidden = false; authError(''); $('#aemail').focus(); });
  $('#authgoogle') && ($('#authgoogle').onclick = googleAuth);
  $('#authform') && ($('#authform').onsubmit = submitAuth);
  const am = $('#authmodal');
  if (am) am.onclick = (e) => { if (e.target === am) closeAuth(); };
}

/* ---------------- cloud projects ---------------- */
const clean = (p) => {
  const out = { ...p };
  delete out.cloud; delete out.role; delete out.owner; delete out.sharedBy;
  return out;
};

function toEntry(row, role) {
  const d = row.data || {};
  return {
    ...d,
    id: row.id,
    name: row.name || d.name || 'Untitled',
    device: row.device || d.device || 'pc',
    updated: row.updated_at ? Date.parse(row.updated_at) : Date.now(),
    cloud: true,
    role: role || (row.owner === user.id ? 'owner' : 'view')
  };
}

async function pull(claimLocal) {
  if (!sb || !user) return;
  try {
    const [proj, mem] = await Promise.all([
      sb.from('projects').select('id,name,device,owner,data,updated_at'),
      sb.from('project_members').select('project_id,role')
    ]);
    if (proj.error) throw proj.error;
    sharedRole = {};
    (mem.data || []).forEach((m) => { sharedRole[m.project_id] = m.role; });
    const rows = proj.data || [];
    const have = new Set(rows.map((r) => r.id));
    const local = (B().mem || []).filter((p) => !p.cloud && !have.has(p.id));
    if (claimLocal && local.length) {
      for (const p of local) await pushNow(p, true);
      return pull(false);
    }
    const entries = rows.map((r) => toEntry(r, r.owner === user.id ? 'owner' : (sharedRole[r.id] || 'view')))
      .sort((a, b) => (b.updated || 0) - (a.updated || 0));
    const leftovers = (B().mem || []).filter((p) => !p.cloud && !rows.some((r) => r.id === p.id));
    B().mem = entries.concat(leftovers);
    if (B().reload) B().reload();
  } catch (err) {
    toast('Could not load your projects: ' + (err.message || err));
  }
}

async function pushNow(p, claim) {
  if (!sb || !user || !p || !p.id) return;
  const name = p.name || 'Untitled';
  const device = p.device || 'pc';
  const data = clean(p);
  try {
    if (p.role && p.role !== 'owner' && !claim) {
      const { error } = await sb.from('projects').update({ name, device, data, updated_at: new Date().toISOString() }).eq('id', p.id);
      if (error) throw error;
    } else {
      let { error } = await sb.from('projects').upsert({
        id: p.id, owner: user.id, name, device, data, updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
      if (error && /duplicate|conflict|policy/i.test(error.message || '')) {
        p.id = p.id + '-' + Math.random().toString(36).slice(2, 6);
        ({ error } = await sb.from('projects').upsert({
          id: p.id, owner: user.id, name, device, data, updated_at: new Date().toISOString()
        }, { onConflict: 'id' }));
      }
      if (error) throw error;
      p.role = 'owner';
    }
    p.cloud = true;
  } catch (err) {
    console.warn('save failed', err);
  }
}

function queuePush(p) {
  if (!sb || !user || !p) return;
  p.cloud = true;
  queue.set(p.id, p);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 700);
}

async function flush() {
  const items = [...queue.values()];
  queue.clear();
  for (const p of items) await pushNow(p);
}

async function deleteProject(id) {
  if (!sb || !user) return;
  const p = (B().mem || []).find((x) => String(x.id) === String(id));
  try {
    if (p && p.role && p.role !== 'owner') {
      const { error } = await sb.from('project_members').delete().eq('project_id', id).eq('user_id', user.id);
      if (error) throw error;
    } else {
      const { error } = await sb.from('projects').delete().eq('id', id);
      if (error) throw error;
    }
  } catch (err) { toast('Could not remove the project online: ' + (err.message || err)); }
}

async function handleCardClick(e) {
  const btn = e.target.closest('[data-o]');
  if (!btn || !sb || !user) return;
  const p = (B().mem || []).find((x) => String(x.id) === String(btn.dataset.o));
  if (!p || !p.cloud) return;
  e.preventDefault();
  e.stopPropagation();
  try {
    const { data, error } = await sb.from('projects').select('id,name,device,owner,data,updated_at').eq('id', p.id).maybeSingle();
    if (!error && data) {
      const fresh = toEntry(data, data.owner === user.id ? 'owner' : (sharedRole[p.id] || 'view'));
      B().mem = (B().mem || []).map((x) => (String(x.id) === String(fresh.id) ? fresh : x));
      B().open(fresh);
      return;
    }
  } catch (_) { }
  B().open(p);
}

/* ---------------- home screen extras ---------------- */
function decorateHome() {
  const grid = $('#grid');
  if (!grid) return;
  document.querySelectorAll('.pcard .badge, .pcard [data-share]').forEach((n) => n.remove());
  if (!user) {
    const wrap = $('#sharedWrap');
    if (wrap) wrap.remove();
    return;
  }
  const all = B().mem || [];
  all.forEach((p) => {
    const card = grid.querySelector('.pcard .acts [data-o="' + String(p.id).replace(/"/g, '') + '"]');
    if (!card) return;
    const acts = card.parentElement;
    const box = acts.closest('.pcard');
    if (p.role && p.role !== 'owner') {
      const b = document.createElement('small');
      b.className = 'badge';
      b.textContent = p.role === 'edit' ? 'Shared with you' : 'Read only';
      box.insertBefore(b, acts);
    } else {
      const s = document.createElement('button');
      s.className = 'btn';
      s.type = 'button';
      s.dataset.share = p.id;
      s.textContent = 'Share';
      acts.appendChild(s);
    }
  });
  renderShared();
}

function renderShared() {
  const all = B().mem || [];
  const shared = all.filter((p) => p.role && p.role !== 'owner');
  let wrap = $('#sharedWrap');
  if (!shared.length) { if (wrap) wrap.remove(); return; }
  if (!wrap) {
    wrap = document.createElement('section');
    wrap.id = 'sharedWrap';
    wrap.className = 'sharedwrap';
    $('#grid').after(wrap);
  }
  wrap.innerHTML = '<h2>Shared with you</h2><div class="sharedgrid">' + shared.map((p) => {
    const owner = p.owner_email ? esc(p.owner_email) : 'another account';
    return '<div class="pcard"><div class="th">' + (p.thumb ? '<img alt="" src="' + p.thumb + '">' : '') + '</div><b>' + esc(p.name || 'Untitled') + '</b>'
      + '<small>' + esc((window.DEV && DEV[p.device] ? DEV[p.device].n : 'Design')) + (p.role === 'edit' ? ' · can edit' : ' · read only') + '</small>'
      + '<div class="acts"><button class="btn" data-o="' + esc(p.id) + '">Open</button></div></div>';
  }).join('') + '</div>';
}

/* ---------------- share dialog ---------------- */
async function openShare(id) {
  shareId = id;
  const p = (B().mem || []).find((x) => String(x.id) === String(id));
  $('#shmail').value = '';
  $('#shrole').value = 'edit';
  shareError('');
  members = [];
  $('#sharemodal').classList.add('on');
  renderMembers();
  if (p) $('#shtitle').textContent = 'Share “' + (p.name || 'Untitled') + '”';
  await loadMembers();
}

function shareError(m) {
  const el = $('#sherr');
  if (!el) return;
  el.textContent = m || '';
  el.hidden = !m;
}

async function loadMembers() {
  if (!sb || !user || !shareId) return;
  const { data, error } = await sb.rpc('list_project_members', { p_project_id: shareId });
  if (error) { shareError(/function|does not exist/i.test(error.message) ? 'Run supabase/schema.sql in your Supabase project to enable sharing.' : error.message); return; }
  members = data || [];
  renderMembers();
}

function renderMembers() {
  const box = $('#shlist');
  if (!box) return;
  if (!members.length) { box.innerHTML = '<p class="hint" style="margin:10px 0 0">Only you can open this project right now.</p>'; return; }
  box.innerHTML = members.map((m) => '<div class="shrow"><span class="shav">' + esc(initials(m.display_name, m.email)) + '</span>'
    + '<span class="shwho"><b>' + esc(m.display_name || m.email) + '</b><small>' + esc(m.email) + ' · ' + (m.member_role === 'view' ? 'can view' : 'can edit') + '</small></span>'
    + '<button class="btn sm" type="button" data-rm="' + esc(m.member_id) + '">Remove</button></div>').join('');
  box.querySelectorAll('[data-rm]').forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      const { error } = await sb.from('project_members').delete().eq('project_id', shareId).eq('user_id', b.dataset.rm);
      if (error) { shareError(error.message); b.disabled = false; return; }
      await loadMembers();
      toast('Access removed');
    };
  });
}

async function doShare() {
  const email = $('#shmail').value.trim();
  const role = $('#shrole').value;
  if (!email) { shareError('Enter the email of the account you want to invite.'); return; }
  if (!sb || !user) { shareError('Log in first.'); return; }
  const btn = $('#shgo');
  btn.disabled = true;
  shareError('');
  try {
    const { data, error } = await sb.rpc('share_project', { p_project_id: shareId, p_email: email, p_role: role });
    if (error) throw error;
    members = data || [];
    renderMembers();
    $('#shmail').value = '';
    toast('Project shared with ' + email);
  } catch (err) {
    const m = String(err.message || err);
    shareError(/no uidrop account/i.test(m) ? 'No account uses that email yet. Ask them to sign up first.'
      : /only the owner/i.test(m) ? 'Only the project owner can invite people.'
        : /your own account/i.test(m) ? 'That is your own email — you already have access.'
          : /does not exist|function/i.test(m) ? 'Run supabase/schema.sql in your Supabase project to enable sharing.'
            : m);
  } finally { btn.disabled = false; }
}

/* ---------------- boot ---------------- */
async function boot() {
  wireHeader();
  setMode('signup');
  const shareModal = $('#sharemodal');
  if (shareModal) shareModal.onclick = (e) => { if (e.target === shareModal) shareModal.classList.remove('on'); };
  $('#shclose') && ($('#shclose').onclick = () => shareModal.classList.remove('on'));
  $('#shgo') && ($('#shgo').onclick = doShare);
  $('#sharemodal') && $('#shmail') && ($('#shmail').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); doShare(); } });
  $('#grid') && $('#grid').addEventListener('click', handleCardClick, true);
  document.addEventListener('click', (e) => {
    const s = e.target.closest('[data-share]');
    if (s) { e.preventDefault(); openShare(s.dataset.share); }
  });

  window.Cloud = {
    queuePush,
    deleteProject,
    decorateHome,
    get user() { return user; }
  };

  if (!ON) { renderAccount(); return; }

  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  sb = createClient(CFG.url, CFG.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });

  const { data } = await sb.auth.getSession();
  user = data && data.session ? data.session.user : null;
  renderAccount();
  if (user) await pull(true);

  sb.auth.onAuthStateChange(async (_evt, session) => {
    const was = user ? user.id : null;
    user = session ? session.user : null;
    const now = user ? user.id : null;
    renderAccount();
    if (now && now !== was) {
      await pull(was === null);
      toast('Signed in as ' + ((user.user_metadata && user.user_metadata.full_name) || user.email));
    } else if (!now && was) {
      B().mem = (B().mem || []).filter((p) => !p.cloud);
      if (B().reload) B().reload();
      toast('Logged out');
    }
  });
}

boot();
