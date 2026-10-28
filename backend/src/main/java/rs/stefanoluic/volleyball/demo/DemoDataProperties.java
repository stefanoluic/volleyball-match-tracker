package rs.stefanoluic.volleyball.demo;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.demo")
public record DemoDataProperties(String password) {
    @Override
    public String toString() {
        return "DemoDataProperties[password=[REDACTED]]";
    }
}
