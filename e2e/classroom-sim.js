// Run: SEC=<backend APPSCRIPT_SECRET> node e2e/classroom-sim.js   (needs playwright + webkit/firefox installed)
// Writes real sessions to PRODUCTION; delete the sim-teacher-*@example.com user afterwards.
// Full classroom simulation against PRODUCTION: an independent teacher (new email,
// never seen before) starts a lesson the way the add-on does, runs it from a
// cookie-blocked Chrome, and 10 students join from isolated browsers across
// Chrome / WebKit (Safari) / Firefox.
const { chromium, webkit, firefox } = require('playwright');
const fs = require('fs'); const path = require('path'); const os = require('os');
const { SEC } = process.env;
// Defaults hit production. For a local stack:
//   BACKEND=http://localhost:4000 APP=http://localhost:3000 SKIP_SITE=1 SEC=... node e2e/classroom-sim.js
const BACKEND = process.env.BACKEND || 'https://codekiwi-app-backend.onrender.com';
const APP = process.env.APP || 'https://codekiwi.app';
const SITE = 'https://www.codekiwi.tech';
const SKIP_SITE = process.env.SKIP_SITE === '1'; // don't register the sim teacher on codekiwi.tech
const results = []; const ok = (name, pass, detail = '') => { results.push([name, pass]); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const stamp = Date.now();
  const teacherEmail = `sim-teacher-${stamp}@example.com`;
  fs.writeFileSync(path.join(__dirname, 'sim-teacher.txt'), teacherEmail);

  // ── 1. Start Lesson, exactly as the add-on does it (Code.js initiateLessonSession) ──
  const notes = [
    'Welcome to today\'s lesson',
    'Code Question:\nPrint the word hello\nExpected Output:\nhello',
    'Code Question:\nPrint the sum of 2 and 3\nExpected Output:\n5',
  ];
  const thumbs = ['Intro', 'Q1: print hello', 'Q2: print 2+3'].map((t, i) => `https://dummyimage.com/960x540/${['2e7d32','1565c0','e65100'][i]}/fff.png&text=${encodeURIComponent(t)}`);
  const up = await (await fetch(`${BACKEND}/api/sessions/upload`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-codekiwi-secret': SEC },
    body: JSON.stringify({ slidesUrl: 'https://docs.google.com/presentation/d/sim', notes, thumbnailUrls: thumbs, language: 'python' }) })).json();
  const { sessionCode: code, teacherToken: tok } = up;
  const reg = SKIP_SITE ? { registered: 'skipped' } : await (await fetch(`${SITE}/api/sessions/register`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-codekiwi-secret': SEC },
    body: JSON.stringify({ sessionCode: code, teacherEmail, presentationId: 'sim', title: 'Sim Lesson' }) })).json();
  fs.writeFileSync(path.join(__dirname, 'sim-session.txt'), code);
  ok('add-on Start Lesson: session created', !!code && !!tok, `code ${code}`);
  if (!SKIP_SITE) ok('brand-new teacher registered with the site (history will save)', reg.registered === true);

  // ── 2. Teacher in a cookie-blocked Chrome ──
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-sim-'));
  fs.mkdirSync(path.join(prof, 'Default'));
  fs.writeFileSync(path.join(prof, 'Default', 'Preferences'), JSON.stringify({ profile: { default_content_setting_values: { cookies: 2 }, cookie_controls_mode: 1 } }));
  const tctx = await chromium.launchPersistentContext(prof, { channel: 'chrome', headless: true, viewport: { width: 1440, height: 900 } });
  const t = tctx.pages()[0] || await tctx.newPage();
  const tDialogs = []; t.on('dialog', d => { tDialogs.push(d.message()); d.dismiss(); });
  const t403 = []; t.on('response', r => { if (r.url().startsWith(BACKEND) && r.status() === 403) t403.push(r.url()); });
  await t.goto(`${APP}/teacher/${code}?t=${tok}`); await sleep(3500);
  ok('teacher browser really has storage blocked', await t.evaluate(() => { try { sessionStorage.getItem('x'); return false; } catch { return true; } }));
  ok('teacher token not in address bar', !/[?&]t=/.test(t.url()));
  const nav = async () => (await t.locator('.slide-controls').innerText()).replace(/\s+/g, ' ');

  // ── 3. Ten students on separate "computers" ──
  const browsers = { chromium: await chromium.launch({ channel: 'chrome' }), webkit: await webkit.launch(), firefox: await firefox.launch() };
  const plan = [
    ['Ava', 'chromium', 'correct'], ['Ben', 'webkit', 'correct'], ['Cara', 'firefox', 'correct'], ['Dev', 'chromium', 'correct'], ['Eli', 'webkit', 'correct'],
    ['Fay', 'firefox', 'wrong'], ['Gus', 'chromium', 'wrong'], ['Hana', 'webkit', 'syntax'], ['Ivan', 'firefox', 'stuck'], ['Jin', 'chromium', 'late'],
  ];
  const S = {};
  const makeStudent = async (name, engine) => {
    const ctx = await browsers[engine].newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    const st = { name, engine, ctx, p, slide: null, locked: null, ended: false, demo: null, runs: [] };
    if (name === 'Gus') { // slow, far-away connection (like UTC+8 to a US server)
      const cdp = await ctx.newCDPSession(p);
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 350, downloadThroughput: 750 * 1024 / 8 * 8, uploadThroughput: 250 * 1024 });
    }
    p.on('websocket', ws => ws.on('framereceived', f => { try { const d = JSON.parse(String(f.payload));
      if (d.type === 'sync') st.slide = d.slide; if (d.type === 'lock-editors' && d.sessionCode === code) st.locked = d.locked;
      if (d.type === 'session-ended' && d.sessionCode === code) st.ended = true; if (d.type === 'demo-run') st.demo = d.output; } catch {} }));
    p.on('response', async r => { if (r.url().endsWith('/api/run')) { let b = {}; try { b = await r.json(); } catch {} st.runs.push({ status: r.status(), ...b }); } });
    // Interactive runs stream over a /run WebSocket; its final frame carries the grade.
    p.on('websocket', ws => { if (!ws.url().endsWith('/run')) return; ws.on('framereceived', f => { try { const d = JSON.parse(f.payload);
      if (d.type === 'exit') st.runs.push({ status: 200, output: d.output, grade: d.grade });
      if (d.type === 'error') st.runs.push({ status: 0, error: d.message }); } catch {} }); });
    return st;
  };
  const join = async (st) => {
    await st.p.goto(`${APP}/student/${code}`); await st.p.waitForSelector('input', { timeout: 30000 });
    await st.p.fill('input', st.name); await st.p.click('text=Join Session');
    await st.p.waitForURL(new RegExp(`/student/${code}/`), { timeout: 30000 }); await sleep(1500);
  };
  for (const [name, engine] of plan) S[name] = await makeStudent(name, engine);
  const first9 = plan.filter(x => x[2] !== 'late').map(x => S[x[0]]);
  await Promise.all(first9.map(join));
  await sleep(4000);
  await t.click('text=Start Class').catch(() => {}); await sleep(800);
  ok('teacher sees 9 students joined', /9 students/.test(await nav()), await nav().then(n => n.match(/\d+ students?/)?.[0]));

  // ── 4. Teacher moves to the coding question ──
  const nextSlide = () => t.evaluate(() => { const bs = [...document.querySelectorAll('.slide-controls button')]; bs.find(x => /›|→|next/i.test(x.innerText + x.title + x.getAttribute('aria-label')))?.click(); });
  await nextSlide(); await sleep(3000);
  ok('all 9 students followed to slide 2', first9.every(s => s.slide === 1), first9.filter(s => s.slide !== 1).map(s => s.name).join(','));

  // ── 5. Students answer ──
  const answer = async (st, src) => {
    await st.p.click('.monaco-editor', { timeout: 15000 }); await st.p.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await st.p.keyboard.press('Backspace'); await st.p.keyboard.insertText(src); await sleep(400);
    const n = st.runs.length; await st.p.click('button.run-button');
    for (let i = 0; i < 60 && st.runs.length === n; i++) await sleep(500);
    return st.runs[st.runs.length - 1];
  };
  const src = { correct: 'print("hello")', wrong: 'print("helo")', syntax: 'print(hello' };
  await Promise.all(first9.map(async st => {
    const kind = plan.find(x => x[0] === st.name)[2];
    if (kind === 'stuck') { await st.p.click('.stuck-button'); return; }
    st.q1 = await answer(st, src[kind]);
  }));
  const graded = (names, passed) => names.every(n => S[n].q1?.grade?.graded && S[n].q1.grade.passed === passed);
  ok('5 correct answers autograded Correct', graded(['Ava', 'Ben', 'Cara', 'Dev', 'Eli'], true), ['Ava','Ben','Cara','Dev','Eli'].map(n => `${n}:${JSON.stringify(S[n].q1?.grade)}`).join(' '));
  ok('wrong answers autograded Not quite', graded(['Fay', 'Gus', 'Hana'], false));
  ok('slow-connection student (Gus) got a result', !!S.Gus.q1?.output);
  ok('syntax error returned an error message', /SyntaxError|Error/i.test(S.Hana.q1?.output || ''));

  // ── 6. Late joiner + a student who closes the tab and rejoins ──
  await join(S.Jin); await sleep(2500);
  ok('late joiner lands on the current slide', S.Jin.slide === 1);
  await S.Cara.ctx.close();
  S.Cara = await makeStudent('Cara', 'firefox'); await sleep(61000); // server treats a same-name seat silent >60s as a rejoin
  await join(S.Cara); await sleep(4000);
  ok('teacher sees 10 students (rejoin made no duplicate)', /10 students/.test(await nav()), (await nav()).match(/\d+ students?/)?.[0]);

  // ── 7. Teacher dashboard: live status per student ──
  await t.click('text=Dashboard'); await sleep(5000);
  const cards = await t.$$eval('.student-card', els => els.map(e => ({ cls: e.className, text: e.innerText.replace(/\s+/g, ' ') })));
  const statusOf = (n) => (cards.find(c => c.text.includes(n))?.cls.match(/student-card--(\w+)/) || [])[1];
  console.log('   dashboard:', plan.map(([n]) => `${n}=${statusOf(n)}`).join(' '));
  ok('dashboard shows all 10 students', plan.every(([n]) => statusOf(n)));
  ok('correct students show Done', ['Ava', 'Ben', 'Dev', 'Eli'].every(n => statusOf(n) === 'done'));
  ok('stuck student shows Needs help', statusOf('Ivan') === 'help');
  ok('syntax-error student shows Error', statusOf('Hana') === 'error');
  await t.reload(); await sleep(4000);
  ok('dashboard survives a refresh (blocked storage)', (await t.$$('.student-card')).length === 10);
  await t.goBack().catch(() => {}); await sleep(500);
  await t.goto(`${APP}/teacher/${code}?live=1`).catch(() => {}); await sleep(3500);

  // ── 8. Lock editors: enforced for everyone, including on the server ──
  await t.click('text=Lock Editors'); await sleep(2500);
  ok('every student received the lock', Object.values(S).every(s => s.locked === true), Object.values(S).filter(s => s.locked !== true).map(s => s.name).join(','));
  const lockedRun = await S.Fay.p.evaluate(async ([c, id, backend]) => (await fetch(`${backend}/api/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'print(1)', language: 'python', sessionCode: c, studentId: id, slideIndex: 1 }) })).status, [code, S.Fay.p.url().split('/').pop(), BACKEND]);
  ok('server refuses runs while locked (even bypassing the UI)', lockedRun === 423, `HTTP ${lockedRun}`);
  await t.click('text=Unlock Editors'); await sleep(2000);
  ok('unlock reaches everyone', Object.values(S).every(s => s.locked === false));

  // ── 9. Teacher live demo mirrors to students ──
  await t.click('text=Editor'); await sleep(1500);
  await t.locator('button:has-text("Run")').first().click(); await sleep(9000);
  ok('teacher demo run shows output on teacher screen', /OUTPUT\s*Hello, World!/.test(await t.locator('.teacher-editor-pane').innerText().catch(() => '')));
  ok('every student sees the teacher demo output', Object.values(S).every(s => s.demo === 'Hello, World!'), Object.values(S).filter(s => s.demo !== 'Hello, World!').map(s => s.name).join(','));
  await t.click('text=Close').catch(() => {}); await sleep(800);

  // ── 10. Second question ──
  await nextSlide(); await sleep(3000);
  ok('all 10 followed to slide 3', Object.values(S).every(s => s.slide === 2), Object.values(S).filter(s => s.slide !== 2).map(s => `${s.name}:${s.slide}`).join(','));
  for (const n of ['Ava', 'Ben', 'Cara']) S[n].q2 = await answer(S[n], 'print(2 + 3)');
  ok('Q2 answers autograded Correct', ['Ava', 'Ben', 'Cara'].every(n => S[n].q2?.grade?.passed === true));

  // ── 11. End session ──
  await sleep(4000);
  await t.click('.nav-btn--danger'); await sleep(600);
  await t.locator('div[style*="position: fixed"] button:has-text("End Session")').click(); await sleep(6000);
  ok('End Session: no error popup', tDialogs.length === 0, tDialogs.join('|'));
  ok('every student told the session ended', Object.values(S).every(s => s.ended), Object.values(S).filter(s => !s.ended).map(s => s.name).join(','));
  ok('teacher never got a 403 all lesson', t403.length === 0, t403.slice(0, 3).join(' '));

  await tctx.close(); for (const b of Object.values(browsers)) await b.close();
  const failed = results.filter(r => !r[1]).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
})().catch(e => { console.log('CRASH', e.message.split('\n').slice(0, 3).join(' | ')); const failed = results.filter(r => !r[1]).length; console.log(`${results.length - failed}/${results.length} passed before crash`); process.exit(1); });
