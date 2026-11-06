import { Component } from '@angular/core';
import { ModalService } from '../../../services/modal.service';
import { AsyncPipe } from '@angular/common';
import { AuthService } from '../../../services/auth.service';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-user-login-modal',
  standalone: true,
  imports: [AsyncPipe, FormsModule, RouterLink],
  templateUrl: './user-login-modal.html',
  styleUrl: './user-login-modal.css',
})
export class UserLoginModal {
  email = '';
  nomeUsuario = '';
  senha = '';
  mostrarSenha = false;
  mensagemErro = '';
  carregando = false;

  constructor(
    public modal: ModalService,
    private authService: AuthService,
    private router: Router,
  ) {}

  async entrar(): Promise<void> {
    if (this.carregando) return;
    const identificador = this.nomeUsuario.trim() || this.email.trim();
    if (!identificador || !this.senha) {
      this.mensagemErro = 'Informe seu usuário (ou e-mail) e senha.';
      return;
    }

    this.carregando = true;
    this.mensagemErro = '';
    try {
      const resultado = await this.authService.login(identificador, this.senha, 'Comum');
      if (resultado.status === 'success') {
        this.modal.closeModal();
        void this.router.navigate(['/']);
      } else {
        this.mensagemErro = this.mensagemParaResultado(resultado.status);
      }
    } finally {
      this.carregando = false;
    }
  }

  private mensagemParaResultado(status: string): string {
    switch (status) {
      case 'email_not_confirmed': return 'Confirme seu e-mail antes de entrar.';
      case 'account_not_found': return 'E-mail ou usuário não encontrado.';
      case 'account_disabled': return 'Esta conta foi desativada.';
      case 'age_restricted': return 'O acesso ao ChArte exige idade mínima de 16 anos.';
      case 'account_type_mismatch': return 'Esta conta é de artista. Entre pelo login de artista.';
      case 'connection_error': return 'Falha de conexão. Verifique sua internet e tente novamente.';
      case 'service_error': return 'Não foi possível validar sua conta agora. Tente novamente.';
      default: return 'E-mail, usuário ou senha incorretos.';
    }
  }

  openLogin() {
    this.modal.openModal('login');
  }

  abrirLoginArtista(): void {
    this.modal.closeModal();
    this.modal.openModal('artistLogin');
  }
}
