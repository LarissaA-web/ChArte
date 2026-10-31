export interface Post {
  /** Identificador estável da publicação, usado também por favoritos e pedidos. */
  id: number;

  titulo: string;
  descricao: string;
  portfolio: string;
  nomeArtistico: string;
  preco: number;
  estilo?: string;

  usuario: {
    id: number;
    artistaId: number;
    nomeUsuario?: string;
    nomeArtistico: string;
    fotoPerfil: string;
  };
  categoria: {
    id: number;
    nomeCategoria: string;
  };
  /** Campos opcionais pensados para a API; pins antigos continuam válidos. */
  tags?: string[];
  criadoEm?: string;
}
