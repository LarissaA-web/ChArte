import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { supabase } from '../app/core/supabase/supabase.client';
import { AuthService } from './auth.service';

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
  constructor(
    private http: HttpClient,
    private auth: AuthService,
  ) {}

  listarConversas(): Observable<ChatConversation[]> {
    return this.http
      .get<ChatConversation[]>(`${CHAT_API_BASE_URL}/conversations`, { withCredentials: true })
      .pipe(catchError(() => from(this.listarConversasSupabase())));
  }

  buscarUsuarios(query: string): Observable<ChatUser[]> {
    return this.http
      .get<ChatUser[]>(`${CHAT_API_BASE_URL}/users`, {
        params: { q: query },
        withCredentials: true,
      })
      .pipe(catchError(() => from(this.buscarUsuariosSupabase(query))));
  }

  criarConversa(participantId: string): Observable<ChatConversation> {
    return this.http
      .post<ChatConversation>(
        `${CHAT_API_BASE_URL}/conversations`,
        { participantId },
        { withCredentials: true },
      )
      .pipe(catchError(() => from(this.criarConversaSupabase({ participantId }))));
  }

  criarConversaPorUsername(participantUsername: string): Observable<ChatConversation> {
    return this.http
      .post<ChatConversation>(
        `${CHAT_API_BASE_URL}/conversations`,
        { participantUsername },
        { withCredentials: true },
      )
      .pipe(catchError(() => from(this.criarConversaSupabase({ participantUsername }))));
  }

  listarMensagens(conversationId: string): Observable<ChatMessage[]> {
    return this.http
      .get<ChatMessage[]>(
        `${CHAT_API_BASE_URL}/conversations/${encodeURIComponent(conversationId)}/messages`,
        { withCredentials: true },
      )
      .pipe(catchError(() => from(this.listarMensagensSupabase(conversationId))));
  }

  enviarMensagem(conversationId: string, content: string): Observable<ChatMessage> {
    return this.http
      .post<ChatMessage>(
        `${CHAT_API_BASE_URL}/conversations/${encodeURIComponent(conversationId)}/messages`,
        { content },
        { withCredentials: true },
      )
      .pipe(catchError(() => from(this.enviarMensagemSupabase(conversationId, content))));
  }

  private async listarConversasSupabase(): Promise<ChatConversation[]> {
    const me = Number(this.auth.getUsuarioLogado()?.idUsuario);
    if (!me) return [];

    const { data: minhasPart } = await supabase
      .from('participante_conversa')
      .select('id_conversa')
      .eq('id_usuario', me);

    if (!minhasPart?.length) return [];
    const idsConversas = minhasPart.map((p: any) => Number(p.id_conversa));

    const [{ data: outrasPart }, { data: mensagens }] = await Promise.all([
      supabase
        .from('participante_conversa')
        .select('id_conversa, id_usuario')
        .in('id_conversa', idsConversas)
        .neq('id_usuario', me),
      supabase
        .from('mensagens')
        .select('id_conversa, conteudo, data_envio')
        .in('id_conversa', idsConversas)
        .order('data_envio', { ascending: false }),
    ]);

    if (!outrasPart?.length) return [];
    const idsUsuarios = Array.from(new Set(outrasPart.map((p: any) => Number(p.id_usuario))));
    const { data: usuarios } = await supabase
      .from('usuario')
      .select('id_usuario, nome_usuario, nome, foto_perfil')
      .in('id_usuario', idsUsuarios);

    const mapaUsuarios = new Map<number, ChatUser>();
    (usuarios || []).forEach((u: any) => {
      mapaUsuarios.set(Number(u.id_usuario), {
        id: String(u.id_usuario),
        username: u.nome_usuario,
        displayName: u.nome || u.nome_usuario,
        avatarUrl: u.foto_perfil || '/gato.jpeg',
      });
    });

    const ultimaMsgPorConversa = new Map<number, { content: string; createdAt: string }>();
    (mensagens || []).forEach((m: any) => {
      const cid = Number(m.id_conversa);
      if (!ultimaMsgPorConversa.has(cid)) {
        ultimaMsgPorConversa.set(cid, {
          content: m.conteudo,
          createdAt: m.data_envio,
        });
      }
    });

    return outrasPart
      .map((op: any): ChatConversation | null => {
        const participant = mapaUsuarios.get(Number(op.id_usuario));
        if (!participant) return null;
        return {
          id: String(op.id_conversa),
          participant,
          lastMessage: ultimaMsgPorConversa.get(Number(op.id_conversa)) ?? null,
        };
      })
      .filter((c): c is ChatConversation => !!c);
  }

  private async buscarUsuariosSupabase(query: string): Promise<ChatUser[]> {
    const me = Number(this.auth.getUsuarioLogado()?.idUsuario);
    const q = (query || '').trim().replace(/^@/, '');
    let builder = supabase
      .from('usuario')
      .select('id_usuario, nome_usuario, nome, foto_perfil')
      .limit(15);

    if (me) {
      builder = builder.neq('id_usuario', me);
    }
    if (q) {
      builder = builder.or(`nome_usuario.ilike.%${q}%,nome.ilike.%${q}%`);
    }

    const { data } = await builder;
    return (data || []).map((u: any) => ({
      id: String(u.id_usuario),
      username: u.nome_usuario,
      displayName: u.nome || u.nome_usuario,
      avatarUrl: u.foto_perfil || '/gato.jpeg',
    }));
  }

  private async criarConversaSupabase(opts: {
    participantId?: string;
    participantUsername?: string;
  }): Promise<ChatConversation> {
    const me = Number(this.auth.getUsuarioLogado()?.idUsuario);
    if (!me) throw new Error('Faça login para iniciar uma conversa.');

    let query = supabase.from('usuario').select('id_usuario, nome_usuario, nome, foto_perfil');
    if (opts.participantUsername) {
      query = query.ilike('nome_usuario', opts.participantUsername.trim().replace(/^@/, ''));
    } else if (opts.participantId) {
      query = query.eq('id_usuario', Number(opts.participantId));
    }
    const { data: target, error: errTarget } = await query.maybeSingle();
    if (errTarget || !target) {
      throw new Error('Destinatário não encontrado.');
    }

    const targetId = Number(target.id_usuario);
    if (targetId === me) {
      throw new Error('Não é possível iniciar conversa consigo mesmo.');
    }

    const { data: minhas } = await supabase
      .from('participante_conversa')
      .select('id_conversa')
      .eq('id_usuario', me);

    let conversationId: number | null = null;
    if (minhas?.length) {
      const ids = minhas.map((m: any) => Number(m.id_conversa));
      const { data: comum } = await supabase
        .from('participante_conversa')
        .select('id_conversa')
        .in('id_conversa', ids)
        .eq('id_usuario', targetId)
        .limit(1);
      if (comum?.length) {
        conversationId = Number(comum[0].id_conversa);
      }
    }

    if (!conversationId) {
      const { data: novaConv, error: errConv } = await supabase
        .from('conversas')
        .insert({})
        .select('id_conversa')
        .single();
      if (errConv || !novaConv) {
        throw new Error('Não foi possível criar a conversa.');
      }
      conversationId = Number(novaConv.id_conversa);
      await supabase.from('participante_conversa').insert([
        { id_conversa: conversationId, id_usuario: me },
        { id_conversa: conversationId, id_usuario: targetId },
      ]);
    }

    return {
      id: String(conversationId),
      participant: {
        id: String(target.id_usuario),
        username: target.nome_usuario,
        displayName: target.nome || target.nome_usuario,
        avatarUrl: target.foto_perfil || '/gato.jpeg',
      },
      lastMessage: null,
    };
  }

  private async listarMensagensSupabase(conversationId: string): Promise<ChatMessage[]> {
    const me = Number(this.auth.getUsuarioLogado()?.idUsuario);
    const { data } = await supabase
      .from('mensagens')
      .select('id_mensagem, id_remetente, conteudo, data_envio')
      .eq('id_conversa', Number(conversationId))
      .order('data_envio', { ascending: true });

    return (data || []).map((m: any) => ({
      id: String(m.id_mensagem),
      isMine: Number(m.id_remetente) === me,
      content: m.conteudo,
      createdAt: m.data_envio || new Date().toISOString(),
    }));
  }

  private async enviarMensagemSupabase(
    conversationId: string,
    content: string,
  ): Promise<ChatMessage> {
    const me = Number(this.auth.getUsuarioLogado()?.idUsuario);
    if (!me) throw new Error('Faça login para enviar mensagens.');

    const { data, error } = await supabase
      .from('mensagens')
      .insert({
        id_conversa: Number(conversationId),
        id_remetente: me,
        conteudo: content.trim(),
      })
      .select('id_mensagem, conteudo, data_envio')
      .single();

    if (error || !data) {
      throw new Error('Não foi possível enviar a mensagem.');
    }

    return {
      id: String(data.id_mensagem),
      isMine: true,
      content: data.conteudo,
      createdAt: data.data_envio || new Date().toISOString(),
    };
  }
}
