
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { TipoUsuario } from '../app/mocks/usuarios.mock';
import { supabase } from '../app/core/supabase/supabase.client';

export interface SessaoUsuario {
  idUsuario: string;
  nomeUsuario: string;
  tipoUsuario: TipoUsuario;
  nome: string;
  nomeArtistico?: string;
  fotoPerfil: string;
}

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

// Códigos de erro do Supabase Auth (AuthErrorCode) considerados aqui.
const CODE_EMAIL_EXISTS = ['email_exists', 'user_already_registered', 'user_already_exists'];
const CODE_RATE_LIMIT = [
  'over_email_send_rate_limit',
  'over_sms_send_rate_limit',
  'over_request_rate_limit',
];
const SQLSTATE_UNIQUE_VIOLATION = '23505';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly usuarioLogadoSubject =
    new BehaviorSubject<SessaoUsuario | null>(null);

  readonly usuarioLogado$: Observable<SessaoUsuario | null> =
    this.usuarioLogadoSubject.asObservable();

  private inicializacaoPromise: Promise<void>;
  private emailUsuarioLogado = '';
  private listenerRegistrado = false;

  constructor() {
    this.inicializacaoPromise = this.inicializarSessao();
  }

  // --------------------------------------------------
  // Conversão dos tipos de conta
  // --------------------------------------------------

  private converterTipoParaBanco(tipo: TipoUsuario): string {
    return tipo === 'Comum' ? 'Cliente' : tipo;
  }

  private converterTipoParaFrontend(tipoBanco: string): TipoUsuario {
    return tipoBanco === 'Cliente'
      ? 'Comum'
      : (tipoBanco as TipoUsuario);
  }

  // --------------------------------------------------
  // Inicialização e acompanhamento da sessão
  // --------------------------------------------------

  private async inicializarSessao(): Promise<void> {
    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error('Erro ao recuperar a sessão:', error.message);
      }

      if (data.session?.user) {
        this.emailUsuarioLogado = data.session.user.email ?? '';
        await this.carregarPerfilESessao(data.session.user);
      }

      if (!this.listenerRegistrado) {
        this.listenerRegistrado = true;

        supabase.auth.onAuthStateChange((evento, sessao) => {
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
              this.emailUsuarioLogado = '';
              this.usuarioLogadoSubject.next(null);
            }
          });
        });
      }
    } catch (erro) {
      console.error('Erro ao inicializar autenticação:', erro);
    }
  }

  async aguardarInicializacao(): Promise<void> {
    await this.inicializacaoPromise;
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
          'id_usuario, id_auth, nome_usuario, nome, tipo_usuario, foto_perfil',
        )
        .eq('id_auth', user.id)
        .maybeSingle();

      if (error) {
        console.error('Erro ao consultar perfil:', error.message);
        this.usuarioLogadoSubject.next(null);
        return;
      }

      if (!usuarioDb) {
        console.warn(
          'Usuário autenticado, mas sem perfil na tabela usuario.',
          user.id,
        );
        this.usuarioLogadoSubject.next(null);
        return;
      }

      const usuario = usuarioDb as UsuarioBanco;
      const tipoFrontend = this.converterTipoParaFrontend(
        usuario.tipo_usuario,
      );

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
      this.usuarioLogadoSubject.next(sessao);
    } catch (erro) {
      console.error('Erro ao carregar perfil da sessão:', erro);
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

    const nascimento = new Date(`${dados.dataNascimento}T00:00:00`);
    const hoje = new Date();

    if (
      !Number.isFinite(nascimento.getTime()) ||
      nascimento > hoje
    ) {
      return {
        status: 'invalid_input',
        field: 'dataNascimento',
        message: 'Data de nascimento inválida.',
      };
    }

    let idade = hoje.getFullYear() - nascimento.getFullYear();

    if (
      hoje.getMonth() < nascimento.getMonth() ||
      (hoje.getMonth() === nascimento.getMonth() &&
        hoje.getDate() < nascimento.getDate())
    ) {
      idade--;
    }

    if (idade < 13) {
      return {
        status: 'invalid_input',
        field: 'dataNascimento',
        message: 'É necessário ter pelo menos 13 anos.',
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
    tipoEsperado?: TipoUsuario,
  ): Promise<boolean> {
    try {
      await this.aguardarInicializacao();

      const ident = identificador.trim();
      let email = ident;

      if (!ident) {
        console.error('Informe seu e-mail ou nome de usuário.');
        return false;
      }

      if (!ident.includes('@')) {
        const { data, error } = await supabase.rpc(
          'get_email_by_username',
          { p_nome_usuario: ident },
        );

        if (error || !data) {
          console.error(
            'Não foi possível localizar o usuário:',
            error?.message,
          );
          return false;
        }

        email = data as string;
      }

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email,
          password: senha,
        });

      if (error || !data.user || !data.session) {
        console.error(
          'Falha no login:',
          error?.message ?? 'Sessão não criada.',
        );
        return false;
      }

      const { data: usuarioDb, error: perfilErro } = await supabase
        .from('usuario')
        .select('tipo_usuario')
        .eq('id_auth', data.user.id)
        .maybeSingle();

      if (perfilErro || !usuarioDb) {
        console.error(
          'Conta autenticada sem perfil válido:',
          perfilErro?.message,
        );
        await supabase.auth.signOut();
        return false;
      }

      const tipoReal = this.converterTipoParaFrontend(
        usuarioDb.tipo_usuario,
      );

      if (tipoEsperado && tipoReal !== tipoEsperado) {
        console.error('O tipo de conta não corresponde ao login.');
        await supabase.auth.signOut();
        return false;
      }

      this.emailUsuarioLogado = data.user.email ?? email;
      await this.carregarPerfilESessao(data.user);

      return this.usuarioLogadoSubject.value !== null;
    } catch (erro) {
      console.error('Erro inesperado no login:', erro);
      return false;
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
    this.usuarioLogadoSubject.next(null);
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

  // --------------------------------------------------
  // Exclusão de conta
  // --------------------------------------------------

  /**
   * Este método encerra a sessão, mas não exclui o usuário
   * de auth.users nem os registros do banco.
   *
   * A exclusão definitiva deve ser implementada no servidor,
   * por exemplo, com uma Supabase Edge Function autenticada
   * que valide o usuário e utilize a chave service_role.
   */
  async excluirContaLogada(): Promise<boolean> {
    if (!this.usuarioLogadoSubject.value) return false;

    try {
      await this.logout();
      return true;
    } catch (erro) {
      console.error('Não foi possível encerrar a sessão:', erro);
      return false;
    }
  }
}

