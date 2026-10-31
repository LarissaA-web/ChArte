import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Base da API do chat; ajuste aqui para o endereço do backend. */
export const CHAT_API_BASE_URL = '/api/chat';

export interface ChatUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface ChatConversation {
  id: string;
  participant: ChatUser;
  lastMessage?: { content: string; createdAt: string } | null;
}

export interface ChatMessage {
  id: string;
  isMine: boolean;
  content: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  constructor(private http: HttpClient) {}

  listarConversas(): Observable<ChatConversation[]> {
    return this.http.get<ChatConversation[]>(`${CHAT_API_BASE_URL}/conversations`, { withCredentials: true });
  }

  buscarUsuarios(query: string): Observable<ChatUser[]> {
    return this.http.get<ChatUser[]>(`${CHAT_API_BASE_URL}/users`, {
      params: { q: query },
      withCredentials: true,
    });
  }

  criarConversa(participantId: string): Observable<ChatConversation> {
    return this.http.post<ChatConversation>(
      `${CHAT_API_BASE_URL}/conversations`,
      { participantId },
      { withCredentials: true },
    );
  }

  criarConversaPorUsername(participantUsername: string): Observable<ChatConversation> {
    return this.http.post<ChatConversation>(
      `${CHAT_API_BASE_URL}/conversations`,
      { participantUsername },
      { withCredentials: true },
    );
  }

  listarMensagens(conversationId: string): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(
      `${CHAT_API_BASE_URL}/conversations/${encodeURIComponent(conversationId)}/messages`,
      { withCredentials: true },
    );
  }

  enviarMensagem(conversationId: string, content: string): Observable<ChatMessage> {
    return this.http.post<ChatMessage>(
      `${CHAT_API_BASE_URL}/conversations/${encodeURIComponent(conversationId)}/messages`,
      { content },
      { withCredentials: true },
    );
  }
}
