// A small in-memory stand-in for the Supabase client, enough to exercise the
// assistant's real decision paths. Security claims about permissions and
// injection are only worth anything if the actual handlers run.
const matches = (row, filters) => filters.every(({ op, column, value }) => {
  const actual = row[column];
  switch (op) {
    case 'eq': return String(actual) === String(value);
    case 'neq': return String(actual) !== String(value);
    case 'in': return value.map(String).includes(String(actual));
    case 'gt': return actual > value;
    case 'gte': return actual >= value;
    case 'lt': return actual < value;
    case 'lte': return actual <= value;
    case 'notIn': return !value.map(String).includes(String(actual));
    case 'notNull': return actual !== null && actual !== undefined;
    default: return true;
  }
});

const parseSqlList = value => String(value).replace(/^\(|\)$/g, '').split(',').map(item => item.trim().replace(/^"|"$/g, ''));

class Query {
  constructor(store, table, mode, payload, options = {}, defaults = {}) {
    this.defaults = defaults[table] || {};
    this.store = store; this.table = table; this.mode = mode; this.payload = payload; this.options = options;
    this.filters = []; this.limitCount = null; this.orderBy = null; this.singleMode = null; this.returning = false;
  }

  rows() { return this.store.get(this.table) || []; }
  eq(column, value) { this.filters.push({ op: 'eq', column, value }); return this; }
  neq(column, value) { this.filters.push({ op: 'neq', column, value }); return this; }
  in(column, value) { this.filters.push({ op: 'in', column, value }); return this; }
  gt(column, value) { this.filters.push({ op: 'gt', column, value }); return this; }
  gte(column, value) { this.filters.push({ op: 'gte', column, value }); return this; }
  lt(column, value) { this.filters.push({ op: 'lt', column, value }); return this; }
  lte(column, value) { this.filters.push({ op: 'lte', column, value }); return this; }
  not(column, operator, value) {
    if (operator === 'in') this.filters.push({ op: 'notIn', column, value: parseSqlList(value) });
    else if (operator === 'is') this.filters.push({ op: 'notNull', column });
    return this;
  }

  select() { this.returning = true; return this; }
  order(column, { ascending = true } = {}) { this.orderBy = { column, ascending }; return this; }
  limit(count) { this.limitCount = count; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }
  single() { this.singleMode = 'strict'; return this; }

  resolve() {
    const all = this.rows();
    if (this.mode === 'insert') {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(item => ({ id: `row-${all.length + 1}-${Math.random().toString(16).slice(2, 8)}`, created_at: new Date().toISOString(), ...this.defaults, ...item }));
      for (const item of items) {
        const conflict = this.store.uniques?.[this.table];
        if (conflict && all.some(row => conflict.every(column => String(row[column]) === String(item[column])))) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        all.push(item);
      }
      this.store.set(this.table, all);
      return this.shape(items);
    }
    if (this.mode === 'upsert') {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(item => ({ ...item }));
      const key = this.options.onConflict?.split(',').map(part => part.trim());
      for (const item of items) {
        const existing = key ? all.find(row => key.every(column => String(row[column]) === String(item[column]))) : null;
        if (existing) { if (!this.options.ignoreDuplicates) Object.assign(existing, item); continue; }
        all.push({ id: `row-${all.length + 1}-${Math.random().toString(16).slice(2, 8)}`, created_at: new Date().toISOString(), ...this.defaults, ...item });
      }
      this.store.set(this.table, all);
      return this.shape(items);
    }
    const selected = all.filter(row => matches(row, this.filters));
    if (this.mode === 'update') {
      for (const row of selected) Object.assign(row, this.payload);
      return this.shape(selected);
    }
    if (this.mode === 'delete') {
      this.store.set(this.table, all.filter(row => !selected.includes(row)));
      return this.shape(selected);
    }
    let out = [...selected];
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      out.sort((left, right) => (String(left[column] ?? '') < String(right[column] ?? '') ? -1 : 1) * (ascending ? 1 : -1));
    }
    if (this.limitCount !== null) out = out.slice(0, this.limitCount);
    return this.shape(out);
  }

  shape(rows) {
    if (this.singleMode === 'strict') return rows.length ? { data: rows[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    if (this.singleMode === 'maybe') return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }

  then(onFulfilled, onRejected) { return Promise.resolve(this.resolve()).then(onFulfilled, onRejected); }
}

export function createFakeSupabase({ tables = {}, uniques = {}, rpc = {}, defaults = {} } = {}) {
  const store = new Map(Object.entries(tables).map(([name, rows]) => [name, rows.map(row => ({ ...row }))]));
  store.uniques = uniques;
  const original = store.get.bind(store);
  store.get = name => { if (!original(name)) store.set(name, []); return original(name); };
  const calls = [];
  return {
    store,
    calls,
    table: name => store.get(name),
    from(name) {
      return {
        select: () => new Query(store, name, 'select', undefined, {}, defaults).select(),
        insert: payload => { calls.push({ table: name, op: 'insert', payload }); return new Query(store, name, 'insert', payload, {}, defaults); },
        upsert: (payload, options = {}) => { calls.push({ table: name, op: 'upsert', payload }); return new Query(store, name, 'upsert', payload, options, defaults); },
        update: payload => { calls.push({ table: name, op: 'update', payload }); return new Query(store, name, 'update', payload, {}, defaults); },
        delete: () => { calls.push({ table: name, op: 'delete' }); return new Query(store, name, 'delete', undefined, {}, defaults); },
      };
    },
    async rpc(name, args) { calls.push({ rpc: name, args }); return rpc[name] ? rpc[name](args) : { data: null, error: null }; },
    storage: { from: () => ({ upload: async () => ({ error: null }), download: async () => ({ error: { message: 'not_supported' } }), remove: async () => ({ error: null }) }) },
  };
}

export const check = async query => {
  const { data, error } = await query;
  if (error) throw new Error(`database_${error.code || 'failed'}`);
  return data;
};
