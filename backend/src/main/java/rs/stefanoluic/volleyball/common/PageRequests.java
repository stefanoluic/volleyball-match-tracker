package rs.stefanoluic.volleyball.common;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import rs.stefanoluic.volleyball.common.exception.ApiException;

public final class PageRequests {
    private PageRequests() {}

    public static PageRequest of(int page, int size, Sort sort) {
        // JPA accepts an int row offset, even though Spring's Pageable uses a long.
        if (page < 0 || size < 1 || size > 100 || (long) page * size > Integer.MAX_VALUE) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Neispravna stranica ili veličina stranice.");
        }
        return PageRequest.of(page, size, sort);
    }
}
