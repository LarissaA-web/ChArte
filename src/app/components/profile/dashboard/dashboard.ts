import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PerfilView } from '../../../models/perfil';
import { Post } from '../../../models/post';
import { AuthService } from '../../../../services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  @Input() perfil?: PerfilView;
  @Input() artes: Post[] = [];

  secaoAtiva = 'dashboard';

  // DADOS MOCKADOS DO PAINEL DO ARTISTA
  metricas = {
    totalObras: 3,
    visualizacoesMes: '4.2k',
    comissoesAtivas: 2,
    faturamentoMes: 'R$ 1.450,00',
    taxaAprovacao: '98%',
  };

  pedidosComissao = [
    {
      id: 101,
      cliente: 'Carlos Eduardo',
      tipo: 'Meio Corpo Colorido',
      prazo: '28/09/2026',
      valor: 'R$ 130,00',
      status: 'Em andamento',
    },
    {
      id: 102,
      cliente: 'Mariana Costa',
      tipo: 'Sketch / Lineart',
      prazo: '30/09/2026',
      valor: 'R$ 60,00',
      status: 'Pendente',
    },
    {
      id: 103,
      cliente: 'Felipe Santos',
      tipo: 'Ilustração Completa',
      prazo: '15/09/2026',
      valor: 'R$ 260,00',
      status: 'Concluída',
    },
    {
      id: 104,
      cliente: 'Beatriz Lima',
      tipo: 'Sketch / Lineart',
      prazo: '10/09/2026',
      valor: 'R$ 60,00',
      status: 'Cancelada',
    },
  ];

  avaliacoes = [
    {
      autor: 'Mariana Costa',
      nota: 5,
      data: '22/09/2026',
      comentario: 'Trabalho impecável! A artista capturou exatamente o que eu pedi na lineart.',
    },
    {
      autor: 'Felipe Santos',
      nota: 5,
      data: '16/09/2026',
      comentario: 'Ilustração incrível, cores e iluminação impressionantes. Recomendo muito!',
    },
    {
      autor: 'Ana Paula',
      nota: 4,
      data: '04/09/2026',
      comentario: 'Muito comunicativa e rápida na entrega. Ficou lindo!',
    },
  ];

  // CONFIGURAÇÕES MOCKADAS
  configPrivacidade = {
    perfilPublico: true,
    aceitarComissoes: true,
    mostrarRedesSociais: true,
    mostrarEstatisticas: true,
  };

  configConta = {
    email: 'artista.contato@charte.com',
    nomeCompleto: 'Larissa Albuquerque',
    notificacoesEmail: true,
  };

  configSeguranca = {
    senhaAtual: '',
    novaSenha: '',
    confirmarSenha: '',
  };

  constructor(public authService: AuthService) {}

  selecionarSecao(secao: string): void {
    this.secaoAtiva = secao;
  }

  salvarPrivacidade(): void {
    alert('Configurações de privacidade atualizadas localmente!');
  }

  salvarConta(): void {
    alert('Informações da conta salvas localmente!');
  }

  alterarSenha(): void {
    if (!this.configSeguranca.novaSenha) {
      alert('Informe a nova senha.');
      return;
    }
    if (this.configSeguranca.novaSenha !== this.configSeguranca.confirmarSenha) {
      alert('As senhas não coincidem.');
      return;
    }
    alert('Senha atualizada com sucesso (simulação local)!');
    this.configSeguranca.senhaAtual = '';
    this.configSeguranca.novaSenha = '';
    this.configSeguranca.confirmarSenha = '';
  }

  logout(): void {
    this.authService.logout();
  }
}

