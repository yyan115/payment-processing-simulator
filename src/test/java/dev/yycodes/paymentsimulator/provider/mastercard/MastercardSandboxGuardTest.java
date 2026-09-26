package dev.yycodes.paymentsimulator.provider.mastercard;

import org.junit.jupiter.api.Test;

import java.net.URI;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MastercardSandboxGuardTest {

    @Test
    void acceptsCurrentRntzSandboxHost() {
        assertThatCode(() -> MastercardSendDisbursementsProvider.requireSandboxBaseUrl(
                URI.create("https://sandbox.api.move.mastercard.com")
        )).doesNotThrowAnyException();
    }

    @Test
    void rejectsProductionHost() {
        assertThatThrownBy(() -> MastercardSendDisbursementsProvider.requireSandboxBaseUrl(
                URI.create("https://api.move.mastercard.com")
        )).isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("sandbox");
    }

    @Test
    void rejectsPlainHttpEvenForSandboxHostname() {
        assertThatThrownBy(() -> MastercardSendDisbursementsProvider.requireSandboxBaseUrl(
                URI.create("http://sandbox.api.move.mastercard.com")
        )).isInstanceOf(IllegalStateException.class);
    }
}
