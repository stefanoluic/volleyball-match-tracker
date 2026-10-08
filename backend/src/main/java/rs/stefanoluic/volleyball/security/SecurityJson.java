package rs.stefanoluic.volleyball.security;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
import rs.stefanoluic.volleyball.common.exception.ApiError;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

@Component
public class SecurityJson {
    private final ObjectMapper mapper;
    public SecurityJson(ObjectMapper mapper) { this.mapper = mapper; }
    public void write(HttpServletResponse response, int status, Object body) throws IOException {
        response.setStatus(status);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType("application/json");
        response.getWriter().write(mapper.writeValueAsString(body));
    }
    public void error(HttpServletResponse response, int status, String message) throws IOException {
        write(response, status, new ApiError(message));
    }
}
