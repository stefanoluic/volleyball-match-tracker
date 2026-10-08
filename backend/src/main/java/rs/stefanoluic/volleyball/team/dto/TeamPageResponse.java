package rs.stefanoluic.volleyball.team.dto;

import org.springframework.data.domain.Page;

import java.util.List;

public record TeamPageResponse(List<TeamResponse> content, int page, int totalPages, long totalElements) {
    public static TeamPageResponse from(Page<TeamResponse> page) {
        return new TeamPageResponse(page.getContent(), page.getNumber(), page.getTotalPages(), page.getTotalElements());
    }
}
