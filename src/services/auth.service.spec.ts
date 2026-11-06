import { afterEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../app/core/supabase/supabase.client';
import { AuthService } from './auth.service';

describe('AuthService login', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  function preparar(tipo: 'Cliente' | 'Artista' = 'Cliente', dataNascimento = '1990-01-01') {
    const auth = supabase.auth as any;
    const usuario = {
      id_usuario: 5,
      id_auth: 'auth-5',
      nome_usuario: 'ana_teste',
      nome: 'Ana Teste',
      tipo_usuario: tipo,
      foto_perfil: null,
      data_nascimento: dataNascimento,
    };
    const query: any = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.maybeSingle = vi.fn(async () => ({ data: usuario, error: null }));
    const artistaQuery: any = {};
    artistaQuery.select = vi.fn(() => artistaQuery);
    artistaQuery.eq = vi.fn(() => artistaQuery);
    artistaQuery.maybeSingle = vi.fn(async () => ({ data: { nome_artistico: 'Ana Artista' }, error: null }));
    vi.spyOn(auth, 'getSession').mockResolvedValue({ data: { session: null }, error: null });
    vi.spyOn(auth, 'onAuthStateChange').mockImplementation(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    }));
    vi.spyOn(auth, 'signOut').mockResolvedValue({ error: null });
    vi.spyOn(auth, 'setSession').mockImplementation(async ({ access_token, refresh_token }: any) => ({
      data: { session: { access_token, refresh_token, user: { id: 'old-auth', email: 'anterior@example.com' } } },
      error: null,
    }));
    vi.spyOn(supabase, 'from').mockImplementation(((table: string) =>
      table === 'artista' ? artistaQuery : query) as any);
    const signIn = vi.spyOn(auth, 'signInWithPassword');
    const rpc = vi.spyOn(supabase, 'rpc');
    return { auth, signIn, rpc, usuario };
  }

  function sucesso(auth: any, email = 'ana@example.com') {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'auth-5', email }, session: { access_token: 'new-token' } },
      error: null,
    });
  }

  it('autentica e-mail com espaços e letras maiúsculas', async () => {
    const { auth, signIn } = preparar(); sucesso(auth);
    const service = new AuthService(); await service.aguardarInicializacao();
    const result = await service.login('  ANA@EXAMPLE.COM  ', 'senha', 'Comum');
    expect(signIn).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'senha' });
    expect(result.status).toBe('success');
  });

  it('resolve username pela RPC e autentica pelo Supabase Auth', async () => {
    const { auth, signIn, rpc } = preparar(); sucesso(auth);
    rpc.mockResolvedValue({ data: 'ANA@EXAMPLE.COM ', error: null } as any);
    const service = new AuthService(); await service.aguardarInicializacao();
    const result = await service.login('@ana_teste', 'senha', 'Comum');
    expect(rpc).toHaveBeenCalledWith('get_email_by_username', { p_nome_usuario: 'ana_teste' });
    expect(signIn).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'senha' });
    expect(result.status).toBe('success');
  });

  it('não cria sessão para senha incorreta ou e-mail não cadastrado', async () => {
    const { auth } = preparar();
    vi.spyOn(auth, 'signInWithPassword').mockResolvedValue({ data: { user: null, session: null }, error: { code: 'invalid_credentials', message: 'Invalid login credentials' } } as any);
    const service = new AuthService(); await service.aguardarInicializacao();
    expect((await service.login('ana@example.com', 'errada', 'Comum')).status).toBe('invalid_credentials');
    expect(service.getUsuarioLogado()).toBeNull();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('trata e-mail cadastrado inexistente como credencial inválida sem autenticar', async () => {
    const { auth, signIn } = preparar();
    signIn.mockResolvedValue({ data: { user: null, session: null }, error: { code: 'invalid_credentials', message: 'Invalid login credentials' } } as any);
    const service = new AuthService(); await service.aguardarInicializacao();
    expect((await service.login('desconhecido@example.com', 'senha', 'Comum')).status).toBe('invalid_credentials');
    expect(service.getUsuarioLogado()).toBeNull();
  });

  it('retorna conta não encontrada para username inexistente sem tentar autenticar', async () => {
    const { auth, signIn, rpc } = preparar();
    rpc.mockResolvedValue({ data: null, error: null } as any);
    const service = new AuthService(); await service.aguardarInicializacao();
    expect((await service.login('nao_existe', 'senha', 'Comum')).status).toBe('account_not_found');
    expect(signIn).not.toHaveBeenCalled();
  });

  it('orienta confirmar o e-mail e mantém a sessão vazia', async () => {
    const { auth } = preparar();
    vi.spyOn(auth, 'signInWithPassword').mockResolvedValue({ data: { user: null, session: null }, error: { code: 'email_not_confirmed', message: 'Email not confirmed' } } as any);
    const service = new AuthService(); await service.aguardarInicializacao();
    expect((await service.login('ana@example.com', 'senha', 'Comum')).status).toBe('email_not_confirmed');
    expect(service.getUsuarioLogado()).toBeNull();
  });

  it('permite artista no modal de artista e usuário comum no modal comum', async () => {
    const artista = preparar('Artista'); sucesso(artista.auth);
    const artistService = new AuthService(); await artistService.aguardarInicializacao();
    expect((await artistService.login('ana@example.com', 'senha', 'Artista')).status).toBe('success');
    vi.restoreAllMocks();
    const comum = preparar('Cliente'); sucesso(comum.auth);
    const userService = new AuthService(); await userService.aguardarInicializacao();
    expect((await userService.login('ana@example.com', 'senha', 'Comum')).status).toBe('success');
  });

  it('rejeita modal incompatível e restaura sessão anterior sem desconectá-la', async () => {
    const { auth } = preparar('Artista'); sucesso(auth);
    const anterior = { access_token: 'old-access', refresh_token: 'old-refresh', user: { id: 'old-auth', email: 'anterior@example.com' } };
    vi.spyOn(auth, 'getSession')
      .mockResolvedValueOnce({ data: { session: null }, error: null })
      .mockResolvedValueOnce({ data: { session: anterior }, error: null });
    const service = new AuthService(); await service.aguardarInicializacao();
    expect((await service.login('ana@example.com', 'senha', 'Comum')).status).toBe('account_type_mismatch');
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: 'old-access', refresh_token: 'old-refresh' });
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(service.getUsuarioLogado()?.idUsuario).toBe('5');
  });

  it('rejeita conta comum no modal de artista e não mantém a nova sessão', async () => {
    const { auth } = preparar('Cliente'); sucesso(auth);
    const service = new AuthService(); await service.aguardarInicializacao();
    expect((await service.login('ana@example.com', 'senha', 'Artista')).status).toBe('account_type_mismatch');
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(service.getUsuarioLogado()).toBeNull();
  });

  it('envia pedido de recuperação com redirect para a rota do site sem revelar existência da conta', async () => {
    const { auth } = preparar();
    vi.stubGlobal('window', { location: { origin: 'https://charte.example' } });
    const reset = vi.spyOn(auth, 'resetPasswordForEmail').mockResolvedValue({ data: {}, error: null } as any);
    const service = new AuthService(); await service.aguardarInicializacao();

    expect(await service.solicitarRedefinicaoSenha(' ANA@EXAMPLE.COM ')).toEqual({ status: 'sent' });
    expect(reset).toHaveBeenCalledWith('ana@example.com', { redirectTo: 'https://charte.example/redefinir-senha' });
    expect(await service.solicitarRedefinicaoSenha('invalido')).toEqual({ status: 'invalid_email' });
  });

  it('não aceita sessão comum como autorização de recuperação de senha', async () => {
    const { auth } = preparar();
    const updateUser = vi.spyOn(auth, 'updateUser');
    auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'auth-5', email: 'ana@example.com' } } },
      error: null,
    } as any);
    const service = new AuthService(); await service.aguardarInicializacao();

    expect(await service.validarFluxoRecuperacaoSenha()).toBe(false);
    expect((await service.concluirRecuperacaoSenha('senha-segura')).status).toBe('invalid_flow');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('aceita somente evento PASSWORD_RECOVERY e encerra a sessão após alterar senha', async () => {
    const { auth } = preparar();
    const recoverySession = { user: { id: 'auth-5', email: 'ana@example.com' } };
    auth.getSession.mockResolvedValue({ data: { session: recoverySession }, error: null } as any);
    auth.onAuthStateChange.mockImplementation((callback: any) => {
      callback('PASSWORD_RECOVERY', recoverySession);
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
    });
    const updateUser = vi.spyOn(auth, 'updateUser').mockResolvedValue({ data: { user: recoverySession.user }, error: null } as any);
    const service = new AuthService(); await service.aguardarInicializacao();

    expect(service.estaLogado()).toBe(false);
    expect(await service.validarFluxoRecuperacaoSenha()).toBe(true);
    expect((await service.concluirRecuperacaoSenha('senha-segura')).status).toBe('success');
    expect(updateUser).toHaveBeenCalledWith({ password: 'senha-segura' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(service.estaLogado()).toBe(false);
    expect(await service.validarFluxoRecuperacaoSenha()).toBe(false);
  });

  it('ignora SIGNED_IN atrasado da tentativa rejeitada após terminar o login', async () => {
    const { auth } = preparar('Artista'); sucesso(auth);
    let listener: ((evento: string, sessao: any) => void) | undefined;
    vi.spyOn(auth, 'onAuthStateChange').mockImplementation((callback: any) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
    });
    const service = new AuthService(); await service.aguardarInicializacao();

    expect((await service.login('ana@example.com', 'senha', 'Comum')).status).toBe('account_type_mismatch');
    listener?.('SIGNED_IN', {
      user: { id: 'auth-5', email: 'ana@example.com' },
      access_token: 'new-token',
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(service.getUsuarioLogado()).toBeNull();
    expect(service.estaLogado()).toBe(false);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('diferencia falha de conexão de credenciais incorretas', async () => {
    const { auth } = preparar();
    vi.spyOn(auth, 'signInWithPassword').mockRejectedValue(new TypeError('Failed to fetch'));
    const service = new AuthService(); await service.aguardarInicializacao();
    expect((await service.login('ana@example.com', 'senha', 'Comum')).status).toBe('connection_error');
    expect(service.getUsuarioLogado()).toBeNull();
  });

  it('bloqueia no login a conta cadastrada com menos de 16 anos', async () => {
    const { auth } = preparar('Cliente', '2011-01-01'); sucesso(auth);
    const service = new AuthService(); await service.aguardarInicializacao();

    expect((await service.login('ana@example.com', 'senha', 'Comum')).status).toBe('age_restricted');
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(service.getUsuarioLogado()).toBeNull();
  });

  it('rejeita cadastro abaixo de 16 anos antes de chamar Supabase Auth', async () => {
    const { auth } = preparar();
    const signUp = vi.spyOn(auth, 'signUp');
    const service = new AuthService(); await service.aguardarInicializacao();

    const result = await service.registrar({
      nome: 'Ana Teste', nomeUsuario: 'ana_teste', email: 'ana@example.com', senha: 'senha123',
      tipoUsuario: 'Comum', dataNascimento: '2011-01-01', genero: 'Feminino', telefone: '11999999999',
    });

    expect(result.status).toBe('invalid_input');
    expect(signUp).not.toHaveBeenCalled();
  });
});
