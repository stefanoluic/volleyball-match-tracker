package rs.stefanoluic.volleyball.player.dto;

import org.springframework.data.domain.Page;

import java.util.List;

public record PlayerPageResponse(List<PlayerResponse> content, int page, int totalPages, long totalElements) {
    public static PlayerPageResponse from(Page<PlayerResponse> page) {
        return new PlayerPageResponse(page.getContent(), page.getNumber(), page.getTotalPages(), page.getTotalElements());
    }
}
