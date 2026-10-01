package dev.yycodes.paymentsimulator.demo;

import dev.yycodes.paymentsimulator.shared.ApiError;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.time.Instant;
import java.util.HashMap;
import java.util.UUID;

@Component
@Order(10)
public class DemoAccessFilter extends OncePerRequestFilter {
    private final DemoWorkspace workspace;
    private final JsonMapper mapper;
    private final HashMap<String, Window> rates = new HashMap<>();

    public DemoAccessFilter(DemoWorkspace workspace, JsonMapper mapper) {
        this.workspace = workspace;
        this.mapper = mapper;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "same-origin");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
        String path = request.getRequestURI();
        if (path.startsWith("/api/")) response.setHeader("Cache-Control", "no-store");
        if (!workspace.enabled()) {
            chain.doFilter(request, response);
            return;
        }
        if (path.startsWith("/actuator/") && !path.equals("/actuator/health")) {
            failure(response, 404, "Not found");
            return;
        }
        if (!path.startsWith("/api/v1/")) {
            chain.doFilter(request, response);
            return;
        }
        try {
            if ("cross-site".equals(request.getHeader("Sec-Fetch-Site")))
                throw new DemoException(403, "Open the demo directly to use its API.");
            if (path.equals("/api/v1/workspace")) {
                try {
                    UUID session = workspace.requireActive(request);
                    limit(session.toString(), 120);
                    if ("true".equals(request.getParameter("reset"))) limit("admission:" + request.getRemoteAddr(), 30);
                } catch (DemoException error) {
                    if (error.status() != 410) throw error;
                    limit("admission:" + request.getRemoteAddr(), 30);
                }
            } else if (!path.equals("/api/v1/config")) {
                UUID session = workspace.requireActive(request);
                limit(session.toString(), 120);
            }
            chain.doFilter(request, response);
        } catch (DemoException error) {
            failure(response, error.status(), error.getMessage());
        }
    }

    private synchronized void limit(String key, int maximum) {
        long now = System.currentTimeMillis();
        rates.entrySet().removeIf(e -> now - e.getValue().started >= 60000);
        if (!rates.containsKey(key) && rates.size() >= 2048)
            throw new DemoException(429, "The demo is busy. Try again shortly.");
        Window window = rates.computeIfAbsent(key, k -> new Window(now));
        if (++window.requests > maximum)
            throw new DemoException(429, "Please slow down and try again in a minute.");
    }

    private void failure(HttpServletResponse response, int status, String message)
            throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        if (status == 429) response.setHeader("Retry-After", "60");
        response.getWriter()
                .write(
                        mapper.writeValueAsString(
                                new ApiError(
                                        Instant.now(), status, "Demo request rejected", message)));
    }

    private static class Window {
        final long started;
        int requests;

        Window(long started) {
            this.started = started;
        }
    }
}
