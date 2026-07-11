// Demo identity: a random per-browser token used as the sync scope. Two browser
// profiles with different tokens sync independent data sets. Replace with a real
// auth/session token in production.
export function getToken(): string {
  if (typeof window === 'undefined') return ''
  let t = localStorage.getItem('taladb-demo-token')
  if (!t) {
    t = crypto.randomUUID()
    localStorage.setItem('taladb-demo-token', t)
  }
  return t
}
