import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-esqueci-senha',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './esqueci-senha.html',
  styleUrl: '../redefinir-senha/recuperacao-senha.css',
})
export class EsqueciSenha {
  email = '';
  enviando = false;
  solicitado = false;
  erro = '';

  constructor(private readonly auth: AuthService) {}

  async solicitar(): Promise<void> {
    this.erro = '';
    if (!this.email.trim()) {
      this.erro = 'Informe o e-mail da sua conta.';
      return;
    }
    if (this.enviando) return;
    this.enviando = true;
    try {
      const resultado = await this.auth.solicitarRedefinicaoSenha(this.email);
      if (resultado.status === 'sent') {
        this.solicitado = true;
      } else if (resultado.status === 'invalid_email') {
        this.erro = 'Informe um e-mail válido.';
      } else if (resultado.status === 'rate_limited') {
        this.erro = 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
      } else if (resultado.status === 'network_error') {
        this.erro = 'Falha de conexão. Verifique sua internet e tente novamente.';
      } else {
        this.erro = 'Não foi possível solicitar a recuperação. Tente novamente.';
      }
    } catch {
      this.erro = 'Não foi possível enviar a solicitação. Verifique sua conexão e tente novamente.';
    } finally {
      this.enviando = false;
    }
  }
}
