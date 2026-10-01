package dev.yycodes.paymentsimulator.config;

import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/** Translate a host-supplied PostgreSQL URI into Spring JDBC configuration. */
public class HostedDatabaseEnvironment implements EnvironmentPostProcessor, Ordered {
    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }

    @Override
    public void postProcessEnvironment(
            ConfigurableEnvironment environment, SpringApplication application) {
        String value = environment.getProperty("DATABASE_URL");
        if (value != null && !value.isBlank())
            environment
                    .getPropertySources()
                    .addFirst(new MapPropertySource("hostedDatabase", properties(value)));
    }

    static Map<String, Object> properties(String value) {
        try {
            URI uri = URI.create(value);
            if (!("postgresql".equals(uri.getScheme()) || "postgres".equals(uri.getScheme()))
                    || uri.getHost() == null
                    || uri.getRawUserInfo() == null
                    || uri.getPath() == null
                    || uri.getPath().length() < 2
                    || uri.getFragment() != null) throw new IllegalArgumentException();
            String[] user = uri.getRawUserInfo().split(":", 2);
            if (user.length != 2 || user[0].isBlank() || user[1].isBlank())
                throw new IllegalArgumentException();
            String host = uri.getHost().contains(":") ? "[" + uri.getHost() + "]" : uri.getHost();
            String jdbc =
                    "jdbc:postgresql://"
                            + host
                            + (uri.getPort() < 0 ? "" : ":" + uri.getPort())
                            + uri.getRawPath()
                            + (uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery());
            return Map.of(
                    "spring.datasource.url",
                    jdbc,
                    "spring.datasource.username",
                    decode(user[0]),
                    "spring.datasource.password",
                    decode(user[1]));
        } catch (Exception e) {
            throw new IllegalArgumentException(
                    "DATABASE_URL must be a PostgreSQL URI containing a host, database, username"
                        + " and password");
        }
    }

    private static String decode(String value) {
        return URLDecoder.decode(value.replace("+", "%2B"), StandardCharsets.UTF_8);
    }
}
