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
  modoRecuperacao = false;
  emailRecuperacao = '';
  mensagemRecuperacao = '';
  erroRecuperacao = '';
  enviandoRecuperacao = false;

  constructor(
    public modal: ModalService,
    private authService: AuthService,
    private router: Router,
  ) {}

  async entrar(): Promise<void> {
    if (this.modoRecuperacao) return;
    if (this.carregando) return;
    const identificador = this.nomeUsuario.trim() || this.email.trim();
    if (!identificador || !this.senha) {
      this.mensagemErro = 'Informe seu usuário (ou e-mail) e senha.';
      return;
    }

    this.carregando = true;
    this.mensagemErro = '';
    try {
      const resultado = await this.authService.login(identificador, this.senha, 'Artista');
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

  abrirRecuperacao(): void {
    this.modoRecuperacao = true;
    this.emailRecuperacao = this.email.trim();
    this.mensagemRecuperacao = '';
    this.erroRecuperacao = '';
  }

  voltarLogin(): void {
    this.modoRecuperacao = false;
    this.mensagemRecuperacao = '';
    this.erroRecuperacao = '';
  }

  async solicitarRedefinicaoSenha(): Promise<void> {
    if (this.enviandoRecuperacao || this.mensagemRecuperacao) return;
    this.enviandoRecuperacao = true;
    this.erroRecuperacao = '';
    try {
      const resultado = await this.authService.solicitarRedefinicaoSenha(this.emailRecuperacao);
      if (resultado.status === 'invalid_email') {
        this.erroRecuperacao = 'Informe um e-mail válido.';
      } else if (resultado.status === 'sent') {
        this.mensagemRecuperacao = 'Se houver uma conta associada a este e-mail, você receberá um link para redefinir sua senha.';
      } else {
        this.erroRecuperacao = resultado.status === 'rate_limited'
          ? 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
          : resultado.status === 'network_error'
            ? 'Falha de conexão. Verifique sua internet e tente novamente.'
            : 'Não foi possível solicitar a recuperação agora. Tente novamente.';
      }
    } finally {
      this.enviandoRecuperacao = false;
    }
  }

  private mensagemParaResultado(status: string): string {
    switch (status) {
      case 'email_not_confirmed': return 'Confirme seu e-mail antes de entrar.';
      case 'account_not_found': return 'E-mail ou usuário não encontrado.';
      case 'account_disabled': return 'Esta conta foi desativada.';
      case 'age_restricted': return 'O acesso ao ChArte exige idade mínima de 16 anos.';
      case 'account_type_mismatch': return 'Esta conta é de usuário comum. Entre pelo login de usuário.';
      case 'connection_error': return 'Falha de conexão. Verifique sua internet e tente novamente.';
      case 'service_error': return 'Não foi possível validar sua conta agora. Tente novamente.';
      default: return 'E-mail, usuário ou senha incorretos.';
    }
  }

  openLogin() {
    this.modal.openModal('artistLogin');
  }
}
