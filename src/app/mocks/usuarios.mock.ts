export type TipoUsuario = 'Comum' | 'Artista';

export interface UsuarioMock {
  idUsuario: string;
  nomeUsuario: string;
  senha: string;
  senhaHash?: string;
  senhaSalt?: string;
  tipoUsuario: TipoUsuario;
  nome: string;
  nomeArtistico?: string;
  fotoPerfil: string;
  email?: string;
}

export const MOCK_USUARIOS: UsuarioMock[] = [
  {
    idUsuario: '7f8c2e91-4a3b-4d00-0000-000000000001',
    nomeUsuario: 'muzzle',
    senha: '123456',
    tipoUsuario: 'Artista',
    nome: 'Larissa',
    nomeArtistico: 'Muzzle',
    fotoPerfil: 'assets/imagens/perfil.jpg',
    email: 'larissa@charte.test',
  },
  {
    idUsuario: '7f8c2e91-4a3b-4d00-0000-000000000002',
    nomeUsuario: 'usuario_teste',
    senha: '123456',
    tipoUsuario: 'Comum',
    nome: 'Lucas Silva',
    fotoPerfil: 'assets/imagens/perfil.jpg',
    email: 'lucas@charte.test',
  },
  {
    idUsuario: '7f8c2e91-4a3b-4d00-0000-000000000003',
    nomeUsuario: 'yasart',
    senha: '123456',
    tipoUsuario: 'Artista',
    nome: 'Yasmin',
    nomeArtistico: 'YasArt',
    fotoPerfil: 'frieren.jpeg',
    email: 'yasmin@charte.test',
  },
];

export const MOCK_USUARIO_TESTE: UsuarioMock = MOCK_USUARIOS[0];
