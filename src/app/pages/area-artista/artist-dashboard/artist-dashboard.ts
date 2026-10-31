import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardChartPoint, DashboardData } from './artist-dashboard.models';

interface BarraGrafico extends DashboardChartPoint {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

interface PontoLinha extends DashboardChartPoint {
  x: number;
  y: number;
}

@Component({
  selector: 'app-artist-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './artist-dashboard.html',
  styleUrl: './artist-dashboard.css',
})
export class ArtistDashboard {
  @Input() totalObras = 0;
  @Input() avaliacao = 0;
  @Input() dados: DashboardData = {
    metricas: { semana: 0, mes: 0, ano: 0, ganhos: 0, pendentes: 0, andamento: 0, finalizadas: 0 },
    comissoesSemana: [], comissoesMes: [], comissoesAno: [], ganhosPorMes: [], comissoesPorStatus: [],
  };

  readonly viewBoxLargura = 720;
  readonly linhaBase = 178;
  readonly alturaUtil = 128;

  get metricas() { return this.dados.metricas; }
  get totalComissoes(): number { return this.dados.comissoesPorStatus.reduce((total, item) => total + item.valor, 0); }
  get statusResumo() { return this.dados.comissoesPorStatus.filter((item) => ['Solicitada', 'Aguardando aprovação do cliente', 'Pendente', 'Em andamento', 'Entregue', 'Finalizada'].includes(item.status)); }
  get existeGanhoNoPeriodo(): boolean { return this.dados.ganhosPorMes.some((item) => item.valor > 0); }

  maximo(series: DashboardChartPoint[]): number { return Math.max(1, ...series.map((item) => item.valor)); }
  algumValor(series: DashboardChartPoint[]): boolean { return series.some((item) => item.valor > 0); }

  barras(series: DashboardChartPoint[]): BarraGrafico[] {
    if (!series.length) return [];
    const plotX = 38;
    const plotWidth = this.viewBoxLargura - plotX - 12;
    const step = plotWidth / series.length;
    const max = this.maximo(series);
    return series.map((item, index) => {
      const altura = item.valor ? Math.max(3, (item.valor / max) * this.alturaUtil) : 0;
      return { ...item, x: plotX + step * index + step * 0.24, y: this.linhaBase - altura, largura: Math.max(2, step * 0.52), altura };
    });
  }

  barrasDeMes(series: DashboardChartPoint[]): BarraGrafico[] {
    return this.barras(series).filter((_, index) => index % 5 === 0 || index === series.length - 1);
  }

  linha(series: DashboardChartPoint[]): PontoLinha[] {
    if (!series.length) return [];
    const plotX = 38;
    const plotWidth = this.viewBoxLargura - plotX - 12;
    const step = series.length > 1 ? plotWidth / (series.length - 1) : plotWidth;
    const max = this.maximo(series);
    return series.map((item, index) => ({ ...item, x: plotX + step * index, y: this.linhaBase - (item.valor / max) * this.alturaUtil }));
  }

  pontosLinha(series: DashboardChartPoint[]): string { return this.linha(series).map((item) => `${item.x},${item.y}`).join(' '); }
  resumoMaiorValor(series: DashboardChartPoint[]): number { return Math.max(0, ...series.map((item) => item.valor)); }
}
