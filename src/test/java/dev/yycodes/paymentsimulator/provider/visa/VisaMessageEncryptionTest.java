package dev.yycodes.paymentsimulator.provider.visa;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.util.Base64;

class VisaMessageEncryptionTest {
    private static VisaMessageEncryption encryption() throws Exception {
        var generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        var pair = generator.generateKeyPair();
        return new VisaMessageEncryption(pair.getPublic(), pair.getPrivate(), "key-1");
    }

    @Test
    void roundTripsAJsonBody() throws Exception {
        var encryption = encryption();
        String json = "{\"amount\":\"53.00\",\"note\":\"é ✓\"}";
        assertThat(encryption.decrypt(encryption.encrypt(json))).isEqualTo(json);
    }

    @Test
    void producesFivePartCompactJweWithTheExpectedHeader() throws Exception {
        String jwe = encryption().encrypt("{}");
        String[] parts = jwe.split("\\.");
        assertThat(parts).hasSize(5);
        String header = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8);
        assertThat(header)
                .contains("\"alg\":\"RSA-OAEP-256\"")
                .contains("\"enc\":\"A128GCM\"")
                .contains("\"kid\":\"key-1\"")
                .contains("\"iat\":");
        // 128-bit authentication tag and 96-bit nonce.
        assertThat(Base64.getUrlDecoder().decode(parts[4])).hasSize(16);
        assertThat(Base64.getUrlDecoder().decode(parts[2])).hasSize(12);
    }

    @Test
    void encryptsDifferentlyEachTimeAndRejectsTampering() throws Exception {
        var encryption = encryption();
        String first = encryption.encrypt("{\"a\":1}");
        assertThat(encryption.encrypt("{\"a\":1}")).isNotEqualTo(first);
        String[] parts = first.split("\\.");
        byte[] cipherText = Base64.getUrlDecoder().decode(parts[3]);
        cipherText[0] ^= 1;
        parts[3] = Base64.getUrlEncoder().withoutPadding().encodeToString(cipherText);
        assertThatThrownBy(() -> encryption.decrypt(String.join(".", parts)))
                .isInstanceOf(Exception.class);
    }
}
