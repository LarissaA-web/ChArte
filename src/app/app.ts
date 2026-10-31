import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Chat } from './components/chat/chat';
import { UserLoginModal } from './components/user-login-modal/user-login-modal';
import { supabase } from './core/supabase/supabase.client';
import { PinService } from '../services/pinService';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Chat, UserLoginModal],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('charte');

  constructor(private pinService: PinService) {
    const temaSalvo = localStorage.getItem('charte-tema');
    document.documentElement.dataset['theme'] =
      temaSalvo === 'claro' ? 'claro' : 'escuro';

    this.testarSupabase();
  }

  
async testarSupabase() {
  const { data, error } = await supabase
  .from('portifolio')
  .select('*');

console.log("ARTE RECEBIDA:", JSON.stringify(data?.[0], null, 2));
console.log("TODAS AS ARTES:", data);

console.log('DADOS:', data);
console.log('ERRO COMPLETO:', error);
console.log('CÓDIGO:', error?.code);
console.log('MENSAGEM:', error?.message);
console.log('DETALHES:', error?.details);
console.log('DICA:', error?.hint);
}
}
