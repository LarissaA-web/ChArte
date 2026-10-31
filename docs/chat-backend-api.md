# Contrato HTTP do chat

O frontend chama a API definida em `CHAT_API_BASE_URL` (`/api/chat` por padrão) e envia cookies de sessão (`withCredentials`). O backend precisa autenticar cada chamada por uma sessão própria. Hoje o login deste projeto é local/de demonstração e não cria uma sessão no servidor; para liberar o chat com contas reais, o backend de autenticação precisa emitir o cookie de sessão (ou o serviço de chat precisa ser adaptado ao mecanismo de token escolhido). Todas as mensagens e participantes devem ser obtidos do banco no servidor; o navegador não envia o ID do remetente.

## Endpoints

- `GET /conversations` — lista conversas do usuário autenticado.
- `GET /users?q={termo}` — busca pessoas reais para iniciar uma conversa. Não deve retornar o próprio usuário.
- `POST /conversations` com `{ "participantId": "..." }` ou `{ "participantUsername": "ana_art" }` — cria ou retorna a conversa existente com essa pessoa. O segundo formato é usado pelo botão de chat dentro de um pin quando o nome de usuário está disponível.
- `GET /conversations/{conversationId}/messages` — lista mensagens em ordem cronológica.
- `POST /conversations/{conversationId}/messages` com `{ "content": "..." }` — valida participação, salva a mensagem e retorna o registro persistido.

## Formato esperado

```json
// GET /conversations
[
  {
    "id": "conversation-id",
    "participant": {
      "id": "user-id",
      "username": "ana_art",
      "displayName": "Ana Silva",
      "avatarUrl": "/media/ana.jpg"
    },
    "lastMessage": {
      "content": "Olá!",
      "createdAt": "2026-10-03T14:30:00.000Z"
    }
  }
]
```

```json
// GET /conversations/{id}/messages e resposta do POST de mensagem
[
  {
    "id": "message-id",
    "isMine": false,
    "content": "Olá!",
    "createdAt": "2026-10-03T14:30:00.000Z"
  }
]
```

O `POST /messages` retorna um único objeto de mensagem no mesmo formato. `isMine` é calculado pelo servidor comparando o remetente autenticado com o autor da mensagem. Responda `401` para sessão ausente/expirada e erros JSON como `{ "message": "..." }` para que o frontend mostre o motivo.

## Persistência e segurança

O servidor deve gravar cada mensagem com identificadores de conversa e remetente, conteúdo e data de criação. Valide que o usuário autenticado pertence à conversa antes de listar ou salvar; derive sempre o remetente da sessão, limite o tamanho do conteúdo e use consultas parametrizadas. Configure CORS com credenciais e uma origem explícita se frontend e API estiverem em domínios diferentes.

O componente atualiza a lista de mensagens a cada cinco segundos enquanto o modal está aberto. O contrato pode ser trocado por WebSocket ou Server-Sent Events no backend sem alterar o formato das mensagens.
