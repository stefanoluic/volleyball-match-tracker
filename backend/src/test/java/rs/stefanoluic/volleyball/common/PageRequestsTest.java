package rs.stefanoluic.volleyball.common;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import rs.stefanoluic.volleyball.common.exception.ApiException;
import static org.assertj.core.api.Assertions.*;

class PageRequestsTest {
    private final Sort sort = Sort.by("id");

    @ParameterizedTest
    @CsvSource({"-1,20", "0,0", "0,-1", "0,101", "0,2147483647", "21474837,100", "2147483647,100"})
    void invalidOrOverflowingOffsetsReturnBadRequest(int page, int size) {
        assertThatThrownBy(() -> PageRequests.of(page, size, sort))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @ParameterizedTest
    @CsvSource({"0,100", "1,20", "21474836,100", "2147483647,1"})
    void supportedOffsetsAndSortingArePreserved(int page, int size) {
        var result = PageRequests.of(page, size, sort);
        assertThat(result.getPageNumber()).isEqualTo(page);
        assertThat(result.getPageSize()).isEqualTo(size);
        assertThat(result.getOffset()).isEqualTo((long) page * size);
        assertThat(result.getSort()).isEqualTo(sort);
    }
}
