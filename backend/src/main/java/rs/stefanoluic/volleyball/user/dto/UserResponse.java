package rs.stefanoluic.volleyball.user.dto;

import rs.stefanoluic.volleyball.user.User;
import rs.stefanoluic.volleyball.user.UserRole;
import rs.stefanoluic.volleyball.user.UserStatus;
import java.time.Instant;
import java.util.UUID;

public record UserResponse(UUID id, String firstName, String lastName, String email,
                           UserRole role, UserStatus status, Instant createdAt) {
    public static UserResponse from(User user) {
        return new UserResponse(user.getId(), user.getFirstName(), user.getLastName(),
                user.getEmail(), user.getRole(), user.getStatus(), user.getCreatedAt());
    }
}
