package rs.stefanoluic.volleyball.user;

import rs.stefanoluic.volleyball.common.PageRequests;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rs.stefanoluic.volleyball.common.exception.ApiException;
import rs.stefanoluic.volleyball.user.dto.UserPageResponse;
import rs.stefanoluic.volleyball.user.dto.UserResponse;
import java.util.UUID;

@Service
public class UserService {
    private final UserRepository users;
    public UserService(UserRepository users) { this.users = users; }
    @Transactional(readOnly = true)
    public UserResponse get(UUID id) {
        return UserResponse.from(users.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Nalog nije pronađen.")));
    }
    @Transactional(readOnly = true)
    public UserPageResponse list(UserStatus status, int page, int size) {
        var pageable = PageRequests.of(page, size, Sort.by(
                Sort.Order.desc("createdAt"), Sort.Order.desc("id")));
        var results = status == null ? users.findByRoleNot(UserRole.ADMIN, pageable)
                : users.findByRoleNotAndStatus(UserRole.ADMIN, status, pageable);
        return UserPageResponse.from(results.map(UserResponse::from));
    }
    @Transactional
    public UserResponse approve(UUID id) {
        User user = manageableUser(id);
        user.activate();
        return UserResponse.from(user);
    }
    @Transactional
    public UserResponse block(UUID id) {
        User user = manageableUser(id);
        user.block();
        return UserResponse.from(user);
    }
    @Transactional
    public void deleteBlocked(UUID id) {
        User user = manageableUser(id);
        if (user.getStatus() != UserStatus.BLOCKED) {
            throw new ApiException(HttpStatus.CONFLICT, "Moguće je obrisati samo blokiran nalog.");
        }
        users.delete(user);
    }
    private User manageableUser(UUID id) {
        User user = users.findByIdForUpdate(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Nalog nije pronađen."));
        if (user.getRole() == UserRole.ADMIN) {
            throw new ApiException(HttpStatus.CONFLICT, "Administratorski nalog nije moguće menjati ovim putem.");
        }
        return user;
    }
}
