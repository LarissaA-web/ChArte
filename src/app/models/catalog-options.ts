export interface CategoriaCatalogo {
  id_categoria: number;
  nome_categoria: string;
  descricao_categoria?: string | null;
}

export interface EstiloCatalogo {
  id_estilo: number;
  nome_estilo: string;
  descricao?: string | null;
  data_criacao?: string | null;
}
