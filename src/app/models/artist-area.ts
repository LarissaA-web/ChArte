export type StatusComissao = 'Solicitada' | 'Aguardando aprovação do cliente' | 'Pendente' | 'Em andamento' | 'Entregue' | 'Finalizada' | 'Recusada' | 'Cancelada';

export interface ArquivoEntregaComissao {
  nome: string;
  url: string;
  tipo?: string;
}

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
  /** Estado operacional persistido em pedidos_principal.status_pedido. */
  statusPedido?: string;
  concluidaEm?: string;
  observacaoEntrega?: string;
  arquivoEntrega?: string;
  arquivosEntrega?: ArquivoEntregaComissao[];
  pagamento?: string;
  pagamentoStatus?: 'pendente' | 'pago' | 'falhou';
  pagamentoLiberado?: boolean;
  paymentId?: string;
  checkoutUrl?: string;
  opcaoTitulo?: string;
  propostaValor?: number;
  propostaPrazo?: string;
  tipoPedido?: 'compra_arte' | 'comissao';
}

export function ehCompraDiretaArte(
  pedido?: Pick<Comissao, 'titulo' | 'prazo' | 'opcaoTitulo' | 'tipoPedido'> | null,
): boolean {
  if (!pedido) return false;
  if (pedido.tipoPedido === 'compra_arte') return true;
  if (pedido.tipoPedido === 'comissao') return false;
  const titulo = (pedido.titulo || '').trim();
  const prazo = (pedido.prazo || '').trim();
  const opcao = (pedido.opcaoTitulo || '').trim();
  return (
    titulo.startsWith('Aquisição:') ||
    prazo === 'Entrega imediata após confirmação do pagamento' ||
    opcao.startsWith('Obra Digital') ||
    opcao === 'Obra de Portfólio'
  );
}

export interface CalculoRepasseArtista {
  valorBruto: number;
  temTaxa: boolean;
  taxaPercentual: number;
  valorTaxa: number;
  valorLiquido: number;
  recusadaPeloCliente?: boolean;
  percentualRecebido?: number;
}

/**
 * Regra financeira ChArte:
 * - Se o cliente recusar a entrega da comissão, o artista recebe 50% do pagamento.
 * - Se o cliente aceitar e o valor total for > R$ 30,00, aplica-se taxa de 8%.
 * - Caso contrário (<= R$ 30,00), não há desconto de taxa (0%).
 */
export function calcularRepasseArtista(
  valorTotal: number,
  recusadaPeloCliente = false,
): CalculoRepasseArtista {
  const bruto = Math.max(0, Number(valorTotal || 0));
  if (recusadaPeloCliente) {
    const valorLiquido = Math.round(bruto * 50) / 100;
    const valorTaxa = Math.round((bruto - valorLiquido) * 100) / 100;
    return {
      valorBruto: bruto,
      temTaxa: false,
      taxaPercentual: 50,
      valorTaxa,
      valorLiquido,
      recusadaPeloCliente: true,
      percentualRecebido: 50,
    };
  }
  if (bruto > 30) {
    const taxaPercentual = 8;
    const valorTaxa = Math.round(bruto * taxaPercentual) / 100;
    const valorLiquido = Math.round((bruto - valorTaxa) * 100) / 100;
    return {
      valorBruto: bruto,
      temTaxa: true,
      taxaPercentual,
      valorTaxa,
      valorLiquido,
      recusadaPeloCliente: false,
      percentualRecebido: 92,
    };
  }
  return {
    valorBruto: bruto,
    temTaxa: false,
    taxaPercentual: 0,
    valorTaxa: 0,
    valorLiquido: Math.round(bruto * 100) / 100,
    recusadaPeloCliente: false,
    percentualRecebido: 100,
  };
}

export function entregaFoiRecusadaPeloCliente(
  pedido?: Pick<Comissao, 'status' | 'arquivoEntrega' | 'pagamentoStatus'> | null,
): boolean {
  if (!pedido) return false;
  return (
    pedido.status === 'Recusada' &&
    (Boolean(pedido.arquivoEntrega) || pedido.pagamentoStatus === 'pago')
  );
}

export function calcularRepasseComissao(
  pedido?: Pick<Comissao, 'valor' | 'propostaValor' | 'status' | 'arquivoEntrega' | 'pagamentoStatus'> | null,
): CalculoRepasseArtista {
  if (!pedido) return calcularRepasseArtista(0, false);
  const valor = Number(pedido.propostaValor ?? pedido.valor ?? 0);
  return calcularRepasseArtista(valor, entregaFoiRecusadaPeloCliente(pedido));
}

export function pagamentoLiberadoParaArtista(
  pedido?: Pick<Comissao, 'status' | 'pagamentoStatus' | 'pagamentoLiberado' | 'arquivoEntrega'> | null,
): boolean {
  if (!pedido) return false;
  if (pedido.pagamentoLiberado === true) return true;
  if (pedido.status === 'Finalizada') return true;
  return entregaFoiRecusadaPeloCliente(pedido);
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
