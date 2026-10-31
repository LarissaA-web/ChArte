export type StatusComissao = 'Solicitada' | 'Aguardando aprovação do cliente' | 'Pendente' | 'Em andamento' | 'Entregue' | 'Finalizada' | 'Recusada' | 'Cancelada';

export interface Comissao {
  id: number;
  artistaUsername: string;
  cliente: { nome: string; username: string; foto: string };
  titulo: string;
  descricao: string;
  referencias: string[];
  valor: number;
  criadaEm: string;
  prazo: string;
  status: StatusComissao;
  concluidaEm?: string;
  observacaoEntrega?: string;
  arquivoEntrega?: string;
  pagamento?: string;
  pagamentoStatus?: 'pendente' | 'pago' | 'falhou';
  paymentId?: string;
  checkoutUrl?: string;
  opcaoTitulo?: string;
  propostaValor?: number;
  propostaPrazo?: string;
}

export interface OpcaoComissao {
  id: number;
  artistaUsername: string;
  titulo: string;
  descricao: string;
  precoInicial: number;
  prazo: string;
  itens: string[];
  destaque: boolean;
  ativa: boolean;
}

export interface DiretrizComissao {
  id: number;
  artistaUsername: string;
  titulo: string;
  descricao: string;
}

export interface AvaliacaoArtista {
  id: number;
  artistaUsername: string;
  cliente: string;
  nota: number;
  comentario: string;
  data: string;
}

export interface PrivacidadeArtista {
  perfilPublico: boolean;
  exibirRedesSociais: boolean;
  exibirInformacoes: boolean;
  aceitarComissoes: boolean;
}
