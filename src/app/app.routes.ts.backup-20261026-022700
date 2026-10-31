import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { Category } from './pages/category/category';
import { FavoritesPage } from './pages/favorites-page/favorites-page';
import { ArtistProfile } from './pages/artist-profile/artist-profile';
import { Styles } from './pages/styles/styles';
import { artistGuard } from '../services/guard';
import { ArtistAreaPage } from './pages/area-artista/artist-area-page/artist-area-page';
import { Cadastro } from './pages/cadastro/cadastro';
import { OrderDetail } from './pages/order-detail/order-detail';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { ModalService } from '../services/modal.service';
import { UserProfileSettings } from './components/profile/user-profile-settings/user-profile-settings';

const userLoginGuard = () => {
  if (inject(AuthService).estaLogado()) return true;
  inject(ModalService).openModal('login');
  return false;
};
export const routes: Routes = [
  {
    path: '',
    component: Home,
  },
  {
    path: 'categoria/:categoria',
    component: Category,
  },
  {
    path: 'carrinho',
    component: FavoritesPage,
    canActivate: [userLoginGuard],
  },
  {
    path: 'pedido/:id',
    component: OrderDetail,
    canActivate: [userLoginGuard],
  },
  {
    path: 'cadastro',
    component: Cadastro,
  },
  {
    path: 'configuracoes',
    component: UserProfileSettings,
    canActivate: [userLoginGuard],
  },
  {
    path: 'perfil',
    component: ArtistProfile,
  },
  {
    path: 'artista',
    component: ArtistAreaPage,
    canActivate: [artistGuard],
  },
  {
    path: 'estilo/:estilo',
    component: Styles,
  },
  {
    path: 'perfil/:nomeUsuario',
    component: ArtistProfile,
  },
];
