import { Component, OnInit } from '@angular/core';
import { ModalService } from '../../../services/modal.service';
import { AuthService } from '../../../services/auth.service';
import { Router } from '@angular/router';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'app-sub-menu',
  standalone: true,
  imports: [AsyncPipe],
  templateUrl: './sub-menu.html',
  styleUrl: './sub-menu.css',
})
export class SubMenu implements OnInit {
  tema: 'claro' | 'escuro' = 'escuro';

  constructor(
    public modal: ModalService,
    public auth: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const temaSalvo = localStorage.getItem('charte-tema');
    this.aplicarTema(temaSalvo === 'claro' ? 'claro' : 'escuro');
  }

  definirTema(tema: 'claro' | 'escuro'): void {
    this.aplicarTema(tema);
    localStorage.setItem('charte-tema', tema);
  }

  private aplicarTema(tema: 'claro' | 'escuro'): void {
    this.tema = tema;
    document.documentElement.dataset['theme'] = tema;
  }

  openMenu() {
    this.modal.openModal('subMenu');
  }

  abrirLogin(): void {
    this.modal.openModal('login');
  }

  irParaMeuPerfil(): void {
    const usuario = this.auth.getUsuarioLogado();
    this.modal.closeModal();

    if (usuario) {
      this.router.navigate(['/perfil', usuario.nomeUsuario]);
    } else {
      this.modal.openModal('login');
    }
  }

  irParaChat(): void {
    this.modal.openChat();
  }

  irParaCarrinho(): void {
    this.modal.closeModal();
    void this.router.navigate(['/carrinho']);
  }

  logout(): void {
    this.auth.logout();
    this.modal.closeModal();
    void this.router.navigate(['/']);
  }
}
