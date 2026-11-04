export async function establishWebSession(token: string) {
  const response = await fetch('/api/auth/session', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || 'No se pudo validar el acceso web.'), { status: response.status });
  return result;
}
export async function clearWebSession() {
  await fetch('/api/auth/session', { method: 'DELETE' });
}
