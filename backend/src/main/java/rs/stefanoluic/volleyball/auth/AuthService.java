package rs.stefanoluic.volleyball.auth;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.stefanoluic.volleyball.auth.dto.RegisterRequest;
import rs.stefanoluic.volleyball.common.exception.ApiException;
import rs.stefanoluic.volleyball.user.*;
import rs.stefanoluic.volleyball.user.dto.UserResponse;

@Service
public class AuthService {
    private final UserRepository users;
    private final PasswordEncoder encoder;
    public AuthService(UserRepository users, PasswordEncoder encoder) {
        this.users = users;
        this.encoder = encoder;
    }
    @Transactional
    public UserResponse register(RegisterRequest request) {
        if (!request.password().equals(request.confirmPassword())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Lozinke se ne podudaraju.");
        }
        if (users.existsByEmail(request.email())) {
            throw new ApiException(HttpStatus.CONFLICT, "Nalog sa ovom mejl adresom već postoji.");
        }
        User user = new User(request.firstName(), request.lastName(), request.email(),
                encoder.encode(request.password()), UserRole.valueOf(request.role().name()), UserStatus.PENDING);
        return UserResponse.from(users.saveAndFlush(user));
    }
}
