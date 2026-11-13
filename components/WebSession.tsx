'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { establishWebSession, clearWebSession } from '@/lib/auth/session-client';
import { dataService } from '@/lib/data-service';
export default function WebSession() {
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = (token: string, allowRenew = true) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void establishWebSession(token).catch(async error => {
          if (disposed || ![401,403].includes(error.status)) return;
          if (error.status === 401 && allowRenew) {
            const { data } = await supabase.auth.refreshSession();
            if (!disposed && data.session?.access_token && data.session.access_token !== token) {
              refresh(data.session.access_token, false);
              return;
            }
          }
          if (disposed) return;
          dataService.clearActiveUser();
          await clearWebSession();
          window.location.replace('/login');
        });
      }, 0);
    };
    void supabase.auth.getSession().then(({ data }) => {
      if (!disposed && data.session?.access_token) refresh(data.session.access_token);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!disposed && session?.access_token && ['SIGNED_IN', 'TOKEN_REFRESHED'].includes(event)) refresh(session.access_token);
    });
    return () => { disposed = true; clearTimeout(timer); data.subscription.unsubscribe(); };
  }, []);
  return null;
}
