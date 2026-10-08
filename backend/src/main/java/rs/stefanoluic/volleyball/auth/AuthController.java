package rs.stefanoluic.volleyball.auth;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;
import rs.stefanoluic.volleyball.auth.dto.RegisterRequest;
import rs.stefanoluic.volleyball.security.AuthenticatedUser;
import rs.stefanoluic.volleyball.user.UserService;
import rs.stefanoluic.volleyball.user.dto.UserResponse;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService auth;
    private final UserService users;
    public AuthController(AuthService auth, UserService users) {
        this.auth = auth;
        this.users = users;
    }
    @GetMapping("/csrf")
    public CsrfResponse csrf(CsrfToken token) {
        return new CsrfResponse(token.getHeaderName(), token.getToken());
    }
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse register(@Valid @RequestBody RegisterRequest request) {
        return auth.register(request);
    }
    @GetMapping("/me")
    public UserResponse me(@AuthenticationPrincipal AuthenticatedUser principal) {
        return users.get(principal.getId());
    }
    public record CsrfResponse(String headerName, String token) {}
}
