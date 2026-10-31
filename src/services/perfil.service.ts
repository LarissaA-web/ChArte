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
        tipo_usuario
      `)
      .ilike('nome_usuario', nomeUsuario)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar perfil do usuário:', error);
      return null;
    }

    if (!usuario) {
      console.warn('Usuário não encontrado:', nomeUsuario);
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
      const { data: artista, error: erroArtista } = await supabase
        .from('artista')
        .select('id_artista, nome_artistico, data_inicio')
        .eq('id_usuario', usuario.id_usuario)
        .maybeSingle();

      if (erroArtista) {
        console.error('Erro ao buscar dados do artista:', erroArtista);
      }

      artistaData = artista;
    }

    const { data: redes, error: erroRedes } = await supabase
      .from('redes_sociais')
      .select('twitter, instagram, tiktok, youtube')
      .eq('id_usuario', usuario.id_usuario)
      .maybeSingle();

    if (erroRedes) {
      console.error('Erro ao buscar redes sociais:', erroRedes);
    }

    const redesSociais = redes ?? {};

    return {
      idUsuario: String(usuario.id_usuario),
      nomeUsuario: usuario.nome_usuario,
      nome: usuario.nome,
      nomeArtistico: artistaData?.nome_artistico,
      fotoPerfil: usuario.foto_perfil || '/gato.jpeg',
      banner: usuario.banner_perfil || '/nimona.jpeg',
      bio: usuario.bio || '',
      tipoUsuario: ehArtista ? 'Artista' :
        (String(usuario.tipo_usuario).toLowerCase() === 'cliente'
          ? 'Comum'
          : usuario.tipo_usuario),
      seguidores: 0,
      seguindo: 0,
      avaliacaoMedia: 0,
      totalReviews: 0,
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
      console.error(
        'Não foi possível salvar o perfil: usuário não autenticado.',
        erroAuth
      );
      return false;
    }

    const { data: usuario, error: erroUsuario } = await supabase
      .from('usuario')
      .select('id_usuario, nome_usuario, tipo_usuario')
      .eq('id_auth', authUser.id)
      .maybeSingle();

    if (erroUsuario || !usuario) {
      console.error(
        'Não foi possível localizar o perfil do usuário autenticado.',
        erroUsuario
      );
      return false;
    }

    const nomeAtual = nomeUsuario.trim().toLowerCase();
    if (usuario.nome_usuario?.trim().toLowerCase() !== nomeAtual) {
      console.error(
        'O perfil aberto não corresponde ao usuário autenticado.',
        { perfilAberto: nomeAtual, perfilAutenticado: usuario.nome_usuario }
      );
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
        console.error(
          'Erro ao salvar os dados do usuário:',
          error ?? 'Nenhuma linha foi atualizada; verifique a política RLS.'
        );
        sucesso = false;
      }
    }

    if (dadosAtualizados.nomeArtistico !== undefined) {
      if (String(usuario.tipo_usuario).toLowerCase() !== 'artista') {
        console.error('Não é possível salvar nome artístico para este tipo de usuário.');
        sucesso = false;
      } else {
        const { data, error } = await supabase
          .from('artista')
          .update({ nome_artistico: dadosAtualizados.nomeArtistico })
          .eq('id_usuario', usuario.id_usuario)
          .select('id_artista');

        if (error || !data || data.length === 0) {
          console.error(
            'Erro ao salvar o nome artístico:',
            error ?? 'Nenhum artista foi atualizado; verifique a política RLS.'
          );
          sucesso = false;
        }
      }
    }

    if (dadosAtualizados.redesSociais !== undefined) {
      const { error } = await supabase
        .from('redes_sociais')
        .upsert({
          id_usuario: usuario.id_usuario,
          twitter: dadosAtualizados.redesSociais.twitter ?? null,
          instagram: dadosAtualizados.redesSociais.instagram ?? null,
          tiktok: dadosAtualizados.redesSociais.tiktok ?? null,
          youtube: dadosAtualizados.redesSociais.youtube ?? null,
        }, { onConflict: 'id_usuario' });

      if (error) {
        console.error('Erro ao salvar as redes sociais:', error);
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
    // O trigger do banco já cria o perfil no cadastro
    // Este método mantém compatibilidade mas retorna o perfil criado
    return this.buscarPerfilNoBanco(dados.nomeUsuario);
  }

  async removerPerfil(idUsuario: string): Promise<void> {
    // Não remove do banco (exclusão real precisa de Edge Function)
    // Apenas para compatibilidade
  }
}
