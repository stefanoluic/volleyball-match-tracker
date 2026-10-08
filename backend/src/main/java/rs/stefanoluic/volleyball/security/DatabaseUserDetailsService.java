package rs.stefanoluic.volleyball.security;

import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import rs.stefanoluic.volleyball.user.User;
import rs.stefanoluic.volleyball.user.UserRepository;

@Service
public class DatabaseUserDetailsService implements UserDetailsService {
    private final UserRepository users;
    public DatabaseUserDetailsService(UserRepository users) { this.users = users; }
    @Override
    public UserDetails loadUserByUsername(String email) {
        return users.findByEmail(User.normalizeEmail(email)).map(AuthenticatedUser::new)
                .orElseThrow(() -> new UsernameNotFoundException("Invalid credentials"));
    }
}
