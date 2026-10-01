package dev.yycodes.paymentsimulator.config;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class HostedDatabaseEnvironmentTest {
    @Test
    void decodesCredentialsAndPreservesJdbcOptions() {
        var p =
                HostedDatabaseEnvironment.properties(
                        "postgresql://demo:secret%40with%3Acolon+plus@db:5432/payments?sslmode=require");
        assertThat(p.get("spring.datasource.url"))
                .isEqualTo("jdbc:postgresql://db:5432/payments?sslmode=require");
        assertThat(p.get("spring.datasource.password")).isEqualTo("secret@with:colon+plus");
    }

    @Test
    void rejectsInvalidUrlWithoutLeakingItsValue() {
        for (String value :
                new String[] {
                    "https://demo:private@db/payments",
                    "postgres://db/payments",
                    "postgres://demo:private@db/"
                })
            assertThatThrownBy(() -> HostedDatabaseEnvironment.properties(value))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageNotContaining("private");
    }

    @Test
    void injectedHostedConnectionOverridesOldExternalSettings() {
        var env =
                new MockEnvironment()
                        .withProperty("DATABASE_URL", "postgres://user:password@internal/payments")
                        .withProperty("spring.datasource.url", "jdbc:postgresql://old/payments");
        new HostedDatabaseEnvironment().postProcessEnvironment(env, null);
        assertThat(env.getProperty("spring.datasource.url"))
                .isEqualTo("jdbc:postgresql://internal/payments");
    }

    @Test
    void noHostedVariablePreservesLocalConfiguration() {
        var env =
                new MockEnvironment()
                        .withProperty("spring.datasource.url", "jdbc:postgresql://local/payments");
        new HostedDatabaseEnvironment().postProcessEnvironment(env, null);
        assertThat(env.getProperty("spring.datasource.url"))
                .isEqualTo("jdbc:postgresql://local/payments");
    }
}
