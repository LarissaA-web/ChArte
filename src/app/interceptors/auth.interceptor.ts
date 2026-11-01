import { HttpInterceptorFn } from '@angular/common/http';
import { from, switchMap } from 'rxjs';
import { supabase } from '../core/supabase/supabase.client';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes('/api/')) {
    return next(req);
  }

  return from(supabase.auth.getSession()).pipe(
    switchMap(({ data }) => {
      const token = data.session?.access_token;

      if (!token) {
        console.warn('Nenhuma sessão autenticada encontrada no Supabase.');
        return next(req);
      }

      const requisicaoAutenticada = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      });

      return next(requisicaoAutenticada);
    })
  );
};
