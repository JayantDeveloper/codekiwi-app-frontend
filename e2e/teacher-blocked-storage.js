// Teacher-view regression check under Chrome's real "Block all cookies" setting.
// Usage: node e2e/teacher-blocked-storage.js <baseUrl> <sessionCode> <teacherToken>
// Needs playwright (npm i -D playwright) and a session created via the backend /api/sessions/upload.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const [base, code, tok] = process.argv.slice(2);
const R = {}; const ok = (k, v) => { R[k] = v; };
(async () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ck-prof-'));
  fs.mkdirSync(path.join(dir, 'Default'));
  fs.writeFileSync(path.join(dir, 'Default', 'Preferences'), JSON.stringify({ profile: { default_content_setting_values: { cookies: 2 }, cookie_controls_mode: 1 } }));
  const tctx = await chromium.launchPersistentContext(dir, { channel: 'chrome', headless: true, viewport: { width: 1400, height: 850 } });
  const t = await tctx.newPage();
  let dialog = null; t.on('dialog', d => { dialog = d.message(); d.dismiss(); });
  const b = await chromium.launch({ channel: 'chrome' });
  const s = await (await b.newContext({ viewport: { width: 1400, height: 850 } })).newPage();
  let sSlide = null, sLocked = null, sEnded = false, sDemo = null;
  s.on('websocket', ws => ws.on('framereceived', f => { try { const d = JSON.parse(String(f.payload));
    if (d.type === 'sync') sSlide = d.slide; if (d.type === 'lock-editors') sLocked = d.locked; if (d.type === 'session-ended' && d.sessionCode === code) sEnded = true; if (d.type === 'demo-run') sDemo = d.output; } catch {} }));
  let leaks = []; const chk = (where) => { if (/[?&]t=/.test(t.url())) leaks.push(where); };
  const nav = async () => (await t.locator('.slide-controls').innerText()).replace(/\s+/g, ' ');

  await t.goto(`${base}/teacher/${code}?t=${tok}`); await t.waitForTimeout(3000);
  ok('storage blocked in teacher tab', await t.evaluate(() => { try { sessionStorage.getItem('x'); return false; } catch { return true; } }));
  await s.goto(`${base}/student/${code}`); await s.waitForTimeout(2000);
  await s.fill('input', 'Kid A'); await s.click('text=Join Session'); await s.waitForTimeout(4500);
  await t.click('text=Start Class').catch(() => {}); await t.waitForTimeout(800);
  chk('1 student count shown'); ok('1 student count shown', /1 student/.test(await nav()));
  await t.evaluate(() => { const bs = [...document.querySelectorAll('.slide-controls button')]; bs.find(x => /›|→|next/i.test(x.innerText + x.title + x.getAttribute('aria-label')))?.click(); });
  await t.waitForTimeout(2000);
  ok('4 student follows to slide 2', sSlide === 1);
  await t.click('text=Editor'); await t.waitForTimeout(1500);
  await t.locator('button:has-text("Run")').first().click(); await t.waitForTimeout(7000);
  ok('1 teacher run shows output', /OUTPUT\s*Hello, World!/.test(await t.locator('.teacher-editor-pane').innerText().catch(() => '')));
  ok('   student sees teacher output', sDemo === 'Hello, World!');
  await t.click('text=Close').catch(() => {}); await t.waitForTimeout(500);
  await t.click('text=Lock Editors'); await t.waitForTimeout(1500);
  chk('3 lock toggles'); ok('3 lock toggles', (await t.locator('text=Unlock Editors').count()) > 0 && sLocked === true);
  await t.click('text=Unlock Editors'); await t.waitForTimeout(1500);
  ok('3 unlock toggles back', sLocked === false);
  // refresh the teacher tab (token can't be in storage here)
  await t.reload(); await t.waitForTimeout(3500);
  await t.click('text=Start Class').catch(() => {}); await t.waitForTimeout(800);
  chk('   after refresh: count still shown'); ok('   after refresh: count still shown', /1 student/.test(await nav()));
  ok('   after refresh: no warning banner', (await t.locator('.ws-banner[role=alert]').count()) === 0);
  // dashboard + inspect
  await t.click('text=Dashboard'); await t.waitForTimeout(4000);
  const dash = await t.locator('body').innerText();
  ok('2 dashboard lists the student', dash.includes('Kid A'));
  await t.reload(); await t.waitForTimeout(4000);
  chk('   dashboard survives a refresh'); ok('   dashboard survives a refresh', (await t.locator('body').innerText()).includes('Kid A'));
  await t.locator('text=Kid A').first().click().catch(() => {}); await t.waitForTimeout(3000);
  ok('   inspect view opens', /\/teacher\/student\//.test(t.url()) && !/authorization required/i.test(await t.locator('body').innerText()));
  await t.reload(); await t.waitForTimeout(3500);
  chk('   inspect survives a refresh'); ok('   inspect survives a refresh', !/authorization required|403/i.test(await t.locator('body').innerText()) && (await t.locator('body').innerText()).includes('Kid A'));
  await t.locator('button:has-text("Presentation"), button:has-text("Slides"), button:has-text("Back")').first().click().catch(() => {}); await t.waitForTimeout(3000);
  if (!/\/teacher\/\d+/.test(new URL(t.url()).pathname)) await t.goBack();
  await t.waitForTimeout(2500);
  chk('   back to slides via app nav: authorized'); ok('   back to slides via app nav: authorized', /1 student/.test(await nav()));
  const nt = await tctx.newPage(); await nt.goto(`${base}/teacher/${code}`); await nt.waitForTimeout(3000);
  ok('   tokenless tab shows warning banner', (await nt.locator('.ws-banner[role=alert]').count()) === 1); await nt.close();
  // end
  await t.click('.nav-btn--danger'); await t.waitForTimeout(500);
  await t.locator('div[style*="position: fixed"] button:has-text("End Session")').click(); await t.waitForTimeout(3500);
  ok('   token NEVER in address bar', leaks.length === 0); if (leaks.length) console.log('leaked at', leaks);
  ok('5 end session: no error popup', dialog === null);
  ok('   students told session ended', sEnded);
  ok('   token cleared from window.name after End', !(await t.evaluate(() => window.name)).includes(tok));
  for (const [k, v] of Object.entries(R)) console.log(v ? 'PASS' : 'FAIL', k);
  await tctx.close(); await b.close();
})().catch(e => { for (const [k, v] of Object.entries(R)) console.log(v ? 'PASS' : 'FAIL', k); console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });
