package rs.stefanoluic.volleyball.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import rs.stefanoluic.volleyball.user.UserRepository;
import rs.stefanoluic.volleyball.user.UserStatus;
import java.io.IOException;

public class ActiveAccountFilter extends OncePerRequestFilter {
    private final UserRepository users;
    private final SecurityJson json;
    public ActiveAccountFilter(UserRepository users, SecurityJson json) {
        this.users = users;
        this.json = json;
    }
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser principal) {
            boolean active = users.findById(principal.getId())
                    .filter(user -> user.getStatus() == UserStatus.ACTIVE && user.getRole() == principal.getRole())
                    .isPresent();
            if (!active) {
                var session = request.getSession(false);
                if (session != null) session.invalidate();
                SecurityContextHolder.clearContext();
                json.error(response, 401, "Nalog više nema pristup. Obratite se administratoru.");
                return;
            }
        }
        chain.doFilter(request, response);
    }
}
