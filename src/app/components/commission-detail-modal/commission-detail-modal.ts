import { CurrencyPipe } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Comissao } from '../../models/artist-area';

@Component({
  selector: 'app-commission-detail-modal',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './commission-detail-modal.html',
  styleUrl: './commission-detail-modal.css',
})
export class CommissionDetailModal {
  @Input({ required: true }) comissao!: Comissao;
  @Output() fechar = new EventEmitter<void>();
  @Output() iniciar = new EventEmitter<void>();
  @Output() enviar = new EventEmitter<void>();
  get pagamentoPago(): boolean { return this.comissao.pagamentoStatus === 'pago'; }
}
