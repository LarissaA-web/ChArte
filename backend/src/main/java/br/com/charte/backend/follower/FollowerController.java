package br.com.charte.backend.follower;

import br.com.charte.backend.follower.FollowerService.FollowSummaryView;
import br.com.charte.backend.follower.FollowerService.FollowerProfileView;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/followers")
public class FollowerController {

    private final FollowerService followerService;

    public FollowerController(FollowerService followerService) {
        this.followerService = followerService;
    }

    @GetMapping("/{username}/summary")
    public FollowSummaryView getSummary(
            @PathVariable String username,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String authId = jwt != null ? jwt.getSubject() : null;
        return followerService.getSummary(username, authId);
    }

    @GetMapping("/{username}/followers")
    public List<FollowerProfileView> listFollowers(@PathVariable String username) {
        return followerService.listFollowers(username);
    }

    @GetMapping("/{username}/following")
    public List<FollowerProfileView> listFollowing(@PathVariable String username) {
        return followerService.listFollowing(username);
    }

    @PostMapping("/{username}")
    public FollowSummaryView follow(
            @PathVariable String username,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String authId = jwt != null ? jwt.getSubject() : null;
        return followerService.follow(username, authId);
    }

    @DeleteMapping("/{username}")
    public FollowSummaryView unfollow(
            @PathVariable String username,
            @AuthenticationPrincipal Jwt jwt
    ) {
        String authId = jwt != null ? jwt.getSubject() : null;
        return followerService.unfollow(username, authId);
    }
}

