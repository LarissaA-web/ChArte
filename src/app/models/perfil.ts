export interface RedesSociais {
  twitter?: string;
  instagram?: string;
  tiktok?: string;
  youtube?: string;
}

export interface Perfil {
  usuario: {
    id_usuario: number;
    nome_usuario: string;
    nome_completo: string;
    email: string;
    foto_perfil: string;
    banner_perfil: string;
    tipo_usuario: string;
    status_conta: string;
    bio: string;
  };

  artista?: {
    id_artista: number;
    nome_artistico: string;
    bio: string;
    total_reviews: number;
    data_inicio: string;
    avaliacao_media: number;
  };
}

export interface PerfilView {
  idUsuario: string;

  nomeUsuario: string;
  nome: string;
  nomeArtistico?: string;

  fotoPerfil: string;
  banner: string;

  bio?: string;

  tipoUsuario: string;

  seguidores: number;
  seguindo: number;

  avaliacaoMedia?: number;
  totalReviews?: number;

  idArtista?: number;
  redesSociais?: RedesSociais;
}

