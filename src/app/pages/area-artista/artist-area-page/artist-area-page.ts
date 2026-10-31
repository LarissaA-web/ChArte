import {
  Component,
  OnInit,
  ChangeDetectorRef,
} from '@angular/core';
import { Router } from '@angular/router';

import { PerfilService } from '../../../../services/perfil.service';
import { PinService } from '../../../../services/pinService';
import { AuthService } from '../../../../services/auth.service';

import { ArtistArea } from '../artist-area/artist-area';
import { PerfilView } from '../../../models/perfil';
import { Post } from '../../../models/post';

@Component({
  selector: 'app-artist-area-page',
  standalone: true,
  imports: [ArtistArea],
  template: `
    @if (carregando) {
      <main class="artist-area-loading">
        <p>Carregando área do artista…</p>
      </main>
    } @else if (erroCarregamento) {
      <main class="artist-area-loading">
        <p>Não foi possível carregar a área do artista.</p>
        <button type="button" (click)="voltarInicio()">
          Voltar ao início
        </button>
      </main>
    } @else if (perfil) {
      <app-artist-area
        [perfil]="perfil"
        [artes]="artes"
        (perfilAtualizado)="atualizarPerfil($event)"
        (artesAtualizadas)="atualizarArtes($event)"
      />
    }
  `,
  styles: [`
    .artist-area-loading {
      min-height: 60vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      color: var(--cor-texto, #fff);
    }
  `],
})
export class ArtistAreaPage implements OnInit {
  perfil: PerfilView | null = null;
  artes: Post[] = [];
  carregando = true;
  erroCarregamento = false;

  constructor(
    private auth: AuthService,
    private perfis: PerfilService,
    private pins: PinService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      console.log('[Área artista] Iniciando autenticação');

      await this.auth.aguardarInicializacao();

      console.log('[Área artista] Autenticação inicializada');

      const usuario = this.auth.getUsuarioLogado();

      console.log('[Área artista] Usuário logado:', usuario);
      console.log('[Área artista] Tipo de usuário:', usuario?.tipoUsuario);
      console.log('[Área artista] Nome de usuário:', usuario?.nomeUsuario);

      if (!usuario) {
        this.carregando = false;
        this.cdr.detectChanges();
        await this.router.navigate(['/']);
        return;
      }

      if (usuario.tipoUsuario !== 'Artista') {
        this.carregando = false;
        this.cdr.detectChanges();
        await this.router.navigate(['/']);
        return;
      }

      this.perfis.getPerfil(usuario.nomeUsuario).subscribe({
        next: (perfil) => {
          console.log('[Área artista] Perfil recebido:', perfil);

          if (!perfil || perfil.tipoUsuario !== 'Artista') {
            this.carregando = false;
            this.erroCarregamento = true;
            this.cdr.detectChanges();
            return;
          }

          this.perfil = perfil;
          this.carregando = false;
          this.cdr.detectChanges();

          console.log('[Área artista] Carregamento finalizado:', {
            carregando: this.carregando,
            tipoUsuario: perfil.tipoUsuario,
            perfil: this.perfil,
          });

          this.pins.getArtesPorArtista(perfil.nomeUsuario).subscribe({
            next: (artes) => {
              this.artes = artes;
              this.cdr.detectChanges();
              console.log('[Área artista] Artes carregadas:', artes);
            },
            error: (erro) => {
              console.error('[Área artista] Erro ao carregar artes:', erro);
              this.artes = [];
              this.cdr.detectChanges();
            },
          });
        },
        error: (erro) => {
          console.error('[Área artista] Erro ao carregar perfil:', erro);
          this.carregando = false;
          this.erroCarregamento = true;
          this.cdr.detectChanges();
        },
      });
    } catch (erro) {
      console.error('[Área artista] Erro ao inicializar área do artista:', erro);
      this.carregando = false;
      this.erroCarregamento = true;
      this.cdr.detectChanges();
    }
  }

  voltarInicio(): void {
    void this.router.navigate(['/']);
  }

  atualizarPerfil(perfil: PerfilView): void {
    this.perfil = perfil;
    this.cdr.detectChanges();

    this.pins.getArtesPorArtista(perfil.nomeUsuario).subscribe({
      next: (artes) => {
        this.artes = artes;
        this.cdr.detectChanges();
      },
      error: (erro) => {
        console.error('[Área artista] Erro ao atualizar artes:', erro);
      },
    });
  }

  atualizarArtes(artes: Post[]): void {
    this.artes = [...artes];
    this.cdr.detectChanges();
  }
}
