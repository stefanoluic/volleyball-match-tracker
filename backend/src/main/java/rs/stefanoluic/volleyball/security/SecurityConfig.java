package rs.stefanoluic.volleyball.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.savedrequest.NullRequestCache;
import rs.stefanoluic.volleyball.user.UserRepository;
import rs.stefanoluic.volleyball.user.UserService;

@Configuration(proxyBeanMethods = false)
public class SecurityConfig {
    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, UserRepository users,
                                             UserService service, SecurityJson json) throws Exception {
        return http
                .authorizeHttpRequests(access -> access
                        .requestMatchers(HttpMethod.GET, "/api/auth/csrf", "/api/system/health").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login").permitAll()
                        .requestMatchers("/error").permitAll()
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/teams", "/api/teams/**")
                        .hasAnyRole("STATISTICIAN", "COACH")
                        .requestMatchers("/api/teams", "/api/teams/**").hasRole("STATISTICIAN")
                        .requestMatchers(HttpMethod.GET, "/api/matches", "/api/matches/**")
                        .hasAnyRole("STATISTICIAN", "COACH")
                        .requestMatchers("/api/matches", "/api/matches/**").hasRole("STATISTICIAN")
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().denyAll())
                .requestCache(cache -> cache.requestCache(new NullRequestCache()))
                // Default session-backed CSRF protection remains enabled.
                .formLogin(login -> login.loginProcessingUrl("/api/auth/login").usernameParameter("email")
                        .successHandler((request, response, authentication) -> {
                            var principal = (AuthenticatedUser) authentication.getPrincipal();
                            json.write(response, 200, service.get(principal.getId()));
                        })
                        .failureHandler((request, response, exception) -> json.error(response, 401,
                                "Pogrešan mejl ili lozinka, ili nalog nije odobren.")))
                .logout(logout -> logout.logoutUrl("/api/auth/logout").deleteCookies("JSESSIONID")
                        .logoutSuccessHandler((request, response, authentication) -> response.setStatus(204)))
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint((request, response, exception) ->
                                json.error(response, 401, "Potrebna je prijava."))
                        .accessDeniedHandler((request, response, exception) ->
                                json.error(response, 403, "Nemate dozvolu ili je zaštitni token istekao.")))
                .addFilterBefore(new ActiveAccountFilter(users, json), AuthorizationFilter.class)
                .build();
    }
}
