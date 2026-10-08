package rs.stefanoluic.volleyball.team;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.text.Normalizer;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "teams", schema = "volleyball")
public class Team {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, length = 100)
    private String city;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected Team() {
    }

    public Team(String name, String city) {
        update(name, city);
        createdAt = Instant.now();
    }

    public static String normalizeText(String value) {
        return value == null ? null : Normalizer.normalize(value.strip(), Normalizer.Form.NFC);
    }

    public void update(String name, String city) {
        this.name = Objects.requireNonNull(normalizeText(name));
        this.city = Objects.requireNonNull(normalizeText(city));
    }

    public UUID getId() { return id; }
    public String getName() { return name; }
    public String getCity() { return city; }
    public Instant getCreatedAt() { return createdAt; }
}
