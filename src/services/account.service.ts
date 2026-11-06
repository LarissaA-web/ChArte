import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AccountService {
  constructor(private readonly http: HttpClient) {}

  async deactivate(username: string): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/account/deactivate', { confirmUsername: username }));
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        const body = error.error;
        const message = typeof body === 'string' ? body : body?.detail || body?.message;
        throw new Error(message || 'Não foi possível desativar a conta. Tente novamente.');
      }
      throw new Error('Falha de conexão ao desativar a conta.');
    }
  }
}
