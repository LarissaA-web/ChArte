import { Component } from '@angular/core';
import { ModalService } from '../../../services/modal.service';
import { AsyncPipe } from '@angular/common';
import { AuthService } from '../../../services/auth.service';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-artist-login-modal',
  standalone: true,
  imports: [AsyncPipe, FormsModule, RouterLink],
  templateUrl: './artist-login-modal.html',
  styleUrl: './artist-login-modal.css',
})
export class ArtistLoginModal {
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
      const sucesso = await this.authService.login(identificador, this.senha, 'Artista');
      if (sucesso) {
        this.modal.closeModal();
        void this.router.navigate(['/']);
      } else {
        this.mensagemErro = 'Credenciais inválidas para conta de artista.';
      }
    } finally {
      this.carregando = false;
    }
  }

  openLogin() {
    this.modal.openModal('artistLogin');
  }
}
