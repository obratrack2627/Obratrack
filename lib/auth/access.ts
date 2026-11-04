export const WEB_ACCESS_ERROR = 'El acceso web es exclusivo para administradores y desarrolladores. Usa WhatsApp para trabajar en tus obras asignadas.';
export const isSessionJWT = (token: string) => /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/.test(token);
export function canAccessWeb(user: { rol?: string; is_dev?: boolean } | null | undefined) {
  return Boolean(user && (user.rol === 'admin' || user.is_dev === true));
}
