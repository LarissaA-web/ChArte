import { Comissao, StatusComissao } from '../../../models/artist-area';

export interface DashboardMetricas {
  semana: number;
  mes: number;
  ano: number;
  ganhos: number;
  pendentes: number;
  andamento: number;
  finalizadas: number;
}

export interface DashboardChartPoint {
  periodo: string;
  rotulo: string;
  valor: number;
}

export interface DashboardStatusPoint {
  status: StatusComissao;
  valor: number;
  cor: string;
}

export interface DashboardData {
  metricas: DashboardMetricas;
  comissoesSemana: DashboardChartPoint[];
  comissoesMes: DashboardChartPoint[];
  comissoesAno: DashboardChartPoint[];
  ganhosPorMes: DashboardChartPoint[];
  comissoesPorStatus: DashboardStatusPoint[];
}

const STATUS_DASHBOARD: { status: StatusComissao; cor: string }[] = [
  { status: 'Solicitada', cor: '#c084fc' },
  { status: 'Aguardando aprovação do cliente', cor: '#f6c85f' },
  { status: 'Pendente', cor: '#f6c85f' },
  { status: 'Em andamento', cor: '#5aa9e6' },
  { status: 'Entregue', cor: '#62c2a3' },
  { status: 'Finalizada', cor: '#8bd17c' },
  { status: 'Recusada', cor: '#f08a8a' },
  { status: 'Cancelada', cor: '#9292a8' },
];

const dataLocal = (data: Date): string => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
const dataComissao = (data: string): string => data.slice(0, 10);
const chaveMes = (data: string): string => data.slice(0, 7);
const nomeMes = (data: Date): string => new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(data).replace('.', '');

/** Pure projection from domain records to a backend-agnostic dashboard view model. */
export function criarDadosDashboard(comissoes: Comissao[], agora = new Date()): DashboardData {
  const hoje = dataLocal(agora);
  const mesAtual = hoje.slice(0, 7);
  const anoAtual = String(agora.getFullYear());
  const segunda = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  segunda.setDate(segunda.getDate() - ((segunda.getDay() + 6) % 7));
  const inicioSemana = dataLocal(segunda);
  const fimSemanaDate = new Date(segunda);
  fimSemanaDate.setDate(fimSemanaDate.getDate() + 6);

  const metricas: DashboardMetricas = {
    semana: comissoes.filter((item) => dataComissao(item.criadaEm) >= inicioSemana && dataComissao(item.criadaEm) <= hoje).length,
    mes: comissoes.filter((item) => chaveMes(item.criadaEm) === mesAtual && dataComissao(item.criadaEm) <= hoje).length,
    ano: comissoes.filter((item) => item.criadaEm.startsWith(anoAtual) && dataComissao(item.criadaEm) <= hoje).length,
    ganhos: comissoes.filter((item) => item.status === 'Finalizada' && chaveMes(item.concluidaEm || item.criadaEm) === mesAtual).reduce((total, item) => total + item.valor, 0),
    pendentes: comissoes.filter((item) => item.status === 'Pendente' || item.status === 'Solicitada' || item.status === 'Aguardando aprovação do cliente').length,
    andamento: comissoes.filter((item) => item.status === 'Em andamento' || item.status === 'Entregue').length,
    finalizadas: comissoes.filter((item) => item.status === 'Finalizada').length,
  };

  const comissoesSemana = Array.from({ length: 7 }, (_, index) => {
    const data = new Date(segunda);
    data.setDate(data.getDate() + index);
    const periodo = dataLocal(data);
    return { periodo, rotulo: new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(data).replace('.', ''), valor: comissoes.filter((item) => dataComissao(item.criadaEm) === periodo).length };
  });

  const diasNoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  const comissoesMes = Array.from({ length: diasNoMes }, (_, index) => {
    const dia = String(index + 1).padStart(2, '0');
    const periodo = `${mesAtual}-${dia}`;
    return { periodo, rotulo: dia, valor: comissoes.filter((item) => dataComissao(item.criadaEm) === periodo).length };
  });

  const comissoesAno = Array.from({ length: agora.getMonth() + 1 }, (_, index) => {
    const data = new Date(agora.getFullYear(), index, 1);
    const periodo = `${anoAtual}-${String(index + 1).padStart(2, '0')}`;
    return { periodo, rotulo: nomeMes(data), valor: comissoes.filter((item) => chaveMes(item.criadaEm) === periodo).length };
  });

  const ganhosPorMes = comissoesAno.map((mes) => ({
    ...mes,
    valor: comissoes.filter((item) => item.status === 'Finalizada' && chaveMes(item.concluidaEm || item.criadaEm) === mes.periodo).reduce((total, item) => total + item.valor, 0),
  }));
  const comissoesPorStatus = STATUS_DASHBOARD.map(({ status, cor }) => ({ status, cor, valor: comissoes.filter((item) => item.status === status).length }));

  return { metricas, comissoesSemana, comissoesMes, comissoesAno, ganhosPorMes, comissoesPorStatus };
}
