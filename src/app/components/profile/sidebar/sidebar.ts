import { Component, Input, Output, EventEmitter } from '@angular/core';
import { PerfilView } from '../../../models/perfil';
import { ModalService } from '../../../../services/modal.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  constructor(public modal: ModalService) {}
  @Input() perfil!: PerfilView;
  @Input() isOwner: boolean = false;
  @Input() editandoPerfil = false;
  @Input() exibirInformacoes = true;
  @Input() exibirRedesSociais = true;
  @Output() editarPerfil = new EventEmitter<void>();

  abrirEditarPerfil(): void {
    if (this.isOwner) this.editarPerfil.emit();
  }
}
