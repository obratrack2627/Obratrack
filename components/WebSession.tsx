'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { establishWebSession, clearWebSession } from '@/lib/auth/session-client';
import { dataService } from '@/lib/data-service';
export default function WebSession() {
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = (token: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void establishWebSession(token).catch(async error => {
          if (disposed || ![401,403].includes(error.status)) return;
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
