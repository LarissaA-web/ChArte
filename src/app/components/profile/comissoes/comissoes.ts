import { Component, Input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { AuthService } from '../../../../services/auth.service';
import { ArtistAreaService } from '../../../../services/artist-area.service';
import { PerfilView } from '../../../models/perfil';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Comissao, OpcaoComissao } from '../../../models/artist-area';
import { ModalService } from '../../../../services/modal.service';

@Component({
  selector: 'app-comissoes',
  standalone: true,
  imports: [CurrencyPipe, FormsModule],
  templateUrl: './comissoes.html',
  styleUrl: './comissoes.css',
})
export class Comissoes {
  @Input() perfil?: PerfilView;
  opcaoSelecionada: OpcaoComissao | null = null;
  titulo = '';
  descricao = '';
  referencias = '';
  erro = '';
  enviando = false;
  fotosReferencia: File[] = [];
  previewFotos: string[] = [];

  constructor(private artistData: ArtistAreaService, private auth: AuthService, private router: Router, private modal: ModalService) {}

  get comissoesAbertas(): boolean {
    return this.perfil ? this.artistData.obterPrivacidade(this.perfil.nomeUsuario).aceitarComissoes : true;
  }

  get perfilEhDono(): boolean {
    const usuario = this.auth.getUsuarioLogado();
    return !!usuario && !!this.perfil && usuario.nomeUsuario.toLowerCase() === this.perfil.nomeUsuario.toLowerCase();
  }

  get pacotes() { return this.perfil ? this.artistData.listarOpcoesComissao(this.perfil.nomeUsuario) : []; }
  get diretrizes() { return this.perfil ? this.artistData.listarDiretrizes(this.perfil.nomeUsuario) : []; }

  abrirSolicitacao(opcao: OpcaoComissao): void {
    if (!this.comissoesAbertas || !this.perfil || this.perfilEhDono) return;
    if (!this.modal.exigirLogin()) return;
    this.opcaoSelecionada = opcao;
    this.titulo = opcao.titulo;
    this.descricao = '';
    this.referencias = '';
    this.fotosReferencia = [];
    this.previewFotos = [];
    this.erro = '';
  }

  selecionarFotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    const arquivos = Array.from(input.files ?? []).filter((arquivo) => arquivo.type.startsWith('image/') && arquivo.size <= 5 * 1024 * 1024).slice(0, 5);
    if (input.files?.length !== arquivos.length) this.erro = 'Escolha até 5 imagens válidas, com no máximo 5 MB cada.';
    else this.erro = '';
    this.fotosReferencia = arquivos;
    this.previewFotos = arquivos.map((arquivo) => URL.createObjectURL(arquivo));
  }

  async enviarSolicitacao(): Promise<void> {
    if (this.enviando) return;
    const usuario = this.auth.getUsuarioLogado();
    if (!this.opcaoSelecionada || !this.perfil) return;
    if (!this.comissoesAbertas) { this.erro = 'A artista fechou as comissões. Seu pedido não foi enviado.'; return; }
    if (!usuario) { this.modal.openModal('login'); return; }
    if (!this.titulo.trim() || !this.descricao.trim()) { this.erro = 'Informe um título e descreva a arte desejada.'; return; }
    const links = this.referencias.split('\n').map((item) => item.trim()).filter(Boolean);
    if (links.some((link) => { try { const url = new URL(link); return !['http:', 'https:'].includes(url.protocol); } catch { return true; } })) {
      this.erro = 'Use links completos iniciados por https:// ou http://.';
      return;
    }
    this.enviando = true;
    const fotos = await Promise.all(this.fotosReferencia.map((arquivo) => new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(arquivo);
    })));
    const comissao: Omit<Comissao, 'id' | 'status' | 'criadaEm'> = {
      artistaUsername: this.perfil.nomeUsuario,
      cliente: { nome: usuario.nome, username: usuario.nomeUsuario, foto: usuario.fotoPerfil },
      titulo: this.titulo.trim(), descricao: this.descricao.trim(),
      referencias: [...links, ...fotos.filter(Boolean)],
      valor: this.opcaoSelecionada.precoInicial, prazo: this.opcaoSelecionada.prazo,
      pagamentoStatus: 'pendente', opcaoTitulo: this.opcaoSelecionada.titulo,
    };
    const criada = await this.artistData.solicitarComissao(comissao);
    this.enviando = false;
    this.opcaoSelecionada = null;
    if (criada) {
      void this.router.navigate(['/carrinho'], { queryParams: { aba: 'pedidos', pedido: criada.id } });
    } else {
      this.erro = 'Erro ao enviar solicitação. Tente novamente.';
    }
  }
}
