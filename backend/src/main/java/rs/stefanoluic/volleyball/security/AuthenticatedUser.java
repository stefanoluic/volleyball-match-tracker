package rs.stefanoluic.volleyball.security;

import org.springframework.security.core.CredentialsContainer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import rs.stefanoluic.volleyball.user.User;
import rs.stefanoluic.volleyball.user.UserRole;
import rs.stefanoluic.volleyball.user.UserStatus;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public class AuthenticatedUser implements UserDetails, CredentialsContainer {
    private final UUID id;
    private final String email;
    private final UserRole role;
    private final boolean enabled;
    private String password;
    public AuthenticatedUser(User user) {
        this.id = user.getId();
        this.email = user.getEmail();
        this.role = user.getRole();
        this.enabled = user.getStatus() == UserStatus.ACTIVE;
        this.password = user.getPasswordHash();
    }
    public UUID getId() { return id; }
    public UserRole getRole() { return role; }
    @Override public String getUsername() { return email; }
    @Override public String getPassword() { return password; }
    @Override public boolean isEnabled() { return enabled; }
    @Override public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role.name()));
    }
    @Override public void eraseCredentials() { password = null; }
}
