package br.com.charte.backend.chat;

import br.com.charte.backend.chat.ChatService.ChatConversationView;
import br.com.charte.backend.chat.ChatService.ChatMessageView;
import br.com.charte.backend.chat.ChatService.ChatUserView;
import br.com.charte.backend.chat.ChatService.SendMessageRequest;
import br.com.charte.backend.chat.ChatService.StartConversationRequest;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private final ChatService chatService;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
    }

    @GetMapping("/conversations")
    public List<ChatConversationView> listConversations(@AuthenticationPrincipal Jwt jwt) {
        return chatService.listConversations(jwt.getSubject());
    }

    @GetMapping("/users")
    public List<ChatUserView> searchUsers(
            @RequestParam(name = "q", defaultValue = "") String query,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return chatService.searchUsers(query, jwt.getSubject());
    }

    @PostMapping("/conversations")
    public ChatConversationView startOrGetConversation(
            @RequestBody StartConversationRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return chatService.startOrGetConversation(request, jwt.getSubject());
    }

    @GetMapping("/conversations/{conversationId}/messages")
    public List<ChatMessageView> listMessages(
            @PathVariable Long conversationId,
            @RequestParam(name = "limit", defaultValue = "60") int limit,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return chatService.listMessages(conversationId, limit, jwt.getSubject());
    }

    @PostMapping("/conversations/{conversationId}/messages")
    public ChatMessageView sendMessage(
            @PathVariable Long conversationId,
            @RequestBody SendMessageRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return chatService.sendMessage(conversationId, request, jwt.getSubject());
    }
}
