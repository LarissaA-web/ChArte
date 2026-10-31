import { Component, Output, EventEmitter } from '@angular/core';
import { ModalService } from '../../../services/modal.service';
import { AsyncPipe } from '@angular/common';
import { AuthService } from '../../../services/auth.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-artist-login-modal',
  standalone: true,
  imports: [AsyncPipe, FormsModule, RouterLink],
  templateUrl: './artist-login-modal.html',
  styleUrl: './artist-login-modal.css',
})
export class ArtistLoginModal {
  nomeUsuario = '';
  senha = '';
  mostrarSenha = false;

  constructor(
    public modal: ModalService,
    private authService: AuthService,
    private router: Router,
  ) {}
  async entrar(): Promise<void> {
    const sucesso = await this.authService.login(this.nomeUsuario, this.senha, 'Artista');

    if (sucesso) {
      this.modal.closeModal();
      void this.router.navigate(['/']);
    } else {
      alert('Usuário ou senha incorretos para login de artista');
    }
  }


  openLogin() {
    this.modal.openModal('artistLogin');
  }
}
