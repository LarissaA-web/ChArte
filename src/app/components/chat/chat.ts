import { AsyncPipe, DatePipe } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription, interval } from 'rxjs';
import { ModalService } from '../../../services/modal.service';
import { ChatConversation, ChatMessage, ChatService, ChatUser } from '../../../services/chat.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule, RouterLink, AsyncPipe, DatePipe],
  templateUrl: './chat.html',
  styleUrl: './chat.css',
})
export class Chat {
  conversations: ChatConversation[] = [];
  selectedConversation: ChatConversation | null = null;
  messages: ChatMessage[] = [];
  searchResults: ChatUser[] = [];
  draft = '';
  search = '';
  loadingConversations = false;
  loadingMessages = false;
  sending = false;
  creatingConversation = false;
  errorMessage = '';
  private refreshSubscription?: Subscription;

  constructor(
    public modal: ModalService,
    private chatService: ChatService,
  ) {
    this.modal.modalOpen$.subscribe((modal) => {
      if (modal === 'chat') {
        this.abrirChat(this.modal.consumeChatTarget());
        this.refreshSubscription?.unsubscribe();
        this.refreshSubscription = interval(5000).subscribe(() => this.atualizarChat());
      } else {
        this.refreshSubscription?.unsubscribe();
        this.refreshSubscription = undefined;
      }
    });
  }

  private abrirChat(target: { username?: string; userId?: string } | null): void {
    this.errorMessage = '';
    if (target?.username || target?.userId) {
      this.loadingConversations = true;
      this.creatingConversation = true;
      const request = target.username
        ? this.chatService.criarConversaPorUsername(target.username)
        : this.chatService.criarConversa(target.userId!);
      request.subscribe({
        next: (conversation) => {
          this.loadingConversations = false;
          this.creatingConversation = false;
          this.conversations = [conversation, ...this.conversations.filter((item) => item.id !== conversation.id)];
          this.selecionarConversa(conversation);
        },
        error: (error: HttpErrorResponse) => {
          this.loadingConversations = false;
          this.creatingConversation = false;
          const pessoa = target.username ? `@${target.username}` : 'este artista';
          this.errorMessage = this.mensagemErro(error, `Não foi possível abrir a conversa com ${pessoa}.`);
          this.carregarConversas();
        },
      });
      return;
    }
    this.carregarConversas();
  }

  private atualizarChat(): void {
    this.chatService.listarConversas().subscribe({
      next: (conversations) => {
        this.conversations = conversations;
        const selected = conversations.find((item) => item.id === this.selectedConversation?.id);
        if (!this.selectedConversation && conversations[0]) this.selecionarConversa(conversations[0]);
        else if (selected) this.selectedConversation = selected;
      },
      error: () => { /* A falha momentânea será tentada novamente no próximo ciclo. */ },
    });
    const conversationId = this.selectedConversation?.id;
    if (conversationId) {
      this.chatService.listarMensagens(conversationId).subscribe({
        next: (messages) => {
          if (this.selectedConversation?.id === conversationId) this.messages = messages;
        },
        error: () => { /* A falha momentânea será tentada novamente no próximo ciclo. */ },
      });
    }
  }

  private carregarConversas(): void {
    this.loadingConversations = true;
    this.chatService.listarConversas().subscribe({
      next: (conversations) => {
        this.conversations = conversations;
        this.loadingConversations = false;
        const active = conversations.find((item) => item.id === this.selectedConversation?.id) ?? conversations[0] ?? null;
        if (active) this.selecionarConversa(active);
        else {
          this.selectedConversation = null;
          this.messages = [];
        }
      },
      error: (error: HttpErrorResponse) => {
        this.loadingConversations = false;
        this.errorMessage = this.mensagemErro(error, 'Não foi possível carregar suas conversas.');
      },
    });
  }

  selecionarConversa(conversation: ChatConversation): void {
    this.selectedConversation = conversation;
    this.messages = [];
    this.loadingMessages = true;
    this.errorMessage = '';
    this.chatService.listarMensagens(conversation.id).subscribe({
      next: (messages) => {
        if (this.selectedConversation?.id === conversation.id) this.messages = messages;
        this.loadingMessages = false;
      },
      error: (error: HttpErrorResponse) => {
        this.loadingMessages = false;
        this.errorMessage = this.mensagemErro(error, 'Não foi possível carregar as mensagens.');
      },
    });
  }

  buscarUsuarios(query: string): void {
    this.search = query;
    this.errorMessage = '';
    if (query.trim().length < 2) {
      this.searchResults = [];
      return;
    }
    this.chatService.buscarUsuarios(query.trim()).subscribe({
      next: (users) => {
        if (this.search.trim() === query.trim()) this.searchResults = users;
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.mensagemErro(error, 'Não foi possível buscar usuários.');
      },
    });
  }

  iniciarConversa(user: ChatUser): void {
    this.creatingConversation = true;
    this.errorMessage = '';
    this.chatService.criarConversa(user.id).subscribe({
      next: (conversation) => {
        this.creatingConversation = false;
        this.search = '';
        this.searchResults = [];
        if (!this.conversations.some((item) => item.id === conversation.id)) {
          this.conversations = [conversation, ...this.conversations];
        }
        this.selecionarConversa(conversation);
      },
      error: (error: HttpErrorResponse) => {
        this.creatingConversation = false;
        this.errorMessage = this.mensagemErro(error, 'Não foi possível iniciar a conversa.');
      },
    });
  }

  enviarMensagem(): void {
    const content = this.draft.trim();
    const conversation = this.selectedConversation;
    if (!content || !conversation || this.sending) return;

    this.sending = true;
    this.errorMessage = '';
    this.chatService.enviarMensagem(conversation.id, content).subscribe({
      next: (message) => {
        if (this.selectedConversation?.id === conversation.id) this.messages = [...this.messages, message];
        this.conversations = this.conversations.map((item) => item.id === conversation.id
          ? { ...item, lastMessage: { content: message.content, createdAt: message.createdAt } }
          : item);
        this.draft = '';
        this.sending = false;
      },
      error: (error: HttpErrorResponse) => {
        this.sending = false;
        this.errorMessage = this.mensagemErro(error, 'Não foi possível enviar a mensagem.');
      },
    });
  }

  mensagemMinha(message: ChatMessage): boolean {
    return message.isMine;
  }

  private mensagemErro(error: HttpErrorResponse, fallback: string): string {
    if (error.status === 401) return 'Entre na sua conta para usar o chat.';
    if (error.status === 0) return 'Não foi possível conectar ao servidor do chat.';
    return error.error?.message || fallback;
  }
}
