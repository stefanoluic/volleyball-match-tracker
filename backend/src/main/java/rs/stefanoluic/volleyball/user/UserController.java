package rs.stefanoluic.volleyball.user;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import rs.stefanoluic.volleyball.user.dto.UserPageResponse;
import rs.stefanoluic.volleyball.user.dto.UserResponse;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/users")
public class UserController {
    private final UserService users;
    public UserController(UserService users) { this.users = users; }
    @GetMapping
    public UserPageResponse list(@RequestParam(required = false) UserStatus status,
                                 @RequestParam(defaultValue = "0") int page,
                                 @RequestParam(defaultValue = "20") int size) {
        return users.list(status, page, size);
    }
    @PostMapping("/{id}/approve")
    public UserResponse approve(@PathVariable UUID id) { return users.approve(id); }
    @PostMapping("/{id}/block")
    public UserResponse block(@PathVariable UUID id) { return users.block(id); }
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteBlocked(@PathVariable UUID id) { users.deleteBlocked(id); }
}
