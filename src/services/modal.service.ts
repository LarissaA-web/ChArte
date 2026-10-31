import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Post } from '../app/models/post';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class ModalService {
  private chatTarget = new BehaviorSubject<{ username?: string; userId?: string } | null>(null);
  private modalOpen = new BehaviorSubject<string | null>(null);
  modalOpen$ = this.modalOpen.asObservable();

  postSelecionado = new BehaviorSubject<Post | null>(null);
  postSelecionado$ = this.postSelecionado.asObservable();

  constructor(private auth: AuthService) {}

  openModal(modal: string) {
    if (modal !== 'chat') this.chatTarget.next(null);
    this.modalOpen.next(modal);
  }

  openChat(username?: string | null, userId?: string | number): void {
    if (!this.auth.estaLogado()) {
      this.openModal('login');
      return;
    }
    const normalizedUsername = username?.trim().replace(/^@/, '');
    this.chatTarget.next(normalizedUsername || userId != null ? {
      username: normalizedUsername || undefined,
      userId: userId != null ? String(userId) : undefined,
    } : null);
    this.modalOpen.next('chat');
  }

  exigirLogin(): boolean {
    if (this.auth.estaLogado()) return true;
    this.openModal('login');
    return false;
  }

  consumeChatTarget(): { username?: string; userId?: string } | null {
    const target = this.chatTarget.value;
    this.chatTarget.next(null);
    return target;
  }

  closeModal() {
    this.chatTarget.next(null);
    this.modalOpen.next(null);
  }
  selecionarPost(post: Post) {
    this.postSelecionado.next(post);
  }
}
