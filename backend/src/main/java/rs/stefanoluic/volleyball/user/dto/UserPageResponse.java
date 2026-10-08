package rs.stefanoluic.volleyball.user.dto;

import org.springframework.data.domain.Page;
import java.util.List;

public record UserPageResponse(List<UserResponse> content, int page, int totalPages, long totalElements) {
    public static UserPageResponse from(Page<UserResponse> page) {
        return new UserPageResponse(page.getContent(), page.getNumber(),
                page.getTotalPages(), page.getTotalElements());
    }
}
