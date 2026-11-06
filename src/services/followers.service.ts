import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { supabase } from '../app/core/supabase/supabase.client';
import { AuthService } from './auth.service';

export interface FollowSummary {
  targetUserId: number;
  username: string;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
}

export interface FollowerProfile {
  userId: number;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  bio: string | null;
  isArtist: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class FollowersService {
  private readonly baseUrl = '/api/followers';
  private readonly summariesSubject = new BehaviorSubject<Record<string, FollowSummary>>({});
  public readonly summaries$: Observable<Record<string, FollowSummary>> =
    this.summariesSubject.asObservable();
  private backendIndisponivelAte = 0;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
  ) {}

  private deveTentarBackend(): boolean {
    return Date.now() >= this.backendIndisponivelAte;
  }

  private marcarBackendIndisponivel(): void {
    this.backendIndisponivelAte = Date.now() + 60_000;
  }

  private propagarErroBackend(error: unknown): void {
    if (error instanceof HttpErrorResponse && [401, 403, 503].includes(error.status)) {
      const body = error.error;
      const message = typeof body === 'string' ? body : body?.message || body?.detail;
      throw new Error(message || (error.status === 503
        ? 'A API de seguidores está temporariamente indisponível.'
        : 'Você não tem autorização para acessar este recurso.'));
    }
  }

  getSnapshot(username: string): FollowSummary | null {
    if (!username) return null;
    const key = username.trim().replace(/^@/, '').toLowerCase();
    return this.summariesSubject.value[key] ?? null;
  }

  async obterResumo(username: string): Promise<FollowSummary> {
    const cleanUsername = (username || '').trim().replace(/^@/, '');
    if (!cleanUsername) {
      throw new Error('Nome de usuário inválido.');
    }

    if (this.deveTentarBackend()) {
      try {
        const summary = await firstValueFrom(
          this.http.get<FollowSummary>(`${this.baseUrl}/${encodeURIComponent(cleanUsername)}/summary`),
        );
        if (summary) {
          this.emitSummary(summary, cleanUsername);
          return summary;
        }
      } catch (error) {
        this.propagarErroBackend(error);
        this.marcarBackendIndisponivel();
      }
    }

    const summary = await this.obterResumoSupabase(cleanUsername);
    this.emitSummary(summary, cleanUsername);
    return summary;
  }

  async seguirArtista(username: string): Promise<FollowSummary> {
    const cleanUsername = (username || '').trim().replace(/^@/, '');
    const currentUser = this.authService.getUsuarioLogado();
    if (!currentUser?.idUsuario) {
      throw new Error('Faça login para seguir artistas.');
    }

    const nomeUsuarioAtual = currentUser.nomeUsuario.trim().toLowerCase();
    const nomeArtisticoAtual = (currentUser.nomeArtistico || '').trim().toLowerCase();
    if (
      nomeUsuarioAtual === cleanUsername.toLowerCase() ||
      (nomeArtisticoAtual && nomeArtisticoAtual === cleanUsername.toLowerCase())
    ) {
      throw new Error('Você não pode seguir a si mesmo.');
    }

    const target = await this.buscarUsuarioPorUsername(cleanUsername);
    const idSeguidor = Number(currentUser.idUsuario);
    const idSeguindo = Number(target.id_usuario);

    if (idSeguidor === idSeguindo) {
      throw new Error('Você não pode seguir a si mesmo.');
    }

    if (this.deveTentarBackend()) {
      try {
        const summary = await firstValueFrom(
          this.http.post<FollowSummary>(`${this.baseUrl}/${encodeURIComponent(target.nome_usuario)}`, {}),
        );
        if (summary) {
          this.emitSummary(summary, cleanUsername);
          return summary;
        }
      } catch (err: any) {
        const status = Number(err?.status || 0);
        if ([400, 401, 403, 503].includes(status)) {
          this.propagarErroBackend(err);
          throw new Error(err?.error?.message || 'Não foi possível seguir este perfil.');
        }
        this.marcarBackendIndisponivel();
      }
    }

    const { error } = await supabase.from('seguidores').insert({
      id_seguidor: idSeguidor,
      id_seguindo: idSeguindo,
    });
    if (error && error.code !== '23505') {
      throw new Error('Não foi possível salvar o relacionamento de seguidores. Verifique sua conexão e autorização.');
    }

    const summary = await this.obterResumoSupabase(cleanUsername);
    this.emitSummary(summary, cleanUsername);
    if (currentUser.nomeUsuario) {
      await this.obterResumoSupabase(currentUser.nomeUsuario)
        .then((s) => this.emitSummary(s, currentUser.nomeUsuario))
        .catch(() => {});
    }
    return summary;
  }

  async deixarDeSeguirArtista(username: string): Promise<FollowSummary> {
    const cleanUsername = (username || '').trim().replace(/^@/, '');
    const currentUser = this.authService.getUsuarioLogado();
    if (!currentUser?.idUsuario) {
      throw new Error('Faça login para gerenciar artistas seguidos.');
    }

    const target = await this.buscarUsuarioPorUsername(cleanUsername);
    const idSeguidor = Number(currentUser.idUsuario);
    const idSeguindo = Number(target.id_usuario);

    if (this.deveTentarBackend()) {
      try {
        const summary = await firstValueFrom(
          this.http.delete<FollowSummary>(`${this.baseUrl}/${encodeURIComponent(target.nome_usuario)}`),
        );
        if (summary) {
          this.emitSummary(summary, cleanUsername);
          return summary;
        }
      } catch (error: any) {
        this.propagarErroBackend(error);
        this.marcarBackendIndisponivel();
      }
    }

    const { error: erroRemocao } = await supabase
        .from('seguidores')
        .delete()
        .eq('id_seguidor', idSeguidor)
        .eq('id_seguindo', idSeguindo);
    if (erroRemocao) throw new Error('Não foi possível deixar de seguir. Verifique sua conexão e autorização.');

    const summary = await this.obterResumoSupabase(cleanUsername);
    this.emitSummary(summary, cleanUsername);
    if (currentUser.nomeUsuario) {
      await this.obterResumoSupabase(currentUser.nomeUsuario)
        .then((s) => this.emitSummary(s, currentUser.nomeUsuario))
        .catch(() => {});
    }
    return summary;
  }

  async alternarSeguir(username: string): Promise<FollowSummary> {
    const atual = this.getSnapshot(username) ?? (await this.obterResumo(username));
    if (atual.isFollowing) {
      return this.deixarDeSeguirArtista(username);
    }
    return this.seguirArtista(username);
  }

  async listarSeguidores(username: string): Promise<FollowerProfile[]> {
    const cleanUsername = (username || '').trim().replace(/^@/, '');
    let remotos: FollowerProfile[] = [];
    if (this.deveTentarBackend()) {
      try {
        remotos = await firstValueFrom(
          this.http.get<FollowerProfile[]>(
            `${this.baseUrl}/${encodeURIComponent(cleanUsername)}/followers`,
          ),
        );
      } catch (error) {
        this.propagarErroBackend(error);
        this.marcarBackendIndisponivel();
      }
    }

    const target = await this.buscarUsuarioPorUsername(cleanUsername);
    const targetId = Number(target.id_usuario);
    let supabaseIds: number[] = [];
    try {
      const { data: relacoes, error } = await supabase
        .from('seguidores')
        .select('id_seguidor')
        .eq('id_seguindo', targetId)
        .order('id', { ascending: false });
      if (!error && Array.isArray(relacoes)) {
        supabaseIds = relacoes.map((r: any) => Number(r.id_seguidor));
      }
    } catch {
      supabaseIds = [];
    }

    const idsCombinados = Array.from(
      new Set([
        ...remotos.map((r) => Number(r.userId)),
        ...supabaseIds,
      ]),
    ).filter((id) => Number.isFinite(id) && id > 0);

    if (!idsCombinados.length) return remotos;
    return this.buscarPerfisPorIds(idsCombinados);
  }

  async listarSeguindo(username: string): Promise<FollowerProfile[]> {
    const cleanUsername = (username || '').trim().replace(/^@/, '');
    const currentUser = this.authService.getUsuarioLogado();
    if (currentUser?.idUsuario && currentUser.nomeUsuario?.toLowerCase() === cleanUsername.toLowerCase() && this.deveTentarBackend()) {
      try {
        const ids = await firstValueFrom(this.http.get<number[]>(`${this.baseUrl}/me/following-ids`));
        return this.buscarPerfisPorIds(ids.map(Number).filter((id) => Number.isFinite(id) && id > 0));
      } catch (error) {
        this.propagarErroBackend(error);
        this.marcarBackendIndisponivel();
      }
    }
    let remotos: FollowerProfile[] = [];
    if (this.deveTentarBackend()) {
      try {
        remotos = await firstValueFrom(
          this.http.get<FollowerProfile[]>(
            `${this.baseUrl}/${encodeURIComponent(cleanUsername)}/following`,
          ),
        );
      } catch (error) {
        this.propagarErroBackend(error);
        this.marcarBackendIndisponivel();
      }
    }

    const target = await this.buscarUsuarioPorUsername(cleanUsername);
    const targetId = Number(target.id_usuario);
    let supabaseIds: number[] = [];
    try {
      const { data: relacoes, error } = await supabase
        .from('seguidores')
        .select('id_seguindo')
        .eq('id_seguidor', targetId)
        .order('id', { ascending: false });
      if (!error && Array.isArray(relacoes)) {
        supabaseIds = relacoes.map((r: any) => Number(r.id_seguindo));
      }
    } catch {
      supabaseIds = [];
    }

    const idsCombinados = Array.from(
      new Set([
        ...remotos.map((r) => Number(r.userId)),
        ...supabaseIds,
      ]),
    ).filter((id) => Number.isFinite(id) && id > 0);

    if (!idsCombinados.length) return remotos;
    return this.buscarPerfisPorIds(idsCombinados);
  }

  private async obterResumoSupabase(username: string): Promise<FollowSummary> {
    const target = await this.buscarUsuarioPorUsername(username);
    const targetId = Number(target.id_usuario);
    const currentUser = this.authService.getUsuarioLogado();

    let remoteFollowersIds: number[] = [];
    let remoteFollowingIds: number[] = [];
    try {
      const [{ data: followersData, error: followersError }, { data: followingData, error: followingError }] = await Promise.all([
        supabase.from('seguidores').select('id_seguidor').eq('id_seguindo', targetId),
        supabase.from('seguidores').select('id_seguindo').eq('id_seguidor', targetId),
      ]);
      if (followersError || followingError) {
        throw new Error('Não foi possível carregar os relacionamentos de seguidores.');
      }
      if (Array.isArray(followersData)) {
        remoteFollowersIds = followersData.map((r: any) => Number(r.id_seguidor));
      }
      if (Array.isArray(followingData)) {
        remoteFollowingIds = followingData.map((r: any) => Number(r.id_seguindo));
      }
    } catch (error) {
      throw error instanceof Error ? error : new Error('Não foi possível carregar os relacionamentos de seguidores.');
    }

    const followersSet = new Set(remoteFollowersIds);
    const followingSet = new Set(remoteFollowingIds);

    const currentUserId = Number(currentUser?.idUsuario || 0);
    const isFollowing = currentUserId > 0 ? followersSet.has(currentUserId) : false;

    return {
      targetUserId: targetId,
      username: target.nome_usuario,
      followersCount: followersSet.size,
      followingCount: followingSet.size,
      isFollowing,
    };
  }

  private async buscarUsuarioPorUsername(
    username: string,
  ): Promise<{ id_usuario: number; nome_usuario: string }> {
    const clean = (username || '').trim().replace(/^@/, '');
    const { data, error } = await supabase
      .from('usuario')
      .select('id_usuario, nome_usuario')
      .ilike('nome_usuario', clean)
      .maybeSingle();

    if (!error && data) {
      return data;
    }

    // Fallback: busca pelo nome_artistico na tabela artista
    const { data: artistaData } = await supabase
      .from('artista')
      .select('id_usuario, nome_artistico')
      .ilike('nome_artistico', clean)
      .maybeSingle();

    if (artistaData?.id_usuario) {
      const { data: usuarioArtista } = await supabase
        .from('usuario')
        .select('id_usuario, nome_usuario')
        .eq('id_usuario', artistaData.id_usuario)
        .maybeSingle();

      if (usuarioArtista) {
        return usuarioArtista;
      }
      return {
        id_usuario: Number(artistaData.id_usuario),
        nome_usuario: artistaData.nome_artistico || clean,
      };
    }

    throw new Error(`Artista ou usuário "@${clean}" não encontrado.`);
  }

  private async buscarPerfisPorIds(ids: number[]): Promise<FollowerProfile[]> {
    if (!ids.length) return [];
    const { data: usuarios } = await supabase
      .from('usuario')
      .select('id_usuario, nome_usuario, nome, foto_perfil, bio, tipo_usuario')
      .in('id_usuario', ids);

    const mapaUsuarios = new Map<number, FollowerProfile>();
    (usuarios || []).forEach((u: any) => {
      const uid = Number(u.id_usuario);
      mapaUsuarios.set(uid, {
        userId: uid,
        username: u.nome_usuario,
        fullName: u.nome || u.nome_usuario,
        avatarUrl: u.foto_perfil || '/gato.jpeg',
        bio: u.bio || null,
        isArtist: String(u.tipo_usuario || '').toLowerCase() === 'artista',
      });
    });

    return ids.map((id) => mapaUsuarios.get(id)).filter((p): p is FollowerProfile => !!p);
  }

  private emitSummary(summary: FollowSummary, aliasUsername?: string): void {
    if (!summary?.username) return;
    const current = { ...this.summariesSubject.value };
    current[summary.username.trim().toLowerCase()] = summary;
    if (aliasUsername) {
      current[aliasUsername.trim().replace(/^@/, '').toLowerCase()] = summary;
    }
    this.summariesSubject.next(current);
  }
}
