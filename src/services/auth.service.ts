
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { TipoUsuario } from '../app/mocks/usuarios.mock';
import { supabase } from '../app/core/supabase/supabase.client';
import { hasMinimumAge } from './age-validation';

export interface SessaoUsuario {
  idUsuario: string;
  nomeUsuario: string;
  tipoUsuario: TipoUsuario;
  nome: string;
  nomeArtistico?: string;
  fotoPerfil: string;
}

export type LoginResult =
  | { status: 'success'; sessao: SessaoUsuario }
  | { status: 'invalid_credentials' }
  | { status: 'email_not_confirmed' }
  | { status: 'account_not_found' }
  | { status: 'account_disabled' }
  | { status: 'age_restricted' }
  | { status: 'account_type_mismatch'; tipoReal: TipoUsuario }
  | { status: 'connection_error' }
  | { status: 'service_error' };

interface DadosCadastro {
  nome: string;
  nomeUsuario: string;
  email: string;
  senha: string;
  tipoUsuario: TipoUsuario;
  nomeArtistico?: string;
  dataNascimento: string;
  genero: string;
  telefone: string;
}

interface UsuarioBanco {
  id_usuario: number;
  id_auth: string;
  nome_usuario: string;
  nome: string;
  tipo_usuario: string;
  foto_perfil: string | null;
  status_conta?: string;
  data_nascimento?: string | null;
}

/**
 * Resultado tipado do fluxo de cadastro.
 *
 * Cada branch representa um estado exclusivo, eliminando a ambiguidade
 * anterior em que `null` significava tanto falha real quanto conta criada
 * aguardando confirmação de e-mail.
 */
export type SignUpResult =
  | { status: 'success'; sessao: SessaoUsuario }
  | { status: 'confirmation_required'; email: string; messageId?: string | null }
  | {
      status: 'invalid_input';
      field?: string;
      message: string;
    }
  | { status: 'email_already_registered' }
  | { status: 'username_already_registered' }
  | { status: 'rate_limited' }
  | { status: 'weak_password'; message: string; reasons?: string[] }
  | { status: 'network_error'; message: string }
  | { status: 'profile_creation_error'; message: string }
  | { status: 'unknown_error'; message: string };

/**
 * Resultado do reenvio do e-mail de confirmação.
 */
export type ReenvioConfirmacao =
  | { status: 'sent'; messageId?: string | null }
  | { status: 'rate_limited' }
  | { status: 'network_error'; message: string }
  | { status: 'unknown_error'; message: string };

export type PasswordResetRequestResult =
  | { status: 'sent' }
  | { status: 'invalid_email' }
  | { status: 'rate_limited' }
  | { status: 'network_error' }
  | { status: 'error' };

export type PasswordRecoveryResult =
  | { status: 'success' }
  | { status: 'invalid_flow' }
  | { status: 'weak_password' }
  | { status: 'network_error' }
  | { status: 'error' };

// Códigos de erro do Supabase Auth (AuthErrorCode) considerados aqui.
const CODE_EMAIL_EXISTS = ['email_exists', 'user_already_registered', 'user_already_exists'];
const CODE_RATE_LIMIT = [
  'over_email_send_rate_limit',
  'over_sms_send_rate_limit',
  'over_request_rate_limit',
];
const SQLSTATE_UNIQUE_VIOLATION = '23505';
const PASSWORD_RECOVERY_STORAGE_KEY = 'charte_password_recovery_uid';
const PASSWORD_RECOVERY_CONSUMED_KEY = 'charte_password_recovery_consumed_uid';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly usuarioLogadoSubject =
    new BehaviorSubject<SessaoUsuario | null>(null);

  readonly usuarioLogado$: Observable<SessaoUsuario | null> =
    this.usuarioLogadoSubject.asObservable();

  private inicializacaoPromise: Promise<void>;
  private emailUsuarioLogado = '';
  private listenerRegistrado = false;
  private loginAttemptInProgress = false;
  /** Auth UID whose database profile was validated for this app session. */
  private authUidAutorizado: string | null = null;
  private recoveryAuthUid: string | null = null;

  constructor() {
    this.inicializacaoPromise = this.inicializarSessao();
  }

  // --------------------------------------------------
  // Conversão dos tipos de conta
  // --------------------------------------------------

  private converterTipoParaBanco(tipo: TipoUsuario): string {
    return tipo === 'Comum' ? 'Cliente' : tipo;
  }

  private converterTipoParaFrontend(tipoBanco: string): TipoUsuario | null {
    if (tipoBanco === 'Cliente' || tipoBanco === 'Comum') return 'Comum';
    if (tipoBanco === 'Artista') return 'Artista';
    return null;
  }

  // --------------------------------------------------
  // Inicialização e acompanhamento da sessão
  // --------------------------------------------------

  private async inicializarSessao(): Promise<void> {
    try {
      if (!this.listenerRegistrado) {
        this.listenerRegistrado = true;
        supabase.auth.onAuthStateChange((evento, sessao) => {
          if (evento === 'PASSWORD_RECOVERY' && sessao?.user) {
            this.recoveryAuthUid = sessao.user.id;
            this.salvarUidRecuperacao(sessao.user.id);
            this.authUidAutorizado = null;
            this.emailUsuarioLogado = '';
            this.usuarioLogadoSubject.next(null);
            return;
          }
          // SIGNED_IN may be delivered after signInWithPassword resolves. Do
          // not let Auth's session alone publish an application login: only
          // process events for a UID whose database profile was validated.
          if (this.loginAttemptInProgress) return;
          if (evento === 'SIGNED_IN' || evento === 'TOKEN_REFRESHED' || evento === 'USER_UPDATED') {
            if (!sessao?.user || sessao.user.id !== this.authUidAutorizado) return;
          }
          // Evita aguardar consultas ao banco dentro do callback
          // de autenticação do Supabase.
          Promise.resolve().then(async () => {
            if (
              evento === 'SIGNED_IN' ||
              evento === 'TOKEN_REFRESHED' ||
              evento === 'USER_UPDATED'
            ) {
              if (sessao?.user) {
                this.emailUsuarioLogado = sessao.user.email ?? '';
                await this.carregarPerfilESessao(sessao.user);
              }
            } else if (evento === 'SIGNED_OUT') {
              // A rejected login can emit SIGNED_OUT while replacing the
              // temporary session, then restore a previously valid session.
              // Ignore a stale event if that authorized session is current.
              const atual = await supabase.auth.getSession();
              if (atual.data.session?.user.id === this.authUidAutorizado) return;
              this.emailUsuarioLogado = '';
              this.authUidAutorizado = null;
              this.usuarioLogadoSubject.next(null);
            }
          });
        });
      }

      const { data, error } = await this.comTimeout(supabase.auth.getSession(), 10000);

      if (error) {
        console.error('Erro ao recuperar a sessão:', error.message);
      }

      if (data.session?.user) {
        if (this.recuperacaoConsumida(data.session.user.id)) {
          await supabase.auth.signOut({ scope: 'local' });
        } else if (!(await this.sessaoDeRecuperacaoValida(data.session.user.id))) {
          this.emailUsuarioLogado = data.session.user.email ?? '';
          await this.comTimeout(this.carregarPerfilESessao(data.session.user), 10000);
        }
      }
    } catch {
      // A inicialização termina mesmo se a validação de sessão ou perfil não responder.
      console.error('Não foi possível concluir a inicialização da autenticação.');
    }
  }

  private async comTimeout<T>(operacao: PromiseLike<T>, limiteMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve(operacao),
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error('auth_timeout')), limiteMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async aguardarInicializacao(): Promise<void> {
    await this.inicializacaoPromise;
  }

  async solicitarRedefinicaoSenha(email: string): Promise<PasswordResetRequestResult> {
    const emailNormalizado = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
      return { status: 'invalid_email' };
    }
    try {
      const redirectTo = `${window.location.origin}/redefinir-senha`;
      const { error } = await this.comTimeout(
        supabase.auth.resetPasswordForEmail(emailNormalizado, { redirectTo }),
        15000,
      );
      if (!error) return { status: 'sent' };
      if (error.status === 429 || CODE_RATE_LIMIT.includes(error.code ?? '')) {
        return { status: 'rate_limited' };
      }
      return this.ehFalhaDeConexao(error) ? { status: 'network_error' } : { status: 'error' };
    } catch (error) {
      return this.ehFalhaDeConexao(error) ? { status: 'network_error' } : { status: 'error' };
    }
  }

  async validarFluxoRecuperacaoSenha(): Promise<boolean> {
    try {
      await this.comTimeout(this.aguardarInicializacao(), 10000);
      const { data, error } = await this.comTimeout(supabase.auth.getSession(), 10000);
      const uid = data.session?.user.id;
      if (error || !uid || this.recuperacaoConsumida(uid) || !(await this.sessaoDeRecuperacaoValida(uid))) return false;
      return true;
    } catch {
      return false;
    }
  }

  async concluirRecuperacaoSenha(novaSenha: string): Promise<PasswordRecoveryResult> {
    if (novaSenha.length < 6) return { status: 'weak_password' };
    try {
      await this.comTimeout(this.aguardarInicializacao(), 10000);
    } catch {
      return { status: 'invalid_flow' };
    }
    let data: Awaited<ReturnType<typeof supabase.auth.getSession>>['data'];
    let sessionError: Awaited<ReturnType<typeof supabase.auth.getSession>>['error'];
    try {
      ({ data, error: sessionError } = await this.comTimeout(supabase.auth.getSession(), 10000));
    } catch {
      return { status: 'network_error' };
    }
    const uid = data.session?.user.id;
    if (sessionError || !uid || this.recuperacaoConsumida(uid) || !(await this.sessaoDeRecuperacaoValida(uid))) {
      return { status: 'invalid_flow' };
    }

    this.loginAttemptInProgress = true;
    let senhaAtualizada = false;
    try {
      const { error } = await this.comTimeout(supabase.auth.updateUser({ password: novaSenha }), 15000);
      if (error) {
        if (error.code === 'weak_password') return { status: 'weak_password' };
        return this.ehFalhaDeConexao(error) ? { status: 'network_error' } : { status: 'error' };
      }
      senhaAtualizada = true;
      this.marcarRecuperacaoConsumida(uid);
      try { await this.comTimeout(supabase.auth.signOut({ scope: 'local' }), 8000); } catch { /* UID consumido continua bloqueado */ }
      return { status: 'success' };
    } catch (error) {
      return this.ehFalhaDeConexao(error) ? { status: 'network_error' } : { status: 'error' };
    } finally {
      this.loginAttemptInProgress = false;
      if (senhaAtualizada) this.limparEstadoRecuperacao(true);
      this.authUidAutorizado = null;
      this.emailUsuarioLogado = '';
      this.usuarioLogadoSubject.next(null);
    }
  }

  private async sessaoDeRecuperacaoValida(uid: string): Promise<boolean> {
    if (this.recoveryAuthUid === uid) return true;
    const storedUid = this.lerUidRecuperacao();
    if (storedUid === uid) {
      this.recoveryAuthUid = uid;
      return true;
    }
    return false;
  }

  private salvarUidRecuperacao(uid: string): void {
    try {
      sessionStorage.removeItem(PASSWORD_RECOVERY_CONSUMED_KEY);
      sessionStorage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, uid);
    } catch { /* armazenamento opcional */ }
  }

  private marcarRecuperacaoConsumida(uid: string): void {
    try { sessionStorage.setItem(PASSWORD_RECOVERY_CONSUMED_KEY, uid); } catch { /* armazenamento opcional */ }
  }

  private recuperacaoConsumida(uid: string): boolean {
    try { return sessionStorage.getItem(PASSWORD_RECOVERY_CONSUMED_KEY) === uid; } catch { return false; }
  }

  private lerUidRecuperacao(): string | null {
    try { return sessionStorage.getItem(PASSWORD_RECOVERY_STORAGE_KEY); } catch { return null; }
  }

  private limparEstadoRecuperacao(manterConsumida = false): void {
    this.recoveryAuthUid = null;
    try {
      sessionStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
      if (!manterConsumida) sessionStorage.removeItem(PASSWORD_RECOVERY_CONSUMED_KEY);
    } catch { /* armazenamento opcional */ }
  }

  // --------------------------------------------------
  // Carregamento do perfil no PostgreSQL
  // --------------------------------------------------

  private async carregarPerfilESessao(
    user: { id: string; email?: string },
  ): Promise<void> {
    try {
      const { data: usuarioDb, error } = await supabase
        .from('usuario')
        .select(
          'id_usuario, id_auth, nome_usuario, nome, tipo_usuario, foto_perfil, status_conta, data_nascimento',
        )
        .eq('id_auth', user.id)
        .maybeSingle();

      if (error) {
        console.error('Erro ao consultar perfil:', error.message);
        this.authUidAutorizado = null;
        this.usuarioLogadoSubject.next(null);
        return;
      }

      if (!usuarioDb) {
        console.warn(
          'Usuário autenticado, mas sem perfil na tabela usuario.',
          user.id,
        );
        this.authUidAutorizado = null;
        this.usuarioLogadoSubject.next(null);
        return;
      }

      const usuario = usuarioDb as UsuarioBanco;
      if (usuario.status_conta && usuario.status_conta.toLowerCase() !== 'ativo') {
        this.authUidAutorizado = null;
        this.emailUsuarioLogado = '';
        this.usuarioLogadoSubject.next(null);
        void supabase.auth.signOut({ scope: 'local' });
        return;
      }
      if (!hasMinimumAge(usuario.data_nascimento, 16)) {
        this.authUidAutorizado = null;
        this.emailUsuarioLogado = '';
        this.usuarioLogadoSubject.next(null);
        void supabase.auth.signOut({ scope: 'local' });
        return;
      }
      const tipoFrontend = this.converterTipoParaFrontend(
        usuario.tipo_usuario,
      );
      if (!tipoFrontend) {
        this.authUidAutorizado = null;
        this.usuarioLogadoSubject.next(null);
        return;
      }

      let nomeArtistico: string | undefined;

      if (usuario.tipo_usuario === 'Artista') {
        const { data: artistaDb, error: artistaErro } = await supabase
          .from('artista')
          .select('nome_artistico')
          .eq('id_usuario', usuario.id_usuario)
          .maybeSingle();

        if (artistaErro) {
          console.error(
            'Erro ao consultar perfil artístico:',
            artistaErro.message,
          );
        }

        nomeArtistico = artistaDb?.nome_artistico ?? undefined;
      }

      const sessao: SessaoUsuario = {
        idUsuario: String(usuario.id_usuario),
        nomeUsuario: usuario.nome_usuario,
        tipoUsuario: tipoFrontend,
        nome: usuario.nome,
        nomeArtistico,
        fotoPerfil: usuario.foto_perfil || '/gato.jpeg',
      };

      this.emailUsuarioLogado = user.email ?? this.emailUsuarioLogado;
      this.authUidAutorizado = user.id;
      this.usuarioLogadoSubject.next(sessao);
    } catch (erro) {
      console.error('Erro ao carregar perfil da sessão:', erro);
      this.authUidAutorizado = null;
      this.usuarioLogadoSubject.next(null);
    }
  }

  // --------------------------------------------------
  // Cadastro
  // --------------------------------------------------

  async registrar(
    dados: DadosCadastro,
  ): Promise<SignUpResult> {
    const nome = dados.nome.trim();
    const nomeUsuario = dados.nomeUsuario.trim().replace(/^@/, '');
    const email = dados.email.trim().toLowerCase();
    const telefone = dados.telefone.replace(/\D/g, '');
    const nomeArtistico = dados.nomeArtistico?.trim() ?? '';

    if (!nome) {
      console.error('Cadastro inválido: nome não informado.');
      return {
        status: 'invalid_input',
        field: 'nome',
        message: 'Informe seu nome.',
      };
    }

    if (!/^[a-zA-Z0-9_.]{3,24}$/.test(nomeUsuario)) {
      return {
        status: 'invalid_input',
        field: 'nomeUsuario',
        message:
          'Nome de usuário deve ter de 3 a 24 caracteres: letras, números, _ ou .',
      };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return {
        status: 'invalid_input',
        field: 'email',
        message: 'Digite um e-mail válido, como voce@email.com.',
      };
    }

    if (dados.senha.length < 6) {
      return {
        status: 'weak_password',
        message:
          'A senha precisa ter pelo menos 6 caracteres.',
      };
    }

    if (!dados.dataNascimento || !dados.genero) {
      return {
        status: 'invalid_input',
        message: 'Data de nascimento ou gênero não informado.',
      };
    }

    if (telefone.length < 10 || telefone.length > 11) {
      return {
        status: 'invalid_input',
        field: 'telefone',
        message: 'Telefone inválido: informe 10 ou 11 dígitos.',
      };
    }

    if (dados.tipoUsuario === 'Artista' && !nomeArtistico) {
      return {
        status: 'invalid_input',
        field: 'nomeArtistico',
        message: 'O nome artístico é obrigatório para contas de artista.',
      };
    }

    const generosValidos = [
      'Feminino',
      'Masculino',
      'Gênero Fluido',
      'Não Binário',
      'Não Informado',
      'Outro',
    ];

    if (!generosValidos.includes(dados.genero)) {
      return { status: 'invalid_input', message: 'Gênero inválido.' };
    }

    if (!hasMinimumAge(dados.dataNascimento, 0)) {
      return {
        status: 'invalid_input',
        field: 'dataNascimento',
        message: 'Data de nascimento inválida.',
      };
    }

    if (!hasMinimumAge(dados.dataNascimento, 16)) {
      return {
        status: 'invalid_input',
        field: 'dataNascimento',
        message: 'É necessário ter pelo menos 16 anos.',
      };
    }

    const tipoUsuarioBanco = this.converterTipoParaBanco(
      dados.tipoUsuario,
    );

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: dados.senha,
        options: {
          data: {
            nome,
            nomeUsuario,
            nomeArtistico:
              dados.tipoUsuario === 'Artista'
                ? nomeArtistico
                : null,
            dataNascimento: dados.dataNascimento,
            genero: dados.genero,
            telefone,
            tipoUsuario: tipoUsuarioBanco,
          },
        },
      });

      if (error) {
        console.error(
          'Erro no cadastro Supabase:',
          error.message,
          error,
        );
        return this.classificarErroSignup(error);
      }

      if (!data.user) {
        console.error('O Supabase não retornou o usuário criado.');
        return {
          status: 'unknown_error',
          message:
            'Não foi possível concluir seu cadastro agora. Tente novamente mais tarde.',
        };
      }

      this.emailUsuarioLogado = data.user.email ?? email;

      // Com confirmação de e-mail habilitada, o Supabase cria a conta sem
      // iniciar uma sessão imediatamente. O trigger já criou os registros
      // de usuario/artista atomicamente dentro do mesmo INSERT, então a
      // ausência de sessão não é um erro.
      if (!data.session) {
        console.info(
          'Conta criada. É necessário confirmar o e-mail antes de entrar.',
        );
        return {
          status: 'confirmation_required',
          email,
          messageId: (data as { message_id?: string | null })
            ?.message_id ?? null,
        };
      }

      await this.carregarPerfilESessao(data.user);

      const sessao = this.usuarioLogadoSubject.value;

      if (!sessao) {
        // A conta foi criada e autenticada, mas o perfil não pôde ser
        // carregado. Evita deixar o usuário sem perfil.
        console.error(
          'Conta criada com sessão, mas perfil não localizado.',
          data.user.id,
        );
        return {
          status: 'profile_creation_error',
          message:
            'Sua conta foi criada, mas não conseguimos carregar seu perfil. Tente fazer login novamente.',
        };
      }

      return { status: 'success', sessao };
    } catch (erro) {
      console.error('Falha inesperada no cadastro:', erro);
      return this.classificarErroSignup(erro);
    }
  }

  /**
   * Reenvia o e-mail de confirmação de cadastro.
   * O Supabase impõe limites de envio por e-mail; respeita-os retornando
   * `rate_limited` para que a UI possa bloquear tentativas repetidas.
   */
  async reenviarConfirmacaoEmail(
    email: string,
  ): Promise<ReenvioConfirmacao> {
    const emailNormalizado = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
      return {
        status: 'unknown_error',
        message: 'Informe um e-mail válido para reenviar a confirmação.',
      };
    }

    try {
      const { data, error } = await supabase.auth.resend({
        type: 'signup',
        email: emailNormalizado,
      });

      if (error) {
        console.error(
          'Erro ao reenviar confirmação:',
          error.message,
          error,
        );
        const code = (error as { code?: string }).code;
        const status = (error as { status?: number }).status;

        if (
          CODE_RATE_LIMIT.includes(code ?? '') ||
          status === 429
        ) {
          return { status: 'rate_limited' };
        }

        if (this.ehErroRede(error)) {
          return {
            status: 'network_error',
            message:
              'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
          };
        }

        return {
          status: 'unknown_error',
          message:
            'Não foi possível reenviar a confirmação agora. Tente novamente em instantes.',
        };
      }

      return {
        status: 'sent',
        messageId: (data as { message_id?: string | null })
          ?.message_id ?? null,
      };
    } catch (erro) {
      console.error('Falha inesperada no reenvio:', erro);
      if (
        erro instanceof TypeError &&
        erro.message.toLowerCase().includes('fetch')
      ) {
        return {
          status: 'network_error',
          message:
            'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
        };
      }
      return {
        status: 'unknown_error',
        message:
          'Não foi possível reenviar a confirmação agora. Tente novamente em instantes.',
      };
    }
  }

  /**
   * Classifica o erro retornado (ou lançado) por `supabase.auth.signUp`
   * em uma `SignUpResult` sem revelar detalhes internos do banco ao usuário.
   */
  private classificarErroSignup(
    error: unknown,
  ): SignUpResult {
    const authError = error as
      | {
          code?: string;
          status?: number;
          name?: string;
          message?: string;
          details?: unknown;
          hint?: unknown;
          reasons?: string[];
        }
      | undefined
      | null;

    if (this.ehErroRede(error)) {
      return {
        status: 'network_error',
        message:
          'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
      };
    }

    const code = authError?.code;
    const status = authError?.status;

    // Senha fraca — o Supabase informa os motivos exatos via `reasons`.
    if (code === 'weak_password') {
      return {
        status: 'weak_password',
        message: this.mensagemSenhaFraca(
          authError?.reasons ?? undefined,
        ),
        reasons: authError?.reasons,
      };
    }

    // E-mail já registrado — apenas quando identificável com certeza,
    // para não afirmar existência de conta quando o Supabase obscurece.
    if (code && CODE_EMAIL_EXISTS.includes(code)) {
      return { status: 'email_already_registered' };
    }

    // Limite de envio de e-mails / taxa de requisições.
    if (
      (code && CODE_RATE_LIMIT.includes(code)) ||
      status === 429
    ) {
      return { status: 'rate_limited' };
    }

    // Violação de unicidade do banco disparada pelo trigger ao criar o
    // registro de usuario. O código SQLSTATE 23505 é o sinal primário;
    // só o associamos a `nome_usuario` quando houver evidência da coluna.
    if (this.ehViolacaoUnicidade(authError)) {
      if (this.referenciaColuna(authError, 'nome_usuario')) {
        return { status: 'username_already_registered' };
      }

      return {
        status: 'profile_creation_error',
        message:
          'Houve um conflito ao gravar seu perfil. Tente novamente mais tarde.',
      };
    }

    // Outros erros de API do GoTrue (validação, etc.) não mapeados acima.
    if (code) {
      console.warn(
        'Erro de cadastro não mapeado:',
        code,
        authError?.message,
      );
    }

    return {
      status: 'unknown_error',
      message:
        'Não foi possível concluir seu cadastro agora. Confira sua conexão e tente novamente.',
    };
  }

  private ehErroRede(error: unknown): boolean {
    const authError = error as
      | { status?: number; name?: string }
      | undefined
      | null;

    if (
      authError?.name === 'AuthRetryableFetchError' ||
      authError?.status === 0 ||
      (typeof authError?.status === 'number' &&
        authError.status >= 500)
    ) {
      return true;
    }

    if (error instanceof TypeError) {
      return true;
    }

    const msg = (error as { message?: string })?.message ?? '';
    return msg.toLowerCase().includes('fetch');
  }

  /**
   * Detecta violação de restrição de unicidade (SQLSTATE 23505), usando o
   * código como sinal primário e consultando `details`/`hint`/`message`
   * como confirmação secundária — nunca dependendo apenas do texto.
   */
  private ehViolacaoUnicidade(
    error: { code?: string; details?: unknown; hint?: unknown; message?: string }
      | undefined
      | null,
  ): boolean {
    if (error?.code === SQLSTATE_UNIQUE_VIOLATION) {
      return true;
    }

    const alvo =
      String(error?.details ?? '') +
      ' ' +
      String(error?.hint ?? '') +
      ' ' +
      String(error?.message ?? '');

    return alvo.includes(SQLSTATE_UNIQUE_VIOLATION);
  }

  /**
   * Verifica, sem depender exclusivamente da mensagem, se a violação de
   * unicidade referencia a coluna informada. Prefere `details`/`hint`,
   * que são estruturados, e usa `message` apenas como fallback.
   */
  private referenciaColuna(
    error: { details?: unknown; hint?: unknown; message?: string }
      | undefined
      | null,
    coluna: string,
  ): boolean {
    const inText = (v: unknown): boolean =>
      typeof v === 'string' && v.toLowerCase().includes(coluna.toLowerCase());

    const detalhes = error?.details;
    const dica = error?.hint;
    const texto = `${String(detalhes ?? '')} ${String(dica ?? '')} ${String(error?.message ?? '')}`;

    return inText(detalhes) || inText(dica) || texto.toLowerCase().includes(coluna.toLowerCase());
  }

  /**
   * Monta uma orientação amigável a partir dos `reasons` retornados pelo
   * Supabase para senhas fracas. Só menciona o que o servidor reportou,
   * nunca requisitos que não estejam configurados no projeto.
   */
  private mensagemSenhaFraca(reasons?: string[]): string {
    if (!reasons || reasons.length === 0) {
      return 'Sua senha não atende aos requisitos de segurança do ChArte.';
    }

    const partes: string[] = [];

    if (reasons.includes('length')) {
      partes.push('precisa ter mais caracteres');
    }

    if (reasons.includes('characters')) {
      partes.push(
        'precisa conter os tipos de caractere exigidos (letras, números e símbolos)',
      );
    }

    if (reasons.includes('pwned')) {
      partes.push('já aparece em vazamentos conhecidos de senhas');
    }

    if (partes.length === 0) {
      return 'Sua senha não atende aos requisitos de segurança do ChArte.';
    }

    return `Sua senha não atende aos requisitos: ${partes.join(', ')}.`;
  }

  // --------------------------------------------------
  // Login
  // --------------------------------------------------

  async login(
    identificador: string,
    senha: string,
    tipoEsperado: TipoUsuario,
  ): Promise<LoginResult> {
    const informado = identificador.trim().replace(/^@/, '');
    if (!informado || !senha) return { status: 'invalid_credentials' };

    const pareceEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(informado);
    if (informado.includes('@') && !pareceEmail) return { status: 'invalid_credentials' };

    let email = pareceEmail ? informado.toLowerCase() : '';
    let sessaoAnterior: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] = null;
    let autenticadoNestaTentativa = false;
    try {
      await this.aguardarInicializacao();
      if (!pareceEmail) {
        const { data, error } = await supabase.rpc('get_email_by_username', {
          p_nome_usuario: informado,
        });
        if (error) {
          return this.ehFalhaDeConexao(error) ? { status: 'connection_error' } : { status: 'service_error' };
        }
        if (typeof data !== 'string' || !data.trim()) return { status: 'account_not_found' };
        email = data.trim().toLowerCase();
      }
      const anterior = await supabase.auth.getSession();
      sessaoAnterior = anterior.data.session;
      this.loginAttemptInProgress = true;

      const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) {
        if (error && /email_not_confirmed/i.test(`${error.code ?? ''} ${error.message}`)) {
          return { status: 'email_not_confirmed' };
        }
        return error && this.ehFalhaDeConexao(error)
          ? { status: 'connection_error' }
          : { status: 'invalid_credentials' };
      }
      if (!data.user || !data.session) {
        await this.restaurarSessaoAnterior(sessaoAnterior);
        return { status: 'service_error' };
      }
      autenticadoNestaTentativa = true;

      const { data: usuarioDb, error: perfilErro } = await supabase
        .from('usuario')
        .select('tipo_usuario, status_conta, data_nascimento')
        .eq('id_auth', data.user.id)
        .maybeSingle();

      if (perfilErro || !usuarioDb) {
        await this.restaurarSessaoAnterior(sessaoAnterior);
        return perfilErro && this.ehFalhaDeConexao(perfilErro)
          ? { status: 'connection_error' }
          : { status: 'service_error' };
      }

      if (usuarioDb.status_conta && String(usuarioDb.status_conta).toLowerCase() !== 'ativo') {
        await this.restaurarSessaoAnterior(sessaoAnterior);
        return { status: 'account_disabled' };
      }
      if (!hasMinimumAge(usuarioDb.data_nascimento, 16)) {
        await this.restaurarSessaoAnterior(sessaoAnterior);
        return { status: 'age_restricted' };
      }

      const tipoReal = this.converterTipoParaFrontend(usuarioDb.tipo_usuario);
      if (!tipoReal) {
        await this.restaurarSessaoAnterior(sessaoAnterior);
        return { status: 'service_error' };
      }
      if (tipoReal !== tipoEsperado) {
        await this.restaurarSessaoAnterior(sessaoAnterior);
        return { status: 'account_type_mismatch', tipoReal };
      }

      this.emailUsuarioLogado = data.user.email ?? email;
      await this.carregarPerfilESessao(data.user);
      const sessao = this.usuarioLogadoSubject.value;
      if (!sessao || sessao.tipoUsuario !== tipoEsperado) {
        await this.restaurarSessaoAnterior(sessaoAnterior);
        return { status: 'service_error' };
      }
      this.limparEstadoRecuperacao();
      return { status: 'success', sessao };
    } catch (error) {
      if (autenticadoNestaTentativa) await this.restaurarSessaoAnterior(sessaoAnterior);
      return this.ehFalhaDeConexao(error)
        ? { status: 'connection_error' }
        : { status: 'service_error' };
    } finally {
      this.loginAttemptInProgress = false;
    }
  }

  private ehFalhaDeConexao(error: unknown): boolean {
    const detail = error instanceof Error
      ? `${error.name} ${error.message}`
      : error && typeof error === 'object'
        ? `${(error as any).name ?? ''} ${(error as any).message ?? ''} ${(error as any).code ?? ''}`
        : String(error ?? '');
    return /fetch|network|timeout|connection|failed to fetch/i.test(detail);
  }

  private async restaurarSessaoAnterior(
    sessaoAnterior: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'],
  ): Promise<void> {
    try {
      if (sessaoAnterior?.access_token && sessaoAnterior.refresh_token) {
        const { data, error } = await supabase.auth.setSession({
          access_token: sessaoAnterior.access_token,
          refresh_token: sessaoAnterior.refresh_token,
        });
        if (!error && data.session?.user) {
          this.emailUsuarioLogado = data.session.user.email ?? '';
          await this.carregarPerfilESessao(data.session.user);
          return;
        }
      }
      await supabase.auth.signOut({ scope: 'local' });
      this.emailUsuarioLogado = '';
      this.authUidAutorizado = null;
      this.usuarioLogadoSubject.next(null);
    } catch {
      this.emailUsuarioLogado = '';
      this.authUidAutorizado = null;
      this.usuarioLogadoSubject.next(null);
    }
  }

  // --------------------------------------------------
  // Logout e consulta da sessão
  // --------------------------------------------------

  async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Erro ao sair da conta:', error.message);
      throw error;
    }

    this.emailUsuarioLogado = '';
    this.authUidAutorizado = null;
    this.limparEstadoRecuperacao();
    this.usuarioLogadoSubject.next(null);
  }

  async logoutLocal(): Promise<void> {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Sempre remove a sessão da aplicação neste dispositivo.
    } finally {
      this.emailUsuarioLogado = '';
      this.authUidAutorizado = null;
      this.limparEstadoRecuperacao();
      this.usuarioLogadoSubject.next(null);
    }
  }

  getUsuarioLogado(): SessaoUsuario | null {
    return this.usuarioLogadoSubject.value;
  }

  obterEmailUsuarioLogado(): string {
    return this.emailUsuarioLogado;
  }

  estaLogado(): boolean {
    return this.usuarioLogadoSubject.value !== null;
  }

  // --------------------------------------------------
  // Atualização de e-mail e senha no Supabase Auth
  // --------------------------------------------------

  async atualizarEmail(email: string): Promise<boolean> {
    const emailNormalizado = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
      return false;
    }

    const { data, error } = await supabase.auth.updateUser({
      email: emailNormalizado,
    });

    if (error) {
      console.error('Erro ao atualizar e-mail:', error.message);
      return false;
    }

    this.emailUsuarioLogado =
      data.user?.email ?? this.emailUsuarioLogado;

    return true;
  }

  async atualizarSenha(novaSenha: string): Promise<boolean> {
    if (novaSenha.length < 6) {
      console.error('A senha precisa ter pelo menos 6 caracteres.');
      return false;
    }

    const { error } = await supabase.auth.updateUser({
      password: novaSenha,
    });

    if (error) {
      console.error('Erro ao atualizar senha:', error.message);
      return false;
    }

    return true;
  }

  // --------------------------------------------------
  // Atualização do perfil no PostgreSQL
  // --------------------------------------------------

  async atualizarFotoPerfil(fotoPerfil: string): Promise<boolean> {
    const sessao = this.usuarioLogadoSubject.value;
    if (!sessao) return false;

    const { error } = await supabase
      .from('usuario')
      .update({ foto_perfil: fotoPerfil })
      .eq('id_usuario', Number(sessao.idUsuario));

    if (error) {
      console.error('Erro ao atualizar foto:', error.message);
      return false;
    }

    this.usuarioLogadoSubject.next({
      ...sessao,
      fotoPerfil,
    });

    return true;
  }

  async atualizarUsername(username: string): Promise<boolean> {
    const sessao = this.usuarioLogadoSubject.value;
    if (!sessao) return false;

    const nomeUsuario = username.trim().replace(/^@/, '');

    if (!/^[a-zA-Z0-9_.]{3,24}$/.test(nomeUsuario)) {
      console.error('Nome de usuário inválido.');
      return false;
    }

    const { data, error } = await supabase
      .from('usuario')
      .update({ nome_usuario: nomeUsuario })
      .eq('id_usuario', Number(sessao.idUsuario))
      .select('id_usuario')
      .maybeSingle();

    if (error || !data) {
      console.error(
        'Erro ao atualizar nome de usuário:',
        error?.message ?? 'Nenhum registro foi atualizado.',
      );
      return false;
    }

    this.usuarioLogadoSubject.next({
      ...sessao,
      nomeUsuario,
    });

    return true;
  }

}

