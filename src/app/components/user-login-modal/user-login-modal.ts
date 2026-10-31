import { Component } from '@angular/core';
import { ModalService } from '../../../services/modal.service';
import { AsyncPipe } from '@angular/common';
import { AuthService } from '../../../services/auth.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-user-login-modal',
  standalone: true,
  imports: [AsyncPipe, FormsModule, RouterLink],
  templateUrl: './user-login-modal.html',
  styleUrl: './user-login-modal.css',
})
export class UserLoginModal {
  nomeUsuario = '';
  senha = '';
  mostrarSenha = false;

  constructor(
    public modal: ModalService,
    private authService: AuthService,
    private router: Router,
  ) {}

  async entrar(): Promise<void> {
    const sucesso = await this.authService.login(this.nomeUsuario, this.senha, 'Comum');

    if (sucesso) {
      this.modal.closeModal();
      void this.router.navigate(['/']);
    } else {
      alert('Usuário ou senha incorretos para login de usuário comum');
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
