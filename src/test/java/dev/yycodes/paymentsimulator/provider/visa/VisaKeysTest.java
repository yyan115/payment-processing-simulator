package dev.yycodes.paymentsimulator.provider.visa;

import static org.assertj.core.api.Assertions.assertThat;

import java.security.KeyPairGenerator;
import java.util.Arrays;
import java.util.Base64;
import org.junit.jupiter.api.Test;

class VisaKeysTest {
    @Test
    void readsTheSingleLinePkcs1KeyVisaIssues() throws Exception {
        var generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        var pair = generator.generateKeyPair();
        byte[] pkcs8 = pair.getPrivate().getEncoded();
        // A 2048-bit PKCS#8 key is a 26 byte header followed by the PKCS#1 key.
        byte[] pkcs1 = Arrays.copyOfRange(pkcs8, 26, pkcs8.length);

        assertThat(VisaKeys.pkcs1ToPkcs8(pkcs1)).isEqualTo(pkcs8);

        String pem =
                "-----BEGIN RSA PRIVATE KEY-----"
                        + Base64.getEncoder().encodeToString(pkcs1)
                        + "-----END RSA PRIVATE KEY-----";
        assertThat(VisaKeys.privateKey(pem).getEncoded()).isEqualTo(pkcs8);
    }

    @Test
    void readsPkcs8KeysToo() throws Exception {
        var generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        byte[] pkcs8 = generator.generateKeyPair().getPrivate().getEncoded();
        String pem =
                "-----BEGIN PRIVATE KEY-----\n"
                        + Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(pkcs8)
                        + "\n-----END PRIVATE KEY-----\n";
        assertThat(VisaKeys.privateKey(pem).getEncoded()).isEqualTo(pkcs8);
    }

    @Test
    void decodesBase64Properties() {
        String pem = "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----\n";
        assertThat(VisaKeys.pem(Base64.getEncoder().encodeToString(pem.getBytes()))).isEqualTo(pem);
        assertThat(VisaKeys.pem("")).isEmpty();
    }
}
