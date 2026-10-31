import { Component } from '@angular/core';
import { ModalService } from '../../../../services/modal.service';

@Component({
  selector: 'app-post-button',
  standalone: true,
  templateUrl: './post-button.html',
  styleUrl: './post-button.css',
})
export class PostButton {
  constructor(private modalService: ModalService) {}

  adicionarPostagem(): void {
    this.modalService.openModal('postModal');
  }
}
