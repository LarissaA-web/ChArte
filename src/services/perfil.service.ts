import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { PerfilView } from '../app/models/perfil';
import { supabase } from '../app/core/supabase/supabase.client';
import { catchError } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class PerfilService {

  getPerfil(nomeUsuario: string): Observable<PerfilView | null> {
    const nome = nomeUsuario.trim().replace(/^@/, '').toLowerCase();
    return from(this.buscarPerfilNoBanco(nome)).pipe(
      catchError(() => of(null))
    );
  }

  private async buscarPerfilNoBanco(nomeUsuario: string): Promise<PerfilView | null> {
    const { data: usuario, error } = await supabase
      .from('usuario')
      .select(`
        id_usuario,
        nome_usuario,
        nome,
        foto_perfil,
        banner_perfil,
        bio,
        tipo_usuario
      `)
      .ilike('nome_usuario', nomeUsuario)
      .maybeSingle();

    if (error || !usuario) {
      return null;
    }

    const ehArtista =
      String(usuario.tipo_usuario).toLowerCase() === 'artista';

    let artistaData: {
      id_artista: number;
      nome_artistico: string;
      data_inicio: string;
    } | null = null;

    if (ehArtista) {
      const { data: artista } = await supabase
        .from('artista')
        .select('id_artista, nome_artistico, data_inicio')
        .eq('id_usuario', usuario.id_usuario)
        .maybeSingle();

      artistaData = artista;
    }

    const [
      { data: redes },
      { count: seguidoresCount },
      { count: seguindoCount },
      { data: reviewsData },
    ] = await Promise.all([
      supabase
        .from('redes_sociais')
        .select('twitter, instagram, tiktok, youtube')
        .eq('id_usuario', usuario.id_usuario)
        .maybeSingle(),
      supabase
        .from('seguidores')
        .select('id', { count: 'exact', head: true })
        .eq('id_seguindo', usuario.id_usuario),
      supabase
        .from('seguidores')
        .select('id', { count: 'exact', head: true })
        .eq('id_seguidor', usuario.id_usuario),
      artistaData?.id_artista
        ? supabase
            .from('review')
            .select('nota')
            .eq('id_artista', artistaData.id_artista)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const redesSociais = redes ?? {};
    const totalReviews = Array.isArray(reviewsData) ? reviewsData.length : 0;
    const avaliacaoMedia =
      totalReviews > 0
        ? Number(
            (
              reviewsData!.reduce((acc: number, r: any) => acc + Number(r.nota ?? 5), 0) /
              totalReviews
            ).toFixed(1),
          )
        : 0;

    return {
      idUsuario: String(usuario.id_usuario),
      nomeUsuario: usuario.nome_usuario,
      nome: usuario.nome,
      nomeArtistico: artistaData?.nome_artistico,
      fotoPerfil: usuario.foto_perfil || '/gato.jpeg',
      banner: usuario.banner_perfil || '/nimona.jpeg',
      bio: usuario.bio || '',
      tipoUsuario: ehArtista
        ? 'Artista'
        : String(usuario.tipo_usuario).toLowerCase() === 'cliente'
          ? 'Comum'
          : usuario.tipo_usuario,
      seguidores: seguidoresCount ?? 0,
      seguindo: seguindoCount ?? 0,
      avaliacaoMedia,
      totalReviews,
      idArtista: artistaData?.id_artista,
      redesSociais: redesSociais || {},
    };
  }

  async atualizarPerfil(
    nomeUsuario: string,
    dadosAtualizados: Partial<PerfilView>
  ): Promise<boolean> {
    const { data: authData, error: erroAuth } =
      await supabase.auth.getUser();

    const authUser = authData.user;
    if (erroAuth || !authUser) {
      return false;
    }

    const { data: usuario, error: erroUsuario } = await supabase
      .from('usuario')
      .select('id_usuario, nome_usuario, tipo_usuario')
      .eq('id_auth', authUser.id)
      .maybeSingle();

    if (erroUsuario || !usuario) {
      return false;
    }

    const nomeAtual = nomeUsuario.trim().toLowerCase();
    if (usuario.nome_usuario?.trim().toLowerCase() !== nomeAtual) {
      return false;
    }

    let sucesso = true;

    const usuarioUpdates: Record<string, unknown> = {};
    if (dadosAtualizados.nome !== undefined)
      usuarioUpdates['nome'] = dadosAtualizados.nome;
    if (dadosAtualizados.fotoPerfil !== undefined)
      usuarioUpdates['foto_perfil'] = dadosAtualizados.fotoPerfil;
    if (dadosAtualizados.banner !== undefined)
      usuarioUpdates['banner_perfil'] = dadosAtualizados.banner;
    if (dadosAtualizados.bio !== undefined)
      usuarioUpdates['bio'] = dadosAtualizados.bio;

    if (Object.keys(usuarioUpdates).length > 0) {
      const { data, error } = await supabase
        .from('usuario')
        .update(usuarioUpdates)
        .eq('id_usuario', usuario.id_usuario)
        .select('id_usuario');

      if (error || !data || data.length === 0) {
        sucesso = false;
      }
    }

    const ehArtista =
      String(usuario.tipo_usuario).toLowerCase() === 'artista';

    if (ehArtista && dadosAtualizados.nomeArtistico !== undefined) {
      const { data, error } = await supabase
        .from('artista')
        .update({ nome_artistico: dadosAtualizados.nomeArtistico })
        .eq('id_usuario', usuario.id_usuario)
        .select('id_artista');

      if (error || !data || data.length === 0) {
        sucesso = false;
      }
    }

    if (dadosAtualizados.redesSociais) {
      const redes = dadosAtualizados.redesSociais;
      const { error } = await supabase
        .from('redes_sociais')
        .upsert(
          {
            id_usuario: usuario.id_usuario,
            twitter: redes.twitter ?? null,
            instagram: redes.instagram ?? null,
            tiktok: redes.tiktok ?? null,
            youtube: redes.youtube ?? null,
          },
          { onConflict: 'id_usuario' }
        );

      if (error) {
        sucesso = false;
      }
    }

    return sucesso;
  }

  async nomeUsuarioDisponivel(nomeUsuario: string, atual = ''): Promise<boolean> {
    const nome = nomeUsuario.trim().replace(/^@/, '').toLowerCase();
    const atualLower = atual.trim().replace(/^@/, '').toLowerCase();

    if (nome === atualLower) return true;

    const { data, error } = await supabase
      .from('usuario')
      .select('nome_usuario')
      .ilike('nome_usuario', nome)
      .limit(1);

    if (error) return false;
    return !data || data.length === 0;
  }

  async criarPerfil(dados: {
    idUsuario: string;
    nomeUsuario: string;
    nome: string;
    nomeArtistico?: string;
    email: string;
    tipoUsuario: 'Comum' | 'Artista';
  }): Promise<PerfilView | null> {
    return this.buscarPerfilNoBanco(dados.nomeUsuario);
  }

  async removerPerfil(idUsuario: string): Promise<void> {
    // Exclusão gerenciada pela conta autenticada
  }
}
