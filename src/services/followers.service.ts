import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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

interface LocalFollowEntry {
  idSeguidor: number;
  idSeguindo: number;
  createdAt: string;
}

const CHAVE_SEGUIDORES_LOCAL = 'charte_seguidores_store_v1';

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

  private lerSeguidoresLocais(): LocalFollowEntry[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(CHAVE_SEGUIDORES_LOCAL);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private salvarSeguidoresLocais(entries: LocalFollowEntry[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(CHAVE_SEGUIDORES_LOCAL, JSON.stringify(entries));
    } catch {
      // ignora erro de quota
    }
  }

  private adicionarSeguidorLocal(idSeguidor: number, idSeguindo: number): void {
    const lista = this.lerSeguidoresLocais();
    const existe = lista.some(
      (item) => Number(item.idSeguidor) === idSeguidor && Number(item.idSeguindo) === idSeguindo,
    );
    if (!existe) {
      lista.unshift({
        idSeguidor,
        idSeguindo,
        createdAt: new Date().toISOString(),
      });
      this.salvarSeguidoresLocais(lista);
    }
  }

  private removerSeguidorLocal(idSeguidor: number, idSeguindo: number): void {
    const lista = this.lerSeguidoresLocais().filter(
      (item) => !(Number(item.idSeguidor) === idSeguidor && Number(item.idSeguindo) === idSeguindo),
    );
    this.salvarSeguidoresLocais(lista);
  }

  private verificarRelacaoLocal(idSeguidor: number, idSeguindo: number): boolean {
    return this.lerSeguidoresLocais().some(
      (item) => Number(item.idSeguidor) === idSeguidor && Number(item.idSeguindo) === idSeguindo,
    );
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
          const enriquecido = await this.mesclarResumoComLocal(summary);
          this.emitSummary(enriquecido, cleanUsername);
          return enriquecido;
        }
      } catch {
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

    this.adicionarSeguidorLocal(idSeguidor, idSeguindo);

    if (this.deveTentarBackend()) {
      try {
        const summary = await firstValueFrom(
          this.http.post<FollowSummary>(`${this.baseUrl}/${encodeURIComponent(target.nome_usuario)}`, {}),
        );
        if (summary) {
          const enriquecido = await this.mesclarResumoComLocal(summary);
          this.emitSummary(enriquecido, cleanUsername);
          return enriquecido;
        }
      } catch (err: any) {
        const status = Number(err?.status || 0);
        if (status === 400 && err?.error?.message) {
          this.removerSeguidorLocal(idSeguidor, idSeguindo);
          throw new Error(err.error.message);
        }
        this.marcarBackendIndisponivel();
      }
    }

    const jaSegue = await this.verificarRelacaoSupabase(idSeguidor, idSeguindo);
    if (!jaSegue) {
      try {
        await supabase.from('seguidores').insert({
          id_seguidor: idSeguidor,
          id_seguindo: idSeguindo,
        });
      } catch {
        // Persistido localmente quando a tabela pública seguidores não está exposta no schema cache
      }
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

    this.removerSeguidorLocal(idSeguidor, idSeguindo);

    if (this.deveTentarBackend()) {
      try {
        const summary = await firstValueFrom(
          this.http.delete<FollowSummary>(`${this.baseUrl}/${encodeURIComponent(target.nome_usuario)}`),
        );
        if (summary) {
          const enriquecido = await this.mesclarResumoComLocal(summary);
          this.emitSummary(enriquecido, cleanUsername);
          return enriquecido;
        }
      } catch {
        this.marcarBackendIndisponivel();
      }
    }

    try {
      await supabase
        .from('seguidores')
        .delete()
        .eq('id_seguidor', idSeguidor)
        .eq('id_seguindo', idSeguindo);
    } catch {
      // Removido localmente
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
      } catch {
        this.marcarBackendIndisponivel();
      }
    }

    const target = await this.buscarUsuarioPorUsername(cleanUsername);
    const targetId = Number(target.id_usuario);
    const locaisIds = this.lerSeguidoresLocais()
      .filter((item) => Number(item.idSeguindo) === targetId)
      .map((item) => Number(item.idSeguidor));

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
        ...locaisIds,
      ]),
    ).filter((id) => Number.isFinite(id) && id > 0);

    if (!idsCombinados.length) return remotos;
    return this.buscarPerfisPorIds(idsCombinados);
  }

  async listarSeguindo(username: string): Promise<FollowerProfile[]> {
    const cleanUsername = (username || '').trim().replace(/^@/, '');
    let remotos: FollowerProfile[] = [];
    if (this.deveTentarBackend()) {
      try {
        remotos = await firstValueFrom(
          this.http.get<FollowerProfile[]>(
            `${this.baseUrl}/${encodeURIComponent(cleanUsername)}/following`,
          ),
        );
      } catch {
        this.marcarBackendIndisponivel();
      }
    }

    const target = await this.buscarUsuarioPorUsername(cleanUsername);
    const targetId = Number(target.id_usuario);
    const locaisIds = this.lerSeguidoresLocais()
      .filter((item) => Number(item.idSeguidor) === targetId)
      .map((item) => Number(item.idSeguindo));

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
        ...locaisIds,
      ]),
    ).filter((id) => Number.isFinite(id) && id > 0);

    if (!idsCombinados.length) return remotos;
    return this.buscarPerfisPorIds(idsCombinados);
  }

  private async mesclarResumoComLocal(summary: FollowSummary): Promise<FollowSummary> {
    const currentUser = this.authService.getUsuarioLogado();
    const targetId = Number(summary.targetUserId);
    const locais = this.lerSeguidoresLocais();

    const seguidoresLocais = locais.filter((r) => Number(r.idSeguindo) === targetId).length;
    const seguindoLocais = locais.filter((r) => Number(r.idSeguidor) === targetId).length;
    const segueLocalmente = currentUser?.idUsuario
      ? this.verificarRelacaoLocal(Number(currentUser.idUsuario), targetId)
      : false;

    return {
      ...summary,
      followersCount: Math.max(Number(summary.followersCount || 0), seguidoresLocais),
      followingCount: Math.max(Number(summary.followingCount || 0), seguindoLocais),
      isFollowing: Boolean(summary.isFollowing || segueLocalmente),
    };
  }

  private async obterResumoSupabase(username: string): Promise<FollowSummary> {
    const target = await this.buscarUsuarioPorUsername(username);
    const targetId = Number(target.id_usuario);
    const currentUser = this.authService.getUsuarioLogado();

    let remoteFollowersIds: number[] = [];
    let remoteFollowingIds: number[] = [];
    try {
      const [{ data: followersData }, { data: followingData }] = await Promise.all([
        supabase.from('seguidores').select('id_seguidor').eq('id_seguindo', targetId),
        supabase.from('seguidores').select('id_seguindo').eq('id_seguidor', targetId),
      ]);
      if (Array.isArray(followersData)) {
        remoteFollowersIds = followersData.map((r: any) => Number(r.id_seguidor));
      }
      if (Array.isArray(followingData)) {
        remoteFollowingIds = followingData.map((r: any) => Number(r.id_seguindo));
      }
    } catch {
      // ignora erro se tabela seguidores não existir no schema cache
    }

    const locais = this.lerSeguidoresLocais();
    const localFollowersIds = locais
      .filter((r) => Number(r.idSeguindo) === targetId)
      .map((r) => Number(r.idSeguidor));
    const localFollowingIds = locais
      .filter((r) => Number(r.idSeguidor) === targetId)
      .map((r) => Number(r.idSeguindo));

    const followersSet = new Set([...remoteFollowersIds, ...localFollowersIds]);
    const followingSet = new Set([...remoteFollowingIds, ...localFollowingIds]);

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

  private async verificarRelacaoSupabase(idSeguidor: number, idSeguindo: number): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('seguidores')
        .select('id')
        .eq('id_seguidor', idSeguidor)
        .eq('id_seguindo', idSeguindo)
        .limit(1);

      if (error) return false;
      return Array.isArray(data) && data.length > 0;
    } catch {
      return false;
    }
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
