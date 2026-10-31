import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../../services/auth.service';

@Component({
  selector: 'app-delete-account-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './delete-account-card.html',
  styleUrl: './delete-account-card.css',
})
export class DeleteAccountCard {
  @Input({ required: true }) nomeUsuario = '';
  confirmacao = '';
  erro = '';

  constructor(private auth: AuthService, private router: Router) {}

  get podeExcluir(): boolean {
    return this.confirmacao.trim().replace(/^@/, '').toLowerCase() === this.nomeUsuario.toLowerCase();
  }

  excluirConta(): void {
    this.erro = '';
    if (!this.podeExcluir) {
      this.erro = 'Digite seu nome de usuário para confirmar a exclusão.';
      return;
    }
    if (!window.confirm('Esta ação é permanente. Deseja apagar sua conta?')) return;
    if (!this.auth.excluirContaLogada()) {
      this.erro = 'Não foi possível apagar a conta. Entre novamente e tente outra vez.';
      return;
    }
    void this.router.navigate(['/']);
  }
}
