// This module runs only in the account function. Nothing here is bundled into the browser.
const schema = 'spanvision_commerce';
const tables = {
  tool_trials: ['user_id', 'started_at'],
  tool_launch_grants: ['id', 'user_id', 'request_id', 'tool_id', 'access_source', 'trial_day', 'expires_at', 'created_at'],
  billing_customers: ['user_id', 'provider', 'provider_customer_id'],
  billing_subscriptions: ['provider', 'provider_subscription_id', 'user_id', 'plan_key', 'status', 'current_period_end', 'observed_at'],
  billing_events: ['provider', 'event_id', 'processed_at'],
  billing_checkout_locks: ['user_id', 'plan_key', 'expires_at', 'checkout_url'],
  account_plan_overrides: ['user_id', 'plan_id', 'expires_at', 'reason', 'updated_by', 'updated_at'],
  account_plan_audit: ['id', 'actor_id', 'user_id', 'action', 'before_state', 'after_state', 'reason', 'created_at'],
};
const keys = { billing_customers: 'user_id,provider', billing_subscriptions: 'provider,provider_subscription_id',
  billing_events: 'provider,event_id' };
const stores = new WeakMap();

export function databaseConfigured(env) {
  try {
    const url = new URL(env.DATABASE_URL);
    return ['postgres:', 'postgresql:'].includes(url.protocol) && url.hostname.endsWith('.neon.tech')
      && !!url.username && !!url.password && url.pathname.length > 1;
  } catch { return false; }
}

export function createNeonStore(query, env = {}) {
  function identifier(name, columns) {
    if (!columns.includes(name)) throw new Error('Unsupported database column.');
    return `"${name}"`;
  }
  async function rows(sql, params = []) { return query(sql, params); }
  function normalizeAccount(row) {
    return { id: row.id, email: row.email, email_confirmed_at: row.email_verified ? row.updated_at : null,
      user_metadata: { full_name: row.name }, created_at: row.created_at, last_sign_in_at: row.last_sign_in_at };
  }
  return {
    async syncAccount(record, signedIn = true) {
      await rows(`insert into ${schema}.accounts(id,email,name,email_verified,created_at,last_sign_in_at)
        values($1,$2,$3,$4,coalesce($5::timestamptz,now()),case when $6::boolean then now() else null end) on conflict(id) do update set
        email=excluded.email,name=excluded.name,email_verified=excluded.email_verified,
        last_sign_in_at=coalesce(excluded.last_sign_in_at,accounts.last_sign_in_at),updated_at=now()`,
      [record.id, record.email, record.user_metadata?.full_name || '', !!record.email_confirmed_at, record.created_at || null, signedIn]);
    },
    async adminUsers(resource) {
      const url = new URL(resource, 'https://internal/');
      if (url.pathname === '/users') {
        const page = Number(url.searchParams.get('page')), limit = Number(url.searchParams.get('per_page'));
        if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Invalid pagination.');
        const users = await rows(`select * from ${schema}.accounts order by created_at,id limit $1 offset $2`, [limit, (page - 1) * limit]);
        const count = await rows(`select count(*)::int as total from ${schema}.accounts`);
        return { response: new Response(null, { headers: { 'x-total-count': String(count[0].total) } }),
          data: { users: users.map(normalizeAccount) } };
      }
      const match = /^\/users\/([a-zA-Z0-9_-]{1,128})$/.exec(url.pathname);
      if (!match) throw new Error('Unsupported user lookup.');
      const result = await rows(`select * from ${schema}.accounts where id=$1`, [match[1]]);
      return { response: new Response(null, { status: result.length ? 200 : 404 }), data: result.length ? normalizeAccount(result[0]) : null };
    },
    async request(resource, options = {}) {
      const url = new URL(resource, 'https://internal/'), table = url.pathname.slice(1), method = options.method || 'GET';
      const body = options.body ? JSON.parse(options.body) : null;
      if (table.startsWith('rpc/')) {
        if (method !== 'POST') throw new Error('Unsupported database operation.');
        let sql, params;
        if (table === 'rpc/tool_trial_status') {
          sql = `select ${schema}.tool_trial_status($1) as result`; params = [body.account_id];
        } else if (table === 'rpc/claim_tool_launch') {
          sql = `select ${schema}.claim_tool_launch($1,$2,$3,$4,$5) as result`;
          params = [body.account_id, body.selected_tool, body.launch_request, body.access_source, body.access_expires];
        } else if (table === 'rpc/claim_billing_checkout') {
          sql = `select ${schema}.claim_billing_checkout($1,$2) as result`; params = [body.account_id, body.selected_plan];
        } else if (table === 'rpc/apply_billing_subscription') {
          sql = `select ${schema}.apply_billing_subscription($1::jsonb) as result`; params = [JSON.stringify(body.record)];
        } else if (table === 'rpc/admin_set_plan_access') {
          sql = `select ${schema}.admin_set_plan_access($1,$2,$3,$4,$5,$6) as result`;
          params = [body.actor, body.target, body.requested_plan, body.expires, body.note, env.SUPER_ADMIN_USER_ID || ''];
        } else throw new Error('Unsupported database function.');
        return (await rows(sql, params))[0].result;
      }
      const columns = tables[table];
      if (!columns) throw new Error('Unsupported database table.');
      const params = [], bind = value => { params.push(value); return `$${params.length}`; };
      const filters = [];
      for (const [column, expression] of url.searchParams) {
        if (['select', 'order', 'limit', 'on_conflict'].includes(column)) continue;
        const quoted = identifier(column, columns);
        if (expression.startsWith('eq.')) filters.push(`${quoted}=${bind(expression.slice(3))}`);
        else if (/^in\.\([^()]+\)$/.test(expression)) filters.push(`${quoted} in (${expression.slice(4, -1).split(',').map(bind).join(',')})`);
        else throw new Error('Unsupported database filter.');
      }
      const where = filters.length ? ` where ${filters.join(' and ')}` : '';
      if (method === 'GET') {
        const selected = (url.searchParams.get('select') || columns.join(',')).split(',').map(column => identifier(column, columns)).join(',');
        let suffix = '';
        if (url.searchParams.has('order')) {
          const [column, direction, extra] = url.searchParams.get('order').split('.');
          if (!['asc', 'desc'].includes(direction) || extra) throw new Error('Invalid database ordering.');
          suffix += ` order by ${identifier(column, columns)} ${direction}`;
        }
        if (url.searchParams.has('limit')) {
          const limit = Number(url.searchParams.get('limit'));
          if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid database limit.');
          suffix += ` limit ${bind(limit)}`;
        }
        return rows(`select ${selected} from ${schema}.${table}${where}${suffix}`, params);
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid database write.');
      const names = Object.keys(body); names.forEach(name => identifier(name, columns));
      if (!names.length) throw new Error('Empty database write.');
      if (method === 'POST' && keys[table]) {
        if (url.searchParams.get('on_conflict') !== keys[table]) throw new Error('Invalid database conflict target.');
        const merge = options.headers?.Prefer?.includes('resolution=merge-duplicates');
        const updates = names.filter(name => !keys[table].split(',').includes(name));
        const conflict = merge && updates.length ? `do update set ${updates.map(name => `"${name}"=excluded."${name}"`).join(',')}` : 'do nothing';
        const values = names.map(name => bind(body[name])).join(',');
        return rows(`insert into ${schema}.${table}(${names.map(name => `"${name}"`).join(',')}) values(${values})
          on conflict(${keys[table]}) ${conflict} returning *`, params);
      }
      if (method === 'PATCH' && table === 'billing_checkout_locks' && filters.length === 1 && names.length === 1 && names[0] === 'checkout_url') {
        return rows(`update ${schema}.${table} set checkout_url=${bind(body.checkout_url)}${where} returning *`, params);
      }
      throw new Error('Unsupported database write.');
    },
  };
}

export async function neonStore(env) {
  if (!databaseConfigured(env)) throw new Error('Neon database setup is incomplete.');
  if (!stores.has(env)) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(env.DATABASE_URL);
    stores.set(env, createNeonStore((text, params) => sql.query(text, params, { fetchOptions: { signal: AbortSignal.timeout(12000) } }), env));
  }
  return stores.get(env);
}

export function bindNeonStore(env, store) { stores.set(env, store); }
