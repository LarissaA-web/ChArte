import { Component, Input } from '@angular/core';
import { Post } from '../../../models/post';
import { PinCard } from '../../pin-card/pin-card';
import { ModalService } from '../../../../services/modal.service';

@Component({
  selector: 'app-portfolio',
  standalone: true,
  imports: [PinCard],
  templateUrl: './portfolio.html',
  styleUrl: './portfolio.css',
})
export class Portfolio {
  @Input() artes: Post[] = [];

  constructor(private modal: ModalService) {}

  abrirPin(arte: Post): void {
    this.modal.selecionarPost(arte);
    this.modal.openModal('pinModal');
  }
}

