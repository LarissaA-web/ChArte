import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { PerfilView } from '../app/models/perfil';
import { supabase } from '../app/core/supabase/supabase.client';
import { map, catchError } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class PerfilService {

  getPerfil(nomeUsuario: string): Observable<PerfilView | null> {
    const nome = nomeUsuario.trim().toLowerCase();
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
        tipo_usuario,
        seguidores,
        seguindo,
        avaliacao_media,
        total_reviews
      `)
      .ilike('nome_usuario', nomeUsuario)
      .single();

    if (error || !usuario) {
      return null;
    }

    let artistaData: {
      id_artista: number;
      nome_artistico: string;
      bio: string;
      total_reviews: number;
      data_inicio: string;
      avaliacao_media: number;
    } | null = null;

    if (usuario.tipo_usuario === 'Artista') {
      const { data: artista } = await supabase
        .from('artista')
        .select('id_artista, nome_artistico, bio, total_reviews, data_inicio, avaliacao_media')
        .eq('id_usuario', usuario.id_usuario)
        .single();
      artistaData = artista;
    }

    const { data: redesSociais } = await supabase
      .from('redes_sociais')
      .select('twitter, instagram, tiktok, youtube')
      .eq('id_usuario', usuario.id_usuario)
      .single();

    return {
      idUsuario: usuario.id_usuario.toString(),
      nomeUsuario: usuario.nome_usuario,
      nome: usuario.nome,
      nomeArtistico: artistaData?.nome_artistico,
      fotoPerfil: usuario.foto_perfil || '/gato.jpeg',
      banner: usuario.banner_perfil || '/nimona.jpeg',
      bio: artistaData?.bio || usuario.bio || '',
      tipoUsuario: usuario.tipo_usuario === 'Cliente' ? 'Comum' : usuario.tipo_usuario,
      seguidores: usuario.seguidores || 0,
      seguindo: usuario.seguindo || 0,
      avaliacaoMedia: artistaData?.avaliacao_media ?? usuario.avaliacao_media ?? 0,
      totalReviews: artistaData?.total_reviews ?? usuario.total_reviews ?? 0,
      idArtista: artistaData?.id_artista,
      redesSociais: redesSociais || {},
    };
  }

  async atualizarPerfil(nomeUsuario: string, dadosAtualizados: Partial<PerfilView>): Promise<boolean> {
    const nome = nomeUsuario.trim().toLowerCase();

    const usuarioUpdates: Record<string, unknown> = {};
    if (dadosAtualizados.nome !== undefined) usuarioUpdates['nome'] = dadosAtualizados.nome;
    if (dadosAtualizados.fotoPerfil !== undefined) usuarioUpdates['foto_perfil'] = dadosAtualizados.fotoPerfil;
    if (dadosAtualizados.banner !== undefined) usuarioUpdates['banner_perfil'] = dadosAtualizados.banner;
    if (dadosAtualizados.bio !== undefined) usuarioUpdates['bio'] = dadosAtualizados.bio;

    let sucesso = true;

    if (Object.keys(usuarioUpdates).length > 0) {
      const { error } = await supabase
        .from('usuario')
        .update(usuarioUpdates)
        .ilike('nome_usuario', nome);
      if (error) {
        console.error('Erro ao atualizar usuário:', error);
        sucesso = false;
      }
    }

    if (dadosAtualizados.nomeArtistico !== undefined || dadosAtualizados.bio !== undefined) {
      const { data: usuario } = await supabase
        .from('usuario')
        .select('id_usuario, tipo_usuario')
        .ilike('nome_usuario', nome)
        .single();

      if (usuario && usuario.tipo_usuario === 'Artista') {
        const artistaUpdates: Record<string, unknown> = {};
        if (dadosAtualizados.nomeArtistico !== undefined) artistaUpdates['nome_artistico'] = dadosAtualizados.nomeArtistico;
        if (dadosAtualizados.bio !== undefined) artistaUpdates['bio'] = dadosAtualizados.bio;

        const { error } = await supabase
          .from('artista')
          .update(artistaUpdates)
          .eq('id_usuario', usuario.id_usuario);
        if (error) {
          console.error('Erro ao atualizar artista:', error);
          sucesso = false;
        }
      }
    }

    if (dadosAtualizados.redesSociais) {
      const { data: usuario } = await supabase
        .from('usuario')
        .select('id_usuario')
        .ilike('nome_usuario', nome)
        .single();

      if (usuario) {
        const { error } = await supabase
          .from('redes_sociais')
          .upsert({
            id_usuario: usuario.id_usuario,
            twitter: dadosAtualizados.redesSociais.twitter,
            instagram: dadosAtualizados.redesSociais.instagram,
            tiktok: dadosAtualizados.redesSociais.tiktok,
            youtube: dadosAtualizados.redesSociais.youtube,
          });
        if (error) {
          console.error('Erro ao atualizar redes sociais:', error);
          sucesso = false;
        }
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
    // O trigger do banco já cria o perfil no cadastro
    // Este método mantém compatibilidade mas retorna o perfil criado
    return this.buscarPerfilNoBanco(dados.nomeUsuario);
  }

  async removerPerfil(idUsuario: string): Promise<void> {
    // Não remove do banco (exclusão real precisa de Edge Function)
    // Apenas para compatibilidade
  }
}