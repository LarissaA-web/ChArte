import { PerfilView } from '../models/perfil';

export const MOCK_PERFIL_MUZZLE: PerfilView = {
  idUsuario: '7f8c2e91-4a3b-4d00-0000-000000000001',
  nomeUsuario: 'muzzle',
  nome: 'Larissa',
  nomeArtistico: 'Muzzle',
  fotoPerfil: 'assets/imagens/perfil.jpg',
  banner: 'assets/imagens/banner.jpg',
  bio: 'Artista digital focada em ilustrações de fantasia e personagens.',
  tipoUsuario: 'Artista',
  seguidores: 120,
  seguindo: 80,
  avaliacaoMedia: 4.7,
  totalReviews: 3,
  idArtista: 1,
  redesSociais: {
    twitter: '@muzzle_art',
    instagram: '@muzzle.digital',
    tiktok: '@muzzle_draws',
    youtube: '@muzzleart',
  },
};

export const MOCK_PERFIL_USUARIO_COMUM: PerfilView = {
  idUsuario: '7f8c2e91-4a3b-4d00-0000-000000000002',
  nomeUsuario: 'usuario_teste',
  nome: 'Lucas Silva',
  fotoPerfil: 'assets/imagens/perfil.jpg',
  banner: 'assets/imagens/banner.jpg',
  bio: 'Apenas um entusiasta e colecionador de arte digital.',
  tipoUsuario: 'Comum',
  seguidores: 12,
  seguindo: 45,
  redesSociais: {
    twitter: '@lucassilva',
    instagram: '@lucas_artes',
  },
};

export const MOCK_PERFIL_YASART: PerfilView = {
  idUsuario: '7f8c2e91-4a3b-4d00-0000-000000000003',
  nomeUsuario: 'yasart',
  nome: 'Yasmin',
  nomeArtistico: 'YasArt',
  fotoPerfil: 'frieren.jpeg',
  banner: 'assets/imagens/banner.jpg',
  bio: 'Ilustradora e criadora de fanarts de animes clássicos e novos.',
  tipoUsuario: 'Artista',
  seguidores: 340,
  seguindo: 110,
  avaliacaoMedia: 5,
  totalReviews: 1,
  idArtista: 2,
  redesSociais: {
    twitter: '@yasart_draw',
    instagram: '@yas.artworks',
    tiktok: '@yasart',
    youtube: '@yasartchannel',
  },
};

export const MOCK_PERFIS: PerfilView[] = [
  MOCK_PERFIL_MUZZLE,
  MOCK_PERFIL_USUARIO_COMUM,
  MOCK_PERFIL_YASART,
];
