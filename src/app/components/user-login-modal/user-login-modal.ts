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
      const sucesso = await this.authService.login(identificador, this.senha, 'Comum');
      if (sucesso) {
        this.modal.closeModal();
        void this.router.navigate(['/']);
      } else {
        this.mensagemErro = 'Usuário, e-mail ou senha incorretos.';
      }
    } finally {
      this.carregando = false;
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
