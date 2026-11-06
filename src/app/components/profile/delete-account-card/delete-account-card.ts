import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../../services/auth.service';
import { AccountService } from '../../../../services/account.service';

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
  excluindo = false;

  constructor(
    private auth: AuthService,
    private account: AccountService,
    private router: Router,
  ) {}

  get podeExcluir(): boolean {
    return this.confirmacao.trim().replace(/^@/, '').toLowerCase() === this.nomeUsuario.toLowerCase();
  }

  async excluirConta(): Promise<void> {
    if (this.excluindo) return;
    this.erro = '';
    if (!this.podeExcluir) {
      this.erro = 'Digite seu nome de usuário para confirmar a exclusão.';
      return;
    }
    if (!window.confirm('Sua conta será desativada. Pedidos e registros financeiros serão preservados. Deseja continuar?')) return;
    this.excluindo = true;
    try {
      await this.account.deactivate(this.nomeUsuario);
      try {
        await this.auth.logoutLocal();
      } finally {
        void this.router.navigate(['/']);
      }
    } catch (error) {
      this.erro = error instanceof Error ? error.message : 'Não foi possível desativar a conta.';
    } finally {
      this.excluindo = false;
    }
  }
}
