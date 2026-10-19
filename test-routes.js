async function runTestSuite() {
  const BASE = 'http://localhost:3000';
  const token = 'admin123';
  const runId = Math.random().toString(36).slice(2, 6);
  let passed = 0;
  let total = 0;

  function assert(condition, name) {
    total++;
    if (condition) {
      console.log(`✅ [${total}] ${name}`);
      passed++;
    } else {
      console.error(`❌ [${total}] FAILED: ${name}`);
      process.exitCode = 1;
    }
  }

  console.log('════════════════════════════════════════════════════════════');
  console.log(`⚡ LINK PULSE — POSTGRESQL MIGRATION TEST SUITE (Run: ${runId})`);
  console.log('════════════════════════════════════════════════════════════\n');

  // Test 1: Public Summary
  let r = await fetch(`${BASE}/api/analytics/summary-public`);
  let data = await r.json();
  assert(r.status === 200 && typeof data.totalLinks === 'number', 'Public analytics summary endpoint');

  // Test 2: Create standard link
  r = await fetch(`${BASE}/api/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://github.com/teamkrypton' }),
  });
  const link1 = await r.json();
  assert(r.status === 201 && link1.short_code && link1.original_url === 'https://github.com/teamkrypton', 'Create standard short link');

  // Test 3: Create custom alias link
  const alias2 = `innovista-${runId}`;
  r = await fetch(`${BASE}/api/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://innovista.dev/round2',
      custom_alias: alias2,
      title: 'Innovista Round 2',
      campaign_tag: `hackathon-${runId}`,
    }),
  });
  const link2 = await r.json();
  assert(r.status === 201 && link2.custom_alias === alias2, 'Create link with custom alias & campaign tag');

  // Test 4: Duplicate alias rejection
  r = await fetch(`${BASE}/api/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://duplicate.com',
      custom_alias: alias2,
    }),
  });
  assert(r.status === 409, 'Duplicate custom alias rejected (409 Conflict)');

  // Test 5: Safe redirect (302)
  r = await fetch(`${BASE}/${link1.short_code}`, { redirect: 'manual' });
  assert(r.status === 302 && r.headers.get('location') === 'https://github.com/teamkrypton', 'Safe 302 redirect & click tracking');

  // Test 6: QR Code generation
  r = await fetch(`${BASE}/api/links/${link1.id}/qr`);
  data = await r.json();
  assert(r.status === 200 && data.qr && data.qr.startsWith('data:image/png;base64,'), 'QR Code generated as downloadable data URL');

  // Test 7: Protected endpoint without auth
  r = await fetch(`${BASE}/api/links`);
  assert(r.status === 401, 'Protected endpoint blocks unauthorized request (401)');

  // Test 8: Protected endpoint with auth
  r = await fetch(`${BASE}/api/links`, { headers: { 'x-admin-token': token } });
  const allLinks = await r.json();
  assert(r.status === 200 && Array.isArray(allLinks) && allLinks.length >= 2, 'Protected endpoint retrieves links with admin token');

  // Test 9: Click count incremented
  const refreshedLink1 = allLinks.find((l) => l.id === link1.id);
  assert(refreshedLink1 && refreshedLink1.click_count === 1, 'Click event persisted and click_count incremented');

  // Test 10: Password-protected link creation & verification
  const secAlias = `vault-${runId}`;
  r = await fetch(`${BASE}/api/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://confidential.docs/spec',
      custom_alias: secAlias,
      password: 'vault-secret-password',
    }),
  });
  const secLink = await r.json();
  assert(r.status === 201 && secLink.custom_alias === secAlias, 'Password-protected link created with bcrypt hash');

  // Password challenge page served on redirect
  r = await fetch(`${BASE}/${secAlias}`);
  let html = await r.text();
  assert(html.includes('Password Required') && html.includes('form id="f"'), 'Password prompt page served for protected links');

  // Wrong password rejection
  r = await fetch(`${BASE}/api/links/${secAlias}/verify-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'bad-password' }),
  });
  assert(r.status === 403, 'Incorrect password rejected (403 Forbidden)');

  // Correct password verification
  r = await fetch(`${BASE}/api/links/${secAlias}/verify-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'vault-secret-password' }),
  });
  const unlock = await r.json();
  assert(r.status === 200 && unlock.redirect_url === 'https://confidential.docs/spec', 'Correct password unlocks redirect');

  // Test 11: Suspicious link reporting
  r = await fetch(`${BASE}/api/links/${link1.id}/report`, { method: 'POST' });
  const rep = await r.json();
  assert(r.status === 200 && rep.link && rep.link.is_suspicious === 1, 'Suspicious link reported and flagged');

  // Test 12: Expired link enforcement
  const expAlias = `exp-${runId}`;
  r = await fetch(`${BASE}/api/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://expired.example.com',
      custom_alias: expAlias,
      expires_at: '2020-01-01T00:00:00Z',
    }),
  });
  const expLink = await r.json();
  r = await fetch(`${BASE}/${expAlias}`);
  html = await r.text();
  assert(r.status === 410 && html.includes('Link Expired'), 'Expired link enforces HTTP 410 Expired page');

  // Test 13: Click limit enforcement
  const limitAlias = `limit-${runId}`;
  r = await fetch(`${BASE}/api/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://limit.example.com',
      custom_alias: limitAlias,
      click_limit: 1,
    }),
  });
  const limitLink = await r.json();
  // 1st click succeeds
  r = await fetch(`${BASE}/${limitAlias}`, { redirect: 'manual' });
  assert(r.status === 302, 'First click allowed on click-limited link');
  // 2nd click blocked
  r = await fetch(`${BASE}/${limitAlias}`);
  html = await r.text();
  assert(r.status === 410 && html.includes('Click Limit Reached'), 'Exceeded click quota returns HTTP 410 Limit Reached');

  // Test 14: Link toggling (disable link)
  r = await fetch(`${BASE}/api/links/${link2.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
    body: JSON.stringify({ is_active: 0 }),
  });
  const disabledLink = await r.json();
  assert(disabledLink.is_active === 0, 'Link disabled via PUT /api/links/:id');

  r = await fetch(`${BASE}/${alias2}`);
  html = await r.text();
  assert(r.status === 410 && html.includes('Link Disabled'), 'Disabled link serves HTTP 410 Disabled page');

  // Test 15: Search and filter
  r = await fetch(`${BASE}/api/links?search=Innovista&status=disabled&tag=hackathon-${runId}`, {
    headers: { 'x-admin-token': token },
  });
  const searchResults = await r.json();
  assert(searchResults.length === 1 && searchResults[0].title === 'Innovista Round 2', 'Search and multi-parameter filtering works');

  // Test 16: Admin analytics summary & date trends
  r = await fetch(`${BASE}/api/analytics/summary`, {
    headers: { 'x-admin-token': token },
  });
  const summary = await r.json();
  assert(summary.totalLinks >= 4 && summary.totalClicks >= 3, 'Full admin analytics summary calculated');

  r = await fetch(`${BASE}/api/analytics/clicks-by-date?days=30`, {
    headers: { 'x-admin-token': token },
  });
  const trend = await r.json();
  assert(Array.isArray(trend) && trend.length >= 1 && trend[0].date && typeof trend[0].count === 'number', 'Clicks by date trends calculated for Chart.js');

  // Test 17: Delete link
  r = await fetch(`${BASE}/api/links/${expLink.id}`, {
    method: 'DELETE',
    headers: { 'x-admin-token': token },
  });
  const del = await r.json();
  assert(r.status === 200 && del.message === 'Link deleted successfully.', 'Link deleted successfully');

  console.log(`\n════════════════════════════════════════════════════════════`);
  console.log(`RESULTS: ${passed}/${total} TESTS PASSED`);
  console.log(`════════════════════════════════════════════════════════════\n`);
}

runTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
