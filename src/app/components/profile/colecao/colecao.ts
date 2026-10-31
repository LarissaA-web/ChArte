import { Component, Input } from '@angular/core';
import { Post } from '../../../models/post';
import { PinCard } from '../../pin-card/pin-card';
import { ModalService } from '../../../../services/modal.service';

@Component({
  selector: 'app-colecao',
  standalone: true,
  imports: [PinCard],
  templateUrl: './colecao.html',
  styleUrl: './colecao.css',
})
export class Colecao {
  @Input() artes: Post[] = [];

  constructor(private modal: ModalService) {}

  abrirPin(arte: Post): void {
    this.modal.selecionarPost(arte);
    this.modal.openModal('pinModal');
  }
}

