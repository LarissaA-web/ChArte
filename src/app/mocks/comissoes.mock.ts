import { Comissao } from '../models/artist-area';

export const MOCK_COMISSOES: Comissao[] = [
  { id: 101, artistaUsername: 'muzzle', cliente: { nome: 'Marina Costa', username: 'marinac', foto: 'assets/imagens/perfil.jpg' }, titulo: 'Retrato digital', descricao: 'Retrato de personagem em estilo fantasia.', referencias: ['assets/imagens/banner.jpg'], valor: 130, criadaEm: '2026-09-25', prazo: '2026-10-10', status: 'Solicitada' },
  { id: 102, artistaUsername: 'muzzle', cliente: { nome: 'Rafael Lima', username: 'rafaelart', foto: 'assets/imagens/perfil.jpg' }, titulo: 'Personagem original', descricao: 'Personagem original com paleta azul e dourada.', referencias: [], valor: 260, criadaEm: '2026-09-21', prazo: '2026-10-05', status: 'Em andamento' },
  { id: 103, artistaUsername: 'muzzle', cliente: { nome: 'Bia Nunes', username: 'bianunes', foto: 'assets/imagens/perfil.jpg' }, titulo: 'Ilustração de personagem', descricao: 'Arte final colorida para presente.', referencias: [], valor: 180, criadaEm: '2026-08-28', prazo: '2026-09-18', status: 'Finalizada', concluidaEm: '2026-09-17' },
  { id: 104, artistaUsername: 'muzzle', cliente: { nome: 'Caio Alves', username: 'caioalves', foto: 'assets/imagens/perfil.jpg' }, titulo: 'Estudo de personagem', descricao: 'Estudo em preto e branco.', referencias: [], valor: 90, criadaEm: '2026-07-11', prazo: '2026-07-25', status: 'Cancelada' },
  { id: 201, artistaUsername: 'yasart', cliente: { nome: 'Nina Souza', username: 'ninas', foto: 'assets/imagens/perfil.jpg' }, titulo: 'Fanart personalizada', descricao: 'Fanart em cores quentes.', referencias: [], valor: 150, criadaEm: '2026-09-19', prazo: '2026-10-03', status: 'Pendente' },
];
