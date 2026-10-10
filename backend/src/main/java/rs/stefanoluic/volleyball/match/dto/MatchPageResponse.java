package rs.stefanoluic.volleyball.match.dto;

import org.springframework.data.domain.Page;
import java.util.List;

public record MatchPageResponse(List<MatchResponse> content, int page, int totalPages, long totalElements) {
    public static MatchPageResponse from(Page<MatchResponse> page) {
        return new MatchPageResponse(page.getContent(), page.getNumber(), page.getTotalPages(), page.getTotalElements());
    }
}
