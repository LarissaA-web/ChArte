import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ArtistAreaService } from '../../../../services/artist-area.service';
import { AuthService } from '../../../../services/auth.service';
import { PerfilService } from '../../../../services/perfil.service';
import { PerfilView } from '../../../models/perfil';
import { DeleteAccountCard } from '../delete-account-card/delete-account-card';

@Component({
  selector: 'app-user-profile-settings',
  standalone: true,
  imports: [FormsModule, RouterLink, DeleteAccountCard],
  templateUrl: './user-profile-settings.html',
  styleUrl: './user-profile-settings.css',
})
export class UserProfileSettings implements OnInit {
  perfil: PerfilView | null = null;
  secao: 'informacoes' | 'seguranca' | 'apagar-conta' = 'informacoes';

  privacidade = { perfilPublico: true, exibirInformacoes: true, exibirRedesSociais: true };
  emailNovo = '';
  senhaAtual = '';
  senhaNova = '';
  senhaConfirmacao = '';
  mensagem = '';
  erro = '';

  constructor(private artistArea: ArtistAreaService, private auth: AuthService, private perfis: PerfilService, private router: Router) {}

  ngOnInit(): void {
    const sessao = this.auth.getUsuarioLogado();
    if (!sessao) { void this.router.navigate(['/']); return; }
    if (sessao.tipoUsuario === 'Artista') { void this.router.navigate(['/artista']); return; }
    this.perfis.getPerfil(sessao.nomeUsuario).subscribe((perfil) => {
      if (!perfil || perfil.idUsuario !== sessao.idUsuario || perfil.tipoUsuario !== 'Comum') { void this.router.navigate(['/']); return; }
      this.perfil = perfil;
      const salva = this.artistArea.obterPrivacidade(perfil.nomeUsuario);
      this.privacidade = {
        perfilPublico: salva.perfilPublico,
        exibirInformacoes: salva.exibirInformacoes,
        exibirRedesSociais: salva.exibirRedesSociais,
      };
      this.emailNovo = this.auth.obterEmailUsuarioLogado();
    });
  }

  selecionarSecao(secao: 'informacoes' | 'seguranca' | 'apagar-conta'): void { this.secao = secao; }

  salvarPrivacidade(): void {
    if (!this.perfil) return;
    this.artistArea.salvarPrivacidade(this.perfil.nomeUsuario, {
      ...this.artistArea.obterPrivacidade(this.perfil.nomeUsuario),
      ...this.privacidade,
    });
    this.confirmar('Preferências de privacidade salvas.');
  }

  salvarEmail(): void {
    this.limparMensagens();
    this.auth.atualizarEmail(this.emailNovo).then((ok) => {
      if (!ok) {
        this.erro = 'Não foi possível atualizar o e-mail. Confira o endereço informado.';
        return;
      }
      this.confirmar('E-mail atualizado.');
    });
  }

  async salvarSenha(): Promise<void> {
    this.limparMensagens();
    if (this.senhaNova.length < 6) {
      this.erro = 'A nova senha deve ter pelo menos 6 caracteres.';
      return;
    }
    if (this.senhaNova !== this.senhaConfirmacao) {
      this.erro = 'A confirmação não corresponde à nova senha.';
      return;
    }
    const ok = await this.auth.atualizarSenha(this.senhaNova);
    if (!ok) {
      this.erro = 'Não foi possível atualizar a senha.';
      return;
    }
    this.senhaAtual = this.senhaNova = this.senhaConfirmacao = '';
    this.confirmar('Senha atualizada.');
  }

  private limparMensagens(): void { this.mensagem = ''; this.erro = ''; }
  private confirmar(texto: string): void { this.limparMensagens(); this.mensagem = texto; }
}
