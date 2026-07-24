const BASE = '/api'

function token() {
  return localStorage.getItem('lp_token')
}

function headers(extra = {}) {
  return {
    'Content-Type': 'application/json',
    ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    ...extra,
  }
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

const get  = (path)        => request('GET',    path)
const post = (path, body)  => request('POST',   path, body)
const put  = (path, body)  => request('PUT',    path, body)
const del  = (path)        => request('DELETE', path)

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const auth = {
  login:  (email, password) => post('/auth/login', { email, password }),
  logout: ()                => post('/auth/logout'),
  me:     ()                => get('/auth/me'),
  changePassword: (current_password, new_password) => post('/auth/password', { current_password, new_password }),
}

// ─── Stats ────────────────────────────────────────────────────────────────────
export const statsApi = {
  get: () => get('/stats'),
}

// ─── Leads ────────────────────────────────────────────────────────────────────
export const leadsApi = {
  list:   (params = {}) => get('/leads?' + new URLSearchParams(params).toString()),
  add:    (data)        => post('/leads', data),
  remove: (id)          => del(`/leads/${id}`),
  score:  (id)          => post(`/leads/${id}/score`),
  detail: (id)          => get(`/leads/${id}/detail`),
  // assignment
  assign:     (id, agent_id) => post(`/leads/${id}/assign`, { agent_id }),
  bulkAssign: (lead_ids, agent_id) => post('/leads/assign', { lead_ids, agent_id }),
  // activity tracking
  activities:  (id)       => get(`/leads/${id}/activities`),
  logActivity: (id, data) => post(`/leads/${id}/activity`, data),
}

// ─── Performance / leaderboard ────────────────────────────────────────────────
export const performanceApi = {
  leaderboard: (params = {}) => get('/performance/leaderboard?' + new URLSearchParams(params).toString()),
  agent:       (id, params = {}) => get(`/performance/agent/${id}?` + new URLSearchParams(params).toString()),
  getWeights:  ()     => get('/performance/weights'),
  saveWeights: (data) => post('/performance/weights', data),
}

// ─── Analytics ──────────────────────────────────────────────────────────────
export const analyticsApi = {
  overview:     ()     => get('/analytics/overview'),
  segments:     ()     => get('/analytics/segments'),
  getEconomics: ()     => get('/analytics/economics'),
  saveEconomics:(data) => post('/analytics/economics', data),
}

// ─── Activity / audit log ─────────────────────────────────────────────────────
export const activityApi = {
  list: (limit = 50) => get(`/activity?limit=${limit}`),
}

// ─── Email ────────────────────────────────────────────────────────────────────
export const emailApi = {
  generate: (lead_id) => get(`/email/generate?lead_id=${lead_id}`),
  send:     (data)    => post('/email/send', data),
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────
export const pipelineApi = {
  trigger:      (step)     => post(`/pipeline/${step}`),
  status:       ()         => get('/pipeline/status'),
  getSettings:  ()         => get('/pipeline/settings'),
  saveSettings: (settings) => post('/pipeline/settings', settings),
  rotation:     ()         => get('/pipeline/rotation'),
  regenerate:   ()         => post('/pipeline/rotation/regenerate'),
}

// ─── Users / RBAC ─────────────────────────────────────────────────────────────
export const usersApi = {
  list:       ()            => get('/users'),
  invite:     (data)        => post('/users', data),
  setRole:    (id, role)    => put(`/users/${id}/role`, { role }),
  remove:     (id)          => del(`/users/${id}`),
}

// ─── RBAC helper — can this user do X? ────────────────────────────────────────
// actions: view, edit, delete, send, manage (team), assign (leads), log (activity)
const PERMS = {
  admin:   ['view', 'edit', 'delete', 'send', 'manage', 'assign', 'log'],
  manager: ['view', 'edit', 'send', 'manage', 'assign', 'log'],
  agent:   ['view', 'send', 'log'],
  viewer:  ['view'],
}
export function can(user, action) {
  return PERMS[user?.role]?.includes(action) ?? false
}
