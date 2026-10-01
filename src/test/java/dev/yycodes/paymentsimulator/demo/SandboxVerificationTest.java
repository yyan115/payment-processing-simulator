package dev.yycodes.paymentsimulator.demo;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class SandboxVerificationTest {
    @Test
    void rejectsWrongActionHostnameFailureAndMalformedResponses() {
        String valid = "{\"success\":true,\"hostname\":\"demo.example\",\"action\":\"mastercard\"}";
        assertThat(SandboxVerification.validResult(200, valid, "demo.example")).isTrue();
        assertThat(SandboxVerification.validResult(500, valid, "demo.example")).isFalse();
        assertThat(SandboxVerification.validResult(200, valid, "other.example")).isFalse();
        assertThat(
                        SandboxVerification.validResult(
                                200, valid.replace("mastercard", "login"), "demo.example"))
                .isFalse();
        assertThat(
                        SandboxVerification.validResult(
                                200, valid.replace("true", "false"), "demo.example"))
                .isFalse();
        assertThat(SandboxVerification.validResult(200, "not-json", "demo.example")).isFalse();
    }

    @Test
    void incompleteConfigurationFailsClosed() {
        assertThatThrownBy(
                        () ->
                                new SandboxVerification(
                                        mock(JdbcTemplate.class),
                                        mock(DemoWorkspace.class),
                                        true,
                                        "site",
                                        "",
                                        "demo.example"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void simulatorDoesNotRequireCloudflare() {
        var workspace = mock(DemoWorkspace.class);
        when(workspace.enabled()).thenReturn(true);
        var verification =
                new SandboxVerification(mock(JdbcTemplate.class), workspace, false, "", "", "");
        assertThat(verification.required()).isFalse();
        assertThat(verification.verified()).isTrue();
    }
}
