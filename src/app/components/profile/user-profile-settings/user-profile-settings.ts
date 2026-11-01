import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ArtistAreaService } from '../../../../services/artist-area.service';
import { AuthService } from '../../../../services/auth.service';
import { PerfilService } from '../../../../services/perfil.service';
import { PrivacidadeArtista } from '../../../models/artist-area';
import { PerfilView } from '../../../models/perfil';
import { DeleteAccountCard } from '../delete-account-card/delete-account-card';

type SecaoUsuario = 'privacidade' | 'seguranca';

@Component({
  selector: 'app-user-profile-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DeleteAccountCard],
  templateUrl: './user-profile-settings.html',
  styleUrl: './user-profile-settings.css',
})
export class UserProfileSettings implements OnInit {
  perfil: PerfilView | null = null;
  secaoAtual: SecaoUsuario = 'privacidade';
  menuAberto = false;

  readonly secoes: { grupo: string; itens: { id: SecaoUsuario; titulo: string }[] }[] = [
    {
      grupo: 'CONTA',
      itens: [
        { id: 'privacidade', titulo: 'Privacidade' },
        { id: 'seguranca', titulo: 'Segurança' },
      ],
    },
  ];

  privacidade: PrivacidadeArtista = {
    perfilPublico: true,
    exibirInformacoes: true,
    exibirRedesSociais: true,
    aceitarComissoes: false,
  };
  usernameNovo = '';
  emailNovo = '';
  senhaAtual = '';
  senhaNova = '';
  senhaConfirmacao = '';
  mostrarSenhaAtual = false;
  mostrarSenhaNova = false;
  mostrarSenhaConfirmacao = false;
  mensagemSeguranca = '';

  constructor(
    private artistArea: ArtistAreaService,
    private auth: AuthService,
    private perfis: PerfilService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.auth.aguardarInicializacao();
    const sessao = this.auth.getUsuarioLogado();
    if (!sessao) {
      void this.router.navigate(['/']);
      return;
    }
    if (sessao.tipoUsuario === 'Artista') {
      void this.router.navigate(['/artista']);
      return;
    }
    this.perfis.getPerfil(sessao.nomeUsuario).subscribe((perfil) => {
      if (!perfil || String(perfil.idUsuario) !== String(sessao.idUsuario)) {
        void this.router.navigate(['/']);
        return;
      }
      this.perfil = perfil;
      const salva = this.artistArea.obterPrivacidade(perfil.nomeUsuario);
      this.privacidade = {
        perfilPublico: salva.perfilPublico,
        exibirInformacoes: salva.exibirInformacoes,
        exibirRedesSociais: salva.exibirRedesSociais,
        aceitarComissoes: false,
      };
      this.emailNovo = this.auth.obterEmailUsuarioLogado();
      this.cdr.detectChanges();
    });
  }

  selecionarSecao(secao: SecaoUsuario): void {
    this.secaoAtual = secao;
    this.menuAberto = false;
    this.mensagemSeguranca = '';
    if (this.perfil && secao === 'privacidade') {
      this.privacidade = {
        ...this.artistArea.obterPrivacidade(this.perfil.nomeUsuario),
        aceitarComissoes: false,
      };
    }
    this.cdr.detectChanges();
  }

  async salvarPrivacidade(): Promise<void> {
    if (!this.perfil) return;
    await this.artistArea.salvarPrivacidade(this.perfil.nomeUsuario, {
      ...this.privacidade,
      aceitarComissoes: false,
    });
    this.mensagemSeguranca = 'Preferências de privacidade salvas.';
    this.cdr.detectChanges();
  }

  async alterarUsername(): Promise<void> {
    if (!this.perfil) return;
    const anterior = this.perfil.nomeUsuario;
    const novo = this.usernameNovo.trim().replace(/^@/, '');
    if (!novo || novo.length < 3) {
      this.mensagemSeguranca = 'Informe um username com pelo menos 3 caracteres.';
      this.cdr.detectChanges();
      return;
    }
    const disponivel = await this.perfis.nomeUsuarioDisponivel(novo, anterior);
    if (!disponivel) {
      this.mensagemSeguranca = 'Username inválido ou já utilizado.';
      this.cdr.detectChanges();
      return;
    }
    const ok = await this.auth.atualizarUsername(novo);
    if (!ok) {
      this.mensagemSeguranca = 'Não foi possível atualizar o username.';
      this.cdr.detectChanges();
      return;
    }
    await this.perfis.atualizarPerfil(anterior, { nomeUsuario: novo });
    await this.artistArea.renomearArtista(anterior, novo);
    this.perfil = { ...this.perfil, nomeUsuario: novo };
    this.usernameNovo = '';
    this.mensagemSeguranca = 'Username atualizado.';
    this.cdr.detectChanges();
  }

  alterarEmail(): void {
    this.auth.atualizarEmail(this.emailNovo).then((ok) => {
      this.mensagemSeguranca = ok ? 'E-mail atualizado.' : 'Informe um e-mail válido.';
      if (ok) this.emailNovo = '';
      this.cdr.detectChanges();
    });
  }

  async alterarSenha(): Promise<void> {
    if (this.senhaNova !== this.senhaConfirmacao || this.senhaNova.length < 6) {
      this.mensagemSeguranca = 'Confira a confirmação e use ao menos 6 caracteres.';
      this.cdr.detectChanges();
      return;
    }
    const ok = await this.auth.atualizarSenha(this.senhaNova);
    this.mensagemSeguranca = ok ? 'Senha atualizada.' : 'Não foi possível atualizar a senha.';
    if (ok) {
      this.senhaAtual = this.senhaNova = this.senhaConfirmacao = '';
    }
    this.cdr.detectChanges();
  }

  sair(): void {
    this.auth.logout();
    void this.router.navigate(['/']);
  }

  acessarPerfil(): void {
    if (!this.perfil) return;
    void this.router.navigate(['/perfil', this.perfil.nomeUsuario]);
  }
}
