#!/usr/bin/env node
/**
 * Settings wiring smoke test — run against local backend on :3007
 */
const BASE = process.env.FAMS_API || 'http://127.0.0.1:3007/api';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

async function main() {
  const results = [];

  const health = await req('/health');
  results.push({ name: 'Health check', ok: health.status === 200, detail: health.body });

  const settings = await req('/settings');
  results.push({
    name: 'Public settings (ai_threshold)',
    ok: settings.status === 200 && settings.body?.ai_threshold != null,
    detail: settings.body?.ai_threshold,
  });

  const login = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const token = login.body?.token;
  results.push({ name: 'Admin login', ok: login.status === 200 && !!token, detail: login.status });

  if (token) {
    const auth = { Authorization: `Bearer ${token}` };
    const save = await req('/settings', {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({
        gracePeriod: '12',
        overtimeThreshold: '10',
        shiftCapacityAlerts: 'true',
        notif_webhook_url: 'https://example.com/hook',
      }),
    });
    results.push({ name: 'Save operational settings', ok: save.status === 200, detail: save.body });

    const readBack = await req('/settings', { headers: auth });
    results.push({
      name: 'Read back gracePeriod=12',
      ok: readBack.body?.gracePeriod === '12',
      detail: readBack.body?.gracePeriod,
    });

    const exportRes = await req('/settings/payroll-exports', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ period: 'Test Period', format: 'csv' }),
    });
    results.push({ name: 'Payroll export create', ok: exportRes.status === 200 || exportRes.status === 201, detail: exportRes.body?.id });

    const kiosk = await req('/settings/regenerate-kiosk-token', { method: 'POST', headers: auth });
    results.push({ name: 'Regenerate kiosk token', ok: kiosk.status === 200 && !!kiosk.body?.token, detail: 'ok' });

    const sysInfo = await req('/settings/system-info', { headers: auth });
    results.push({ name: 'System info', ok: sysInfo.status === 200 && sysInfo.body?.uptime != null, detail: sysInfo.body?.nodeVersion });

    const dash = await req('/dashboard', { headers: auth });
    results.push({
      name: 'Dashboard KPIs',
      ok: dash.status === 200 && dash.body?.kpi != null,
      detail: dash.body?.kpi?.workDate,
    });
    results.push({
      name: 'Dashboard missed punch count',
      ok: dash.status === 200 && typeof dash.body?.kpi?.missedPunchCount === 'number',
      detail: dash.body?.kpi?.missedPunchCount,
    });

    const month = new Date().toISOString().slice(0, 7);
    const monthSummary = await req(`/report/month-summary?month=${month}`, { headers: auth });
    results.push({
      name: 'Month summary API',
      ok: monthSummary.status === 200 && Array.isArray(monthSummary.body?.days),
      detail: monthSummary.body?.days?.length,
    });

    const salary = await req(`/report/salary?month=${month}`, { headers: auth });
    const firstRecord = salary.body?.records?.[0];
    const firstDay = firstRecord?.dailyBreakdown?.[0];
    results.push({
      name: 'Salary daily breakdown shape',
      ok: salary.status === 200 && (
        !firstDay || (
          typeof firstDay.regularHours === 'number' &&
          typeof firstDay.overtimeHours === 'number' &&
          typeof firstDay.dayPay === 'number'
        )
      ),
      detail: firstDay ? `${firstDay.regularHours}h reg / ${firstDay.overtimeHours}h OT` : 'no days',
    });

    const workers = await req('/workers', { headers: auth });
    const firstWorker = workers.body?.[0];
    if (firstWorker?.employeeCode) {
      const summary = await req(`/workers/${firstWorker.employeeCode}/summary?month=${month}`, { headers: auth });
      results.push({
        name: 'Worker summary API',
        ok: summary.status === 200 && typeof summary.body?.daysPresent === 'number',
        detail: summary.body?.daysPresent,
      });
    }
  }

  console.log('\n=== FAMS Settings Wiring Test Report ===\n');
  let passed = 0;
  for (const r of results) {
    const mark = r.ok ? '✅' : '❌';
    if (r.ok) passed += 1;
    console.log(`${mark} ${r.name}${r.detail != null ? ` → ${r.detail}` : ''}`);
  }
  console.log(`\n${passed}/${results.length} passed\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error('Test runner failed:', e.message);
  process.exit(1);
});
